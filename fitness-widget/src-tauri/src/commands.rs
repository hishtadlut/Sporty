use rusqlite::params;
use tauri::{State, command};
use std::sync::Mutex;
use chrono::Local;

use crate::{AppState, models::{Exercise, SetInput, GhostSet}};

#[command]
pub fn get_exercises(state: State<AppState>) -> Result<Vec<Exercise>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT e.id, e.name, mg.name as muscle_group, e.is_bodyweight, mg.level, mg.points
         FROM exercises e
         JOIN muscle_groups mg ON e.muscle_group_id = mg.id
         ORDER BY e.sort_order"
    ).map_err(|e| e.to_string())?;

    let iter = stmt.query_map([], |row| {
        Ok(Exercise {
            id: row.get(0)?,
            name: row.get(1)?,
            muscle_group: row.get(2)?,
            is_bodyweight: row.get(3)?,
            level: row.get(4)?,
            points: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut exercises = Vec::new();
    for ex in iter {
        exercises.push(ex.map_err(|e| e.to_string())?);
    }

    Ok(exercises)
}

#[command]
pub fn get_current_loop_index(state: State<AppState>) -> Result<i32, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT value FROM app_state WHERE key = 'current_loop_index'").map_err(|e| e.to_string())?;
    let val_str: String = stmt.query_row([], |row| row.get(0)).map_err(|e| e.to_string())?;
    val_str.parse::<i32>().map_err(|e| e.to_string())
}

#[command]
pub fn advance_loop(state: State<AppState>, count: i32) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT value FROM app_state WHERE key = 'current_loop_index'").map_err(|e| e.to_string())?;
    let val_str: String = stmt.query_row([], |row| row.get(0)).map_err(|e| e.to_string())?;
    let mut idx = val_str.parse::<i32>().map_err(|e| e.to_string())?;

    idx = (idx + count) % 12; // 12 exercises total

    conn.execute(
        "UPDATE app_state SET value = ?1 WHERE key = 'current_loop_index'",
        params![idx.to_string()],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn log_workout(
    state: State<AppState>,
    exercise_id: i32,
    sets: Vec<SetInput>,
    is_bodyweight: bool
) -> Result<(), String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;

    let total_volume: f64 = if is_bodyweight {
        sets.iter().map(|s| s.reps as f64).sum()
    } else {
        sets.iter().map(|s| s.weight * s.reps as f64).sum()
    };

    let today = Local::now().format("%Y-%m-%d").to_string();

    // Begin transaction
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Check if PR
    let prev_max: f64 = tx.query_row(
        "SELECT COALESCE(MAX(total_volume), 0) FROM workout_logs WHERE exercise_id = ?1",
        params![exercise_id],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let is_pr = total_volume > prev_max && prev_max > 0.0;

    tx.execute(
        "INSERT INTO workout_logs (exercise_id, date, total_volume, is_pr) VALUES (?1, ?2, ?3, ?4)",
        params![exercise_id, today, total_volume, is_pr],
    ).map_err(|e| e.to_string())?;

    let log_id = tx.last_insert_rowid();

    for (i, set) in sets.iter().enumerate() {
        tx.execute(
            "INSERT INTO sets (workout_log_id, set_number, weight, reps) VALUES (?1, ?2, ?3, ?4)",
            params![log_id, i as i32 + 1, set.weight, set.reps],
        ).map_err(|e| e.to_string())?;
    }

    // Update muscle group last trained date
    tx.execute(
        "UPDATE muscle_groups SET last_trained_date = ?1
         WHERE id = (SELECT muscle_group_id FROM exercises WHERE id = ?2)",
        params![today, exercise_id],
    ).map_err(|e| e.to_string())?;

    let _ = crate::scoring::calculate_workout_points(&tx, exercise_id, total_volume, is_pr, &today);
tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn get_ghost_data(state: State<AppState>, exercise_id: i32) -> Result<Vec<GhostSet>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Get last workout log id for this exercise
    let log_id: Option<i32> = conn.query_row(
        "SELECT id FROM workout_logs WHERE exercise_id = ?1 ORDER BY date DESC, id DESC LIMIT 1",
        params![exercise_id],
        |row| row.get(0),
    ).ok();

    match log_id {
        Some(id) => {
            let mut stmt = conn.prepare(
                "SELECT set_number, weight, reps FROM sets WHERE workout_log_id = ?1 ORDER BY set_number"
            ).map_err(|e| e.to_string())?;

            let iter = stmt.query_map(params![id], |row| {
                Ok(GhostSet {
                    set_number: row.get(0)?,
                    weight: row.get(1)?,
                    reps: row.get(2)?,
                })
            }).map_err(|e| e.to_string())?;

            let mut sets = Vec::new();
            for set in iter {
                sets.push(set.map_err(|e| e.to_string())?);
            }
            Ok(sets)
        },
        None => Ok(vec![])
    }
}
