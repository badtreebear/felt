// Coach API key, stored in the OS keychain rather than plaintext localStorage.
const KEY_SERVICE: &str = "com.badtreebear.felt";

fn key_entry(id: &str) -> Result<keyring::Entry, String> {
  let account = format!("coach-api-key-{}", id);
  keyring::Entry::new(KEY_SERVICE, &account).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_coach_key(id: String, key: String) -> Result<(), String> {
  key_entry(&id)?.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_coach_key(id: String) -> Result<Option<String>, String> {
  match key_entry(&id)?.get_password() {
    Ok(password) => Ok(Some(password)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn delete_coach_key(id: String) -> Result<(), String> {
  match key_entry(&id)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn get_legacy_coach_key() -> Result<Option<String>, String> {
  match keyring::Entry::new(KEY_SERVICE, "coach-api-key").map_err(|e| e.to_string())?.get_password() {
    Ok(password) => Ok(Some(password)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn delete_legacy_coach_key() -> Result<(), String> {
  match keyring::Entry::new(KEY_SERVICE, "coach-api-key").map_err(|e| e.to_string())?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      set_coach_key,
      get_coach_key,
      delete_coach_key,
      get_legacy_coach_key,
      delete_legacy_coach_key
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
