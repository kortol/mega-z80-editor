import { AssemblerErrorCode } from "../errors";
import { assembleSource, assembleSourceMulti, getBytes, phaseEmit } from "../testUtils";
import { AsmContext } from "../context";

describe("P2-J: Local Macro scope handling", () => {
  test("LOCALMACRO: defined but not callable outside its scope", () => {
    const src = `
OUTER MACRO
  LOCALMACRO FOO
    NOP
  ENDM
  FOO  ; OK
ENDM

OUTER
FOO    ; should not be visible globally
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    console.log(ctx);
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.errors[0].code).toBe(AssemblerErrorCode.SyntaxError);
    expect(ctx.errors[0].message).toMatch(/Macro 'FOO' is not defined/i);
  });

  test("LOCALMACRO: callable inside same MACRO body", () => {
    const src = `
OUTER MACRO
  LOCALMACRO INNER
    NOP
  ENDM
  INNER
ENDM

OUTER
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    expect(ctx.errors).toHaveLength(0);
    // NOP → 00h
    expect(getBytes(ctx)).toContain(0x00);
  });

  test("LOCALMACRO: local scope does not leak to global after macro end", () => {
    const src = `
OUTER MACRO
  LOCALMACRO TEMP
    LD A,1
  ENDM
  TEMP
ENDM

OUTER
TEMP    ; should fail (scope closed)
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    const err = ctx.errors.find(e => /TEMP/.test(e.message));
    expect(err?.code).toBe(AssemblerErrorCode.SyntaxError);
  });

  test("LOCALMACRO shadowing: local version overrides global temporarily", () => {
    const src = `
MACRO1 MACRO
  NOP
ENDM

MACRO2 MACRO
  LOCALMACRO MACRO1
    LD A,1
  ENDM
  MACRO1     ; should expand to LD A,1
ENDM

MACRO2
MACRO1       ; should expand to NOP
`;
    const ctx = assembleSource(phaseEmit, src, {  });
    expect(ctx.errors).toHaveLength(0);

    const bin = getBytes(ctx);
    const hex = bin.map(b => b.toString(16).padStart(2, "0")).join(" ");

    // LD A,1 (3E 01) と NOP (00) の両方が出現するはず
    expect(hex).toMatch(/3e 01/i);
    expect(hex).toMatch(/00/i);
  });

  test("Normal MACRO (non-local) still promoted globally", () => {
    const mainSrc = `
MAC1 MACRO
  LD A,2
ENDM

INCLUDE "sub.inc"
MAC1
`;

    const subSrc = `
MAC2 MACRO
  LD A,3
ENDM
`;

    const files = {
      "main.asm": mainSrc,
      "sub.inc": subSrc,
    };

    const ctx = assembleSourceMulti(phaseEmit, files);
    expect(ctx.errors).toHaveLength(0);
    const bin = getBytes(ctx);
    const hex = bin.map(b => b.toString(16).padStart(2, "0")).join(" ");
    expect(hex).toMatch(/3e 02/i); // LD A,2（MAC1呼び出し）
  });

  test("多段展開検出: 15回超でエラー", () => {
    const src = `
  RECUR MACRO
    RECUR
  ENDM

    RECUR
  `;
    const ctx = assembleSource(phaseEmit, src, {  });
    const err = ctx.errors.find(e => /exceeded/i);
    expect(err?.code).toBe(AssemblerErrorCode.MacroRecursionLimit);
  });
});

