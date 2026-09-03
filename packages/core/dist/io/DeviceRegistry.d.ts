import { Device } from "./types";
export declare class DeviceRegistry {
    private readonly devices;
    register(device: Device): void;
    get(id: string): Device;
}
