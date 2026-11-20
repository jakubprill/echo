// The built-in picture library: files in ./pics, looked up by id (file name without extension).
// Vite turns each file into a URL (inlined as a data URI in the single-file artifact build).
const files = import.meta.glob<string>("./pics/*.{svg,png,webp}", { eager: true, query: "?url", import: "default" });

const byId = new Map(Object.entries(files).map(([path, url]) => [path.replace(/^\.\/pics\//, "").replace(/\.\w+$/, ""), url]));

/** URL of a built-in picture, or undefined when the app does not have it (an older app reading a newer deck). */
export const picUrl = (id: string | undefined): string | undefined => (id ? byId.get(id) : undefined);
