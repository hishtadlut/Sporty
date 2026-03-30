use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{
    menu::MenuEvent,
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Rect, WindowEvent,
};

mod commands;
mod db;
mod models;
mod scoring;

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_TOGGLE_ID: &str = "toggle-widget";
const TRAY_QUIT_ID: &str = "quit-widget";

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_menu_event(|app, event: MenuEvent| match event.id().as_ref() {
            TRAY_TOGGLE_ID => {
                let _ = toggle_main_window(app, None);
            }
            TRAY_QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|app, event: TrayIconEvent| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                let _ = toggle_main_window(app, Some(rect));
            }
        })
        .setup(|app| {
            let conn = db::init_db(&app.handle()).expect("failed to initialize database");
            let _ = scoring::update_scores(&conn);

            app.manage(AppState { db: Mutex::new(conn) });

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.set_skip_taskbar(true);
                let _ = window.hide();
            }

            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            match event {
                WindowEvent::Focused(false) => {
                    let _ = window.hide();
                }
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_home_state,
            commands::complete_split,
            commands::mark_rest_day,
            commands::log_workout,
            commands::get_exercise_insights
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let tray_menu = MenuBuilder::new(app)
        .text(TRAY_TOGGLE_ID, "Open Widget")
        .separator()
        .text(TRAY_QUIT_ID, "Quit")
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .menu(&tray_menu)
        .tooltip("Iron Loop")
        .show_menu_on_left_click(false);

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;
    Ok(())
}

fn toggle_main_window(app: &AppHandle, tray_rect: Option<Rect>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };

    if window.is_visible()? {
        window.hide()?;
        return Ok(());
    }

    position_window(&window, tray_rect)?;
    window.show()?;
    window.set_focus()?;
    Ok(())
}

fn position_window(window: &tauri::WebviewWindow, tray_rect: Option<Rect>) -> tauri::Result<()> {
    let outer_size = window
        .outer_size()
        .unwrap_or_else(|_| tauri::PhysicalSize::new(420, 720));

    if let Some(rect) = tray_rect {
        if let Some(monitor) = window.primary_monitor()? {
            let tray_position = rect.position.to_physical::<i32>(monitor.scale_factor());
            let tray_size = rect.size.to_physical::<u32>(monitor.scale_factor());
            let work_area = monitor.work_area();
            let min_x = work_area.position.x + 12;
            let max_x = work_area.position.x + work_area.size.width as i32 - outer_size.width as i32 - 12;
            let min_y = work_area.position.y + 12;
            let max_y = work_area.position.y + work_area.size.height as i32 - outer_size.height as i32 - 12;

            let desired_x =
                tray_position.x + tray_size.width as i32 - outer_size.width as i32 - 8;
            let desired_y = if tray_position.y
                > work_area.position.y + (work_area.size.height as i32 / 2)
            {
                work_area.position.y + work_area.size.height as i32 - outer_size.height as i32 - 12
            } else {
                tray_position.y + tray_size.height as i32 + 12
            };

            let x = desired_x.clamp(min_x, max_x.max(min_x));
            let y = desired_y.clamp(min_y, max_y.max(min_y));
            window.set_position(PhysicalPosition::new(x, y))?;
            return Ok(());
        }
    }

    if let Some(monitor) = window.primary_monitor()? {
        let work_area = monitor.work_area();
        let x =
            work_area.position.x + work_area.size.width as i32 - outer_size.width as i32 - 24;
        let y =
            work_area.position.y + work_area.size.height as i32 - outer_size.height as i32 - 24;
        window.set_position(PhysicalPosition::new(x, y))?;
    }

    Ok(())
}
