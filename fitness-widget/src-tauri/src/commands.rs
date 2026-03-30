use chrono::Local;
use rusqlite::params;
use tauri::{command, State};

use crate::{
    db,
    models::{
        Exercise, ExerciseHistoryEntry, ExerciseInsights, GhostSet, GhostWorkout, HomeState,
        SetInput, WorkoutSummary,
    },
    scoring, AppState,
};

#[command]
pub fn get_home_state(state: State<AppState>) -> Result<HomeState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    scoring::update_scores(&conn)?;

    let current_split = current_split(&conn)?;
    let all_exercises = query_exercises(&conn)?;
    let current_split_exercises = all_exercises
        .iter()
        .filter(|exercise| exercise.split_key == current_split)
        .cloned()
        .collect();

    Ok(HomeState {
        current_split,
        is_rest_day_today: is_rest_day_today(&conn)?,
        current_split_exercises,
        all_exercises,
    })
}

#[command]
pub fn complete_split(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let next_split = if current_split(&conn)? == "A" { "B" } else { "A" };

    db::set_state_value(&conn, "current_split", next_split).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_state WHERE key = 'rest_day_date'", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn mark_rest_day(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let today = today_string();
    db::set_state_value(&conn, "rest_day_date", &today).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn log_workout(
    state: State<AppState>,
    exercise_id: i32,
    sets: Vec<SetInput>,
    is_bodyweight: bool,
) -> Result<WorkoutSummary, String> {
    let mut cleaned_sets: Vec<SetInput> = sets
        .into_iter()
        .filter(|set| set.reps > 0 && (is_bodyweight || set.weight > 0.0))
        .collect();

    if cleaned_sets.is_empty() {
        return Err("Add at least one completed set before saving.".into());
    }

    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    scoring::update_scores(&conn)?;

    let baseline_volume: f64 = conn
        .query_row(
            "SELECT baseline_volume FROM exercises WHERE id = ?1",
            params![exercise_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let total_volume: f64 = if is_bodyweight {
        cleaned_sets.iter().map(|set| set.reps as f64).sum()
    } else {
        cleaned_sets
            .iter()
            .map(|set| set.weight * set.reps as f64)
            .sum()
    };

    let normalized_volume = if baseline_volume > 0.0 {
        total_volume / baseline_volume
    } else {
        total_volume
    };

    let today = Local::now().naive_local().date();
    let today_str = today.format("%Y-%m-%d").to_string();
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let previous_max: f64 = tx
        .query_row(
            "SELECT COALESCE(MAX(total_volume), 0) FROM workout_logs WHERE exercise_id = ?1",
            params![exercise_id],
            |row| row.get(0),
        )
        .unwrap_or(0.0);
    let is_pr = previous_max > 0.0 && total_volume > previous_max;

    tx.execute(
        "INSERT INTO workout_logs (
            exercise_id,
            date,
            total_volume,
            is_pr,
            normalized_volume
         ) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![exercise_id, today_str, total_volume, is_pr, normalized_volume],
    )
    .map_err(|e| e.to_string())?;

    let log_id = tx.last_insert_rowid();

    for (index, set) in cleaned_sets.drain(..).enumerate() {
        tx.execute(
            "INSERT INTO sets (workout_log_id, set_number, weight, reps)
             VALUES (?1, ?2, ?3, ?4)",
            params![log_id, index as i32 + 1, set.weight, set.reps],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.execute(
        "UPDATE exercises
         SET last_trained_date = ?1, last_penalty_date = NULL
         WHERE id = ?2",
        params![today_str, exercise_id],
    )
    .map_err(|e| e.to_string())?;

    let score_result =
        scoring::calculate_workout_points(&tx, exercise_id, log_id, normalized_volume, is_pr, today)?;

    tx.execute(
        "UPDATE workout_logs
         SET points_earned = ?1, streak_count = ?2, muscle_group_streak = ?2
         WHERE id = ?3",
        params![score_result.earned_points, score_result.exercise_streak, log_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(WorkoutSummary {
        total_volume,
        earned_points: score_result.earned_points,
        level: score_result.level,
        points: score_result.points,
        points_to_next_level: score_result.points_to_next_level,
        exercise_streak: score_result.exercise_streak,
        is_pr,
    })
}

#[command]
pub fn get_exercise_insights(
    state: State<AppState>,
    exercise_id: i32,
) -> Result<ExerciseInsights, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let last_workout = get_last_workout(&conn, exercise_id)?;

    let mut history_stmt = conn
        .prepare(
            "SELECT date, total_volume, points_earned, is_pr
             FROM workout_logs
             WHERE exercise_id = ?1
             ORDER BY date DESC, id DESC
             LIMIT 6",
        )
        .map_err(|e| e.to_string())?;

    let history = history_stmt
        .query_map(params![exercise_id], |row| {
            Ok(ExerciseHistoryEntry {
                date: row.get(0)?,
                total_volume: row.get(1)?,
                points_earned: row.get(2)?,
                is_pr: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();

    Ok(ExerciseInsights { last_workout, history })
}

fn query_exercises(conn: &rusqlite::Connection) -> Result<Vec<Exercise>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, split_key, split_order, is_bodyweight, level, points, baseline_volume
             FROM exercises
             ORDER BY sort_order, id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let level = row.get::<_, i32>(5)?;
            Ok(Exercise {
                id: row.get(0)?,
                name: row.get(1)?,
                split_key: row.get(2)?,
                split_order: row.get(3)?,
                is_bodyweight: row.get(4)?,
                level,
                points: row.get(6)?,
                points_to_next_level: scoring::points_to_next_level(level),
                baseline_volume: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut exercises = Vec::new();
    for row in rows {
        exercises.push(row.map_err(|e| e.to_string())?);
    }

    Ok(exercises)
}

fn get_last_workout(conn: &rusqlite::Connection, exercise_id: i32) -> Result<Option<GhostWorkout>, String> {
    let log = conn
        .query_row(
            "SELECT id, date, total_volume, is_pr
             FROM workout_logs
             WHERE exercise_id = ?1
             ORDER BY date DESC, id DESC
             LIMIT 1",
            params![exercise_id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            },
        )
        .ok();

    let Some((log_id, date, total_volume, is_pr)) = log else {
        return Ok(None);
    };

    let mut stmt = conn
        .prepare(
            "SELECT set_number, weight, reps
             FROM sets
             WHERE workout_log_id = ?1
             ORDER BY set_number",
        )
        .map_err(|e| e.to_string())?;

    let sets = stmt
        .query_map(params![log_id], |row| {
            Ok(GhostSet {
                set_number: row.get(0)?,
                weight: row.get(1)?,
                reps: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();

    Ok(Some(GhostWorkout {
        date,
        total_volume,
        is_pr,
        sets,
    }))
}

fn current_split(conn: &rusqlite::Connection) -> Result<String, String> {
    let value = db::get_state_value(conn, "current_split").map_err(|e| e.to_string())?;
    Ok(match value.as_deref() {
        Some("B") => "B".into(),
        _ => "A".into(),
    })
}

fn is_rest_day_today(conn: &rusqlite::Connection) -> Result<bool, String> {
    let today = today_string();
    let value = db::get_state_value(conn, "rest_day_date").map_err(|e| e.to_string())?;
    Ok(value.as_deref() == Some(today.as_str()))
}

fn today_string() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}
