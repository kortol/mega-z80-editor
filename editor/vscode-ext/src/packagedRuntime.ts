import { createRequire } from "node:module";
import * as path from "node:path";

// The extension itself is packaged without its development node_modules tree.
// Runtime libraries live below server/node_modules with the CLI, LSP, and DAP
// closure, so resolve extension-owned runtime dependencies from that location.
const requirePackagedRuntime = createRequire(
  path.join(__dirname, "..", "server", "node_modules", "@mz80", "cli", "package.json"),
);

export const packagedYaml: typeof import("yaml") = requirePackagedRuntime("yaml");
