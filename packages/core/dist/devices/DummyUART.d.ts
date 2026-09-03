import { Byte, Device, Port } from "../io/types";
export declare class DummyUART implements Device {
    id: string;
    private readonly buffer;
    in(_port: Port): Byte;
    out(_port: Port, value: Byte): void;
    enqueueInput(data: ArrayLike<number>): void;
}
