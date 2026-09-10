# Curated sjasmplus macro fixtures

These files are the minimal inputs and expected binaries used by
`sjasm_macro_compat.test.ts`. They were copied from
[`z00m128/sjasmplus`](https://github.com/z00m128/sjasmplus),
`tests/macros/`, so the assembler test suite does not depend on a local
sjasmplus clone.

The upstream `tests/` directory is licensed under the BSD 0-clause license.
The original files retain their content unchanged except where the test itself
normalizes the non-standard `ORG 'PS'` literal before assembly.
