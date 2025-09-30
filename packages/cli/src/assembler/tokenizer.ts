export type TokenKind =
  | "ident"
  | "num"
  | "comma"
  | "colon"
  | "lparen"
  | "rparen"
  | "op"
  | "eol";

export interface Token {
  kind: TokenKind;
  text: string;
  value?: number;
  line: number;
  col: number;
}

export function tokenize(src: string): Token[] {
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
    let line = lines[lineNo];

    // --- 最終行が空文字なら無視 ---
    if (lineNo === lines.length - 1 && line === "") {
      break;
    }

    // --- コメント削除 ---
    const commentIdx = line.indexOf(";");
    if (commentIdx >= 0) line = line.substring(0, commentIdx);

    let col = 0;
    while (col < line.length) {
      const rest = line.slice(col);

      // 空白スキップ
      if (/^\s+/.test(rest)) {
        col += rest.match(/^\s+/)![0].length;
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
        tokens.push({ kind, text: ch, line: lineNo + 1, col });
        col += 1;
        continue;
      }

      // --- 文字リテラル ---
      if (rest[0] === "'") {
        if (/^'.'/.test(rest) && rest.length >= 3 && rest[2] === "'") {
          const text = rest.slice(0, 3); // 'A'
          const value = parseNumber(text);
          tokens.push({ kind: "num", text, value, line: lineNo + 1, col });
          col += 3;
          continue;
        } else if (/^'\\./.test(rest) && rest.length >= 4 && rest[3] === "'") {
          const text = rest.slice(0, 4); // '\n' とか '\''
          const value = parseNumber(text);
          tokens.push({ kind: "num", text, value, line: lineNo + 1, col });
          col += 4;
          continue;
        } else {
          throw new Error(
            `Tokenizer error at line ${lineNo + 1}, col ${col}: '${rest[0]}'`
          );
        }
      }

      // %の場合、%(0|1)+は数値でそれ以外はoperator
      if (rest[0] === "%") {
        const m = /^(%[01]+)/.exec(rest);
        if (m) {
          const text = m[1];
          const value = parseNumber(text); // parseNumber が throw する場合は即エラー
          tokens.push({ kind: "num", text, value, line: lineNo + 1, col });
          col += text.length;
          continue;
        } else {
          tokens.push({ kind: "op", text: "%", line: lineNo + 1, col });
          col += 1;
          continue;
        }
      }

      // --- 数値または識別子（$,%含む） ---
      const m = /^([A-Za-z0-9\$][A-Za-z0-9A-Fa-fHhBbXx]*)/.exec(rest);
      if (m) {
        const text = m[1];
        if (text === "$") {
          // 現在アドレス → 特殊記号なので ident 扱い
          tokens.push({ kind: "ident", text, line: lineNo + 1, col });
        } else if (/^(0X|[0-9]|[$])/.test(text)) {
          // 数値リテラルの可能性がある場合は厳格チェック
          const value = parseNumber(text); // parseNumber が throw する場合は即エラー
          tokens.push({ kind: "num", text, value, line: lineNo + 1, col });
        } else {
          tokens.push({ kind: "ident", text, line: lineNo + 1, col });
        }
        col += text.length;
        continue;
      }

      throw new Error(
        `Tokenizer error at line ${lineNo + 1}, col ${col}: '${rest[0]}'`
      );
    }
    tokens.push({
      kind: "eol",
      text: "\n",
      line: lineNo + 1,
      col: line.length,
    });
  }
  // 🔽 最終行が改行で終わらなかった場合も eol を保証
  if (tokens.length === 0 || tokens[tokens.length - 1].kind !== "eol") {
    tokens.push({
      kind: "eol",
      text: "\n",
      line: lines.length,
      col: lines[lines.length - 1].length,
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
