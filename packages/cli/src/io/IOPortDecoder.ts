import { IOPortMap, Port, maskPort } from "./types";

export class IOPortDecoder {
  private readonly maps: IOPortMap[];

  constructor(maps: IOPortMap[]) {
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

  resolve(port: Port): string | null {
    const p = maskPort(port);
    for (const m of this.maps) {
      if ((p & m.portMask) === m.portValue) {
        return m.deviceId;
      }
    }
    return null;
  }
}

