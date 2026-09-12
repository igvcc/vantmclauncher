import { useState } from "react";
import { Sliders, Save, FolderOpen, Check } from "lucide-react";
import { UserSettings } from "../types";

interface SettingsViewProps {
  settings: UserSettings;
  onSaveSettings: (settings: UserSettings) => void;
  onOpenAppDir: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onOpenAppDir,
}) => {
  const [minRam, setMinRam] = useState(settings.min_ram_mb);
  const [maxRam, setMaxRam] = useState(settings.max_ram_mb);
  const [jvmArgs, setJvmArgs] = useState(settings.jvm_args);
  const [nickname, setNickname] = useState(settings.nickname);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalMin = Math.min(minRam, maxRam);
    const finalMax = Math.max(minRam, maxRam);
    setMinRam(finalMin);
    setMaxRam(finalMax);

    onSaveSettings({
      ...settings,
      nickname: nickname.trim() || "VantPlayer",
      min_ram_mb: finalMin,
      max_ram_mb: finalMax,
      jvm_args: jvmArgs.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const applyAppleSiliconPreset = () => {
    setJvmArgs("-XX:+UnlockExperimentalVMOptions -XX:+UseZGC -XX:+ZGenerational -XX:+UseStringDeduplication -Dsun.rmi.dgc.server.gcInterval=2147483646");
  };

  const applyG1GCPreset = () => {
    setJvmArgs("-XX:+UseG1GC -Dsun.rmi.dgc.server.gcInterval=2147483646 -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M");
  };

  const applySimplePreset = () => {
    setJvmArgs("-XX:+UseG1GC");
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-8 flex flex-col relative z-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-neon-cyan text-xs font-semibold tracking-wider uppercase mb-2">
            <Sliders size={13} />
            <span>Konfiguracja Klienta</span>
          </div>
          <h2 className="text-3xl font-heading font-extrabold text-white tracking-tight">
            Ustawienia Główne
          </h2>
          <p className="text-gray-400 text-xs mt-1">
            Zarządzaj przydziałem pamięci RAM, flagami maszyny JVM i lokalizacją danych.
          </p>
        </div>

        <button
          onClick={onOpenAppDir}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors cursor-pointer"
        >
          <FolderOpen size={15} className="text-neon-cyan" />
          <span>Folder aplikacji</span>
        </button>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
        {/* Nickname card */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="font-heading font-bold text-base text-white mb-1">
            Domyślny Nick Gracza
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Nazwa gracza wykorzystywana przy logowaniu do serwerów Non-Premium.
          </p>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-400 font-semibold"
          />
        </div>

        {/* RAM Allocation card */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading font-bold text-base text-white">
                Przydział Pamięci RAM
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Więcej RAM-u jest zalecane w przypadku rozbudowanych paczek modów (Fabric / Forge).
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Maksymalna pamięć (-Xmx):</span>
                <span className="font-mono text-neon-cyan font-bold">{maxRam} MB ({(maxRam / 1024).toFixed(1)} GB)</span>
              </div>
              <input
                type="range"
                min="1024"
                max="16384"
                step="512"
                value={maxRam}
                onChange={(e) => setMaxRam(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1">
                <span>1 GB</span>
                <span>4 GB</span>
                <span>8 GB</span>
                <span>12 GB</span>
                <span>16 GB</span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/5">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Początkowa pamięć (-Xms):</span>
                <span className="font-mono text-white">{minRam} MB</span>
              </div>
              <input
                type="range"
                min="512"
                max="8192"
                step="512"
                value={minRam}
                onChange={(e) => setMinRam(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* JVM Flags card */}
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading font-bold text-base text-white">
              Argumenty Wirtualnej Maszyny Java (JVM)
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyAppleSiliconPreset}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-[11px] text-neon-cyan border border-cyan-400/30 transition-colors cursor-pointer font-semibold shadow-[0_0_10px_rgba(0,242,255,0.2)]"
              >
                ⚡ Apple Silicon (ZGC)
              </button>
              <button
                type="button"
                onClick={applyG1GCPreset}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-gray-300 border border-white/10 transition-colors cursor-pointer"
              >
                G1GC
              </button>
              <button
                type="button"
                onClick={applySimplePreset}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-gray-400 border border-white/10 transition-colors cursor-pointer"
              >
                Czysty
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Zaawansowane flagi optymalizujące garbage collector oraz zachowanie silnika graficznego.
          </p>
          <textarea
            rows={3}
            value={jvmArgs}
            onChange={(e) => setJvmArgs(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-gray-200 font-mono focus:outline-none focus:border-cyan-400 leading-relaxed"
          />
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="btn-neon flex items-center gap-2 px-8 py-3 rounded-xl font-heading font-bold text-xs tracking-wider uppercase cursor-pointer"
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            <span>{saved ? "ZAPISANO ZMIANY!" : "ZAPISZ USTAWIENIA"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
