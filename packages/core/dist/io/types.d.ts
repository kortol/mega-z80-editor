export type Port = number;
export type Byte = number;
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
export declare function maskPort(port: Port): Port;
export declare function maskByte(value: Byte): Byte;
