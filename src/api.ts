import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import {
  UserSettings,
  Instance,
  ModItem,
  VersionEntry,
  JavaInstallation,
} from "./types";

const MOCK_SETTINGS: UserSettings = {
  nickname: "VantPlayer",
  custom_java_path: null,
  min_ram_mb: 2048,
  max_ram_mb: 4096,
  jvm_args: "-XX:+UseG1GC",
  selected_instance_id: "fabric-1-20-4",
};

const MOCK_INSTANCES: Instance[] = [
  {
    id: "fabric-1-20-4",
    name: "Fabric 1.20.4",
    mc_version: "1.20.4",
    loader: "fabric",
    loader_version: "0.15.11",
    created_at: 1710200000,
    icon: "fabric",
  },
  {
    id: "vanilla-survival",
    name: "Vanilla Survival",
    mc_version: "1.20.4",
    loader: "vanilla",
    created_at: 1710100000,
    icon: "grass",
  },
];

const MOCK_MODS: ModItem[] = [
  {
    filename: "sodium-fabric-mc1.20.4-0.5.8.jar",
    name: "Sodium",
    version: "0.5.8",
    description: "Nowoczesny silnik renderujący, który dramatycznie podnosi liczbę klatek FPS.",
    authors: ["jellysquid3"],
    enabled: true,
  },
  {
    filename: "lithium-fabric-mc1.20.4-0.12.1.jar",
    name: "Lithium",
    version: "0.12.1",
    description: "Optymalizacja silnika fizyki, sztucznej inteligencji mobów i tickowania chunków.",
    authors: ["jellysquid3"],
    enabled: true,
  },
  {
    filename: "iris-1.6.17-1.20.4.jar",
    name: "Iris Shaders",
    version: "1.6.17",
    description: "Szybki loader shaderów z pełnym wsparciem dla pakietów BSL, Complementary i innych.",
    authors: ["coderbot"],
    enabled: true,
  },
  {
    filename: "fabric-api-0.96.4+1.20.4.jar",
    name: "Fabric API",
    version: "0.96.4",
    description: "Niezbędna biblioteka bazowa dla modyfikacji środowiska Fabric.",
    authors: ["modmuss50"],
    enabled: true,
  },
  {
    filename: "optifine-1.20.4.jar.disabled",
    name: "OptiFine HD",
    version: "U_I7",
    description: "Modyfikacja graficzna OptiFine.",
    authors: ["sp614x"],
    enabled: false,
  },
];

const MOCK_JAVA: JavaInstallation[] = [
  {
    path: "/Users/igorpienkny/Library/Application Support/VantMcLauncher/runtimes/java-21/jdk-21.0.12.1+1/Contents/Home/bin/java",
    version_string: "21.0.12",
    major_version: 21,
    is_arm64: true,
  },
  {
    path: "/opt/homebrew/opt/openjdk@21/bin/java",
    version_string: "21.0.2",
    major_version: 21,
    is_arm64: true,
  },
];

const MOCK_VERSIONS: VersionEntry[] = [
  { id: "26.2", type: "release", url: "", release_time: "2026-06-16" },
  { id: "1.20.4", type: "release", url: "", release_time: "2023-12-07" },
  { id: "1.20.2", type: "release", url: "", release_time: "2023-09-21" },
  { id: "1.20.1", type: "release", url: "", release_time: "2023-06-12" },
  { id: "1.19.4", type: "release", url: "", release_time: "2023-03-14" },
  { id: "1.18.2", type: "release", url: "", release_time: "2022-02-28" },
  { id: "1.16.5", type: "release", url: "", release_time: "2021-01-15" },
  { id: "1.12.2", type: "release", url: "", release_time: "2017-09-18" },
  { id: "1.8.9", type: "release", url: "", release_time: "2015-12-09" },
  { id: "1.2.5", type: "release", url: "", release_time: "2012-03-29" },
];

