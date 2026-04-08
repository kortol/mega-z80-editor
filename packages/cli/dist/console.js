"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Console = void 0;
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const wrap = (code, msg) => useColor ? `\u001b[${code}m${msg}\u001b[0m` : msg;
const color = {
    cyan: (s) => wrap(36, s),
    green: (s) => wrap(32, s),
    yellow: (s) => wrap(33, s),
    red: (s) => wrap(31, s),
    gray: (s) => wrap(90, s),
    magenta: (s) => wrap(35, s),
    whiteBright: (s) => wrap(97, s),
};
class Console {
    verbose;
    constructor(verbose = false) {
        this.verbose = verbose;
    }
    info(msg) {
        console.log(color.cyan("ℹ️  " + msg));
    }
    success(msg) {
        console.log(color.green("✅  " + msg));
    }
    warn(msg) {
        console.warn(color.yellow("⚠️  " + msg));
    }
    error(msg) {
        console.error(color.red("❌  " + msg));
    }
    debug(msg) {
        if (this.verbose) {
            console.log(color.gray("🐞  " + msg));
        }
    }
    /** 区切り線（セクション境界） */
    section(title) {
        const line = "─".repeat(40);
        console.log(color.magenta(`\n${line}\n📦 ${title}\n${line}`));
    }
    /** 複数行の強調メッセージ */
    box(message) {
        const border = color.gray("─".repeat(message.length + 4));
        console.log(color.gray(border));
        console.log(color.whiteBright(`  ${message}  `));
        console.log(color.gray(border));
    }
}
exports.Console = Console;
