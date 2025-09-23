const { spawn } = require("child_process");

console.log("🚀 Starting DAP test client...");
console.log("   (Press Ctrl+C to stop)\n");

// DAPサーバを起動
const server = spawn("node", ["./dist/index.js"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "inherit"]
});

// サーバからの応答を表示
server.stdout.on("data", (data) => {
  console.log("<<", data.toString());
});

// JSON-RPC (DAP) メッセージ送信関数
function send(message) {
  const json = JSON.stringify(message);
  const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
  server.stdin.write(payload);
}

// === initialize リクエスト ===
const initRequest = {
  seq: 1,
  type: "request",
  command: "initialize",
  arguments: {
    adapterID: "mz80",
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: "path"
  }
};

// === launch リクエスト ===
const launchRequest = {
  seq: 2,
  type: "request",
  command: "launch",
  arguments: {
    program: "dummy.rom"
  }
};

// === disconnect リクエスト ===
const disconnectRequest = {
  seq: 3,
  type: "request",
  command: "disconnect"
};

// サーバへ送信
send(initRequest);
setTimeout(() => send(launchRequest), 300);
setTimeout(() => send(disconnectRequest), 600);

process.on("SIGINT", () => {
  console.log("\n🛑 Test client stopped by user (Ctrl+C).");
  server.kill();
  process.exit(0);
});
