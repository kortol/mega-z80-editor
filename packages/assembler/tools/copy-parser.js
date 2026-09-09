const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "src", "parser", "gen", "z80_assembler.js");
const destDir = path.join(root, "dist", "parser", "gen");
const dest = path.join(destDir, "z80_assembler.js");
const grammarSrc = path.join(root, "src", "grammar", "z80_assembler.pegjs");
const grammarDest = path.join(root, "dist", "grammar", "z80_assembler.pegjs");
const mnemonicsSrc = path.join(root, "src", "grammar", "z80_mnemonics.json");
const mnemonicsDest = path.join(root, "dist", "grammar", "z80_mnemonics.json");

if (!fs.existsSync(src)) {
  console.error(`[copy-parser] missing source: ${src}`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
fs.mkdirSync(path.dirname(grammarDest), { recursive: true });
fs.copyFileSync(grammarSrc, grammarDest);
// Keep this generated package asset stable across Windows and CI.  In
// particular, Git's whitespace check must not treat CRLF in a newly generated
// JSON file as trailing whitespace.
fs.writeFileSync(
  mnemonicsDest,
  fs.readFileSync(mnemonicsSrc, "utf8").replace(/\r\n?/g, "\n"),
  "utf8",
);
console.log(`[copy-parser] copied to ${dest}`);
