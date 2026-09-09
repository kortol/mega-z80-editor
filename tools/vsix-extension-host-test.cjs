const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const vscode = require("vscode");

const workspace = process.env.MZ80_VSIX_SMOKE_WORKSPACE;

function waitFor(predicate, description, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      try {
        const value = predicate();
        if (value) {
          clearInterval(timer);
          resolve(value);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`timed out waiting for ${description}`));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, 100);
  });
}

function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(`127.0.0.1:${address.port}`));
    });
  });
}

async function run() {
  assert.ok(workspace, "MZ80_VSIX_SMOKE_WORKSPACE is required");
  const extension = vscode.extensions.getExtension("mz80.z80-assembler-language");
  assert.ok(extension, "packaged extension is not discoverable");
  await extension.activate();

  const source = path.join(workspace, "invalid.asm");
  fs.writeFileSync(source, "LD A,\n");
  const document = await vscode.workspace.openTextDocument(source);
  await vscode.window.showTextDocument(document);
  const diagnostics = await waitFor(() => {
    const current = vscode.languages.getDiagnostics(document.uri);
    return current.length > 0 ? current : undefined;
  }, "LSP diagnostics");
  assert.equal(diagnostics[0].source, "mz80");

  const validSource = path.join(workspace, "semantic.asm");
  fs.writeFileSync(validSource, "start: NOP\n");
  const valid = await vscode.workspace.openTextDocument(validSource);
  await vscode.window.showTextDocument(valid);
  const tokens = await vscode.commands.executeCommand("vscode.provideDocumentSemanticTokens", valid.uri);
  assert.ok(
    tokens && ArrayBuffer.isView(tokens.data) && tokens.data.length > 0,
    "semantic tokens are unavailable",
  );

  const program = path.join(workspace, "smoke.bin");
  fs.writeFileSync(program, Buffer.from([0x00]));
  const rpcListen = await reserveLocalPort();
  const started = new Promise((resolve) => {
    const disposable = vscode.debug.onDidStartDebugSession((session) => {
      if (session.type !== "mz80-dap") return;
      disposable.dispose();
      resolve(session);
    });
  });
  const launched = await vscode.debug.startDebugging(undefined, {
    type: "mz80-dap",
    name: "MZ80 VSIX smoke",
    request: "launch",
    program,
    cwd: workspace,
    rpcListen,
  });
  assert.equal(launched, true, "DAP launch request was rejected");
  const session = await Promise.race([
    started,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timed out waiting for DAP session")), 15000)),
  ]);
  await vscode.debug.stopDebugging(session);
}

module.exports = { run };
