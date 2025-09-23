# 📘 MegaZ80Editor 開発ドキュメント - P0 成果まとめ

## 🎯 P0 の目的

* **CLI / LSP / DAP / VSCode Extension の基盤を整える**
* まず「動作して応答する」ことを確認できる最小限のスケルトンを揃える
* examples プロジェクトを通じて統合確認を行えるようにする

---

## ✅ 成果物一覧

### 1. CLI

* `@mz80/cli`
* verbose / quiet ログ出力オプション実装済み
* `.asm` / `mz80.yaml` を入力対象とする CLI コマンドが動作確認済み

**実行例**

```powershell
PS> pnpm --filter @mz80/cli dev -- --version
0.0.0

PS> pnpm --filter @mz80/cli dev -- --verbose
[mz80-cli] verbose logging enabled
```

---

### 2. LSP

* `@mz80/lsp`
* VSCode Language Server Protocol 実装の最小雛形
* `onDidOpen` / `onDidChange` / `onDidClose` イベントを受信
* ダミーのエラーメッセージを JSON (Diagnostics) として返却

**実行例（単体テストクライアント）**

```powershell
PS> node .\test-client.js
<< Content-Length: 73
<< {"jsonrpc":"2.0","id":1,"result":{"capabilities":{"textDocumentSync":2}}}
```

**VSCode の問題パネル**

```
main.asm
[L1,C1] 仮エラ: とりあえず何か返しています (mz80)
```

---

### 3. DAP

* `@mz80/dap`
* Debug Adapter Protocol (DAP) 雛形
* initialize / launch / disconnect に応答

**実行例（単体テストクライアント）**

```powershell
PS> node .\test-client.js
🚀 Starting DAP test client...
<< {"seq":1,"type":"response","request_seq":1,"command":"initialize","success":true}
<< {"seq":2,"type":"event","event":"initialized"}
<< {"seq":3,"type":"response","request_seq":2,"command":"launch","success":true}
<< {"seq":4,"type":"response","request_seq":3,"command":"disconnect","success":true}
<< {"seq":5,"type":"event","event":"terminated"}
🛑 Test client stopped by user (Ctrl+C).
```

---

### 4. VSCode Extension

* `mz80-vscode-ext`
* `.asm` 言語を登録（`z80-asm`）
* コマンド `mz80.runMake` を登録（スタブ実装）
* LSP サーバを spawn & 接続
* DAP を登録し、launch.json から「MZ80 Debugger」として利用可能
* 出力パネルに「MZ80 Language Server」ログを表示可能

**実行例**

* `.asm` ファイルを開くと「Z80 Assembly」として認識
* 出力パネルに以下のログが出力：

```
Document opened: file:///.../main.asm
Document changed: file:///.../main.asm
```

---

### 5. Examples プロジェクト

* `examples/hello-msx/`

  * `src/main.asm` : 簡単な Hello World 相当コード
  * `mz80.yaml` : 設定ファイル（雛形）
* VSCode 上で開いて LSP によるエラー検出が動作することを確認済み
* DAP の launch.json も配置済み（`MZ80 Debugger` エントリ）

---

## 🏁 P0 の終了条件

* CLI が動作してログを出力できること
* LSP が応答し、エラーを JSON で返して VSCode に表示できること
* DAP が initialize/launch/disconnect に応答できること
* VSCode Extension から LSP/DAP が起動し、examples プロジェクトで確認できること

👉 以上、全て達成済み。**P0 完了**。

---

## 🔜 P1 での予定

* LSP: 未定義ラベル検出などの簡易パーサ追加
* DAP: openMSX 接続スケルトン実装
* CLI: アセンブル処理の呼び出し追加
* VSCode: エラーハイライトの改善、初期設定UI追加

