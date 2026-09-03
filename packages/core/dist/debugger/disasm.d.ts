export type Decoded = {
    size: number;
    text: string;
    target?: number;
};
export declare function decodeOne(buf: Uint8Array, offset: number, addr: number): Decoded;
