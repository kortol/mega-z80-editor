"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = pino;
function createLogger() {
    const logger = {
        child: () => logger,
        info: () => { },
        debug: () => { },
        warn: () => { },
        error: () => { },
    };
    return logger;
}
function pino(_options) {
    return createLogger();
}
