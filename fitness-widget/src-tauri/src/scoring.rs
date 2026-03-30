use rusqlite::{Connection, params};
use chrono::{Local, NaiveDate};

pub fn update_scores(conn: &Connection) -> Result<(), String> {
    let today = Local::now().naive_local().date();

    // Process penalties for all muscle groups
    let mut stmt = conn.prepare("SELECT id, last_trained_date, points, level FROM muscle_groups").map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, i32>(3)?,
        ))
    }).map_err(|e| e.to_string())?;

    for row_res in rows {
        let (id, last_trained, mut points, mut level) = row_res.map_err(|e| e.to_string())?;

        if let Some(date_str) = last_trained {
            if let Ok(last_date) = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
                let diff = (today - last_date).num_days();

                if diff >= 14 {
                    // Start deducting 0.1 every day after 14 days
                    let days_penalty = diff - 13;
                    points -= 0.1 * days_penalty as f64;
                }
            }
        }

        // Handle Level down
        while points < 0.0 && level > 1 {
            level -= 1;
            points += 10.0; // Assuming 10 points per level
        }

        // Cannot go below Level 1, 0 points
        if level == 1 && points < 0.0 {
            points = 0.0;
        }

        conn.execute(
            "UPDATE muscle_groups SET points = ?1, level = ?2 WHERE id = ?3",
            params![points, level, id]
        ).map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn calculate_workout_points(
    conn: &Connection,
    exercise_id: i32,
    total_volume: f64,
    is_pr: bool,
    today_str: &str
) -> Result<(), String> {

    let muscle_group_id: i32 = conn.query_row(
        "SELECT muscle_group_id FROM exercises WHERE id = ?1",
        params![exercise_id],
        |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    // Check frequency in last 7 days for THIS muscle group
    let last_week = (Local::now().naive_local().date() - chrono::Duration::days(7)).format("%Y-%m-%d").to_string();

    let count: i32 = conn.query_row(
        "SELECT COUNT(DISTINCT date) FROM workout_logs w
         JOIN exercises e ON w.exercise_id = e.id
         WHERE e.muscle_group_id = ?1 AND w.date >= ?2 AND w.date <= ?3",
        params![muscle_group_id, last_week, today_str],
        |row| row.get(0)
    ).unwrap_or(0);

    let mut earned_points = 0.0;

    // Frequency points logic (assuming this current workout makes the count go up by 1)
    let new_count = count; // count already includes today since we insert log first

    match new_count {
        1 => earned_points += 0.1,
        2 => earned_points += 1.3,
        _ if new_count >= 3 => earned_points += 1.5, // Treating >= 3 as "2.5x"
        _ => ()
    }

    // Check streak for THIS exercise
    let mut streak = 0;
    let prev_workouts: Vec<f64> = {
        let mut stmt = conn.prepare(
            "SELECT total_volume FROM workout_logs WHERE exercise_id = ?1 AND date < ?2 ORDER BY date DESC LIMIT 10"
        ).map_err(|e| e.to_string())?;

        let iter = stmt.query_map(params![exercise_id, today_str], |row| row.get(0)).map_err(|e| e.to_string())?;
        iter.filter_map(|r| r.ok()).collect()
    };

    let mut current_vol_to_beat = total_volume;
    for prev_vol in prev_workouts {
        if current_vol_to_beat >= prev_vol {
            streak += 1;
            current_vol_to_beat = prev_vol;
        } else {
            break;
        }
    }

    // Streak logic
    if streak >= 3 && streak < 6 {
        earned_points += 0.1;
    } else if streak >= 6 {
        earned_points += 0.2; // Extra for high streak
    }

    // PR logic
    if is_pr {
        earned_points += 0.5;
    }

    // Add points to muscle group
    let mut mg_row = conn.query_row(
        "SELECT points, level FROM muscle_groups WHERE id = ?1",
        params![muscle_group_id],
        |row| Ok((row.get::<_, f64>(0)?, row.get::<_, i32>(1)?))
    ).map_err(|e| e.to_string())?;

    let mut points = mg_row.0 + earned_points;
    let mut level = mg_row.1;

    // Level up logic (10 points per level)
    while points >= 10.0 {
        level += 1;
        points -= 10.0;
    }

    conn.execute(
        "UPDATE muscle_groups SET points = ?1, level = ?2 WHERE id = ?3",
        params![points, level, muscle_group_id]
    ).map_err(|e| e.to_string())?;

    Ok(())
}
