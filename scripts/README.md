# Workspace verification scripts

This directory contains tracked repository-maintenance and distribution
verification scripts. Run the root commands in `package.json` rather than
calling scripts directly when a corresponding command exists.

| Root command | Entry script | Purpose |
| --- | --- | --- |
| `pnpm run check:versions` | `check-versions.cjs` | Validates public package versions and manifests. |
| `pnpm run check:boundaries` | `check-boundaries.cjs` | Validates package dependency and import boundaries. |
| `pnpm run check:pack` | `check-packages.cjs` | Validates package tarballs, metadata, and runtime assets. |
| `pnpm run check:vsix` | `check-vsix.cjs` | Validates the packaged VS Code extension. |
| `pnpm run check:docs` | `check-docs.cjs` | Validates local Markdown links and rejects absolute filesystem links. |
| `pnpm run verify:dist` | `verify-dist.cjs` | Rebuilds managed generated output in an isolated environment. |

`run-vsix-extension-host.cjs`, `smoke-vsix-runtime.cjs`, `smoke-dap.cjs`, and
`vsix-extension-host-test.cjs` are helpers invoked by the checks above.

Install third-party emulators and toolchains outside this repository. They are
not repository assets and must not be added under this directory.

Assembler regression fixtures derived from sjasmplus live under
`packages/assembler/src/__fixtures__/` so a clean clone does not require a
local sjasmplus checkout.
