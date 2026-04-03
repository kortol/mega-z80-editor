"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitRel = emitRel;
const builder_1 = require("./rel/builder");
const adapter_1 = require("./rel/adapter");
function emitRel(ctx) {
    const file = (0, builder_1.buildRelFile)(ctx);
    const adapter = new adapter_1.TextRelAdapter();
    return adapter.write(file);
}
