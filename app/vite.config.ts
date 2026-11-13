import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

// Content (decks and books) is bundled at build time from the ECHO_CONTENT_DIR
// directory. The default is ../examples, i.e. only decks written for this
// repository. Private decks live outside the repo and only go into private builds.
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
  define: { __ECHO_TARGET__: JSON.stringify(mode === "artifact" ? "artifact" : "app") },
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
