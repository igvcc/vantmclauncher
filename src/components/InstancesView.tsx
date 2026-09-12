import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Layers, Play, FolderOpen, Trash2, Box, X, Loader2, Search, AlertTriangle } from "lucide-react";
import { Instance, VersionEntry } from "../types";
import { safeInvoke } from "../api";

interface InstancesViewProps {
  instances: Instance[];
  activeInstanceId: string | null;
  onSelectInstance: (id: string) => void;
  onLaunchInstance: (id: string) => void;
  onDeleteInstance: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onCreateInstance: (
    name: string,
    mcVersion: string,
    loader: string,
    loaderVersion?: string,
    icon?: string
  ) => void;
  availableVersions: VersionEntry[];
  fabricLoaders: string[];
  fetchFabricLoaders: (mcVer: string) => void;
}

export const InstancesView: React.FC<InstancesViewProps> = ({
  instances,
  activeInstanceId,
  onSelectInstance,
  onLaunchInstance,
  onDeleteInstance,
  onOpenFolder,
  onCreateInstance,
  availableVersions,
  fabricLoaders,
  fetchFabricLoaders,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState("26.2");
  const [loader, setLoader] = useState<"fabric" | "vanilla" | "forge" | "neoforge" | "quilt">("fabric");
  const [loaderVersion, setLoaderVersion] = useState("");
  const [loaderVersionsList, setLoaderVersionsList] = useState<string[]>([]);
  const [isLoadingLoaders, setIsLoadingLoaders] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [mcVersionSearch, setMcVersionSearch] = useState("");
  const [loaderVersionSearch, setLoaderVersionSearch] = useState("");
  const hasInitializedVersion = useRef(false);

  useEffect(() => {
    if (availableVersions.length > 0 && !hasInitializedVersion.current) {
      hasInitializedVersion.current = true;
      const latest = availableVersions.find((v) => v.type === "release");
      if (latest) {
        setMcVersion(latest.id);
      }
    }
  }, [availableVersions]);

  useEffect(() => {
    const isOldLegacy =
      mcVersion.startsWith("rd-") ||
      mcVersion.startsWith("c0.") ||
      mcVersion.startsWith("inf-") ||
      mcVersion.startsWith("a1.") ||
      mcVersion.startsWith("b1.");
    if (isOldLegacy && loader !== "vanilla") {
      setLoader("vanilla");
    }
  }, [mcVersion]);

  useEffect(() => {
    let active = true;
    if (loader === "vanilla") {
      setLoaderVersionsList([]);
      setLoaderVersion("");
      return;
    }

    setIsLoadingLoaders(true);
    const fetchVersions = async () => {
      try {
        let versions: string[] = [];
        if (loader === "fabric") {
          fetchFabricLoaders(mcVersion);
          return;
        } else if (loader === "quilt") {
          versions = await safeInvoke<string[]>("get_quilt_loaders", { gameVersion: mcVersion });
        } else if (loader === "neoforge") {
          versions = await safeInvoke<string[]>("get_neoforge_versions", { gameVersion: mcVersion });
        } else if (loader === "forge") {
          versions = await safeInvoke<string[]>("get_forge_versions", { gameVersion: mcVersion });
        }
        if (active) {
          setLoaderVersionsList(versions || []);
          if (versions && versions.length > 0) {
            setLoaderVersion(versions[0]);
          } else {
            setLoaderVersion("");
          }
        }
      } catch (err) {
        console.error("Błąd pobierania wersji loadera:", err);
      } finally {
        if (active) setIsLoadingLoaders(false);
      }
    };
    fetchVersions();
    return () => {
      active = false;
    };
  }, [loader, mcVersion]);

  useEffect(() => {
    if (loader === "fabric") {
      setLoaderVersionsList(fabricLoaders);
      if (fabricLoaders.length > 0) {
        setLoaderVersion(fabricLoaders[0]);
      }
      setIsLoadingLoaders(false);
    }
  }, [loader, fabricLoaders]);

  const filteredMcVersions = useMemo(() => {
    const query = mcVersionSearch.trim().toLowerCase();
    return availableVersions.filter((v) => {
      if (query) {
        return v.id.toLowerCase().includes(query) || v.type.toLowerCase().includes(query);
      }
      if (!showSnapshots && v.type !== "release") {
        return false;
      }
      return true;
    });
  }, [availableVersions, showSnapshots, mcVersionSearch]);

  const releaseVersions = useMemo(
    () => filteredMcVersions.filter((v) => v.type === "release"),
    [filteredMcVersions]
  );
  const snapshotVersions = useMemo(
    () => filteredMcVersions.filter((v) => v.type === "snapshot"),
    [filteredMcVersions]
  );
  const otherVersions = useMemo(
    () => filteredMcVersions.filter((v) => v.type !== "release" && v.type !== "snapshot"),
    [filteredMcVersions]
  );

  const filteredLoaderVersions = useMemo(() => {
    if (!loaderVersionSearch.trim()) return loaderVersionsList;
    return loaderVersionsList.filter((v) =>
      v.toLowerCase().includes(loaderVersionSearch.toLowerCase().trim())
    );
  }, [loaderVersionsList, loaderVersionSearch]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const isLoaderUnavailable = loader !== "vanilla" && loaderVersionsList.length === 0;
    const effectiveLoader = isLoaderUnavailable ? "vanilla" : loader;
    const finalName = name.trim() || `${effectiveLoader.toUpperCase()} ${mcVersion}`;
    onCreateInstance(
      finalName,
      mcVersion,
      effectiveLoader,
      effectiveLoader !== "vanilla" && loaderVersion ? loaderVersion : undefined,
      effectiveLoader === "vanilla" ? "grass" : effectiveLoader
    );
    setIsModalOpen(false);
    setName("");
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 flex flex-col relative z-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-neon-cyan text-xs font-semibold tracking-wider uppercase mb-2">
            <Layers size={13} />
            <span>Profile i Wersje</span>
          </div>
          <h2 className="text-3xl font-heading font-extrabold text-white tracking-tight">
            Profile Gry
          </h2>
          <p className="text-gray-400 text-xs mt-1">
            Twórz osobne profile na mody, shadery lub czystą grę ze znajomymi.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-neon flex items-center gap-2 px-5 py-2.5 rounded-xl font-heading font-bold text-xs tracking-wider uppercase cursor-pointer"
        >
          <Plus size={16} />
          <span>Nowy Profil</span>
        </button>
      </div>

      {/* Grid of Instances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {instances.map((inst) => {
          const isActive = inst.id === activeInstanceId;
          return (
            <div
              key={inst.id}
              className={`glass-panel rounded-2xl p-5 flex flex-col justify-between transition-all relative overflow-hidden ${
                isActive
                  ? "border-cyan-400/50 shadow-neon-cyan bg-cyan-950/10"
                  : "hover:border-white/20"
              }`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 px-3 py-1 bg-cyan-400 text-black font-bold text-[10px] tracking-wider uppercase rounded-bl-xl shadow-md">
                  Wybrany
                </div>
              )}

              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-12 h-12 min-w-[48px] min-h-[48px] max-w-[48px] max-h-[48px] rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-neon-cyan shrink-0 shadow-md"
                    style={{ width: 48, height: 48, minWidth: 48, minHeight: 48, maxWidth: 48, maxHeight: 48 }}
                  >
                    <Box size={24} />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-base text-white truncate max-w-[180px]">
                      {inst.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-mono text-neon-cyan uppercase font-semibold">
                        {inst.loader}
                      </span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-[11px] font-mono text-gray-400">{inst.mc_version}</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-400 flex flex-col gap-1 py-3 border-y border-white/5 my-3 font-mono">
                  <div className="flex justify-between">
                    <span>Silnik modów:</span>
                    <span className="text-gray-300 font-semibold uppercase">{inst.loader}</span>
                  </div>
                  {inst.loader_version && (
                    <div className="flex justify-between">
                      <span>Wersja silnika:</span>
                      <span className="text-gray-300">{inst.loader_version}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Pamięć RAM:</span>
                    <span className="text-gray-300">{inst.memory_mb || 4096} MB</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {!isActive ? (
                  <button
                    onClick={() => onSelectInstance(inst.id)}
                    className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors cursor-pointer text-center"
                  >
                    Wybierz
                  </button>
                ) : (
                  <button
                    onClick={() => onLaunchInstance(inst.id)}
                    className="flex-1 py-2 rounded-xl bg-neon-cyan text-black font-semibold text-xs hover:bg-cyan-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-neon-cyan"
                  >
                    <Play size={14} fill="currentColor" />
                    <span>Graj teraz</span>
                  </button>
                )}

                <button
                  onClick={() => onOpenFolder(inst.id)}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  title="Otwórz folder profilu"
                >
                  <FolderOpen size={16} />
                </button>

                {instances.length > 1 && (
                  <button
                    onClick={() => onDeleteInstance(inst.id)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Usuń profil"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Instance Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-panel rounded-3xl p-6 max-w-md w-full border border-white/10 shadow-2xl relative">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-heading font-bold text-white">Nowy Profil Gry</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Nazwa Profilu
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="np. Mody 1.20.4 ze znajomymi"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Wybierz silnik modów
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["fabric", "vanilla", "forge", "neoforge", "quilt"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLoader(l)}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer border ${
                        loader === l
                          ? "bg-cyan-500/20 border-cyan-400 text-neon-cyan shadow-neon-cyan"
                          : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                    Wersja gry Minecraft ({availableVersions.length} z API)
                  </label>
                </div>

                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Szukaj wersji (np. 26.2, 1.2.5, 1.20.4, 1.16.5, 1.12.2, 26w)..."
                    value={mcVersionSearch}
                    onChange={(e) => setMcVersionSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <label className="flex items-center gap-2 mb-2 cursor-pointer select-none text-[11px] text-gray-400 hover:text-gray-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={showSnapshots}
                    onChange={(e) => setShowSnapshots(e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-neon-cyan focus:ring-0 cursor-pointer"
                  />
                  <span>Pokaż snapshoty, wersje testowe i archiwalne ({availableVersions.length} wersji z Mojang API)</span>
                </label>

                <select
                  value={mcVersion}
                  onChange={(e) => setMcVersion(e.target.value)}
                  className="w-full bg-black/70 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {releaseVersions.length > 0 && (
                    <optgroup label="Wydania oficjalne (Releases)">
                      {releaseVersions.map((v) => (
                        <option key={v.id} value={v.id} className="bg-[#111114]">
                          Minecraft {v.id}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {snapshotVersions.length > 0 && (
                    <optgroup label="Wersje testowe (Snapshoty / RC)">
                      {snapshotVersions.map((v) => (
                        <option key={v.id} value={v.id} className="bg-[#111114]">
                          {v.id} (snapshot)
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherVersions.length > 0 && (
                    <optgroup label="Wersje archiwalne (Beta & Alpha)">
                      {otherVersions.map((v) => (
                        <option key={v.id} value={v.id} className="bg-[#111114]">
                          {v.id} ({v.type})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {filteredMcVersions.length === 0 && (
                    <option disabled className="bg-[#111114]">
                      Nie znaleziono wersji dla "{mcVersionSearch}"
                    </option>
                  )}
                </select>
              </div>

              {loader !== "vanilla" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                      Wersja silnika {loader.toUpperCase()} ({loaderVersionsList.length} z API)
                    </label>
                    {isLoadingLoaders && (
                      <span className="flex items-center gap-1 text-[11px] text-neon-cyan">
                        <Loader2 size={11} className="animate-spin" /> Sprawdzanie API...
                      </span>
                    )}
                  </div>
                  {loaderVersionsList.length > 15 && (
                    <div className="relative mb-2">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder={`Filtruj wersje ${loader.toUpperCase()}...`}
                        value={loaderVersionSearch}
                        onChange={(e) => setLoaderVersionSearch(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  )}
                  {filteredLoaderVersions.length > 0 ? (
                    <select
                      value={loaderVersion}
                      onChange={(e) => setLoaderVersion(e.target.value)}
                      className="w-full bg-black/70 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400 cursor-pointer font-mono max-h-48"
                    >
                      {filteredLoaderVersions.map((ver) => (
                        <option key={ver} value={ver} className="bg-[#111114]">
                          {ver}
                        </option>
                      ))}
                    </select>
                  ) : isLoadingLoaders ? (
                    <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-gray-400">
                      <Loader2 size={13} className="animate-spin text-neon-cyan" />
                      <span>Sprawdzanie dostępności silnika {loader.toUpperCase()} dla wersji {mcVersion}...</span>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
                      <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <p className="font-semibold text-white mb-0.5">Silnik {loader.toUpperCase()} jest niedostępny dla Minecraft {mcVersion}</p>
                        <p className="text-gray-400 text-[11px] mb-2">Ta wersja gry wspiera wyłącznie oficjalny profil Vanilla.</p>
                        <button
                          type="button"
                          onClick={() => setLoader("vanilla")}
                          className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Przełącz na profil Vanilla
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-neon-cyan text-black font-semibold text-xs hover:bg-cyan-300 transition-colors shadow-neon-cyan cursor-pointer"
                >
                  Stwórz profil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
