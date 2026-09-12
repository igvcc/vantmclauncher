import { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  Search,
  Trash2,
  UploadCloud,
  CheckCircle,
  XCircle,
  Puzzle,
  PlusCircle,
  AlertTriangle,
  Sparkles,
  Loader2,
  ArrowDownToLine,
  Check
} from "lucide-react";
import { Instance, ModItem, ModrinthMod, ModrinthSearchResult, ModrinthVersion } from "../types";
import { safeInvoke } from "../api";

interface ModsViewProps {
  activeInstance: Instance | null;
  mods: ModItem[];
  isLoading: boolean;
  onToggleMod: (filename: string) => void;
  onDeleteMod: (filename: string) => void;
  onInstallModFile: (path: string) => void;
  onInstallModBytes?: (filename: string, bytes: number[]) => void;
  onOpenModsFolder: () => void;
  onModInstalled?: () => void;
}

export const ModsView: React.FC<ModsViewProps> = ({
  activeInstance,
  mods,
  isLoading,
  onToggleMod,
  onDeleteMod,
  onInstallModFile,
  onInstallModBytes,
  onOpenModsFolder,
  onModInstalled,
}) => {
  const [subTab, setSubTab] = useState<"installed" | "catalog">(() => {
    const p = new URLSearchParams(window.location.search).get("subtab");
    return p === "catalog" ? "catalog" : "installed";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [modPendingDelete, setModPendingDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modrinth Catalog state
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("all");
  const [catalogMods, setCatalogMods] = useState<ModrinthMod[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [installingMods, setInstallingMods] = useState<Record<string, boolean>>({});
  const [installedNotice, setInstalledNotice] = useState<string | null>(null);

  // Native Tauri v2 window drag-and-drop listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupTauriDrop = async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const fn = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            if (event.payload.paths && event.payload.paths.length > 0) {
              for (const p of event.payload.paths) {
                if (p.endsWith(".jar") || p.endsWith(".jar.disabled")) {
                  onInstallModFile(p);
                }
              }
            }
          } else {
            setIsDragging(false);
          }
        });
        unlisten = fn;
      } catch {
        // Running in browser preview
      }
    };

    setupTauriDrop();
    return () => {
      if (unlisten) unlisten();
    };
  }, [onInstallModFile]);

  // Modrinth Search Effect
  useEffect(() => {
    if (subTab !== "catalog") return;

    const timer = setTimeout(async () => {
      setIsSearchingCatalog(true);
      try {
        const res = await safeInvoke<ModrinthSearchResult>("search_modrinth_mods", {
          query: catalogQuery,
          loader: activeInstance?.loader,
          mcVersion: activeInstance?.mc_version,
          limit: 30,
          offset: 0,
        });

        if (res && res.hits) {
          let hits = res.hits;
          if (catalogCategory !== "all") {
            hits = hits.filter((m) =>
              m.categories.some((c) => c.toLowerCase() === catalogCategory.toLowerCase())
            );
          }
          setCatalogMods(hits);
        }
      } catch (err) {
        console.error("Błąd wyszukiwania w Modrinth:", err);
      } finally {
        setIsSearchingCatalog(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [subTab, catalogQuery, catalogCategory, activeInstance?.loader, activeInstance?.mc_version]);

  const handleInstallFromCatalog = async (mod: ModrinthMod) => {
    if (!activeInstance) return;

    setInstallingMods((prev) => ({ ...prev, [mod.project_id]: true }));
    try {
      const versions = await safeInvoke<ModrinthVersion[]>("get_modrinth_versions", {
        projectId: mod.project_id,
        loader: activeInstance.loader,
        mcVersion: activeInstance.mc_version,
      });

      if (!versions || versions.length === 0 || !versions[0].files || versions[0].files.length === 0) {
        alert(`Brak kompatybilnej wersji moda ${mod.title} dla ${activeInstance.loader} ${activeInstance.mc_version}`);
        return;
      }

      const targetFile = versions[0].files.find((f) => f.primary) || versions[0].files[0];
      await safeInvoke("install_modrinth_mod", {
        instanceId: activeInstance.id,
        fileUrl: targetFile.url,
        filename: targetFile.filename,
      });

      setInstalledNotice(`Zainstalowano: ${mod.title}!`);
      setTimeout(() => setInstalledNotice(null), 3000);
      if (onModInstalled) onModInstalled();
    } catch (err) {
      console.error("Błąd instalacji moda z Modrinth:", err);
      alert(`Nie udało się zainstalować moda: ${err}`);
    } finally {
      setInstallingMods((prev) => ({ ...prev, [mod.project_id]: false }));
    }
  };

  const isModInstalledLocally = (modTitle: string, modSlug: string) => {
    const t = modTitle.toLowerCase();
    const s = modSlug.toLowerCase();
    return mods.some((m) => {
      const mn = m.name.toLowerCase();
      const fn = m.filename.toLowerCase();
      return mn.includes(t) || fn.includes(s) || s.includes(mn);
    });
  };

  const filteredMods = mods.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.authors.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path;
        if (filePath && (filePath.endsWith(".jar") || filePath.endsWith(".jar.disabled"))) {
          onInstallModFile(filePath);
        } else if (onInstallModBytes && (file.name.endsWith(".jar") || file.name.endsWith(".jar.disabled"))) {
          const buffer = await file.arrayBuffer();
          onInstallModBytes(file.name, Array.from(new Uint8Array(buffer)));
        }
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path;
        if (filePath) {
          onInstallModFile(filePath);
        } else if (onInstallModBytes) {
          const buffer = await file.arrayBuffer();
          onInstallModBytes(file.name, Array.from(new Uint8Array(buffer)));
        }
      }
      e.target.value = "";
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 flex flex-col relative z-10">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".jar,.jar.disabled"
        multiple
        className="hidden"
      />

      {/* Notice Banner */}
      {installedNotice && (
        <div className="fixed bottom-8 right-8 z-50 px-5 py-3 rounded-2xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle size={16} className="text-emerald-400" />
          <span>{installedNotice}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-neon-cyan text-xs font-semibold tracking-wider uppercase mb-2">
            <Puzzle size={13} />
            <span>Centrum Modów</span>
          </div>
          <h2 className="text-3xl font-heading font-extrabold text-white tracking-tight">
            Mody — <span className="text-neon-cyan">{activeInstance ? activeInstance.name : "Wybierz profil"}</span>
          </h2>
          <p className="text-gray-400 text-xs mt-1">
            Przeciągaj pliki z dysku lub pobieraj mody jednym kliknięciem z bazy Modrinth.
          </p>
        </div>

        <button
          onClick={onOpenModsFolder}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg hover:border-cyan-400/40"
        >
          <FolderOpen size={16} className="text-neon-cyan" />
          <span>Folder z modami</span>
        </button>
      </div>

      {/* Sub-Tabs: Zainstalowane vs Katalog Modrinth */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setSubTab("installed")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold tracking-wider transition-all cursor-pointer ${
            subTab === "installed"
              ? "bg-white text-black font-bold shadow-[0_0_20px_rgba(255,255,255,0.25)] scale-[1.02]"
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Puzzle size={14} />
          <span>Zainstalowane ({mods.length})</span>
        </button>

        <button
          onClick={() => setSubTab("catalog")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold tracking-wider transition-all cursor-pointer ${
            subTab === "catalog"
              ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-bold shadow-[0_0_25px_rgba(0,242,255,0.35)] scale-[1.02]"
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Sparkles size={14} className={subTab === "catalog" ? "text-black" : "text-neon-cyan"} />
          <span>Katalog Modrinth (Online)</span>
        </button>
      </div>

      {/* TAB 1: INSTALLED MODS */}
      {subTab === "installed" && (
        <>
          {/* Drag & Drop Hero Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-3xl p-8 mb-6 border-2 border-dashed transition-all flex flex-col items-center justify-center text-center ${
              isDragging
                ? "border-neon-cyan bg-cyan-500/15 shadow-neon-cyan scale-[1.01]"
                : "border-white/10 bg-black/40 hover:border-white/20 hover:bg-black/60"
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center text-neon-cyan mb-3 shadow-[0_0_20px_rgba(0,242,255,0.25)]">
              <UploadCloud size={30} />
            </div>
            <h3 className="font-heading font-extrabold text-base text-white mb-1">
              Upuść pliki .jar tutaj
            </h3>
            <p className="text-xs text-gray-400 max-w-sm mb-4">
              Przeciągnij pobrany plik z komputera, a automatycznie dodamy go do Twojej gry.
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition-all cursor-pointer shadow-lg hover:border-cyan-400/50"
            >
              <PlusCircle size={15} className="text-neon-cyan" />
              <span>Wybierz pliki z dysku</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="relative mb-5">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Szukaj w zainstalowanych modach..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/50 transition-colors"
            />
          </div>

          {/* List of Mods */}
          <div className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center p-12 text-gray-500">
                <Loader2 size={24} className="animate-spin text-neon-cyan mr-3" />
                <span className="text-sm">Wczytywanie modów...</span>
              </div>
            ) : filteredMods.length === 0 ? (
              <div className="glass-panel rounded-3xl p-12 text-center text-gray-500">
                <Puzzle size={40} className="mx-auto mb-3 opacity-30 text-neon-cyan" />
                <p className="font-medium text-sm text-gray-400">Brak modów w tym profilu</p>
                <p className="text-xs text-gray-500 mt-1">
                  Przeciągnij plik .jar lub kliknij w Katalog Modrinth powyżej, aby coś dodać.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                {filteredMods.map((mod) => {
                  const cleanedDesc = mod.description
                    .replace(/^['"]{1,3}|['"]{1,3}$/g, "")
                    .replace(/\s+/g, " ")
                    .trim();
                  const displayDesc = cleanedDesc.length > 0 && cleanedDesc !== "'''" && cleanedDesc !== "\"\"\""
                    ? cleanedDesc
                    : "Modyfikacja gry Minecraft";

                  const cleanedVer = mod.version.split("#")[0].replace(/^["']|["']$/g, "").trim();
                  const displayVer = cleanedVer.startsWith("v") ? cleanedVer : `v${cleanedVer}`;

                  const cleanName = mod.name.replace(/^["']|["']$/g, "").trim();
                  const words = cleanName.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/);
                  const initials = words.length >= 2
                    ? (words[0][0] + words[1][0]).toUpperCase()
                    : cleanName.slice(0, 2).toUpperCase() || "MD";

                  return (
                    <div
                      key={mod.filename}
                      className={`glass-panel rounded-2xl p-4 transition-all duration-200 border flex items-center justify-between gap-4 ${
                        mod.enabled
                          ? "border-white/10 hover:border-cyan-500/30 hover:bg-white/[0.04]"
                          : "border-white/5 opacity-60 bg-black/40"
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className="w-13 h-13 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-md">
                          {mod.icon_base64 ? (
                            <img
                              src={mod.icon_base64}
                              alt={cleanName}
                              className="w-full h-full object-cover rounded-xl"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-cyan-950/80 via-black to-purple-950/60 flex items-center justify-center border border-cyan-500/20 text-neon-cyan font-heading font-black text-sm shadow-inner">
                              {initials}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5 mb-1">
                            <h4 className="font-heading font-bold text-sm text-white truncate" title={cleanName}>
                              {cleanName}
                            </h4>
                            <span
                              className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/10 max-w-[120px] truncate"
                              title={displayVer}
                            >
                              {displayVer}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed" title={displayDesc}>
                            {displayDesc}
                          </p>
                          {mod.authors.length > 0 && (
                            <p className="text-[10px] text-gray-500 truncate mt-1">Autorzy: {mod.authors.join(", ")}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <button
                          onClick={() => onToggleMod(mod.filename)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                            mod.enabled
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                              : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {mod.enabled ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          <span>{mod.enabled ? "Włączony" : "Wyłączony"}</span>
                        </button>

                        <button
                          onClick={() => setModPendingDelete(mod.filename)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer"
                          title="Usuń moda"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: MODRINTH ONLINE CATALOG */}
      {subTab === "catalog" && (
        <div className="flex flex-col gap-5">
          {/* Search & Categories Toolbar */}
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Szukaj modów na Modrinth (np. Sodium, Iris, Lithium, JEI)..."
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/50 transition-colors"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1">
              {[
                { id: "all", label: "Wszystkie" },
                { id: "optimization", label: "Wydajność" },
                { id: "shaders", label: "Shadery" },
                { id: "utility", label: "Narzędzia" },
                { id: "adventure", label: "Przygoda" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCatalogCategory(cat.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    catalogCategory === cat.id
                      ? "bg-cyan-500/20 text-neon-cyan border border-cyan-400/40 shadow-neon-cyan"
                      : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results Grid */}
          {isSearchingCatalog ? (
            <div className="flex items-center justify-center p-16 text-gray-400">
              <Loader2 size={26} className="animate-spin text-neon-cyan mr-3" />
              <span className="text-sm font-semibold">Wyszukiwanie w bazie Modrinth...</span>
            </div>
          ) : catalogMods.length === 0 ? (
            <div className="glass-panel rounded-3xl p-12 text-center text-gray-500">
              <Sparkles size={36} className="mx-auto mb-3 opacity-30 text-neon-cyan" />
              <p className="font-medium text-sm text-gray-400">Nie znaleziono modów dla podanych kryteriów</p>
              <p className="text-xs text-gray-600 mt-1">Spróbuj wpisać inną frazę lub wybrać kategorię "Wszystkie".</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalogMods.map((mod) => {
                const isInstalled = isModInstalledLocally(mod.title, mod.slug);
                const isInstalling = installingMods[mod.project_id] || false;

                return (
                  <div
                    key={mod.project_id}
                    className="glass-panel rounded-2xl p-4.5 border border-white/10 hover:border-cyan-500/30 hover:bg-white/[0.04] transition-all flex flex-col justify-between gap-3 shadow-lg"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-14 h-14 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-inner p-1">
                        {mod.icon_url ? (
                          <img
                            src={mod.icon_url}
                            alt={mod.title}
                            className="w-full h-full object-cover rounded-xl"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <Puzzle size={24} className="text-neon-cyan" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-heading font-bold text-sm text-white truncate">{mod.title}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-neon-cyan border border-cyan-500/20 shrink-0">
                            {(mod.downloads / 1000000).toFixed(1)}M pobrań
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                          {mod.description}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1">Autor: {mod.author}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="flex items-center gap-1.5 flex-wrap max-w-xs">
                        {mod.categories.slice(0, 3).map((cat) => (
                          <span
                            key={cat}
                            className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-white/5 text-gray-400 border border-white/5"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>

                      {isInstalled ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                          <Check size={13} />
                          <span>Zainstalowano</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleInstallFromCatalog(mod)}
                          disabled={isInstalling}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-bold text-xs shadow-neon-cyan transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isInstalling ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <ArrowDownToLine size={13} />
                          )}
                          <span>{isInstalling ? "Pobieranie..." : "Zainstaluj"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-panel border border-rose-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                <AlertTriangle size={20} />
              </div>
              <h3 className="font-heading font-bold text-lg text-white">Potwierdź usunięcie</h3>
            </div>
            <p className="text-xs text-gray-300 mb-6 leading-relaxed">
              Czy na pewno chcesz bezpowrotnie usunąć modyfikację{" "}
              <span className="font-mono text-white bg-white/10 px-2 py-0.5 rounded font-semibold">
                {modPendingDelete}
              </span>{" "}
              z dysku?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setModPendingDelete(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={() => {
                  onDeleteMod(modPendingDelete);
                  setModPendingDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-bold text-white transition-colors cursor-pointer shadow-lg shadow-rose-900/30"
              >
                Usuń z dysku
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
