// Copies pictures into the built-in picture library (src/kids/pics/).
//
//   node scripts/add-pics.mjs <dir-with-svgs> <file>[=<id>] ...
//
// <file> is a file name without ".svg" (e.g. "jump_,_to" from Mulberry Symbols' EN/ folder).
// The id defaults to a cleaned-up file name ("jump_,_to" -> "jump", "school_bag" -> "school-bag").
// Decks refer to a picture by its id in the card field `pic`.
// Only add pictures whose license allows redistribution, and list their source in src/kids/pics/README.md.
import fs from "node:fs";
import path from "node:path";

const [src, ...names] = process.argv.slice(2);
if (!src || names.length === 0) {
  console.error("usage: node scripts/add-pics.mjs <dir-with-svgs> <file>[=<id>] ...");
  process.exit(1);
}
const out = path.resolve(import.meta.dirname, "../src/kids/pics");
fs.mkdirSync(out, { recursive: true });

export const picId = (file) =>
  file
    .replace(/_,_to$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const minify = (svg) =>
  svg
    .replace(/<\?xml[^>]*>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

for (const arg of names) {
  const [file, id = picId(file)] = arg.split("=");
  const svg = fs.readFileSync(path.join(src, `${file}.svg`), "utf8");
  if (/<script|on\w+=|xlink:href="http|href="http/i.test(svg)) throw new Error(`${file}.svg contains scripts or external links`);
  fs.writeFileSync(path.join(out, `${id}.svg`), minify(svg) + "\n");
  console.log(`${file} -> ${id}`);
}
