const { createDefaultPreset } = require("ts-jest");
module.exports = { testEnvironment: "node", testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"], transform: { ...createDefaultPreset().transform, "^.+\\.[tj]sx?$": ["ts-jest", { tsconfig: "tsconfig.test.json" }] }, testPathIgnorePatterns: ["/node_modules/", "/dist/", "/.tmp_"] };
