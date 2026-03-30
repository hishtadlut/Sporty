use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Exercise {
    pub id: i32,
    pub name: String,
    pub split_key: String,
    pub split_order: i32,
    pub is_bodyweight: bool,
    pub level: i32,
    pub points: f64,
    pub points_to_next_level: f64,
    pub baseline_volume: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HomeState {
    pub current_split: String,
    pub is_rest_day_today: bool,
    pub current_split_exercises: Vec<Exercise>,
    pub all_exercises: Vec<Exercise>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetInput {
    pub weight: f64,
    pub reps: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GhostSet {
    pub set_number: i32,
    pub weight: f64,
    pub reps: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GhostWorkout {
    pub date: String,
    pub total_volume: f64,
    pub is_pr: bool,
    pub sets: Vec<GhostSet>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExerciseHistoryEntry {
    pub date: String,
    pub total_volume: f64,
    pub points_earned: f64,
    pub is_pr: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExerciseInsights {
    pub last_workout: Option<GhostWorkout>,
    pub history: Vec<ExerciseHistoryEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkoutSummary {
    pub total_volume: f64,
    pub earned_points: f64,
    pub level: i32,
    pub points: f64,
    pub points_to_next_level: f64,
    pub exercise_streak: i32,
    pub is_pr: bool,
}
