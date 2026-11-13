import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

// The release workflow passes the version being published; local builds use package.json.
const appVersion: string =
  process.env.ECHO_VERSION || JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")).version;

// Treści (talie i książki) są dołączane w czasie budowania z katalogu
// ECHO_CONTENT_DIR. Domyślnie to ../examples, czyli tylko talie napisane dla
// repozytorium. Prywatne talie leżą poza repo i trafiają tylko do prywatnych buildów.
function echoContent(): Plugin {
  const id = "virtual:echo-content";
  const dir = path.resolve(process.env.ECHO_CONTENT_DIR ?? "../examples");
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
    });
  return {
    name: "echo-content",
    resolveId: (s) => (s === id ? "\0" + id : undefined),
    load(s) {
      if (s !== "\0" + id) return;
      const decks = new Map<string, unknown>();
      const books = new Map<string, unknown>();
      for (const f of fs.existsSync(dir) ? walk(dir).sort() : []) {
        const data = JSON.parse(fs.readFileSync(f, "utf8"));
        for (const x of Array.isArray(data) ? data : [data]) {
          if (x?.format === "echo-deck" && !decks.has(x.id)) decks.set(x.id, x);
          if (x?.format === "echo-book" && !books.has(x.id)) books.set(x.id, x);
        }
      }
      return `export const decks = ${JSON.stringify([...decks.values()])};\nexport const books = ${JSON.stringify([...books.values()])};`;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), echoContent(), ...(mode === "artifact" ? [viteSingleFile()] : [])],
  base: "./",
  define: {
    __ECHO_TARGET__: JSON.stringify(mode === "artifact" ? "artifact" : "app"),
    __ECHO_VERSION__: JSON.stringify(appVersion),
  },
  build: { outDir: mode === "artifact" ? "dist-artifact" : "dist" },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: { environment: "node" },
}));
