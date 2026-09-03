export type LogLevel = "quiet" | "normal" | "verbose";
export declare function createLogger(level?: LogLevel, ctxId?: string): any;
export type Logger = ReturnType<typeof createLogger>;
