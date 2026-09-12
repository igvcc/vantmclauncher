export interface UserSettings {
  nickname: string;
  custom_java_path: string | null;
  min_ram_mb: number;
  max_ram_mb: number;
  jvm_args: string;
  selected_instance_id: string | null;
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
