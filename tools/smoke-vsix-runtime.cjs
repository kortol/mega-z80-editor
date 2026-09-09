/* Exercise the runtime exactly as it is laid out inside an extracted VSIX. */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { smokeDap } = require("./smoke-dap.cjs");

const extensionRoot = path.resolve(process.argv[2] ?? "");
if (!fs.existsSync(path.join(extensionRoot, "package.json"))) {
  throw new Error("usage: node tools/smoke-vsix-runtime.cjs <extracted-extension-directory>");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startProtocolProcess(entry, args, label) {
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: extensionRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const messages = [];
  let buffer = Buffer.alloc(0);
  let stderr = "";
  let exited = false;

  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("exit", () => { exited = true; });
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const header = buffer.subarray(0, separator).toString("ascii");
      const lengthMatch = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
      if (!lengthMatch) throw new Error(`${label}: malformed protocol header: ${header}`);
      const length = Number(lengthMatch[1]);
      const bodyStart = separator + 4;
      if (buffer.length < bodyStart + length) return;
      const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.subarray(bodyStart + length);
      messages.push(JSON.parse(body));
    }
  });

  return {
    send(message) {
      const body = JSON.stringify(message);
      child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    },
    async waitFor(predicate, description) {
      for (let elapsed = 0; elapsed < 8000; elapsed += 25) {
        const match = messages.find(predicate);
        if (match) return match;
        if (exited) break;
        await delay(25);
      }
      throw new Error(`${label}: timed out waiting for ${description}; stderr=${stderr || "(none)"}`);
    },
    async stop() {
      if (exited) return;
      child.kill();
      for (let elapsed = 0; elapsed < 1000 && !exited; elapsed += 25) await delay(25);
      if (!exited) child.kill("SIGKILL");
    },
  };
}

async function verifyLsp(lspEntry) {
  // LanguageClient starts node-based language servers with this transport
  // selector; pass the same argument when exercising the packaged entrypoint.
  const lsp = startProtocolProcess(lspEntry, ["--stdio"], "LSP");
  const uri = "file:///mz80-vsix-smoke.asm";
  try {
    lsp.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { processId: null, rootUri: null, capabilities: {} } });
    const initialized = await lsp.waitFor((message) => message.id === 1 && message.result?.capabilities?.semanticTokensProvider, "initialize response");
    if (!initialized.result.capabilities.semanticTokensProvider.full) throw new Error("LSP: semantic tokens are not enabled");
    lsp.send({ jsonrpc: "2.0", method: "initialized", params: {} });
    lsp.send({ jsonrpc: "2.0", method: "textDocument/didOpen", params: {
      textDocument: { uri, languageId: "z80-asm", version: 1, text: "start: NOP\n" },
    } });
    await lsp.waitFor((message) => message.method === "textDocument/publishDiagnostics" && message.params?.uri === uri, "initial diagnostics");
    lsp.send({ jsonrpc: "2.0", id: 2, method: "textDocument/semanticTokens/full", params: { textDocument: { uri } } });
    const tokens = await lsp.waitFor((message) => message.id === 2 && Array.isArray(message.result?.data), "semantic token response");
    if (tokens.result.data.length === 0) throw new Error("LSP: expected semantic tokens for a label declaration");
    lsp.send({ jsonrpc: "2.0", method: "textDocument/didChange", params: {
      textDocument: { uri, version: 2 }, contentChanges: [{ text: "LD A,\n" }],
    } });
    const diagnostics = await lsp.waitFor((message) =>
      message.method === "textDocument/publishDiagnostics" &&
      message.params?.uri === uri &&
      Array.isArray(message.params?.diagnostics) &&
      message.params.diagnostics.length > 0,
    "diagnostics for invalid source");
    if (diagnostics.params.diagnostics[0].source !== "mz80") throw new Error("LSP: diagnostics did not originate from mz80");
  } finally {
    await lsp.stop();
  }
}

async function main() {
  const runtime = path.join(extensionRoot, "server", "node_modules", "@mz80");
  await verifyLsp(path.join(runtime, "lsp", "dist", "index.js"));
  await smokeDap(path.join(runtime, "cli", "dist", "index.js"), extensionRoot);
  console.log("[vsix] packaged LSP diagnostics/semantic tokens and DAP initialization are valid");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
