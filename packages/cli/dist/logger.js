"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
class Logger {
    level;
    constructor(level = "normal") {
        this.level = level;
    }
    info(msg) {
        if (this.level !== "quiet") {
            console.log(msg);
        }
    }
    verbose(msg) {
        if (this.level === "verbose") {
            console.log("[VERBOSE]", msg);
        }
    }
    error(msg) {
        if (this.level !== "quiet") {
            console.error("❌ " + msg);
        }
    }
}
exports.Logger = Logger;
