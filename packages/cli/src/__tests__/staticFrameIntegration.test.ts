import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, Z80DebugCore } from "@mz80/core";
import { compileSccProgramFromCli } from "../cli/mz80-cc";
import { buildProjectTarget, loadProjectConfig } from "../project";

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-abi-cli-"));
  const input = path.join(dir, "main.c");
  fs.writeFileSync(input, '#include <stdio.h>\nint f(int x){return x+1;} int main(){putchar(f(64));return 0;}');
  return { dir, input, output: path.join(dir, "main.com") };
}
function run(output: string) {
  const core = new Z80DebugCore(false);
  core.setCpm22Enabled(true);
  core.setAllowOutOfImage(true);
  core.loadImage(fs.readFileSync(output), 0x100);
  core.setEntry(0x100);
  expect(core.run(15000).reason).toBe("BDOS 0: terminate");
  expect(core.getOutput()).toBe("A");
}
test("CLI adapter builds static-frame CP/M code", () => {
  const { input, output } = fixture();
  compileSccProgramFromCli(createLogger("quiet"), input, output, {
    compiler: "ts", tsAbi: "static-frame", runtime: { platform: "cpm", profile: "lite" },
  });
  run(output);
});
test("YAML config merges TS backend and target ABI selection", () => {
  const { dir, output } = fixture();
  const config = path.join(dir, "mz80.yaml");
  fs.writeFileSync(config, "cc:\n  compiler: ts\n  runtime:\n    platform: cpm\n    profile: lite\ntargets:\n  demo:\n    output: main.com\n    modules: [main.c]\n    cc:\n      tsAbi: static-frame\n    link:\n      com: true\n      orgText: 100H\n");
  buildProjectTarget(config, loadProjectConfig(config), "demo", createLogger("quiet"));
  run(output);
});
test("ABI option rejects external compiler and invalid profiles", () => {
  const { input, output } = fixture();
  expect(() => compileSccProgramFromCli(createLogger("quiet"), input, output, { tsAbi: "static-frame" })).toThrow("requires compiler: ts");
  expect(() => compileSccProgramFromCli(createLogger("quiet"), input, output, { compiler: "ts", tsAbi: "bad" as any })).toThrow("Unknown TS ABI");
});

test("static-frame project rejects multiple C translation units", () => {
  const { dir } = fixture();
  expect(() => buildProjectTarget(path.join(dir, "mz80.yaml"), {
    cc: { compiler: "ts", tsAbi: "static-frame" },
    targets: { demo: { output: "main.com", modules: ["main.c", "other.c"] } },
  }, "demo", createLogger("quiet"))).toThrow("exactly one C translation unit");
});
