import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const DB_PATH = path.join(__dirname, '../database.sqlite');

export async function openDB() {
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
}

const INITIAL_EXERCISES = [
  { name: 'Squat', muscle_group: 'Legs', baseline_work: 100, is_bodyweight: 0 },
  { name: 'Bench Press', muscle_group: 'Chest', baseline_work: 80, is_bodyweight: 0 },
  { name: 'Deadlift', muscle_group: 'Back', baseline_work: 120, is_bodyweight: 0 },
  { name: 'Pull-ups', muscle_group: 'Back', baseline_work: 50, is_bodyweight: 1 },
  { name: 'Overhead Press', muscle_group: 'Shoulders', baseline_work: 50, is_bodyweight: 0 },
  { name: 'Barbell Row', muscle_group: 'Back', baseline_work: 70, is_bodyweight: 0 },
  { name: 'Romanian Deadlift', muscle_group: 'Legs', baseline_work: 100, is_bodyweight: 0 },
  { name: 'Incline Bench Press', muscle_group: 'Chest', baseline_work: 60, is_bodyweight: 0 },
  { name: 'Lateral Raises', muscle_group: 'Shoulders', baseline_work: 20, is_bodyweight: 0 },
  { name: 'Barbell Curl', muscle_group: 'Arms', baseline_work: 30, is_bodyweight: 0 },
  { name: 'Triceps Extension', muscle_group: 'Arms', baseline_work: 30, is_bodyweight: 0 },
  { name: 'Calf Raises', muscle_group: 'Legs', baseline_work: 80, is_bodyweight: 0 }
];

export async function initDB() {
  const db = await openDB();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      muscle_group TEXT NOT NULL,
      baseline_work REAL NOT NULL,
      is_bodyweight INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS muscle_stats (
      muscle_group TEXT PRIMARY KEY,
      level INTEGER DEFAULT 1,
      points REAL DEFAULT 0,
      consecutive_streaks INTEGER DEFAULT 0,
      last_trained_date TEXT,
      max_volume REAL DEFAULT 0,
      last_penalty_date TEXT
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      total_volume REAL,
      points_earned REAL
    );

    CREATE TABLE IF NOT EXISTS workout_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_id INTEGER,
      exercise_id INTEGER,
      set_number INTEGER,
      reps INTEGER,
      weight REAL,
      volume REAL,
      FOREIGN KEY (workout_id) REFERENCES workouts(id),
      FOREIGN KEY (exercise_id) REFERENCES exercises(id)
    );
  `);

  // Populate initial exercises if empty
  const count = await db.get('SELECT COUNT(*) as count FROM exercises');
  if (count.count === 0) {
    const stmt = await db.prepare('INSERT INTO exercises (name, muscle_group, baseline_work, is_bodyweight) VALUES (?, ?, ?, ?)');
    for (const ex of INITIAL_EXERCISES) {
      await stmt.run(ex.name, ex.muscle_group, ex.baseline_work, ex.is_bodyweight);
    }
    await stmt.finalize();

    // Init muscle stats
    const muscleGroups = Array.from(new Set(INITIAL_EXERCISES.map(e => e.muscle_group)));
    const msStmt = await db.prepare('INSERT INTO muscle_stats (muscle_group) VALUES (?)');
    for (const mg of muscleGroups) {
      await msStmt.run(mg);
    }
    await msStmt.finalize();
  }

  return db;
}
