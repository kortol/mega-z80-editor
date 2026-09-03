export type ToolMode = "host" | "wsl";
export type RunTool = (command: string, args: string[], cwd: string, toolMode: ToolMode) => void;
export declare function buildCppArgs(includeDirs?: string[], cppArgs?: string[]): string[];
export declare function prepareToolchainIncludeDirs(tempDir: string, toolMode: ToolMode, includeDirs: string[]): string[];
export declare function findGeneratedSccAsm(stageDir: string, stem: string): string;
export declare const defaultRunTool: RunTool;
export declare function safeRmDir(dirPath: string): void;
