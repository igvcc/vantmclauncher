import { useState } from "react";
import { Cpu, Download, AlertCircle, RefreshCw, HardDrive } from "lucide-react";
import { JavaInstallation, UserSettings } from "../types";

interface JavaViewProps {
  javaList: JavaInstallation[];
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onDownloadJava: (version: number) => void;
  onRefreshJava: () => void;
  isDownloadingJava: boolean;
  javaDownloadMsg: string;
  javaDownloadPct: number;
}

export const JavaView: React.FC<JavaViewProps> = ({
  javaList,
  settings,
  onUpdateSettings,
  onDownloadJava,
  onRefreshJava,
  isDownloadingJava,
  javaDownloadMsg,
  javaDownloadPct,
}) => {
  const [customPath, setCustomPath] = useState(settings.custom_java_path || "");

  const handleSaveCustomPath = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({ custom_java_path: customPath.trim() || null });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 flex flex-col relative z-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-neon-cyan text-xs font-semibold tracking-wider uppercase mb-2">
            <Cpu size={13} />
            <span>Środowisko Uruchomieniowe</span>
          </div>
          <h2 className="text-3xl font-heading font-extrabold text-white tracking-tight">
            Zarządzanie Środowiskiem Java
          </h2>
          <p className="text-gray-400 text-xs mt-1">
            Minecraft wymaga środowiska Java (OpenJDK 21 dla najnowszych wersji, Java 17 lub 8 dla starszych).
          </p>
        </div>

        <button
          onClick={onRefreshJava}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          <RefreshCw size={14} />
          <span>Odśwież listę</span>
        </button>
      </div>

      {/* Auto Downloader Card (1-Click Java 21) */}
      <div className="glass-panel rounded-2xl p-6 mb-8 border-cyan-500/20 bg-gradient-to-r from-cyan-950/20 via-black/40 to-transparent">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-neon-cyan animate-pulse"></span>
              <h3 className="font-heading font-bold text-lg text-white">
                Pobierz zalecaną wersję: Java 21 (Temurin OpenJDK)
              </h3>
            </div>
            <p className="text-xs text-gray-400 max-w-xl">
              Oficjalne, bezpłatne wydanie Eclipse Temurin OpenJDK zoptymalizowane pod architekturę Twojego komputera.
              Launcher sam pobierze, rozpakuje i skonfiguruje środowisko.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onDownloadJava(21)}
              disabled={isDownloadingJava}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-heading font-bold text-xs tracking-wider uppercase cursor-pointer ${
                isDownloadingJava ? "bg-cyan-500/20 text-cyan-300 animate-pulse cursor-not-allowed" : "btn-neon"
              }`}
            >
              <Download size={16} />
              <span>{isDownloadingJava ? "POBIERANIE..." : "POBIERZ JAVA 21"}</span>
            </button>

            <button
              onClick={() => onDownloadJava(17)}
              disabled={isDownloadingJava}
              className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Java 17 (dla Minecraft 1.17 - 1.20.4)"
            >
              Java 17
            </button>
          </div>
        </div>

        {/* Download progress bar */}
        {isDownloadingJava && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-neon-cyan font-semibold">{javaDownloadMsg}</span>
              <span className="font-mono text-gray-400">{Math.round(javaDownloadPct)}%</span>
            </div>
            <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/10">
              <div
                className="h-full bg-neon-cyan rounded-full transition-all duration-300"
                style={{ width: `${javaDownloadPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Detected Java installations */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Wykryte instalacje Java na komputerze ({javaList.length})
        </h3>

        {javaList.length === 0 ? (
          <div className="glass-panel rounded-2xl p-6 flex items-center gap-3 text-amber-300 border-amber-500/20">
            <AlertCircle size={20} className="text-amber-400 shrink-0" />
            <p className="text-xs">
              Nie wykryto żadnej zainstalowanej wersji Javy. Użyj przycisku powyżej, aby pobrać Java 21 automatycznie.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {javaList.map((j) => {
              const isSelected = settings.custom_java_path === j.path || (!settings.custom_java_path && j === javaList[0]);
              return (
                <div
                  key={j.path}
                  className={`glass-panel rounded-xl p-4 flex items-center justify-between gap-4 transition-all ${
                    isSelected ? "border-cyan-400/40 bg-cyan-950/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-neon-cyan">
                      <HardDrive size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold text-sm text-white">
                          Java {j.major_version}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300 font-mono">
                          {j.version_string}
                        </span>
                        {j.is_arm64 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                            Apple Silicon ARM64
                          </span>
                        )}
                        {j.major_version >= 21 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-neon-cyan">
                            Zalecana
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 font-mono truncate mt-0.5">
                        {j.path}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onUpdateSettings({ custom_java_path: j.path })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-cyan-400 text-black shadow-neon-cyan"
                        : "bg-white/5 hover:bg-white/10 text-gray-300"
                    }`}
                  >
                    {isSelected ? "Wybrana" : "Użyj"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Custom Java Path */}
      <div className="glass-panel rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Własna ścieżka do pliku wykonywalnego Java
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Możesz ręcznie wskazać ścieżkę do pliku `java` lub `java.exe` na dysku.
        </p>

        <form onSubmit={handleSaveCustomPath} className="flex gap-3">
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="np. /usr/bin/java lub C:\Program Files\Java\jdk-21\bin\java.exe"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
          />
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            Zapisz
          </button>
          {settings.custom_java_path && (
            <button
              type="button"
              onClick={() => {
                setCustomPath("");
                onUpdateSettings({ custom_java_path: null });
              }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-rose-500/10 text-xs font-semibold text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Resetuj (Auto)
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
