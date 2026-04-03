import { AsmContext } from "../context";
import { AssemblerErrorCode, makeError } from "../errors";
import { NodePseudo } from "../node";
import { handleEXTERN } from "./extern";
import { handleSECTION } from "./section";

export function handleGLOBAL(ctx: AsmContext, node: NodePseudo) {
  if (!node.args?.length) {
    ctx.errors.push(makeError(AssemblerErrorCode.SyntaxError, "GLOBAL requires symbol list", { pos: node.pos }));
    return;
  }
  for (const a of node.args) {
    const name = (a.value ?? "").trim();
    if (!name) continue;
    const sym = ctx.caseInsensitive ? name.toUpperCase() : name;
    ctx.exportSymbols.add(sym);
  }
}

export function handleLOCAL(_ctx: AsmContext, _node: NodePseudo) {
  // P2-M minimal mode:
  // accept LOCAL syntax for M80 compatibility. Macro-local semantics are not expanded here.
}

export function handleSectionAlias(ctx: AsmContext, node: NodePseudo, kind: "ASEG" | "CSEG" | "DSEG" | "COMMON") {
  const name =
    kind === "CSEG" ? "TEXT"
      : kind === "DSEG" ? "DATA"
        : kind === "ASEG" ? ".aseg"
          : "COMMON";
  const sectionNode: NodePseudo = { ...node, op: "SECTION", args: [{ value: name }] };
  handleSECTION(ctx, sectionNode);
}

export function handleEXTERNALAlias(ctx: AsmContext, node: NodePseudo) {
  const externNode: NodePseudo = { ...node, op: "EXTERN" };
  handleEXTERN(ctx, externNode);
}

export function handleTITLE(ctx: AsmContext, node: NodePseudo) {
  const raw = node.args?.map(a => a.value ?? "").join(",").trim();
  if (!raw) return;
  ctx.listingControl.title = raw;
}

export function handlePAGE(ctx: AsmContext, node: NodePseudo) {
  if (!node.args?.length) return;
  const raw = node.args[0]?.value?.trim();
  if (!raw) return;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    ctx.errors.push(makeError(AssemblerErrorCode.SyntaxError, "PAGE requires positive integer", { pos: node.pos }));
    return;
  }
  ctx.listingControl.page = n;
}

export function handleLIST(ctx: AsmContext, node: NodePseudo) {
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

export function handleEXITM(ctx: AsmContext, node: NodePseudo) {
  ctx.errors.push(makeError(AssemblerErrorCode.SyntaxError, "EXITM outside macro", { pos: node.pos }));
}

