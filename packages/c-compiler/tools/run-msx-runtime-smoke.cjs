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
function runVariant(profile, exit, heapAbi) {
  const variantDir = path.join(tempDir, `${profile}-${exit}${heapAbi ? '-heap-' + heapAbi : ''}`);
  fs.mkdirSync(variantDir);
  const sourcePath = path.join(variantDir, "runtime-smoke.c");
  const binaryPath = path.join(variantDir, "runtime-smoke.bin");
  const romPath = path.join(variantDir, "runtime-smoke.rom");
  const scriptPath = path.join(variantDir, "runtime-smoke.tcl");
  const screenPath = path.join(variantDir, "screen.txt");
  const expected = heapAbi ? `HEAP ${heapAbi} ${exit} ABC` : `MZ80 MSX BIOS ${profile} ${exit}`;

  const source = heapAbi ? [
    "#include <stdio.h>", "#include <stdlib.h>", "#include <mz80.h>",
    `char arena[128];int main(){char *p;char *q;${[...expected.slice(0, -3)].map((ch) => `putchar(${ch.charCodeAt(0)});`).join('')}mz80_heap_init(arena,128);mz80_heap_set_debug(1);p=malloc(8);p[0]=65;p=realloc(p,32);putchar(p[0]);q=calloc(2,4);putchar(q[0]+66);free(p);free(q);putchar(mz80_heap_check()+66);return 0;}`,
  ].join("\n") : profile === "full"
    ? [
      "#include <stdio.h>",
      "#include <string.h>",
      "#include <ctype.h>",
      `int main(){ char text[8]; strcpy(text, "msx"); printf("${expected} %d %c\\n", strlen(text), toupper(97)); return 0; }`,
      "",
    ].join("\n")
    : `#include <stdio.h>\nint main(){ puts("${expected}"); return 0; }\n`;
  fs.writeFileSync(sourcePath, source, "utf8");
  compileSccProgram(createLogger("quiet"), {
    inputFile: sourcePath,
    outputFile: binaryPath,
    runtime: { platform: "msx-bios", profile, exit },
    orgText: heapAbi ? "4030H" : "4010H",
    ...(heapAbi ? { orgData: "C000H", orgBss: "C100H", map: true } : {}),
    tempDir: variantDir,
  }, { compilerAdapter: new TsSccCompilerAdapter({ abi: heapAbi }) });

  const header = Buffer.alloc(16);
  header.write("AB", 0, "ascii");
  header.writeUInt16LE(0x4010, 2); // cartridge init entry point
  if (heapAbi) {
    const binary = fs.readFileSync(binaryPath);
    const dataOffset = 0xC000 - 0x4030;
    const initialData = binary.subarray(dataOffset);
    // This probe's DATA consists solely of the allocator's zero-initialized
    // state. General DATA-copy startup remains a separate target feature.
    if (!initialData.length || initialData.length > 0x100 || initialData.some((byte) => byte !== 0)) {
      throw new Error("Heap ROM smoke expects zero-initialized DATA within C000-C0FF");
    }
    const rom = Buffer.alloc(32768);
    header.copy(rom);
    // Clear the writable DATA area, then enter the compiled CRT at 4030H.
    Buffer.from([0x21,0x00,0xC0,0x36,0x00,0x11,0x01,0xC0,0x01,0xFF,0x00,0xED,0xB0,0xC3,0x30,0x40]).copy(rom,16);
    binary.subarray(0, dataOffset).copy(rom, 0x30);
    fs.writeFileSync(romPath, rom);
  } else {
    fs.writeFileSync(romPath, Buffer.concat([header, fs.readFileSync(binaryPath)]));
  }
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
    throw new Error(`openMSX (${profile}/${exit}) exited with ${run.status}: ${run.stderr || run.stdout}`);
  }
  const screen = fs.existsSync(screenPath) ? fs.readFileSync(screenPath, "utf8") : "";
  // C-BIOS uses a narrow screen; a long probe label may wrap mid-word.
  if (!screen.replace(/\s+/g, "").includes(expected.replace(/\s+/g, ""))) {
    throw new Error(`MSX BIOS runtime (${profile}/${exit}) output was not found in openMSX screen output:\n${screen}`);
  }
  console.log(`[msx-runtime-smoke] passed (${profile}/${exit}): ${expected}`);
}

for (const profile of ["lite", "full"]) {
  runVariant(profile, "halt");
  runVariant(profile, "return");
}
for (const abi of ["ts-internal", "ts-static-frame"]) {
  runVariant("full", "halt", abi);
  runVariant("full", "return", abi);
}
