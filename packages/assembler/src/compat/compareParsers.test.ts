import { runPegSource } from "./compareParsers";
import { fixtures } from "./fixtures";

describe("PEG parser fixtures", () => {
  for (const fx of fixtures) {
    test(fx.name, () => {
      const virtualFiles = fx.virtualFiles ? new Map(Object.entries(fx.virtualFiles)) : undefined;
      const result = runPegSource(fx.name, fx.source, { keepTemp: false, relVersion: 2 }, virtualFiles);
      expect(result.exception).toBeUndefined();
      expect(result.errors).toEqual([]);
    });
  }
});
