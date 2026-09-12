# VantMcLauncher 🚀

Nowoczesny, szybki i lekki launcher Minecrafta napisany w **Rust (Tauri 2)** z interfejsem **React + Tailwind CSS + Lucide Icons**, zaprojektowany w stylistyce serwisu **`vant.fun`** (głęboki dark mode `#0D0D0D`, neon cyan `#00F2FF`, pływający dock nawigacyjny, szklane panele i rozmycia).

---

## ✨ Kluczowe Funkcje

- ⚡ **Tryb Non-Premium (Offline)**: Błyskawiczne uruchamianie – wpisujesz swój nick, a launcher generuje poprawny Minecraft Offline UUID (v3 MD5 z przestrzeni `OfflinePlayer:<nick>`), zachowując Twoje postępy na serwerach offline.
- 📦 **Wsparcie dla Silników**:
  - **Vanilla**: Oficjalne wersje i snapshoty z Mojang Manifest API.
  - **Fabric**: Automatyczne pobieranie loaderów z Fabric Meta API oraz bibliotek Maven.
  - **Forge / NeoForge / Quilt**: Profile i manifesty instancji.
- 🧩 **Instalacja modów przez Drag & Drop**:
  - Przeciągnij dowolny plik `.jar` do okna aplikacji lub zakładki „MODY”.
  - Launcher w locie rozpakowuje archiwum i odczytuje metadane (`fabric.mod.json` lub `META-INF/mods.toml`): nazwę, wersję, autorów, opis oraz ikonę moda!
  - Włączanie/wyłączanie modów jednym kliknięciem (przełącznik `.jar` ↔ `.jar.disabled`).
  - Przycisk bezpośredniego otwarcia folderu `mods/` w Finderze / Explorerze.
- ☕ **Wbudowany Menedżer Javy**:
  - Automatyczne wykrywanie zainstalowanych wersji Java na komputerze (macOS Apple Silicon ARM64, Windows, Linux).
  - Funkcja **1-kliknięcie: Pobierz Java 21 (Temurin OpenJDK)** – launcher sam pobierze i rozpakuje Javę, jeśli nie masz jej zainstalowanej!
- 🖥️ **Konsola i Logi na Żywo**:
  - Podgląd `stdout` i `stderr` procesu Minecrafta w czasie rzeczywistym.
  - Kolorowanie błędów, auto-przewijanie, wyszukiwanie i kopiowanie do schowka.
- 🎨 **Interfejs w stylu `vant.fun`**:
  - Czysty dark mode `#0D0D0D`, akcenty `#00F2FF`, pływający dock ze stanami aktywnymi i animacjami.
  - Prawdziwe avatary graczy (Minotar / MC-Heads), brak grafik generowanych przez AI.

---

## 🎮 Jak uruchomić aplikację?

### Sposób 1: Gotowa aplikacja macOS (.app)
Aplikacja została skompilowana i znajduje się bezpośrednio w katalogu projektu:
```bash
open /Users/igorpienkny/Desktop/VantMcLauncher/VantMcLauncher.app
```
(Możesz również po prostu dwukrotnie kliknąć plik **`VantMcLauncher.app`** w Finderze na pulpicie).

### Sposób 2: Uruchomienie deweloperskie z podglądem na żywo (Hot Reload)
```bash
npm run tauri dev
```

### Sposób 3: Budowanie instalatora produkcyjnego
```bash
npm run tauri build
```
