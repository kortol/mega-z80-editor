const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const wrap = (code: number, msg: string) =>
  useColor ? `\u001b[${code}m${msg}\u001b[0m` : msg;
const color = {
  cyan: (s: string) => wrap(36, s),
  green: (s: string) => wrap(32, s),
  yellow: (s: string) => wrap(33, s),
  red: (s: string) => wrap(31, s),
  gray: (s: string) => wrap(90, s),
  magenta: (s: string) => wrap(35, s),
  whiteBright: (s: string) => wrap(97, s),
};

export type OutputLevel = "info" | "success" | "warn" | "error" | "debug";

export class Console {
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  info(msg: string) {
    console.log(color.cyan("ℹ️  " + msg));
  }

  success(msg: string) {
    console.log(color.green("✅  " + msg));
  }

  warn(msg: string) {
    console.warn(color.yellow("⚠️  " + msg));
  }

  error(msg: string) {
    console.error(color.red("❌  " + msg));
  }

  debug(msg: string) {
    if (this.verbose) {
      console.log(color.gray("🐞  " + msg));
    }
  }

  /** 区切り線（セクション境界） */
  section(title: string) {
    const line = "─".repeat(40);
    console.log(color.magenta(`\n${line}\n📦 ${title}\n${line}`));
  }

  /** 複数行の強調メッセージ */
  box(message: string) {
    const border = color.gray("─".repeat(message.length + 4));
    console.log(color.gray(border));
    console.log(color.whiteBright(`  ${message}  `));
    console.log(color.gray(border));
  }
}
