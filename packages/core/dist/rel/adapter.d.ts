import { RelAdapter } from "./types";
import { RelFile } from "./types";
export declare class TextRelAdapter implements RelAdapter {
    write(file: RelFile): string;
}
export declare class JsonRelAdapter implements RelAdapter {
    write(file: RelFile): string;
}
