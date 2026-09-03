import { RelModuleV2 } from "./types";
export declare function adaptV2toV1(mod: RelModuleV2): {
    symbols: {
        name: string;
        value: number;
        storage: import("./types").RelSymbolStorageV2;
    }[];
    data: Uint8Array<ArrayBuffer>;
    fixups: {
        loc: number;
        symIndex: number;
        width: 1 | 2;
        signed: boolean;
        pcrel: boolean;
        addend: number;
    }[];
};
