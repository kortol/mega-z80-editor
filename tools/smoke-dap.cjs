/* Exercise the public CLI DAP adapter without any workspace dependency. */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startDap(cliEntry, cwd) {
  const child = spawn(process.execPath, [cliEntry, "dap"], {
    cwd,
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
      if (!lengthMatch) throw new Error(`DAP: malformed protocol header: ${header}`);
      const bodyStart = separator + 4;
      const length = Number(lengthMatch[1]);
      if (buffer.length < bodyStart + length) return;
      messages.push(JSON.parse(buffer.subarray(bodyStart, bodyStart + length).toString("utf8")));
      buffer = buffer.subarray(bodyStart + length);
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
      throw new Error(`DAP: timed out waiting for ${description}; stderr=${stderr || "(none)"}`);
    },
    async stop() {
      if (exited) return;
      child.kill();
      for (let elapsed = 0; elapsed < 1000 && !exited; elapsed += 25) await delay(25);
      if (!exited) child.kill("SIGKILL");
    },
  };
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

async function smokeDap(cliEntry, cwd = process.cwd()) {
  const dap = startDap(path.resolve(cliEntry), cwd);
  const debugRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mz80-dap-smoke-"));
  const program = path.join(debugRoot, "smoke.bin");
  fs.writeFileSync(program, Buffer.from([0x00]));
  const rpcListen = await reserveLocalPort();
  try {
    dap.send({ seq: 1, type: "request", command: "initialize", arguments: { clientID: "mz80-smoke", adapterID: "mz80-dap" } });
    await dap.waitFor((message) => message.type === "response" && message.command === "initialize" && message.success === true, "initialize response");
    dap.send({ seq: 2, type: "request", command: "launch", arguments: { program, cwd: debugRoot, rpcListen } });
    await dap.waitFor((message) => message.type === "event" && message.event === "initialized", "initialized event");
    dap.send({ seq: 3, type: "request", command: "configurationDone", arguments: {} });
    await dap.waitFor((message) => message.type === "response" && message.command === "configurationDone" && message.success === true, "configurationDone response");
    await dap.waitFor((message) => message.type === "response" && message.command === "launch" && message.success === true, "launch response");
    dap.send({ seq: 4, type: "request", command: "disconnect", arguments: { terminateDebuggee: true } });
    await dap.waitFor((message) => message.type === "response" && message.command === "disconnect" && message.success === true, "disconnect response");
  } finally {
    await dap.stop();
    fs.rmSync(debugRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const cliEntry = process.argv[2];
  if (!cliEntry) throw new Error("usage: node tools/smoke-dap.cjs <cli-entry>");
  smokeDap(cliEntry).then(() => {
    console.log("[dap] initialize, launch, and disconnect are valid");
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { smokeDap };
