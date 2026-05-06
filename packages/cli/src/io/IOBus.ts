import { DeviceRegistry } from "./DeviceRegistry";
import { IOPortDecoder } from "./IOPortDecoder";
import { Byte, IOEvent, Port, maskByte, maskPort } from "./types";

export class IOBus {
  constructor(
    private readonly decoder: IOPortDecoder,
    private readonly registry: DeviceRegistry,
    private readonly debugHook?: (event: IOEvent) => void
  ) {}

  in(port: Port): Byte {
    const p = maskPort(port);
    const deviceId = this.decoder.resolve(p);

    if (!deviceId) {
      this.emit({ type: "in", port: p, value: 0xff, deviceId: null });
      return 0xff;
    }

    const device = this.registry.get(deviceId);
    const value = maskByte(device.in(p));
    this.emit({ type: "in", port: p, value, deviceId });
    return value;
  }

  out(port: Port, value: Byte): void {
    const p = maskPort(port);
    const v = maskByte(value);
    const deviceId = this.decoder.resolve(p);

    if (!deviceId) {
      this.emit({ type: "out", port: p, value: v, deviceId: null });
      return;
    }

    const device = this.registry.get(deviceId);
    device.out(p, v);
    this.emit({ type: "out", port: p, value: v, deviceId });
  }

  private emit(event: IOEvent): void {
    if (!this.debugHook) return;
    try {
      this.debugHook(event);
    } catch {
      // Debug hook failures must not break target execution.
    }
  }
}

