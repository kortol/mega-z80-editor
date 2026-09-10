const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const markdownFiles = [];
const errors = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) visit(path.join(directory, entry.name));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) markdownFiles.push(path.join(directory, entry.name));
  }
}

function addError(file, target, message) {
  errors.push(`${path.relative(root, file)}: ${message}: ${target}`);
}

function checkTarget(file, rawTarget) {
  const target = rawTarget.trim().replace(/^<|>$/g, "");
  if (!target || target.startsWith("#") || target.startsWith("//")) return;
  if (/^[a-z]:[\\/]/i.test(target) || target.startsWith("/")) {
    addError(file, target, "Markdown links must be repository-relative");
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return;
  const pathname = target.split(/[?#]/, 1)[0];
  if (!pathname) return;
  const resolved = path.resolve(path.dirname(file), pathname);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    addError(file, target, "Markdown link escapes the repository");
  } else if (!fs.existsSync(resolved)) {
    addError(file, target, "Markdown link target does not exist");
  }
}

visit(root);
for (const file of markdownFiles) {
  const content = fs.readFileSync(file, "utf8");
  const prose = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  for (const match of prose.matchAll(/!?\[[^\]]*]\(([^)\n]+)\)/g)) checkTarget(file, match[1]);
}

if (errors.length > 0) {
  console.error(`[docs] ${errors.length} invalid Markdown link(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`[docs] ${markdownFiles.length} Markdown files have valid local links`);
}
