import { AsmContext } from "../context";
import { NodePseudo } from "../node";
/**
 * SECTION 擬似命令
 *   SECTION TEXT
 *   SECTION DATA
 *   SECTION BSS
 *   SECTION .custom
 */
export declare function handleSECTION(ctx: AsmContext, node: NodePseudo | string, attrs?: {
    align?: number;
}): void;
