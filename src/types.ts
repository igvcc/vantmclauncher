export interface UserSettings {
  nickname: string;
  custom_java_path: string | null;
  min_ram_mb: number;
  max_ram_mb: number;
  jvm_args: string;
  selected_instance_id: string | null;
  arm_optimization?: boolean;
}

export interface ModrinthMod {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  follows?: number;
  categories: string[];
  client_side?: string;
  server_side?: string;
  author: string;
}

export interface ModrinthSearchResult {
  hits: ModrinthMod[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface ModrinthFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export type ContentType = "mods" | "resourcepacks" | "shaderpacks" | "datapacks";
export type ContentSource = "all" | "modrinth" | "curseforge";

export interface UnifiedCatalogItem {
  id: string;
  source: "modrinth" | "curseforge";
  raw_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  categories: string[];
  author: string;
  category: ContentType;
}

export interface UnifiedVersionItem {
  id: string;
  source: "modrinth" | "curseforge";
  project_id: string;
  name: string;
  version_number: string;
  release_type: "release" | "beta" | "alpha" | string;
  game_versions: string[];
  loaders: string[];
  file_name: string;
  file_size: number;
  download_url: string;
  date?: string | null;
}

export interface UnifiedInstalledItem {
  filename: string;
  name: string;
  enabled: boolean;
  size: number;
  category: ContentType;
  description: string;
  icon_base64?: string | null;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: ModrinthFile[];
  version_type?: string;
  date_published?: string;
}

export interface Instance {
  id: string;
  name: string;
  mc_version: string;
  loader: "vanilla" | "fabric" | "forge" | "neoforge" | "quilt";
  loader_version?: string;
  created_at: number;
  memory_mb?: number;
  icon: string;
}

export interface ModItem {
  filename: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  enabled: boolean;
  icon_base64?: string;
}

export interface VersionEntry {
  id: string;
  type: string;
  url: string;
  release_time: string;
}

export interface JavaInstallation {
  path: string;
  version_string: string;
  major_version: number;
  is_arm64: boolean;
}

export interface DownloadProgress {
  step: string;
  current: number;
  total: number;
  percentage: number;
  message: string;
}

export interface LaunchLogPayload {
  instance_id: string;
  line: string;
  is_error: boolean;
}

export interface SystemStats {
  cpu_usage: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_pct: number;
  cpu_temp: number | null;
  thermal_status: string;
  minecraft_ram_mb?: number | null;
}

