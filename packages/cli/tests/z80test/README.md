# z80test fixtures

Place `.asm` / `.bin` pairs here to enable the golden tests:

```
pnpm -C packages/cli import:z80test -- --src <path-to-raxoft/z80test>
```

When fixtures exist, `npm test` will assemble each `.asm` (PEG parser) and
compare the emitted bytes to the `.bin` file.
