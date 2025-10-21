// src/assembler/tokenizer.ts
import { AsmContext, cloneSourcePos, SourcePos } from "./context";

export type TokenKind =
  | "ident"
  | "num"
  | "string"
  | "comma"
  | "colon"
  | "lparen"
  | "rparen"
  | "op"
  | "eol";

export interface Token {
  kind: TokenKind;
  text: string;
  value?: number;        // 数値リテラル（従来どおり）
  stringValue?: string;  // 文字列リテラル用（例: "mac.inc"）
  pos: SourcePos;
}

export function tokenize(ctx: AsmContext, src: string): Token[] {
  if (!src || src.trim() === "") return [];

  // --- CP/M EOF (0x1A) で打ち切り ---
  const eofIdx = src.indexOf("\x1A");
  if (eofIdx >= 0) {
    src = src.slice(0, eofIdx);
  }

  const tokens: Token[] = [];
  const lines = src.split(/\r?\n/);

  // 👇 空文字1行のみは即終了（eolを出さない）
  if (lines.length === 1 && lines[0] === "") {
    return [];
  }

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    ctx.currentPos.line = lineNo;
    let line = lines[lineNo];

    // --- 最終行が空文字なら無視 ---
    if (lineNo === lines.length - 1 && line === "") {
      break;
    }

    // --- コメント削除 ---
    const commentIdx = line.indexOf(";");
    if (commentIdx >= 0) line = line.substring(0, commentIdx);

    ctx.currentPos.column = 0;
    while (ctx.currentPos.column < line.length) {
      const rest = line.slice(ctx.currentPos.column);

      // 空白スキップ
      if (/^\s+/.test(rest)) {
        ctx.currentPos.column += rest.match(/^\s+/)![0].length;
        continue;
      }

      // --- 記号 ---
      if (/^[,:()+\-*/]/.test(rest[0])) {
        const ch = rest[0];
        let kind: TokenKind;
        switch (ch) {
          case ",":
            kind = "comma";
            break;
          case ":":
            kind = "colon";
            break;
          case "(":
            kind = "lparen";
            break;
          case ")":
            kind = "rparen";
            break;
          case "+":
          case "-":
          case "*":
          case "/":
            kind = "op"; // ← 新しく追加
            break;
          default:
            throw new Error(`Unhandled symbol ${ch}`);
        }
        tokens.push({ kind, text: ch, pos: cloneSourcePos(ctx.currentPos) });
        ctx.currentPos.column += 1;
        continue;
      }

      // --- 文字リテラル ---
      if (rest[0] === "'") {
        if (/^'.'/.test(rest) && rest.length >= 3 && rest[2] === "'") {
          const text = rest.slice(0, 3); // 'A'
          const value = parseNumber(text);
          tokens.push({ kind: "num", text, value, pos: cloneSourcePos(ctx.currentPos) });
          ctx.currentPos.column += 3;
          continue;
        } else if (/^'\\./.test(rest) && rest.length >= 4 && rest[3] === "'") {
          const text = rest.slice(0, 4); // '\n' とか '\''
          const value = parseNumber(text);
          tokens.push({ kind: "num", text, value, pos: cloneSourcePos(ctx.currentPos) });
          ctx.currentPos.column += 4;
          continue;
        } else {
          throw new Error(
            `Tokenizer error at line ${lineNo + 1}, col ${ctx.currentPos.column}: '${rest[0]}'`
          );
        }
      }

      // --- 文字列リテラル (INCLUDE "file.inc" 等) ---
      if (rest[0] === '"' || rest[0] === "'") {
        const quote = rest[0];
        // 正規表現: 同じクォートで閉じるまでを取得（改行を跨がない）
        const strMatch = rest.match(new RegExp(`^${quote}([^${quote}]*)${quote}`));
        if (!strMatch) {
          throw new Error(
            `Tokenizer error at line ${lineNo + 1}, col ${ctx.currentPos.column}: unterminated string literal`
          );
        }
        const text = strMatch[0];
        const stringValue = strMatch[1]; // 中身だけ取り出す
        tokens.push({
          kind: "string",
          text,
          stringValue,
          pos: cloneSourcePos(ctx.currentPos),
        });
        ctx.currentPos.column += text.length;
        continue;
      }


      // %の場合、%(0|1)+は数値でそれ以外はoperator
      // if (rest[0] === "%") {
      //   const m = /^(%[01]+)/.exec(rest);
      //   if (m) {
      //     const text = m[1];
      //     const value = parseNumber(text); // parseNumber が throw する場合は即エラー
      //     tokens.push({ kind: "num", text, value, pos: cloneSourcePos(ctx.currentPos) });
      //     ctx.currentPos.column += text.length;
      //     continue;
      //   } else {
      //     tokens.push({ kind: "op", text: "%", pos: cloneSourcePos(ctx.currentPos) });
      //     ctx.currentPos.column += 1;
      //     continue;
      //   }
      // }
      // --- % の特別処理 ---
      if (rest[0] === "%") {
        // 連続する %（%%...）はローカルラベル識別子として扱う
        const percents = rest.match(/^%+/)?.[0] ?? "";
        const after = rest.slice(percents.length);

        // case1: %%で始まるローカルラベル
        if (percents.length >= 2 && /^[A-Za-z_]/.test(after)) {
          const labelMatch = rest.match(/^%+[A-Za-z0-9_]+/);
          if (labelMatch) {
            const text = labelMatch[0];
            tokens.push({ kind: "ident", text, pos: cloneSourcePos(ctx.currentPos) });
            ctx.currentPos.column += text.length;
            continue;
          }
        }

        // case2: %0101（二進数）
        const binMatch = /^(%[01]+)/.exec(rest);
        if (binMatch) {
          const text = binMatch[1];
          const value = parseNumber(text);
          tokens.push({ kind: "num", text, value, pos: cloneSourcePos(ctx.currentPos) });
          ctx.currentPos.column += text.length;
          continue;
        }

        // その他は演算子として扱う
        tokens.push({ kind: "op", text: "%", pos: cloneSourcePos(ctx.currentPos) });
        ctx.currentPos.column += 1;
        continue;
      }


      // --- 数値または識別子（$,%含む） ---
      const m = /^([A-Za-z0-9_\$][A-Za-z0-9_.]*)/.exec(rest);
      if (m) {
        const text = m[1];
        if (text === "$") {
          // 現在アドレス → 特殊記号なので ident 扱い
          tokens.push({ kind: "ident", text, pos: cloneSourcePos(ctx.currentPos) });
        } else if (/^(0X|[0-9]|[$])/.test(text)) {
          // 数値リテラルの可能性がある場合は厳格チェック
          const value = parseNumber(text); // parseNumber が throw する場合は即エラー
          tokens.push({ kind: "num", text, value, pos: cloneSourcePos(ctx.currentPos) });
        } else {
          tokens.push({ kind: "ident", text, pos: cloneSourcePos(ctx.currentPos) });
        }
        ctx.currentPos.column += text.length;
        continue;
      }

      throw new Error(
        `Tokenizer error at line ${lineNo + 1}, col ${ctx.currentPos.column}: '${rest[0]}'`
      );
    }
    ctx.currentPos.column = line.length;
    tokens.push({
      kind: "eol",
      text: "\n",
      pos: cloneSourcePos(ctx.currentPos)
    });
  }
  // 🔽 最終行が改行で終わらなかった場合も eol を保証
  ctx.currentPos.line = lines.length;
  ctx.currentPos.column = lines[lines.length - 1].length;
  if (tokens.length === 0 || tokens[tokens.length - 1].kind !== "eol") {
    tokens.push({
      kind: "eol",
      text: "\n",
      pos: cloneSourcePos(ctx.currentPos)
    });
  }

  return tokens;
}

// --- 数値変換処理（厳格版） ---
export function parseNumber(text: string): number {
  const s = text.toUpperCase();

  // 文字リテラル
  if (/^'.'$/.test(text)) {
    return text.charCodeAt(1);
  }
  if (/^'\\n'$/.test(text)) {
    return 10;
  }
  if (/^'\\''$/.test(text)) {
    return 0x27; // シングルクォート
  }

  // 16進
  if (/^0X[0-9A-F]+$/.test(s)) {
    return parseInt(s.slice(2), 16);
  }
  if (/^\$[0-9A-F]+$/.test(s)) {
    return parseInt(s.slice(1), 16);
  }
  if (/^[0-9A-F]+H$/.test(s)) {
    return parseInt(s.slice(0, -1), 16);
  }

  // 2進
  if (/^%[01]+$/.test(s)) {
    return parseInt(s.slice(1), 2);
  }
  if (/^[01]+B$/.test(s)) {
    return parseInt(s.slice(0, -1), 2);
  }

  // 10進
  if (/^[0-9]+$/.test(s)) {
    return parseInt(s, 10);
  }

  throw new Error(`Invalid number literal: ${text}`);
}
