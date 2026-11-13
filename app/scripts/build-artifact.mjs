// Turns the single-file build (dist-artifact/index.html) into the HTML fragment
// expected when publishing as a Claude artifact (no doctype/html/head/body).
import fs from "node:fs";
const src = fs.readFileSync("dist-artifact/index.html", "utf8");
const out = src
  .replace(/<!doctype html>/i, "")
  .replace(/<\/?(html|head|body)[^>]*>/gi, "")
  .replace(/<meta charset[^>]*>/i, "")
  .replace(/<meta name="viewport"[^>]*>/i, "")
  .replace(/<title>[^<]*<\/title>/i, "<title>Echo alfa</title>")
  .trim();
fs.writeFileSync("dist-artifact/echo-alpha.html", out + "\n");
console.log(`dist-artifact/echo-alpha.html ${(out.length / 1024).toFixed(0)} kB`);
