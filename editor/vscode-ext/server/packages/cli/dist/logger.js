"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
function createLogger(level = "normal", ctxId) {
    let pino;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require("pino");
        // pino may be exported as default or named export depending on module type.
        pino =
            typeof mod === "function"
                ? mod
                : typeof mod?.default === "function"
                    ? mod.default
                    : typeof mod?.pino === "function"
                        ? mod.pino
                        : undefined;
    }
    catch {
        // Fallback for test/sandbox environments without pino resolution.
        pino = undefined;
    }
    if (typeof pino !== "function") {
        // Fallback for test/sandbox environments or unexpected module shape.
        pino = () => ({
            child: () => pino(),
            info: () => { },
            debug: () => { },
            warn: () => { },
            error: () => { },
        });
    }
    const map = { quiet: "silent", normal: "info", verbose: "debug" };
    // Jest / CI 環境では pretty を無効化
    const isPretty = process.env.NODE_ENV !== "production" &&
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
