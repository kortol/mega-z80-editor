"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dap = dap;
const minimalAdapter_1 = require("../dap/minimalAdapter");
function dap() {
    const adapter = new minimalAdapter_1.MinimalDapAdapter();
    adapter.start();
}
