"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskPort = maskPort;
exports.maskByte = maskByte;
function maskPort(port) {
    return port & 0xffff;
}
function maskByte(value) {
    return value & 0xff;
}
