// editor/lsp/test-client.js
const { spawn } = require("child_process");

console.log("🚀 Starting LSP test client...");
console.log("   (Press Ctrl+C to stop)\n");

const server = spawn("node", ["./dist/index.js", "--stdio"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "inherit"]
});

server.stdout.on("data", (data) => {
  console.log("<<", data.toString());
});

function send(message) {
  const json = JSON.stringify(message);
  const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
  server.stdin.write(payload);
}

const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    processId: process.pid,
    rootUri: null,
    capabilities: {}
  }
};

const initialized = {
  jsonrpc: "2.0",
  method: "initialized",
  params: {}
};

send(initRequest);
setTimeout(() => send(initialized), 200);

process.on("SIGINT", () => {
  server.kill();
  process.exit(0);
});
