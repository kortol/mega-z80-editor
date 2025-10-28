import chalk from "chalk";

export type OutputLevel = "info" | "success" | "warn" | "error" | "debug";

export class Console {
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  info(msg: string) {
    console.log(chalk.cyan("ℹ️  " + msg));
  }

  success(msg: string) {
    console.log(chalk.green("✅  " + msg));
  }

  warn(msg: string) {
    console.warn(chalk.yellow("⚠️  " + msg));
  }

  error(msg: string) {
    console.error(chalk.red("❌  " + msg));
  }

  debug(msg: string) {
    if (this.verbose) {
      console.log(chalk.gray("🐞  " + msg));
    }
  }

  /** 区切り線（セクション境界） */
  section(title: string) {
    const line = "─".repeat(40);
    console.log(chalk.magenta(`\n${line}\n📦 ${title}\n${line}`));
  }

  /** 複数行の強調メッセージ */
  box(message: string) {
    const border = chalk.gray("─".repeat(message.length + 4));
    console.log(chalk.gray(border));
    console.log(chalk.whiteBright(`  ${message}  `));
    console.log(chalk.gray(border));
  }
}
