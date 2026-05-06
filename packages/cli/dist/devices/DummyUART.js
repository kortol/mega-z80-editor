"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DummyUART = void 0;
const types_1 = require("../io/types");
class DummyUART {
    id = "uart0";
    buffer = [];
    in(_port) {
        return this.buffer.length > 0 ? this.buffer.shift() : 0x00;
    }
    out(_port, value) {
        const ch = (0, types_1.maskByte)(value);
        process.stdout.write(String.fromCharCode(ch));
    }
    enqueueInput(data) {
        for (let i = 0; i < data.length; i++) {
            this.buffer.push((0, types_1.maskByte)(data[i]));
        }
    }
}
exports.DummyUART = DummyUART;
