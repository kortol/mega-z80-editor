import fs from "fs";
import path from "path";

type Pair = { asm: string; bin: string };

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) {
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        throw new Error(`Missing value for ${key}`);
      }
      args[key.slice(2)] = val;
      i++;
    }
  }
  return args;
}

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
}

function safeName(rel: string) {
  return rel.replace(/[\\\/]/g, "__").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function collectPairs(srcRoot: string): Pair[] {
  const files: string[] = [];
  walk(srcRoot, files);
  const pairs: Pair[] = [];
  for (const asm of files.filter(f => f.toLowerCase().endsWith(".asm"))) {
    const bin = asm.replace(/\.asm$/i, ".bin");
    if (fs.existsSync(bin)) {
      pairs.push({ asm, bin });
    }
  }
  return pairs;
}

function main() {
  const args = parseArgs(process.argv);
  const src = args.src;
  if (!src) {
    throw new Error("Usage: ts-node tools/import-z80test.ts --src <path> [--out <path>]");
  }
  const srcRoot = path.resolve(src);
  const outRoot = path.resolve(args.out ?? path.join(process.cwd(), "tests", "z80test"));

  if (!fs.existsSync(srcRoot) || !fs.statSync(srcRoot).isDirectory()) {
    throw new Error(`Source path is not a directory: ${srcRoot}`);
  }
  if (!fs.existsSync(outRoot)) fs.mkdirSync(outRoot, { recursive: true });

  const pairs = collectPairs(srcRoot);
  if (pairs.length === 0) {
    console.log("No .asm/.bin pairs found.");
    return;
  }

  const used = new Set<string>();
  let copied = 0;

  for (const { asm, bin } of pairs) {
    const relDir = path.relative(srcRoot, path.dirname(asm));
    const base = path.basename(asm, ".asm");
    let name = base;
    if (used.has(name)) {
      const suffix = safeName(relDir) || "root";
      name = `${base}__${suffix}`;
    }
    used.add(name);

    const outAsm = path.join(outRoot, `${name}.asm`);
    const outBin = path.join(outRoot, `${name}.bin`);
    fs.copyFileSync(asm, outAsm);
    fs.copyFileSync(bin, outBin);
    copied++;
  }

  console.log(`Copied ${copied} fixture pair(s) to ${outRoot}`);
}

main();
