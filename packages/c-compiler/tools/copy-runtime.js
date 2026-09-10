const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "src", "scc", "runtime");
const destination = path.join(root, "dist", "scc", "runtime");
fs.cpSync(source, destination, { recursive: true, force: true });
