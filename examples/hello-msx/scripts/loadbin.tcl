# hello-msx.bin を 0x0100 にロード
load_debuggable memory examples/hello-msx/dist/hello-msx.bin 0x0100

# エントリポイントに PC をセット
reg pc 0x0100
debug cont
# コンソールにメッセージ
#puts "hello-msx.bin loaded at 0x0100, PC set to 0x0100"
