export type Port = number; // 0x0000 - 0xFFFF
export type Byte = number; // 0x00 - 0xFF

export interface Device {
  id: string;
  in(port: Port): Byte;
  out(port: Port, value: Byte): void;
  tick?(tState: number): void;
}

export type IOPortMap = {
  portMask: number;
  portValue: number;
  deviceId: string;
};

export type IOEvent = {
  type: "in" | "out";
  port: Port;
  value: Byte;
  deviceId: string | null;
};

export function maskPort(port: Port): Port {
  return port & 0xffff;
}

export function maskByte(value: Byte): Byte {
  return value & 0xff;
}

