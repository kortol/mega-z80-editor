import fs from "fs";
import path from "path";
import { BaseTextAdapter } from "../baseTextAdapter";
import { randomUUID } from "crypto";

class MockAdapter extends BaseTextAdapter {
  ext = ".map";
  tag = "[MAP]";
  generateText(): string {
    return "Hello Map";
  }
}

describe("BaseTextAdapter", () => {
  const tmpDir = path.resolve(__dirname, "../../../.tmp_tests." + randomUUID());
  const mapPath = path.join(tmpDir, "test.map");

  beforeAll(() => fs.mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => fs.existsSync(mapPath) && fs.unlinkSync(mapPath));
  afterAll(() => {
    if (fs.existsSync(mapPath)) {
      fs.unlinkSync(mapPath);
    }
    // 一時ディレクトリも削除
    fs.rmdirSync(tmpDir);
  })


  it("writes text file", () => {
    new MockAdapter().write(mapPath, false);
    const content = fs.readFileSync(mapPath, "utf-8");
    expect(content).toBe("Hello Map");
  });

  it("verbose mode prints tag and size", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => { });
    new MockAdapter().write(mapPath, true);
    const output = spy.mock.calls.map(c => c[0]).join("\n");
    expect(output).toMatch(/\[MAP\]/);
    expect(output).toMatch(/bytes/);
    spy.mockRestore();
  });

  it("formatSize computes UTF-8 bytes correctly", () => {
    const adapter = new MockAdapter();
    expect(adapter["formatSize"]("あ")).toBe("3 bytes");
  });

  it("calls generateText()", () => {
    const spy = jest.spyOn(MockAdapter.prototype, "generateText");
    new MockAdapter().write(mapPath);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
