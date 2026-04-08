"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGLOBAL = handleGLOBAL;
exports.handleLOCAL = handleLOCAL;
exports.handleSectionAlias = handleSectionAlias;
exports.handleEXTERNALAlias = handleEXTERNALAlias;
exports.handleTITLE = handleTITLE;
exports.handlePAGE = handlePAGE;
exports.handleLIST = handleLIST;
exports.handleEXITM = handleEXITM;
const errors_1 = require("../errors");
const extern_1 = require("./extern");
const section_1 = require("./section");
function handleGLOBAL(ctx, node) {
    if (!node.args?.length) {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "GLOBAL requires symbol list", { pos: node.pos }));
        return;
    }
    for (const a of node.args) {
        const name = (a.value ?? "").trim();
        if (!name)
            continue;
        const sym = ctx.caseInsensitive ? name.toUpperCase() : name;
        ctx.exportSymbols.add(sym);
    }
}
function handleLOCAL(_ctx, _node) {
    // P2-M minimal mode:
    // accept LOCAL syntax for M80 compatibility. Macro-local semantics are not expanded here.
}
function handleSectionAlias(ctx, node, kind) {
    const name = kind === "CSEG" ? "TEXT"
        : kind === "DSEG" ? "DATA"
            : kind === "ASEG" ? "ASEG"
                : "COMMON";
    const sectionNode = { ...node, op: "SECTION", args: [{ value: name }] };
    (0, section_1.handleSECTION)(ctx, sectionNode);
}
function handleEXTERNALAlias(ctx, node) {
    const externNode = { ...node, op: "EXTERN" };
    (0, extern_1.handleEXTERN)(ctx, externNode);
}
function handleTITLE(ctx, node) {
    const raw = node.args?.map(a => a.value ?? "").join(",").trim();
    if (!raw)
        return;
    ctx.listingControl.title = raw;
}
function handlePAGE(ctx, node) {
    if (!node.args?.length)
        return;
    const raw = node.args[0]?.value?.trim();
    if (!raw)
        return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "PAGE requires positive integer", { pos: node.pos }));
        return;
    }
    ctx.listingControl.page = n;
}
function handleLIST(ctx, node) {
    const raw = node.args?.[0]?.value?.trim().toUpperCase() ?? "";
    if (!raw) {
        ctx.listingControl.enabled = true;
        return;
    }
    if (raw === "OFF" || raw === "0" || raw === "FALSE" || raw === "NOLIST") {
        ctx.listingControl.enabled = false;
        return;
    }
    ctx.listingControl.enabled = true;
}
function handleEXITM(ctx, node) {
    ctx.errors.push((0, errors_1.makeError)(errors_1.AssemblerErrorCode.SyntaxError, "EXITM outside macro", { pos: node.pos }));
}
