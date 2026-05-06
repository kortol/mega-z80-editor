const fs = require("fs");
const path = require("path");

const binPath = path.join("examples", "hello-msx", "dist", "hello-msx.bin");
if (!fs.existsSync(binPath)) {
  throw new Error(`Missing ${binPath}. Build the hello-msx example before running make-rom.js.`);
}
const bin = fs.readFileSync(binPath);

// 16KB ROM バッファ作成
const rom = Buffer.alloc(0x4000, 0xFF); // 16KB

// ヘッダ（ROM先頭は 0x4000 にマップされる）
rom[0x0000] = 0x41; // 'A'
rom[0x0001] = 0x42; // 'B'
rom[0x0002] = 0xC3; // JP 4010h (INIT)
rom[0x0003] = 0x10;
rom[0x0004] = 0x40;
rom[0x0005] = 0xC9; // RET (STAT)
rom[0x0008] = 0xC9; // RET (CALL)
rom[0x000B] = 0xC9; // RET (DEVICE)
rom[0x000E] = 0xC9; // RET (TEXT)

// プログラム本体を 0x4010 に配置（ROM 内では offset 0x0010）
bin.copy(rom, 0x0010);

fs.writeFileSync(path.join("examples", "hello-msx", "dist", "hello-msx.rom"), rom);
console.log("16KB ROM written: hello-msx.rom");
