import { DummyUART } from "../../devices/DummyUART";
import { DeviceRegistry } from "../../io/DeviceRegistry";
import { IOBus } from "../../io/IOBus";
import { IOPortDecoder } from "../../io/IOPortDecoder";
import { IOEvent } from "../../io/types";

class ProbeDevice extends DummyUART {
  id = "probe0";
  lastInPort = -1;
  lastOutPort = -1;
  lastOutValue = -1;

  override in(port: number): number {
    this.lastInPort = port & 0xffff;
    return 0x5a;
  }

  override out(port: number, value: number): void {
    this.lastOutPort = port & 0xffff;
    this.lastOutValue = value & 0xff;
  }
}

describe("IOBus", () => {
  test("routes IN/OUT by mask/value and emits debug events", () => {
    const decoder = new IOPortDecoder([
      { portMask: 0xff, portValue: 0x00, deviceId: "probe0" },
    ]);
    const registry = new DeviceRegistry();
    const probe = new ProbeDevice();
    registry.register(probe);
    const events: IOEvent[] = [];
    const ioBus = new IOBus(decoder, registry, (e) => events.push(e));

    const v = ioBus.in(0x1200);
    expect(v).toBe(0x5a);
    expect(probe.lastInPort).toBe(0x1200);

    ioBus.out(0x3400, 0x1ff);
    expect(probe.lastOutPort).toBe(0x3400);
    expect(probe.lastOutValue).toBe(0xff);

    expect(events).toEqual([
      { type: "in", port: 0x1200, value: 0x5a, deviceId: "probe0" },
      { type: "out", port: 0x3400, value: 0xff, deviceId: "probe0" },
    ]);
  });

  test("returns 0xFF for unmapped IN and ignores unmapped OUT", () => {
    const decoder = new IOPortDecoder([]);
    const registry = new DeviceRegistry();
    const events: IOEvent[] = [];
    const ioBus = new IOBus(decoder, registry, (e) => events.push(e));

    expect(ioBus.in(0x77)).toBe(0xff);
    ioBus.out(0x77, 0x12);
    expect(events).toEqual([
      { type: "in", port: 0x0077, value: 0xff, deviceId: null },
      { type: "out", port: 0x0077, value: 0x12, deviceId: null },
    ]);
  });

  test("first matching map wins", () => {
    const decoder = new IOPortDecoder([
      { portMask: 0x00, portValue: 0x00, deviceId: "a" }, // always matches
      { portMask: 0xff, portValue: 0x10, deviceId: "b" },
    ]);

    const registry = new DeviceRegistry();
    const a = new ProbeDevice();
    a.id = "a";
    const b = new ProbeDevice();
    b.id = "b";
    registry.register(a);
    registry.register(b);
    const ioBus = new IOBus(decoder, registry);

    ioBus.out(0x10, 0x55);
    expect(a.lastOutValue).toBe(0x55);
    expect(b.lastOutValue).toBe(-1);
  });
});
