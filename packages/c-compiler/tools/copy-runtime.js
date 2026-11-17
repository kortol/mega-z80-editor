const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "src", "scc", "runtime");
const destination = path.join(root, "dist", "scc", "runtime");
// Runtime assets are generated package output. Recreate the tree so a source
// move cannot leave an obsolete runtime path in the published package.
const configured = process.env.MZ80_NUMERIC_MODULES ?? "fixed,bcd";
const features = configured === "none" ? [] : [...new Set(configured.split(",").map((part) => part.trim()))];
if (features.some((name) => !["fixed", "bcd"].includes(name))) throw new Error("MZ80_NUMERIC_MODULES must be none, fixed, bcd or fixed,bcd");
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
for (const entry of fs.readdirSync(source)) {
  if (entry !== "numeric") fs.cpSync(path.join(source, entry), path.join(destination, entry), { recursive: true });
}
for (const feature of features) {
  fs.cpSync(path.join(source, "numeric", feature), path.join(destination, "numeric", feature), { recursive: true });
}
fs.mkdirSync(path.join(destination, "numeric"), { recursive: true });
fs.writeFileSync(path.join(destination, "numeric", "available.json"), JSON.stringify({ version: 1, features: ["fixed", "bcd"].filter((name) => features.includes(name)) }, null, 2) + "\n");
