use tauri::Manager;
use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;

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
            last_trained_date TEXT
        );

        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            muscle_group_id INTEGER NOT NULL,
            is_bodyweight BOOLEAN DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY(muscle_group_id) REFERENCES muscle_groups(id)
        );

        CREATE TABLE IF NOT EXISTS workout_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exercise_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            total_volume REAL NOT NULL,
            is_pr BOOLEAN DEFAULT 0,
            streak_count INTEGER DEFAULT 0,
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
        "
    )?;
    Ok(())
}

fn seed_data(conn: &Connection) -> Result<()> {
    // Check if seeded
    let mut stmt = conn.prepare("SELECT count(*) FROM exercises")?;
    let count: i32 = stmt.query_row([], |row| row.get(0))?;

    if count == 0 {
        // Seed Muscle Groups
        let groups = vec!["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Abs"];
        for group in groups {
            conn.execute("INSERT OR IGNORE INTO muscle_groups (name) VALUES (?)", [group])?;
        }

        // Seed 12 Iron Exercises
        // Format: (name, muscle_group_name, is_bodyweight)
        let exercises = vec![
            ("Bench Press", "Chest", false),
            ("Incline Dumbbell Press", "Chest", false),
            ("Pull-ups", "Back", true),
            ("Barbell Rows", "Back", false),
            ("Overhead Press", "Shoulders", false),
            ("Lateral Raises", "Shoulders", false),
            ("Barbell Curls", "Biceps", false),
            ("Hammer Curls", "Biceps", false),
            ("Tricep Extensions", "Triceps", false),
            ("Dips", "Triceps", true),
            ("Squats", "Legs", false),
            ("Romanian Deadlifts", "Legs", false),
        ];

        let mut order = 1;
        for (name, group_name, is_bw) in exercises {
            conn.execute(
                "INSERT OR IGNORE INTO exercises (name, muscle_group_id, is_bodyweight, sort_order)
                 SELECT ?1, id, ?2, ?3 FROM muscle_groups WHERE name = ?4",
                (name, is_bw, order, group_name),
            )?;
            order += 1;
        }

        // Initialize Loop State
        conn.execute(
            "INSERT OR IGNORE INTO app_state (key, value) VALUES ('current_loop_index', '0')",
            [],
        )?;
    }

    Ok(())
}
