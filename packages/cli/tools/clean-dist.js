const fs = require("node:fs");
const path = require("node:path");

const distDir = path.resolve(__dirname, "..", "dist");

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  console.log(`[clean-dist] removed ${distDir}`);
} else {
  console.log(`[clean-dist] no dist dir: ${distDir}`);
}
