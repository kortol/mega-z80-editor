"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitRel = emitRel;
const core_1 = require("@mz80/core");
const core_2 = require("@mz80/core");
function emitRel(ctx) {
    const file = (0, core_1.buildRelFile)(ctx);
    const adapter = new core_2.TextRelAdapter();
    return adapter.write(file);
}
