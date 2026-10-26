use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

const TRAY_ID: &str = "lof-audio-tray";
const OPEN_ID: &str = "lof-audio-tray-open";
const EXIT_ID: &str = "lof-audio-tray-exit";

fn restore_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        if window.is_minimized()? {
            window.unminimize()?;
        }
        window.set_focus()?;
    }
    Ok(())
}

fn restore(app: &AppHandle) {
    if let Err(error) = restore_window(app) {
        eprintln!("트레이에서 창 복원 실패: {error}");
    }
}

fn ensure_tray(app: &AppHandle) -> Result<(), String> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    let icon = app
        .default_window_icon()
        .ok_or("트레이에 사용할 앱 아이콘이 없습니다.")?
        .clone();
    let create = || -> tauri::Result<()> {
        let open = MenuItem::with_id(app, OPEN_ID, "Lof Audio 열기", true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(app)?;
        let exit = MenuItem::with_id(app, EXIT_ID, "종료", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&open, &separator, &exit])?;
        // Tauri retains the icon in its resource table for the app's lifetime.
        TrayIconBuilder::with_id(TRAY_ID)
            .icon(icon)
            .tooltip("Lof Audio — 클릭하여 열기")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id.as_ref() {
                OPEN_ID => restore(app),
                EXIT_ID => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if matches!(
                    event,
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } | TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    }
                ) {
                    restore(tray.app_handle());
                }
            })
            .build(app)?;
        Ok(())
    };
    create().map_err(|error| format!("트레이 아이콘 생성 실패: {error}"))
}

#[tauri::command]
pub(crate) fn minimize_to_tray(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("앱 창을 찾을 수 없습니다.")?;
    // Keep the window accessible when creating a tray icon fails.
    ensure_tray(&app)?;
    window.hide().map_err(|error| error.to_string())
}
