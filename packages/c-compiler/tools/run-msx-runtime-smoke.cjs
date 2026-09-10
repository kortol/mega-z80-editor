/*
 * Local-required integration smoke for the MSX BIOS bundled runtime.
 * It intentionally does not run in CI: openMSX/C-BIOS is a local toolchain.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createLogger } = require("@mz80/core");
const { compileSccProgram, TsSccCompilerAdapter } = require("../dist");

const openMsx = process.env.MZ80_OPENMSX || "C:\\Program Files\\openMSX\\openmsx.exe";
if (!fs.existsSync(openMsx)) {
  throw new Error(`openMSX was not found at ${openMsx}. Set MZ80_OPENMSX to its executable path.`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-msx-runtime-"));
const toTclPath = (filePath) => filePath.replace(/\\/g, "/").replace(/[{}]/g, "\\$&");
function runVariant(exit) {
  const variantDir = path.join(tempDir, exit);
  fs.mkdirSync(variantDir);
  const sourcePath = path.join(variantDir, "runtime-smoke.c");
  const binaryPath = path.join(variantDir, "runtime-smoke.bin");
  const romPath = path.join(variantDir, "runtime-smoke.rom");
  const scriptPath = path.join(variantDir, "runtime-smoke.tcl");
  const screenPath = path.join(variantDir, "screen.txt");
  const expected = `MZ80 MSX BIOS runtime ${exit}`;

  fs.writeFileSync(sourcePath, `#include <stdio.h>\nint main(){ puts("${expected}"); return 0; }\n`, "utf8");
  compileSccProgram(createLogger("quiet"), {
    inputFile: sourcePath,
    outputFile: binaryPath,
    runtime: { platform: "msx-bios", profile: "lite", exit },
    orgText: "4010H",
    tempDir: variantDir,
  }, { compilerAdapter: new TsSccCompilerAdapter() });

  const header = Buffer.alloc(16);
  header.write("AB", 0, "ascii");
  header.writeUInt16LE(0x4010, 2); // cartridge init entry point
  fs.writeFileSync(romPath, Buffer.concat([header, fs.readFileSync(binaryPath)]));
  fs.writeFileSync(scriptPath, [
    "after realtime 3 {",
    `  set fd [open {${toTclPath(screenPath)}} w]`,
    "  puts $fd [get_screen]",
    "  close $fd",
    "  exit",
    "}",
    "",
  ].join("\n"), "utf8");

  const run = spawnSync(openMsx, [
    "-machine", "C-BIOS_MSX1",
    "-cart", romPath,
    "-romtype", "Normal",
    "-script", scriptPath,
  ], { encoding: "utf8", timeout: 15_000, windowsHide: true });
  if (run.error) throw run.error;
  if (run.status !== 0) {
    throw new Error(`openMSX (${exit}) exited with ${run.status}: ${run.stderr || run.stdout}`);
  }
  const screen = fs.existsSync(screenPath) ? fs.readFileSync(screenPath, "utf8") : "";
  if (!screen.includes(expected)) {
    throw new Error(`MSX BIOS runtime (${exit}) output was not found in openMSX screen output:\n${screen}`);
  }
  console.log(`[msx-runtime-smoke] passed (${exit}): ${expected}`);
}

runVariant("halt");
runVariant("return");
