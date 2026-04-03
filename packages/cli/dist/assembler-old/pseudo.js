"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePseudo = handlePseudo;
const org_1 = require("./pseudo/org");
const end_1 = require("./pseudo/end");
const equ_1 = require("./pseudo/equ");
const data_1 = require("./pseudo/data");
const extern_1 = require("./pseudo/extern");
const section_1 = require("./pseudo/section");
const align_1 = require("./pseudo/align");
const phaseManager_1 = require("./phaseManager");
const macro_1 = require("./macro");
const errors_1 = require("./errors");
const include_1 = require("./pseudo/include");
const conditional_1 = require("./pseudo/conditional");
const set_1 = require("./pseudo/set");
const data_2 = require("./pseudo/data");
function handlePseudo(ctx, node) {
    switch (node.op.toUpperCase()) {
        case "IF":
        case "ELSEIF":
        case "ELSE":
        case "ENDIF":
        case "IFIDN":
            return (0, conditional_1.handleConditional)(ctx, node);
        case "ORG":
            return (0, org_1.handleORG)(ctx, node);
        case "END":
            return (0, end_1.handleEND)(ctx, node);
        case "EQU":
            return (0, equ_1.handleEQU)(ctx, node);
        case "EXTERN":
            return (0, extern_1.handleEXTERN)(ctx, node);
        case ".SYMLEN":
            return (0, equ_1.handleSYMLEN)(ctx, node);
        case "DB":
        case "DEFB":
            return (0, data_1.handleDB)(ctx, node);
        case "DZ":
            return (0, data_2.handleDZ)(ctx, node);
        case "DW":
        case "DEFW":
            return (0, data_1.handleDW)(ctx, node);
        case "DS":
        case "DEFS":
            return (0, data_1.handleDS)(ctx, node); // 何もしない（領域確保は context.js の reserveBytes() で実施済み）
        case ".WORD32":
            return (0, data_1.handleWORD32)(ctx, node);
        case "SET":
            return (0, set_1.handleSET)(ctx, node);
        case "SECTION": {
            const name = node.args?.[0]?.value ?? "TEXT";
            const alignArg = node.args?.find((a) => a.key?.toUpperCase() === "ALIGN");
            const align = alignArg ? Number(alignArg.value) : 1;
            (0, section_1.handleSECTION)(ctx, name, { align: align });
            break;
        }
        case "ALIGN": {
            const align = Number(node.args?.[0]?.value) || 1;
            return (0, align_1.handleALIGN)(ctx, align);
        }
        case "INCLUDE": {
            if (node.__included) {
                break;
            }
            const includeArg = node.args[0];
            if (!includeArg || typeof includeArg.value !== "string") {
                ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "INCLUDE requires string literal path", { pos: node.pos }));
                break;
            }
            const includePath = includeArg.value;
            // --- 🧩 セクション復帰用に現在セクション名を保存 ---
            const currentSectionName = ctx.sections.get(ctx.currentSection)?.name ?? ".text";
            ctx.sectionStack.push(currentSectionName);
            // --- 🧩 スコープ切り替え ---
            (0, macro_1.pushMacroScope)(ctx);
            // --- 🧩 既存の include 機構を利用 ---
            const includeNode = { kind: "pseudo", op: "INCLUDE", args: node.args, pos: node.pos };
            const includedNodes = (0, include_1.handleInclude)(ctx, includeNode, true);
            // --- 🧩 INCLUDE内部をマクロ展開 ---
            const savedNodes = ctx.nodes ?? [];
            ctx.nodes = includedNodes;
            if (ctx.phase !== "emit") {
                (0, phaseManager_1.setPhase)(ctx, "macroExpand");
                (0, macro_1.expandMacros)(ctx);
                (0, phaseManager_1.setPhase)(ctx, "analyze");
            }
            // --- 🧩 スコープ戻し（promote=true で昇格） ---
            (0, macro_1.popMacroScope)(ctx);
            node.__included = true;
            // --- 🧩 INCLUDE終端でセクションを復帰 ---
            const restoreName = ctx.sectionStack.pop() ?? currentSectionName;
            const restoreNode = {
                kind: "pseudo",
                op: "SECTION",
                args: [{ value: restoreName }],
                pos: node.pos,
            };
            includedNodes.push(restoreNode);
            // --- 🧩 ノード結合（INCLUDE位置に差し込み） ---
            const insertAt = savedNodes.indexOf(node);
            if (insertAt >= 0) {
                const merged = savedNodes.slice();
                merged.splice(insertAt, 1, ...includedNodes);
                ctx.nodes = merged;
            }
            else {
                ctx.nodes = savedNodes.concat(includedNodes);
            }
            break;
        }
        default:
            throw new Error(`Unknown pseudo op ${node.op} at line ${node.pos.line}`);
    }
}
