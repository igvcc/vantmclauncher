mod auth;
mod config;
mod downloader;
mod instances;
mod java;
mod launcher;
mod loaders_api;
mod models;
mod modrinth;
mod mojang;
mod mods;
mod paths;

use launcher::GameProcessState;
use models::{Instance, JavaInstallation, ModItem, UserSettings, VersionEntry};
use modrinth::{ModrinthSearchResult, ModrinthVersion};
use tauri::AppHandle;

#[tauri::command]
fn get_settings() -> UserSettings {
    config::load_settings()
}

#[tauri::command]
fn save_settings(settings: UserSettings) -> Result<(), String> {
    config::save_settings(&settings)
}

#[tauri::command]
fn get_instances() -> Result<Vec<Instance>, String> {
    instances::list_instances()
}

#[tauri::command]
fn create_instance(
    name: String,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    icon: String,
) -> Result<Instance, String> {
    instances::create_instance(&name, &mc_version, &loader, loader_version, &icon)
}

#[tauri::command]
fn delete_instance(id: String) -> Result<(), String> {
    instances::delete_instance(&id)
}

#[tauri::command]
fn open_instance_folder(id: String, subfolder: Option<String>) -> Result<(), String> {
    instances::open_instance_folder(&id, subfolder.as_deref())
}

#[tauri::command]
fn get_mods(instance_id: String) -> Result<Vec<ModItem>, String> {
    mods::list_mods(&instance_id)
}

#[tauri::command]
fn toggle_mod(instance_id: String, filename: String) -> Result<ModItem, String> {
    mods::toggle_mod(&instance_id, &filename)
}

#[tauri::command]
fn delete_mod(instance_id: String, filename: String) -> Result<(), String> {
    mods::delete_mod(&instance_id, &filename)
}

#[tauri::command]
fn install_mod(instance_id: String, path: String) -> Result<ModItem, String> {
    mods::install_mod_from_path(&instance_id, &path)
}

#[tauri::command]
fn install_mod_bytes(instance_id: String, filename: String, bytes: Vec<u8>) -> Result<ModItem, String> {
    mods::install_mod_bytes(&instance_id, &filename, &bytes)
}

#[tauri::command]
async fn get_mc_versions() -> Result<Vec<VersionEntry>, String> {
    mojang::get_mc_versions().await
}

#[tauri::command]
async fn get_fabric_loaders(game_version: String) -> Result<Vec<String>, String> {
    mojang::get_fabric_loaders(&game_version).await
}

#[tauri::command]
async fn get_quilt_loaders(game_version: String) -> Result<Vec<String>, String> {
    loaders_api::get_quilt_loaders(&game_version).await
}

#[tauri::command]
async fn get_neoforge_versions(game_version: String) -> Result<Vec<String>, String> {
    loaders_api::get_neoforge_versions(&game_version).await
}

#[tauri::command]
async fn get_forge_versions(game_version: String) -> Result<Vec<String>, String> {
    loaders_api::get_forge_versions(&game_version).await
}

#[tauri::command]
async fn search_modrinth_mods(
    query: String,
    loader: Option<String>,
    mc_version: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<ModrinthSearchResult, String> {
    modrinth::search_mods(
        &query,
        loader.as_deref(),
        mc_version.as_deref(),
        limit.unwrap_or(20),
        offset.unwrap_or(0),
    )
    .await
}

#[tauri::command]
async fn get_modrinth_versions(
    project_id: String,
    loader: Option<String>,
    mc_version: Option<String>,
) -> Result<Vec<ModrinthVersion>, String> {
    modrinth::get_project_versions(&project_id, loader.as_deref(), mc_version.as_deref()).await
}

#[tauri::command]
async fn install_modrinth_mod(
    instance_id: String,
    file_url: String,
    filename: String,
) -> Result<ModItem, String> {
    modrinth::install_mod_version(&instance_id, &file_url, &filename).await
}

#[tauri::command]
fn get_java_installations() -> Vec<JavaInstallation> {
    java::scan_java_installations()
}

#[tauri::command]
async fn download_java(version: u32, app_handle: AppHandle) -> Result<String, String> {
    java::download_temurin_java(version, app_handle).await
}

#[tauri::command]
async fn launch_game(instance_id: String, app_handle: AppHandle) -> Result<(), String> {
    launcher::launch_minecraft(&instance_id, app_handle).await
}

#[tauri::command]
fn kill_game(app_handle: AppHandle, instance_id: Option<String>) -> Result<(), String> {
    launcher::kill_game_process(&app_handle, instance_id)
}

#[tauri::command]
fn is_game_running(app_handle: AppHandle, instance_id: Option<String>) -> bool {
    launcher::is_game_running(&app_handle, instance_id)
}

#[tauri::command]
fn get_running_instance_id(app_handle: AppHandle) -> Option<String> {
    launcher::get_running_instance_id(&app_handle)
}

#[tauri::command]
fn get_offline_uuid_cmd(nickname: String) -> String {
    auth::get_offline_uuid(&nickname)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(GameProcessState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_instances,
            create_instance,
            delete_instance,
            open_instance_folder,
            get_mods,
            toggle_mod,
            delete_mod,
            install_mod,
            install_mod_bytes,
            get_mc_versions,
            get_fabric_loaders,
            get_quilt_loaders,
            get_neoforge_versions,
            get_forge_versions,
            search_modrinth_mods,
            get_modrinth_versions,
            install_modrinth_mod,
            get_java_installations,
            download_java,
            launch_game,
            kill_game,
            is_game_running,
            get_running_instance_id,
            get_offline_uuid_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
