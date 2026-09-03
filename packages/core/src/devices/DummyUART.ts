import { Byte, Device, Port, maskByte } from "../io/types";

export class DummyUART implements Device {
  id = "uart0";
  private readonly buffer: Byte[] = [];

  in(_port: Port): Byte {
    return this.buffer.length > 0 ? (this.buffer.shift() as Byte) : 0x00;
  }

  out(_port: Port, value: Byte): void {
    const ch = maskByte(value);
    process.stdout.write(String.fromCharCode(ch));
  }

  enqueueInput(data: ArrayLike<number>): void {
    for (let i = 0; i < data.length; i++) {
      this.buffer.push(maskByte(data[i]));
    }
  }
}

