import { useState, useEffect, useRef } from "react";
import { Terminal, Trash2, Copy, Check, Search } from "lucide-react";
import { LaunchLogPayload } from "../types";

interface ConsoleViewProps {
  logs: LaunchLogPayload[];
  onClearLogs: () => void;
}

export const ConsoleView: React.FC<ConsoleViewProps> = ({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const filteredLogs = logs.filter((l) =>
    l.line.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    const text = logs.map((l) => l.line).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLineColor = (line: string, isError: boolean) => {
    if (isError || line.includes("ERROR") || line.includes("Exception") || line.includes("Crash")) {
      return "text-rose-400 bg-rose-950/20";
    }
    if (line.includes("WARN")) {
      return "text-amber-300";
    }
    if (line.includes("INFO")) {
      return "text-gray-300";
    }
    return "text-gray-400";
  };

  return (
    <div className="flex-1 h-full overflow-hidden p-8 flex flex-col relative z-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-neon-cyan text-xs font-semibold tracking-wider uppercase mb-2">
            <Terminal size={13} />
            <span>Konsola Gry</span>
          </div>
          <h2 className="text-3xl font-heading font-extrabold text-white tracking-tight">
            Logi Minecraft & JVM
          </h2>
          <p className="text-gray-400 text-xs mt-1">
            Podgląd na żywo komunikatów silnika gry, ładowanych modów i ewentualnych błędów.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors cursor-pointer"
            title="Kopiuj wszystkie logi"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? "Skopiowano!" : "Kopiuj"}</span>
          </button>

          <button
            onClick={onClearLogs}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/20 text-xs font-semibold text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
            title="Wyczyść konsolę"
          >
            <Trash2 size={14} />
            <span>Wyczyść</span>
          </button>
        </div>
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtruj logi (np. error, fabric, audio)..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-cyan-400 rounded cursor-pointer"
            />
            <span>Auto-przewijanie</span>
          </label>
          <span className="font-mono">Linii: {filteredLogs.length}</span>
        </div>
      </div>

      {/* Terminal View */}
      <div className="flex-1 bg-black/80 rounded-2xl p-4 font-mono text-[11px] leading-relaxed overflow-y-auto border border-white/10 shadow-inner">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <Terminal size={32} className="mb-2 opacity-40" />
            <p>Konsola jest pusta. Po uruchomieniu gry logi pojawią się tutaj.</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((log, index) => (
              <div
                key={index}
                className={`py-0.5 px-2 rounded font-mono break-all whitespace-pre-wrap ${getLineColor(
                  log.line,
                  log.is_error
                )}`}
              >
                {log.line}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};
