# Dev Notes

`docs/dev/` はフェーズごとの設計メモと履歴資料の置き場です。ここにある文書は「当時の判断理由」を追うためのもので、現行仕様の一次資料としては `docs/spec/` より優先しません。

## Reading Rule

- 実装の現在位置を知りたい場合は `README` と `docs/spec/` を先に読む
- `docs/dev/` は「なぜそうなったか」を追うときに使う
- 古いフェーズ文書ほど、現状との差分がある前提で読む

## Timeline Index

### P0 Baseline

- [p0-summary.md](C:/Workspace/work/mega-z80-editor/docs/dev/p0-summary.md)
  - CLI / LSP / DAP / VSCode extension の最小基盤を整えた段階のまとめ

### P1 Assembler / Linker Foundation

- [P1.md](C:/Workspace/work/mega-z80-editor/docs/dev/P1.md)
  - P1 全体の背景と初期目標
- [P1-B.md](C:/Workspace/work/mega-z80-editor/docs/dev/P1-B.md)
  - P1 の個別設計メモ
- [P1-C.md](C:/Workspace/work/mega-z80-editor/docs/dev/P1-C.md)
  - P1 の個別設計メモ
- [P1-D.md](C:/Workspace/work/mega-z80-editor/docs/dev/P1-D.md)
  - P1 の個別設計メモ
- [P1-E.md](C:/Workspace/work/mega-z80-editor/docs/dev/P1-E.md)
  - P1 の個別設計メモ

### P2 Front-End / Include / Parser Evolution

- [P2-C.md](C:/Workspace/work/mega-z80-editor/docs/dev/P2-C.md)
  - フェーズ管理、emit 統合、セクション拡張
- [P2-D.md](C:/Workspace/work/mega-z80-editor/docs/dev/P2-D.md)
  - INCLUDE まわりの設計メモ
- [P2-D_IncludeSpec_Final_Integrated.md](C:/Workspace/work/mega-z80-editor/docs/dev/P2-D_IncludeSpec_Final_Integrated.md)
  - INCLUDE 仕様の統合版
- [P2-L.md](C:/Workspace/work/mega-z80-editor/docs/dev/P2-L.md)
  - PEG 単一路線化と legacy parser 除去
- [P2-M.md](C:/Workspace/work/mega-z80-editor/docs/dev/P2-M.md)
  - sjasm/m80 互換疑似命令拡張

## Suggested Historical Order

1. `p0-summary.md`
2. `P1.md`
3. 必要に応じて `P1-B.md` から `P1-E.md`
4. `P2-C.md`
5. `P2-D.md`
6. `P2-D_IncludeSpec_Final_Integrated.md`
7. `P2-L.md`
8. `P2-M.md`

## Notes

- `P2-D_IncludeSpec_Final_Integrated.md` は `P2-D.md` より後の統合版として扱う
- `P2-L.md` と `P2-M.md` は、現行実装に比較的近い後期メモ
- 今後 phase 文書を追加する場合も、この index に追記して系列を保つ
