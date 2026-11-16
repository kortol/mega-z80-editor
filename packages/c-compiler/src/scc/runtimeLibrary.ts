import fs from "node:fs";
import path from "node:path";

export type RuntimeLibraryModule = {
  name: string;
  file: string;
  exports: string[];
  externs: string[];
};

/**
 * Source and archive contract for the platform-independent full runtime.
 * Keep this order stable: it is also the deterministic MZ80AR1 member order.
 */
export const FULL_RUNTIME_LIBRARY_MODULES: readonly RuntimeLibraryModule[] = [
  {
    name: "mz80c-stdlib",
    file: "stdlib.scc.asm",
    exports: ["abs", "atoi", "__mz80_assert", "rand", "srand", "mz80_full_atoi_negative", "mz80_full_atoi_pointer", "mz80_full_rand_seed"],
    externs: ["exit", "mz80_runtime_gint"],
  },
  {
    name: "mz80c-string",
    file: "string.scc.asm",
    exports: ["strlen", "memcpy", "memmove", "memset", "strcmp", "strcoll", "strxfrm", "memcmp", "strcpy", "strcat", "strncat", "strncpy", "strncmp", "strchr", "strrchr", "strpbrk", "strspn", "strcspn", "strstr", "strtok", "mz80_full_memset_value", "mz80_full_strxfrm_remaining", "mz80_full_strxfrm_source", "mz80_full_strxfrm_destination", "mz80_full_strxfrm_char", "mz80_full_strstr_needle", "mz80_full_strstr_cursor", "mz80_full_strstr_candidate", "mz80_full_strpbrk_accept", "mz80_full_span_accept", "mz80_full_strtok_is_delimiter", "mz80_full_strtok_delimiters", "mz80_full_strtok_cursor", "mz80_full_strtok_token"],
    externs: ["mz80_runtime_gchar", "mz80_runtime_gint"],
  },
  {
    name: "mz80c-ctype",
    file: "ctype.scc.asm",
    exports: ["isalpha", "isalnum", "iscntrl", "isdigit", "isgraph", "islower", "isprint", "ispunct", "isupper", "isspace", "isxdigit", "tolower", "toupper", "mz80_full_isalpha_a"],
    externs: ["mz80_runtime_gchar"],
  },
  {
    name: "mz80c-stdio",
    file: "stdio.scc.asm",
    exports: ["printf", "sprintf", "mz80_full_vformat", "mz80_full_next_arg", "mz80_full_emit", "mz80_full_emit_unsigned", "mz80_full_emit_signed", "mz80_full_emit_hex_lower", "mz80_full_emit_hex_upper", "mz80_full_emit_hex", "mz80_full_emit_hex_recurse", "mz80_full_emit_hex_fixed", "mz80_full_emit_hex_digit", "mz80_full_format_loop", "mz80_full_hex_alpha"],
    externs: ["putchar", "mz80_runtime_gchar", "mz80_runtime_gint"],
  },
];

const FULL_RUNTIME_PUBLIC_EXPORTS = [
  "memcmp", "memcpy", "memmove", "memset", "strcmp", "strcpy", "strncat", "strstr", "strtok", "strpbrk", "strspn", "strcspn", "strcoll", "strxfrm", "mz80_full_strtok_is_delimiter", "strlen", "isalpha", "isdigit", "islower", "isspace", "isupper", "tolower", "toupper", "abs", "atoi", "__mz80_assert", "rand", "srand", "printf", "sprintf", "mz80_full_memset_value", "mz80_full_isalpha_a", "mz80_full_vformat", "mz80_full_next_arg", "mz80_full_emit", "mz80_full_emit_unsigned", "mz80_full_emit_signed", "mz80_full_emit_hex_lower", "mz80_full_emit_hex_upper", "mz80_full_emit_hex", "mz80_full_emit_hex_recurse", "mz80_full_emit_hex_fixed", "mz80_full_emit_hex_digit", "mz80_full_format_loop", "mz80_full_hex_alpha",
] as const;

/** Concatenates module sources for the legacy source-runtime path. */
export function readFullRuntimeSource(libraryRoot: string): string {
  const bodies = FULL_RUNTIME_LIBRARY_MODULES.map(({ file }) => fs.readFileSync(path.join(libraryRoot, file), "utf8"));
  return [
    "; Profile supplement shared by all bundled full runtimes.",
    "; Entry arguments use the current TypeScript SCC non-variadic ABI (first argument farthest from SP).",
    ...FULL_RUNTIME_PUBLIC_EXPORTS.map((symbol) => `\t.globl\t${symbol}`),
    "\t.area\t_CODE",
    ...bodies,
  ].join("\n");
}
