import fs from "fs";
import os from "os";
import path from "path";
import {
  replaceExt,
  writeTextFile,
  writeBinaryFile
} from "../outputUtils";

describe("outputUtils", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oututil-"));
  const textPath = path.join(tmpDir, "test.txt");
  const binPath = path.join(tmpDir, "test.bin");

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("replaceExt replaces extension correctly", () => {
    expect(replaceExt("foo.abs", ".map")).toBe("foo.map");
    expect(replaceExt("dir/x.rel", ".log")).toBe(path.join("dir", "x.log"));
  });

  it("writeTextFile writes expected content", () => {
    writeTextFile(textPath, "HELLO");
    const data = fs.readFileSync(textPath, "utf-8");
    expect(data).toBe("HELLO");
  });

  it("writeBinaryFile writes expected bytes", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    writeBinaryFile(binPath, bytes);
    const out = fs.readFileSync(binPath);
    expect(out.equals(Buffer.from(bytes))).toBe(true);
  });

  it("verbose mode prints logs", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    writeTextFile(textPath, "X", true);
    writeBinaryFile(binPath, new Uint8Array([0xAA]), true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("verbose mode shows both bytes and human-readable size", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    const data = new Uint8Array(512);
    writeBinaryFile("test.bin", data, true);
    const output = spy.mock.calls.map(c => c[0]).join("\n");
    expect(output).toMatch(/512 bytes \/ 0\.50 KB/);
    spy.mockRestore();
  });
});
