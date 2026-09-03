"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceRegistry = void 0;
class DeviceRegistry {
    devices = new Map();
    register(device) {
        if (!device || typeof device.id !== "string" || device.id.length === 0) {
            throw new Error("Invalid device: id is required");
        }
        this.devices.set(device.id, device);
    }
    get(id) {
        const d = this.devices.get(id);
        if (!d)
            throw new Error(`Device not found: ${id}`);
        return d;
    }
}
exports.DeviceRegistry = DeviceRegistry;
