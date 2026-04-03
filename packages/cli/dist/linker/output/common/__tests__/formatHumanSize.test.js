"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const outputUtils_1 = require("../outputUtils");
describe("formatHumanSize", () => {
    const cases = [
        [128, "128 bytes"],
        [512, "0.50 KB"],
        [1013, "0.98 KB"],
        [1023, "0.99 KB"],
        [1024, "1.00 KB"],
        [10239, "9.99 KB"],
        [15360, "15.0 KB"],
        [2097152, "2.00 MB"],
    ];
    it.each(cases)("formats %d bytes -> %s", (size, expected) => {
        expect((0, outputUtils_1.formatHumanSize)(size)).toBe(expected);
    });
});
