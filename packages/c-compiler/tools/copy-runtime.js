const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "src", "scc", "runtime");
const destination = path.join(root, "dist", "scc", "runtime");
// Runtime assets are generated package output. Recreate the tree so a source
// move cannot leave an obsolete runtime path in the published package.
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true, force: true });
