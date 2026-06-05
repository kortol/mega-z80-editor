const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src", "assembler", "parser", "gen", "z80_assembler.js");
const destDir = path.join(root, "dist", "assembler", "parser", "gen");
const dest = path.join(destDir, "z80_assembler.js");
const runtimeSrcDir = path.join(root, "src", "scc", "runtime");
const runtimeDestDir = path.join(root, "dist", "scc", "runtime");

if (!fs.existsSync(src)) {
  console.error(`[copy-parser] missing source: ${src}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[copy-parser] copied to ${dest}`);

if (fs.existsSync(runtimeSrcDir)) {
  fs.mkdirSync(runtimeDestDir, { recursive: true });
  for (const entry of fs.readdirSync(runtimeSrcDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = path.join(runtimeSrcDir, entry.name);
    const to = path.join(runtimeDestDir, entry.name);
    fs.copyFileSync(from, to);
    console.log(`[copy-parser] copied to ${to}`);
  }
}
