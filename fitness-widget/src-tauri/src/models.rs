use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Exercise {
    pub id: i32,
    pub name: String,
    pub muscle_group: String,
    pub is_bodyweight: bool,
    pub level: i32,
    pub points: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SetInput {
    pub weight: f64,
    pub reps: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkoutLog {
    pub exercise_id: i32,
    pub total_volume: f64,
    pub is_pr: bool,
    pub streak_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GhostSet {
    pub set_number: i32,
    pub weight: f64,
    pub reps: i32,
}
