const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src", "assembler", "parser", "gen", "z80_assembler.js");
const destDir = path.join(root, "dist", "assembler", "parser", "gen");
const dest = path.join(destDir, "z80_assembler.js");

if (!fs.existsSync(src)) {
  console.error(`[copy-parser] missing source: ${src}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[copy-parser] copied to ${dest}`);
