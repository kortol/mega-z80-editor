const { createDefaultPreset } = require("ts-jest");
const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
    "^.+\\.[tj]sx?$": [
      "ts-jest",
      { tsconfig: "tsconfig.test.json" },
    ],
  },
  moduleNameMapper: {
    "^pino$": "<rootDir>/src/test-stubs/pino.ts",
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/.tmp_",
  ],
};
