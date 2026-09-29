/** Token based preprocessing for the fixed integer C Subset. */
export type Macro = {
    body: string;
    params?: string[];
};
export type MacroTable = Map<string, Macro>;
export declare function tokens(source: string): string[];
export declare function expand(source: string, macros: MacroTable, disabled?: Set<string>, depth?: number): string;
/** Integer constant expressions, with unevaluated short-circuit branches. */
export declare function evaluateCondition(source: string, macros: MacroTable): boolean;
export declare function stripComments(source: string): string;
