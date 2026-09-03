import { IOPortMap, Port } from "./types";
export declare class IOPortDecoder {
    private readonly maps;
    constructor(maps: IOPortMap[]);
    resolve(port: Port): string | null;
}
