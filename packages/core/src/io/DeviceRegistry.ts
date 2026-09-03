import { Device } from "./types";

export class DeviceRegistry {
  private readonly devices = new Map<string, Device>();

  register(device: Device): void {
    if (!device || typeof device.id !== "string" || device.id.length === 0) {
      throw new Error("Invalid device: id is required");
    }
    this.devices.set(device.id, device);
  }

  get(id: string): Device {
    const d = this.devices.get(id);
    if (!d) throw new Error(`Device not found: ${id}`);
    return d;
  }
}

