import type {
  BuildArtifact,
  BuildRequest,
  BuildResult,
  BuildStatus,
  DiagnosticSummary,
  ToolchainDrivers,
} from "../index";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Expect<Value extends true> = Value;

type _BuildStatusIsLanguageAndProcessNeutral = Expect<Equal<
  BuildStatus,
  "succeeded" | "failed" | "cancelled"
>>;
type _BuildRequestOnlyContainsNeutralInput = Expect<Equal<
  keyof BuildRequest,
  "configPath" | "target" | "cwd"
>>;
type _BuildArtifactOnlyContainsNeutralOutput = Expect<Equal<
  keyof BuildArtifact,
  "path" | "kind"
>>;
type _DiagnosticSummaryOnlyContainsCounts = Expect<Equal<
  keyof DiagnosticSummary,
  "errors" | "warnings"
>>;
type _BuildResultOnlyContainsNeutralOutput = Expect<Equal<
  keyof BuildResult,
  "status" | "artifacts" | "diagnostics"
>>;

describe("public ToolchainDrivers contract", () => {
  test("accepts neutral request and result values without CLI exit-code semantics", async () => {
    const driver: ToolchainDrivers = {
      build(request) {
        expect(request.configPath).toBe("mz80.yaml");
        return {
          status: "succeeded",
          artifacts: [{ path: "build/main.bin", kind: "binary" }],
          diagnostics: { errors: 0, warnings: 0 },
        };
      },
    };

    await expect(Promise.resolve(driver.build({ configPath: "mz80.yaml", target: "default", cwd: "." })))
      .resolves.toMatchObject({ status: "succeeded", diagnostics: { errors: 0, warnings: 0 } });
  });
});
