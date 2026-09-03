import { DeviceRegistry } from "./DeviceRegistry";
import { IOPortDecoder } from "./IOPortDecoder";
import { Byte, IOEvent, Port } from "./types";
export declare class IOBus {
    private readonly decoder;
    private readonly registry;
    private readonly debugHook?;
    constructor(decoder: IOPortDecoder, registry: DeviceRegistry, debugHook?: ((event: IOEvent) => void) | undefined);
    in(port: Port): Byte;
    out(port: Port, value: Byte): void;
    private emit;
}
