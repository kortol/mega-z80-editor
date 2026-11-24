"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryRangesOverlap = void 0;
exports.memoryAddress = memoryAddress;
exports.normalizeMemoryLayout = normalizeMemoryLayout;
exports.validatePlacedMemory = validatePlacedMemory;
function memoryAddress(value, label) {
    let result;
    if (typeof value === "number")
        result = value;
    else if (typeof value === "string" && /^(?:[0-9]+|0x[0-9a-f]+|[0-9a-f]+h)$/i.test(value.trim())) {
        const text = value.trim();
        result = /h$/i.test(text) ? parseInt(text.slice(0, -1), 16) : Number(text);
    }
    else
        throw new Error(`memory: invalid ${label}`);
    if (!Number.isSafeInteger(result) || result < 0 || result > 65536)
        throw new Error(`memory: ${label} must be an integer in 0..65536`);
    return result;
}
const overlaps = (left, right) => left.size > 0 && right.size > 0 && left.start < right.start + right.size && right.start < left.start + left.size;
exports.memoryRangesOverlap = overlaps;
function normalizeMemoryLayout(value) {
    if (!value || typeof value !== "object")
        throw new Error("memory: expected a layout object");
    for (const key of Object.keys(value))
        if (!["code", "ram", "stack", "heap"].includes(key))
            throw new Error(`memory: unknown field ${key}`);
    const range = (item, label) => {
        if (!item || typeof item !== "object")
            throw new Error(`memory: ${label} is required`);
        for (const key of Object.keys(item))
            if (!["start", "size", ...(label === "code" ? ["kind"] : [])].includes(key))
                throw new Error(`memory: unknown ${label}.${key}`);
        const start = memoryAddress(item.start, `${label}.start`), size = memoryAddress(item.size, `${label}.size`);
        if (size === 0 || start + size > 65536)
            throw new Error(`memory: ${label} range is empty or exceeds 16-bit memory`);
        return { start, size };
    };
    const codeRange = range(value.code, "code"), ram = range(value.ram, "ram");
    if (!["ram", "rom"].includes(value.code.kind))
        throw new Error("memory: code.kind must be ram or rom");
    if (value.code.kind === "rom" && overlaps(codeRange, ram))
        throw new Error("memory: ROM and RAM regions overlap");
    const contained = (item) => item.start >= ram.start && item.start + item.size <= ram.start + ram.size;
    if (value.code.kind === "ram" && !contained(codeRange))
        throw new Error("memory: RAM code region must be inside ram");
    if (!value.stack)
        throw new Error("memory: stack is required");
    for (const key of Object.keys(value.stack))
        if (!["top", "size"].includes(key))
            throw new Error(`memory: unknown stack.${key}`);
    const top = memoryAddress(value.stack.top, "stack.top"), size = memoryAddress(value.stack.size, "stack.size");
    const stack = { start: top - size, top, size };
    if (!size || !contained(stack))
        throw new Error("memory: stack must fit inside ram");
    const heap = value.heap === undefined ? undefined : range(value.heap, "heap");
    if (heap && !contained(heap))
        throw new Error("memory: heap must fit inside ram");
    if (heap && overlaps(heap, stack))
        throw new Error("memory: heap and stack reservations overlap");
    return { code: { ...codeRange, kind: value.code.kind }, ram, stack, ...(heap ? { heap } : {}) };
}
function validatePlacedMemory(layout, sections) {
    const used = sections.filter(section => section.size > 0);
    for (const section of used) {
        if (!["TEXT", "DATA", "BSS"].includes(section.kind))
            throw new Error("memory: CUSTOM/ASEG sections are unsupported in configured layouts");
        const region = section.kind === "TEXT" ? layout.code : layout.ram;
        if (section.start < region.start || section.start + section.size > region.start + region.size)
            throw new Error(`memory: ${section.kind} exceeds its ${section.kind === "TEXT" ? "code" : "RAM"} region`);
        if (overlaps(section, layout.stack))
            throw new Error(`memory: ${section.kind} overlaps reserved stack`);
        if (layout.heap && overlaps(section, layout.heap))
            throw new Error(`memory: ${section.kind} overlaps reserved heap`);
    }
    for (let left = 0; left < used.length; left++)
        for (let right = left + 1; right < used.length; right++)
            if (overlaps(used[left], used[right]))
                throw new Error(`memory: ${used[left].kind}/${used[right].kind} sections overlap`);
}