export async function safeInvoke<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  if (isTauri()) {
    return invoke<T>(cmd, args);
  }

  // Browser Mock Implementation
  console.log(`[Mock Tauri IPC] invoke("${cmd}")`, args);

  switch (cmd) {
    case "get_settings":
      return MOCK_SETTINGS as unknown as T;
    case "save_settings":
      return undefined as unknown as T;
    case "get_instances":
      return MOCK_INSTANCES as unknown as T;
    case "create_instance":
      return {
        id: `inst-${Date.now()}`,
        name: args?.name || "Nowa Instancja",
        mc_version: args?.mcVersion || "1.20.4",
        loader: args?.loader || "fabric",
        loader_version: args?.loaderVersion,
        created_at: Math.floor(Date.now() / 1000),
        icon: args?.icon || "fabric",
      } as unknown as T;
    case "delete_instance":
      return undefined as unknown as T;
    case "open_instance_folder":
      return undefined as unknown as T;
    case "get_mods":
      return MOCK_MODS as unknown as T;
    case "toggle_mod": {
      const mod = MOCK_MODS.find((m) => m.filename === args?.filename) || MOCK_MODS[0];
      return { ...mod, enabled: !mod.enabled } as unknown as T;
    }
    case "delete_mod":
      return undefined as unknown as T;
    case "install_mod":
    case "install_mod_bytes": {
      const name = (args?.filename || args?.path?.split("/").pop() || "NowyMod.jar").replace(".jar", "");
      return {
        filename: `${name}.jar`,
        name,
        version: "1.0.0",
        description: "Nowo zainstalowana modyfikacja",
        authors: ["Autor"],
        enabled: true,
      } as unknown as T;
    }
    case "get_mc_versions":
      return MOCK_VERSIONS as unknown as T;
    case "get_fabric_loaders":
      return ["0.15.11", "0.15.10", "0.15.7", "0.14.25"] as unknown as T;
    case "get_quilt_loaders":
      return ["0.20.0-beta.9", "0.20.0-beta.8"] as unknown as T;
    case "get_neoforge_versions":
      return ["20.4.237", "20.4.236", "20.4.235"] as unknown as T;
    case "get_forge_versions":
      return ["49.0.30 (zalecana)", "49.0.38 (najnowsza)"] as unknown as T;
    case "search_modrinth_mods":
      return {
        hits: [
          {
            project_id: "AANobbMI",
            slug: "sodium",
            title: "Sodium",
            description: "Nowoczesny silnik renderujący, który dramatycznie podnosi liczbę FPS i eliminuje stuttering.",
            icon_url: "https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp",
            downloads: 223800000,
            categories: ["fabric", "neoforge", "optimization"],
            author: "jellysquid3",
          },
          {
            project_id: "gvQqBUqZ",
            slug: "lithium",
            title: "Lithium",
            description: "Optymalizacja silnika fizyki, sztucznej inteligencji mobów i tickowania chunków.",
            icon_url: "https://cdn.modrinth.com/data/gvQqBUqZ/icon.png",
            downloads: 154000000,
            categories: ["fabric", "quilt", "optimization"],
            author: "jellysquid3",
          },
          {
            project_id: "YL57xq9U",
            slug: "iris",
            title: "Iris Shaders",
            description: "Szybki loader shaderów z pełnym wsparciem dla pakietów BSL, Complementary i innych.",
            icon_url: "https://cdn.modrinth.com/data/YL57xq9U/icon.png",
            downloads: 98000000,
            categories: ["fabric", "shaders"],
            author: "coderbot",
          },
          {
            project_id: "uXXizFIs",
            slug: "ferrite-core",
            title: "FerriteCore",
            description: "Drastyczne zmniejszenie zużycia pamięci RAM przez Minecrafta (nawet o 40%).",
            icon_url: "https://cdn.modrinth.com/data/uXXizFIs/icon.png",
            downloads: 72000000,
            categories: ["fabric", "forge", "optimization"],
            author: "malte0811",
          }
        ],
        offset: 0,
        limit: 20,
        total_hits: 4,
      } as unknown as T;
    case "get_modrinth_versions":
      return [
        {
          id: "ver-1",
          project_id: args?.projectId,
          name: "Wersja 1.0.0",
          version_number: "1.0.0",
          game_versions: ["1.20.4"],
          loaders: ["fabric"],
          files: [{ url: "https://example.com/mod.jar", filename: "mod.jar", primary: true, size: 1024000 }],
        }
      ] as unknown as T;
    case "search_content":
      return [
        {
          id: "modrinth:AANobbMI",
          source: "modrinth",
          raw_id: "AANobbMI",
          slug: "sodium",
          title: "Sodium",
          description: "Nowoczesny silnik renderujący, który dramatycznie podnosi liczbę FPS.",
          icon_url: "https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp",
          downloads: 223800000,
          categories: ["fabric", "neoforge", "optimization"],
          author: "jellysquid3",
          category: args?.category || "mods",
        },
        {
          id: "curseforge:238222",
          source: "curseforge",
          raw_id: "238222",
          slug: "jei",
          title: "Just Enough Items (JEI)",
          description: "Przeglądarka przedmiotów i receptur craftingu dla gry Minecraft.",
          icon_url: "https://media.forgecdn.net/avatars/thumbnails/28/670/256/256/635838942200926830.png",
          downloads: 310000000,
          categories: ["Utility", "Information"],
          author: "mezz",
          category: args?.category || "mods",
        }
      ] as unknown as T;
    case "get_content_versions":
      return [
        {
          id: "ver-1",
          source: args?.source || "modrinth",
          project_id: args?.projectId || "sample",
          name: "Wydanie 1.0.0 (Najnowsza)",
          version_number: "1.0.0",
          release_type: "release",
          game_versions: ["26.2", "1.21.1", "1.20.4"],
          loaders: ["fabric", "neoforge"],
          file_name: "sample-mod-1.0.0.jar",
          file_size: 1850000,
          download_url: "https://example.com/mod.jar",
          date: "2026-09-10",
        },
        {
          id: "ver-2",
          source: args?.source || "modrinth",
          project_id: args?.projectId || "sample",
          name: "Wydanie 0.9.1 (Kompatybilna)",
          version_number: "0.9.1",
          release_type: "release",
          game_versions: ["26.2"],
          loaders: ["fabric"],
          file_name: "sample-mod-0.9.1.jar",
          file_size: 1720000,
          download_url: "https://example.com/mod-compat.jar",
          date: "2026-08-20",
        },
        {
          id: "ver-3",
          source: args?.source || "modrinth",
          project_id: args?.projectId || "sample",
          name: "Wersja Beta 0.9.0",
          version_number: "0.9.0-beta",
          release_type: "beta",
          game_versions: ["26.2", "1.21"],
          loaders: ["fabric"],
          file_name: "sample-mod-0.9.0-beta.jar",
          file_size: 1690000,
          download_url: "https://example.com/mod-beta.jar",
          date: "2026-08-01",
        }
      ] as unknown as T;
    case "install_content_file":
      return {
        filename: args?.filename || "item.jar",
        name: args?.filename?.replace(".jar", "").replace(".zip", "") || "Nowy Element",
        enabled: true,
        size: 1024000,
        category: args?.category || "mods",
        description: "Pobrano do folderu",
      } as unknown as T;
    case "get_content_items":
      return [
        {
          filename: "sodium-fabric-0.9.1+mc26.2.jar",
          name: "Sodium",
          enabled: true,
          size: 1834384,
          category: "mods",
          description: "Modern rendering engine",
        }
      ] as unknown as T;
    case "toggle_content_item":
      return {
        filename: args?.filename?.endsWith(".disabled")
          ? args.filename.replace(".disabled", "")
          : `${args?.filename}.disabled`,
        name: "Element",
        enabled: !args?.filename?.endsWith(".disabled"),
        size: 1000,
        category: args?.category || "mods",
        description: "Element",
      } as unknown as T;
    case "delete_content_item":
      return undefined as unknown as T;
    case "get_java_installations":
      return MOCK_JAVA as unknown as T;
    case "download_java":
      return "/mock/java/bin/java" as unknown as T;
    case "get_offline_uuid_cmd":
      return "00000000-0000-3000-8000-000000000000" as unknown as T;
    case "launch_game":
      return undefined as unknown as T;
    case "kill_game":
      return undefined as unknown as T;
    case "is_game_running":
      return false as unknown as T;
    case "get_running_instance_id":
      return null as unknown as T;
    case "get_system_stats":
      return {
        cpu_usage: 12.8,
        ram_used_mb: 8192,
        ram_total_mb: 16384,
        ram_pct: 50.0,
        cpu_temp: 43.5,
        thermal_status: "Optymalna",
        minecraft_ram_mb: 1840,
      } as unknown as T;
    default:
      return undefined as unknown as T;
  }
}

export function safeListen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (isTauri()) {
    return listen<T>(event, handler);
  }
  // No-op in browser mock
  return Promise.resolve(() => {});
}
