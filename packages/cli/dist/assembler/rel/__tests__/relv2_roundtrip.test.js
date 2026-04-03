"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// packages/cli/src/assembler/rel/__tests__/relv2_roundtrip.test.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const context_1 = require("../../context");
const builder_1 = require("../builder");
test(".rel v2 writer produces MZ8R header", () => {
    const ctx = (0, context_1.createContext)();
    // createContextでセクションは設定済
    // // 簡単なダミーセクションに1バイト入れておく
    // const s = ctx.sections.get(0)!;
    // s.bytes.push(0x00);
    const out = path_1.default.join(__dirname, ".tmp.rel");
    (0, builder_1.emitRelV2)(ctx, out);
    const buf = fs_1.default.readFileSync(out);
    expect(buf.slice(0, 4).toString()).toBe("MZ8R"); // magic
    expect(buf[4]).toBe(2); // version
});
