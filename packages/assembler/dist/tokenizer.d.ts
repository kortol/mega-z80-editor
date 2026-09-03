import { AsmContext, SourcePos } from "./context";
export type TokenKind = "ident" | "num" | "string" | "comma" | "colon" | "lparen" | "rparen" | "op" | "eol";
export interface Token {
    kind: TokenKind;
    text: string;
    value?: number;
    stringValue?: string;
    pos: SourcePos;
}
export declare function cloneTokens(tokens: any[]): any[];
export declare function tokenize(ctx: AsmContext, src: string): Token[];
export declare function parseNumber(text: string): number;
