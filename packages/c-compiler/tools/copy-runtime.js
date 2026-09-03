const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "src", "scc", "runtime");
const destination = path.join(root, "dist", "scc", "runtime");
fs.mkdirSync(destination, { recursive: true });
for (const name of fs.readdirSync(source)) {
  if (name.endsWith(".scc.asm")) fs.copyFileSync(path.join(source, name), path.join(destination, name));
}
