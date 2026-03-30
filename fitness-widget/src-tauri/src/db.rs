use rusqlite::{params, Connection, Result};
use std::fs;
use tauri::Manager;

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to resolve app data dir");

    fs::create_dir_all(&app_dir).expect("Failed to create app data dir");

    let db_path = app_dir.join("fitness.db");
    let conn = Connection::open(&db_path)?;

    setup_tables(&conn)?;
    seed_data(&conn)?;

    Ok(conn)
}

fn setup_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS muscle_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            level INTEGER DEFAULT 1,
            points REAL DEFAULT 0.0,
            last_trained_date TEXT,
            last_penalty_date TEXT
        );

        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            split_key TEXT NOT NULL DEFAULT 'A',
            split_order INTEGER DEFAULT 1,
            is_bodyweight BOOLEAN DEFAULT 0,
            baseline_volume REAL DEFAULT 100.0,
            sort_order INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            points REAL DEFAULT 0.0,
            last_trained_date TEXT,
            last_penalty_date TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exercise_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            total_volume REAL NOT NULL,
            is_pr BOOLEAN DEFAULT 0,
            normalized_volume REAL DEFAULT 0.0,
            streak_count INTEGER DEFAULT 0,
            muscle_group_streak INTEGER DEFAULT 0,
            points_earned REAL DEFAULT 0.0,
            FOREIGN KEY(exercise_id) REFERENCES exercises(id)
        );

        CREATE TABLE IF NOT EXISTS sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_log_id INTEGER NOT NULL,
            set_number INTEGER NOT NULL,
            weight REAL NOT NULL,
            reps INTEGER NOT NULL,
            FOREIGN KEY(workout_log_id) REFERENCES workout_logs(id)
        );

        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        ",
    )?;

    ensure_column(conn, "exercises", "split_key", "TEXT NOT NULL DEFAULT 'A'")?;
    ensure_column(conn, "exercises", "split_order", "INTEGER DEFAULT 1")?;
    ensure_column(conn, "exercises", "baseline_volume", "REAL DEFAULT 100.0")?;
    ensure_column(conn, "exercises", "level", "INTEGER DEFAULT 1")?;
    ensure_column(conn, "exercises", "points", "REAL DEFAULT 0.0")?;
    ensure_column(conn, "exercises", "last_trained_date", "TEXT")?;
    ensure_column(conn, "exercises", "last_penalty_date", "TEXT")?;
    ensure_column(conn, "workout_logs", "normalized_volume", "REAL DEFAULT 0.0")?;
    ensure_column(conn, "workout_logs", "streak_count", "INTEGER DEFAULT 0")?;
    ensure_column(conn, "workout_logs", "points_earned", "REAL DEFAULT 0.0")?;

    Ok(())
}

fn seed_data(conn: &Connection) -> Result<()> {
    let workout_log_count: i32 =
        conn.query_row("SELECT COUNT(*) FROM workout_logs", [], |row| row.get(0))?;

    if workout_log_count == 0 {
        conn.execute("DELETE FROM sets", [])?;
        conn.execute("DELETE FROM workout_logs", [])?;
        recreate_exercises_table(conn)?;

        let exercises = vec![
            ("Single Arm DB Row", "A", 1, false, 900.0, 1),
            ("Decline Weighted Push-ups", "A", 2, false, 700.0, 2),
            ("Seated Dumbbell Press", "A", 3, false, 700.0, 3),
            ("Dumbbell Floor Press", "A", 4, false, 850.0, 4),
            ("Dumbbell Lateral Raises", "A", 5, false, 360.0, 5),
            ("Unilateral Bicep Curls", "A", 6, false, 320.0, 6),
            ("Dumbbell Hip Thrust", "B", 1, false, 1600.0, 7),
            ("Glute-Biased Bulgarian Squat", "B", 2, false, 700.0, 8),
            ("Dumbbell Romanian Deadlift", "B", 3, false, 1400.0, 9),
            ("Dumbbell Sumo Squat", "B", 4, false, 1100.0, 10),
            ("Overhead DB Triceps Extension", "B", 5, false, 420.0, 11),
            ("Diamond Push-ups", "B", 6, true, 50.0, 12),
        ];

        for (name, split_key, split_order, is_bodyweight, baseline_volume, sort_order) in exercises {
            conn.execute(
                "INSERT INTO exercises (
                    name,
                    split_key,
                    split_order,
                    is_bodyweight,
                    baseline_volume,
                    sort_order,
                    level,
                    points,
                    last_trained_date,
                    last_penalty_date
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 0.0, NULL, NULL)",
                params![
                    name,
                    split_key,
                    split_order,
                    is_bodyweight,
                    baseline_volume,
                    sort_order
                ],
            )?;
        }

        set_state_value(conn, "current_split", "A")?;
        conn.execute("DELETE FROM app_state WHERE key = 'rest_day_date'", [])?;
    } else {
        conn.execute(
            "UPDATE exercises
             SET split_key = COALESCE(NULLIF(split_key, ''), 'A'),
                 split_order = CASE WHEN split_order <= 0 THEN sort_order ELSE split_order END,
                 level = CASE WHEN level <= 0 THEN 1 ELSE level END",
            [],
        )?;

        if get_state_value(conn, "current_split")?.is_none() {
            set_state_value(conn, "current_split", "A")?;
        }
    }

    Ok(())
}

fn recreate_exercises_table(conn: &Connection) -> Result<()> {
    conn.execute("DROP TABLE IF EXISTS exercises", [])?;
    conn.execute_batch(
        "
        CREATE TABLE exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            split_key TEXT NOT NULL DEFAULT 'A',
            split_order INTEGER DEFAULT 1,
            is_bodyweight BOOLEAN DEFAULT 0,
            baseline_volume REAL DEFAULT 100.0,
            sort_order INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            points REAL DEFAULT 0.0,
            last_trained_date TEXT,
            last_penalty_date TEXT
        );
        ",
    )?;

    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let pragma = format!("PRAGMA table_info({table})");
    let mut stmt = conn.prepare(&pragma)?;
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))?
        .filter_map(|row| row.ok())
        .collect();

    if !columns.iter().any(|existing| existing == column) {
        let alter = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
        conn.execute(&alter, [])?;
    }

    Ok(())
}

pub fn get_state_value(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM app_state WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .map(Some)
    .or_else(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        _ => Err(error),
    })
}

pub fn set_state_value(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO app_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;

    Ok(())
}
