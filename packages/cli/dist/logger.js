"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const pino_1 = __importDefault(require("pino"));
function createLogger(level = "normal", ctxId) {
    const map = { quiet: "silent", normal: "info", verbose: "debug" };
    // Jest / CI 環境では pretty を無効化
    const isPretty = process.env.NODE_ENV !== "production" &&
        !process.env.JEST_WORKER_ID &&
        process.stdout.isTTY;
    const base = (0, pino_1.default)({
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
