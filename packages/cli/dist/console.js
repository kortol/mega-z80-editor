"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Console = void 0;
const chalk_1 = __importDefault(require("chalk"));
class Console {
    verbose;
    constructor(verbose = false) {
        this.verbose = verbose;
    }
    info(msg) {
        console.log(chalk_1.default.cyan("ℹ️  " + msg));
    }
    success(msg) {
        console.log(chalk_1.default.green("✅  " + msg));
    }
    warn(msg) {
        console.warn(chalk_1.default.yellow("⚠️  " + msg));
    }
    error(msg) {
        console.error(chalk_1.default.red("❌  " + msg));
    }
    debug(msg) {
        if (this.verbose) {
            console.log(chalk_1.default.gray("🐞  " + msg));
        }
    }
    /** 区切り線（セクション境界） */
    section(title) {
        const line = "─".repeat(40);
        console.log(chalk_1.default.magenta(`\n${line}\n📦 ${title}\n${line}`));
    }
    /** 複数行の強調メッセージ */
    box(message) {
        const border = chalk_1.default.gray("─".repeat(message.length + 4));
        console.log(chalk_1.default.gray(border));
        console.log(chalk_1.default.whiteBright(`  ${message}  `));
        console.log(chalk_1.default.gray(border));
    }
}
exports.Console = Console;
