"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMockContext = createMockContext;
function createMockContext() {
    return {
        symbols: new Map([
            ["FOO", { bank: 0, addr: 0x200 }],
            ["BAR", { bank: 0, addr: 0x300 }],
        ]),
        externs: new Set(["BAZ"]),
    };
}
