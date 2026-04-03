"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleALIGN = handleALIGN;
function handleALIGN(ctx, align) {
    const sec = ctx.sections.get(ctx.currentSection);
    const mask = align - 1;
    if (align <= 0 || (align & mask) !== 0)
        throw new Error(`ALIGN must be power of two`);
    if (sec.lc & mask) {
        const newLc = (sec.lc + mask) & ~mask;
        const padding = newLc - sec.lc;
        sec.bytes.push(...new Array(padding).fill(0));
        sec.size += padding;
        sec.lc = newLc;
    }
}
