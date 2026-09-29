import { AdditiveOp, BitwiseOp, CompareOp, LogicalOp, MultiplicativeOp, ShiftOp, SourceExpr, SourceGlobalDecl, SourceLocalDecl, SourceProgram, SourceType } from "./tsFrontendAst";
type ParseContext = {
    file?: string;
    normalized: string;
    typedefs: Map<string, SourceType>;
    enumTypes: Set<string>;
    enumConstants: Map<string, number>;
    literals?: Map<string, Extract<SourceExpr, {
        kind: "compoundAddress";
    }>>;
    literalLocals?: Map<string, SourceLocalDecl[]>;
    literalGlobals?: SourceGlobalDecl[];
    literalInitializers?: Map<string, {
        type: SourceType;
        text: string;
        fn: string;
    }>;
    declaredTypes?: Map<string, SourceType>;
    initializerFunction?: string;
};
export declare function parseProgram(sourceText: string, file?: string): SourceProgram;
export declare function stripLineComments(sourceText: string): string;
export declare function parseExpression(context: ParseContext, exprText: string, functionName: string, offset: number): SourceExpr;
export type { ParseContext };
export type { AdditiveOp, BitwiseOp, CompareOp, LogicalOp, MultiplicativeOp, ShiftOp };
