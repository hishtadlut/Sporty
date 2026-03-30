use chrono::{Duration, Local, NaiveDate};
use rusqlite::{params, Connection};

pub struct WorkoutScoreResult {
    pub earned_points: f64,
    pub level: i32,
    pub points: f64,
    pub points_to_next_level: f64,
    pub exercise_streak: i32,
}

pub fn points_to_next_level(level: i32) -> f64 {
    (level + 7).max(8) as f64
}

pub fn update_scores(conn: &Connection) -> Result<(), String> {
    let today = Local::now().naive_local().date();

    let mut stmt = conn
        .prepare(
            "SELECT id, last_trained_date, last_penalty_date, points, level
             FROM exercises",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, i32>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (id, last_trained, last_penalty, mut points, mut level) =
            row.map_err(|e| e.to_string())?;

        let Some(last_trained) = last_trained else {
            continue;
        };

        let Ok(last_trained_date) = NaiveDate::parse_from_str(&last_trained, "%Y-%m-%d") else {
            continue;
        };

        let first_penalty_date = last_trained_date + Duration::days(14);
        if today < first_penalty_date {
            continue;
        }

        let next_penalty_date = match last_penalty {
            Some(value) => NaiveDate::parse_from_str(&value, "%Y-%m-%d")
                .map(|date| date + Duration::days(1))
                .unwrap_or(first_penalty_date),
            None => first_penalty_date,
        };

        if next_penalty_date > today {
            continue;
        }

        let penalty_days = (today - next_penalty_date).num_days() + 1;
        points -= 0.1 * penalty_days as f64;

        while points < 0.0 && level > 1 {
            level -= 1;
            points += points_to_next_level(level);
        }

        if level == 1 && points < 0.0 {
            points = 0.0;
        }

        conn.execute(
            "UPDATE exercises
             SET points = ?1, level = ?2, last_penalty_date = ?3
             WHERE id = ?4",
            params![points, level, today.format("%Y-%m-%d").to_string(), id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn calculate_workout_points(
    conn: &Connection,
    exercise_id: i32,
    workout_log_id: i64,
    normalized_volume: f64,
    is_pr: bool,
    today: NaiveDate,
) -> Result<WorkoutScoreResult, String> {
    let mut earned_points = frequency_bonus(conn, exercise_id, today)?;

    let (volume_bonus, exercise_streak) =
        exercise_volume_bonus(conn, exercise_id, workout_log_id, normalized_volume)?;
    earned_points += volume_bonus;

    if is_pr {
        earned_points += 0.5;
    }

    let (mut points, mut level) = conn
        .query_row(
            "SELECT points, level FROM exercises WHERE id = ?1",
            params![exercise_id],
            |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?)),
        )
        .map_err(|e| e.to_string())?;

    points += earned_points;

    while points >= points_to_next_level(level) {
        points -= points_to_next_level(level);
        level += 1;
    }

    conn.execute(
        "UPDATE exercises SET points = ?1, level = ?2 WHERE id = ?3",
        params![points, level, exercise_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(WorkoutScoreResult {
        earned_points,
        level,
        points,
        points_to_next_level: points_to_next_level(level),
        exercise_streak,
    })
}

fn frequency_bonus(conn: &Connection, exercise_id: i32, today: NaiveDate) -> Result<f64, String> {
    let last_7_days = (today - Duration::days(6)).format("%Y-%m-%d").to_string();
    let last_14_days = (today - Duration::days(13)).format("%Y-%m-%d").to_string();
    let today_str = today.format("%Y-%m-%d").to_string();

    let count_7: i32 = conn
        .query_row(
            "SELECT COUNT(DISTINCT date)
             FROM workout_logs
             WHERE exercise_id = ?1
               AND date BETWEEN ?2 AND ?3",
            params![exercise_id, last_7_days, today_str],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let count_14: i32 = conn
        .query_row(
            "SELECT COUNT(DISTINCT date)
             FROM workout_logs
             WHERE exercise_id = ?1
               AND date BETWEEN ?2 AND ?3",
            params![exercise_id, last_14_days, today_str],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count_14 >= 5 {
        Ok(1.5)
    } else if count_7 >= 2 {
        Ok(1.3)
    } else if count_7 >= 1 {
        Ok(0.1)
    } else {
        Ok(0.0)
    }
}

fn exercise_volume_bonus(
    conn: &Connection,
    exercise_id: i32,
    workout_log_id: i64,
    normalized_volume: f64,
) -> Result<(f64, i32), String> {
    let mut stmt = conn
        .prepare(
            "SELECT normalized_volume
             FROM workout_logs
             WHERE exercise_id = ?1
               AND id <> ?2
             ORDER BY date DESC, id DESC
             LIMIT 12",
        )
        .map_err(|e| e.to_string())?;

    let previous: Vec<f64> = stmt
        .query_map(params![exercise_id, workout_log_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();

    let meets_target = normalized_volume >= 1.0;
    let improves_previous = previous
        .first()
        .map(|prev| normalized_volume >= *prev)
        .unwrap_or(meets_target);

    if !meets_target && !improves_previous {
        return Ok((0.0, 0));
    }

    let mut earned_points = 0.1;
    let mut streak_count = 1;
    let mut comparison_value = normalized_volume;

    for prev in previous {
        if comparison_value >= prev {
            streak_count += 1;
            comparison_value = prev;
        } else {
            break;
        }
    }

    if streak_count == 3 || streak_count >= 6 {
        earned_points += 0.1;
    }

    Ok((earned_points, streak_count))
}
