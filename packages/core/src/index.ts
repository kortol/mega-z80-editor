/** Public language-neutral build and debugger contracts. */
export type BuildStatus = "succeeded" | "failed" | "cancelled";

export type DiagnosticSummary = {
  errors: number;
  warnings: number;
};

export type BuildArtifact = {
  path: string;
  kind: "object" | "binary" | "map" | "symbols" | "other";
};

export type BuildRequest = {
  configPath: string;
  target?: string;
  cwd?: string;
};

export type BuildResult = {
  status: BuildStatus;
  artifacts: BuildArtifact[];
  diagnostics: DiagnosticSummary;
};

/** Language-neutral driver boundary. CLI adapters own language-specific conversion and exit codes. */
export interface ToolchainDrivers {
  build(request: BuildRequest): Promise<BuildResult> | BuildResult;
}

export { createLogger } from "./logger";
export type { Logger } from "./logger";
export { link } from "./link";
export { createArchive } from "./linker/archive";
export { loadArchiveFile } from "./linker/archive";
export { Z80DebugCore } from "./debugger/core";
export { dbgBinary } from "./debugger/binaryDebugger";
export { DebugRpcClient, runRemoteRepl, runRemoteScript } from "./debugger/rpcClient";
export { decodeOne } from "./debugger/disasm";
export { EXAMPLES_REPO_NAME, resolveExamplesPath, resolveExamplesRepoDir } from "./examplesRepo";
export * from "./sourcemap/model";
export * from "./rel/types";
export { RelBuilder, buildRelFile, emitRelV2 } from "./rel/builder";
export { TextRelAdapter } from "./rel/adapter";
