// Run after `tauri android init`: puts Echo's own MainActivity (system bar insets bridge)
// into the generated Android project. Usage: node scripts/android-shell.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const conf = JSON.parse(fs.readFileSync(path.join(app, "src-tauri/tauri.conf.json"), "utf8"));
const pkg = conf.identifier.replaceAll("-", "_");
const target = path.join(app, "src-tauri/gen/android/app/src/main/java", ...pkg.split("."), "MainActivity.kt");
if (!fs.existsSync(target)) {
  console.error(`No generated MainActivity at ${target}. Run "npx tauri android init" first.`);
  process.exit(1);
}
const source = fs.readFileSync(path.join(app, "src-tauri/android/MainActivity.kt"), "utf8");
fs.writeFileSync(target, source.replace("{{package}}", pkg));
console.log(`Replaced ${path.relative(app, target)}`);
