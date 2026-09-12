use crate::models::UserSettings;
use crate::paths::get_config_file;
use std::fs;

pub fn load_settings() -> UserSettings {
    let config_path = get_config_file();
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(settings) = serde_json::from_str::<UserSettings>(&content) {
                return settings;
            }
        }
    }
    let default_settings = UserSettings::default();
    let _ = save_settings(&default_settings);
    default_settings
}

pub fn save_settings(settings: &UserSettings) -> Result<(), String> {
    let config_path = get_config_file();
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Błąd serializacji ustawień: {}", e))?;
    fs::write(config_path, content)
        .map_err(|e| format!("Błąd zapisu ustawień: {}", e))?;
    Ok(())
}
