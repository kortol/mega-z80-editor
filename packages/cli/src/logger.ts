import pino from "pino";

export type LogLevel = "quiet" | "normal" | "verbose";

export function createLogger(level: LogLevel = "normal", ctxId?: string) {
  const map = { quiet: "silent", normal: "info", verbose: "debug" } as const;

  // Jest / CI 環境では pretty を無効化
  const isPretty =
    process.env.NODE_ENV !== "production" &&
    !process.env.JEST_WORKER_ID &&
    process.stdout.isTTY;

  const base = pino({
    level: map[level],
    ...(isPretty
      ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
      : {}),
  });

  return ctxId ? base.child({ ctxId }) : base;
}

export type Logger = ReturnType<typeof createLogger>;
