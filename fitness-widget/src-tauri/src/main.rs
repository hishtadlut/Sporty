#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;
use rusqlite::Connection;
use std::sync::Mutex;

mod db;
mod models;
mod commands;
mod scoring;

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = db::init_db(&app.handle()).expect("Failed to initialize database");

            // Run penalty updates on startup
            let _ = scoring::update_scores(&conn);

            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_exercises,
            commands::log_workout,
            commands::get_ghost_data,
            commands::get_current_loop_index,
            commands::advance_loop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
