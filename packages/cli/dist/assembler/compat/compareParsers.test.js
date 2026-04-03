"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const compareParsers_1 = require("./compareParsers");
const fixtures_1 = require("./fixtures");
describe("PEG parser fixtures", () => {
    for (const fx of fixtures_1.fixtures) {
        test(fx.name, () => {
            const virtualFiles = fx.virtualFiles ? new Map(Object.entries(fx.virtualFiles)) : undefined;
            const result = (0, compareParsers_1.runPegSource)(fx.name, fx.source, { keepTemp: false, relVersion: 2 }, virtualFiles);
            expect(result.exception).toBeUndefined();
            expect(result.errors).toEqual([]);
        });
    }
});
