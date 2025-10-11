import fs from "fs";
import path from "path";
import { BaseTextAdapter } from "../baseTextAdapter";

class MockAdapter extends BaseTextAdapter {
  ext = ".map";
  tag = "[MAP]";
  generateText(): string {
    return "Hello Map";
  }
}

describe("BaseTextAdapter", () => {
  const tmp = path.resolve(__dirname, "../../../.tmp_tests");
  const file = path.join(tmp, "test.map");

  beforeAll(() => fs.mkdirSync(tmp, { recursive: true }));
  afterEach(() => fs.existsSync(file) && fs.unlinkSync(file));

  it("writes text file", () => {
    new MockAdapter().write(file, false);
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toBe("Hello Map");
  });

  it("verbose mode prints tag and size", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    new MockAdapter().write(file, true);
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
    new MockAdapter().write(file);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
