"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IOBus = void 0;
const types_1 = require("./types");
class IOBus {
    decoder;
    registry;
    debugHook;
    constructor(decoder, registry, debugHook) {
        this.decoder = decoder;
        this.registry = registry;
        this.debugHook = debugHook;
    }
    in(port) {
        const p = (0, types_1.maskPort)(port);
        const deviceId = this.decoder.resolve(p);
        if (!deviceId) {
            this.emit({ type: "in", port: p, value: 0xff, deviceId: null });
            return 0xff;
        }
        const device = this.registry.get(deviceId);
        const value = (0, types_1.maskByte)(device.in(p));
        this.emit({ type: "in", port: p, value, deviceId });
        return value;
    }
    out(port, value) {
        const p = (0, types_1.maskPort)(port);
        const v = (0, types_1.maskByte)(value);
        const deviceId = this.decoder.resolve(p);
        if (!deviceId) {
            this.emit({ type: "out", port: p, value: v, deviceId: null });
            return;
        }
        const device = this.registry.get(deviceId);
        device.out(p, v);
        this.emit({ type: "out", port: p, value: v, deviceId });
    }
    emit(event) {
        if (!this.debugHook)
            return;
        try {
            this.debugHook(event);
        }
        catch {
            // Debug hook failures must not break target execution.
        }
    }
}
exports.IOBus = IOBus;
