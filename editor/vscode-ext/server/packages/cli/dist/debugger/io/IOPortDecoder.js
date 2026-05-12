"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IOPortDecoder = void 0;
const types_1 = require("./types");
class IOPortDecoder {
    maps;
    constructor(maps) {
        this.maps = maps.map((m) => {
            if (!m || typeof m.deviceId !== "string" || m.deviceId.length === 0) {
                throw new Error("Invalid IOPortMap: deviceId is required");
            }
            return {
                portMask: m.portMask & 0xffff,
                portValue: m.portValue & 0xffff,
                deviceId: m.deviceId,
            };
        });
    }
    resolve(port) {
        const p = (0, types_1.maskPort)(port);
        for (const m of this.maps) {
            if ((p & m.portMask) === m.portValue) {
                return m.deviceId;
            }
        }
        return null;
    }
}
exports.IOPortDecoder = IOPortDecoder;
