import { createInterface, type Interface } from "node:readline";

const hideCursor = () => process.stdout.write("\x1b[?25l");
const showCursor = () => process.stdout.write("\x1b[?25h");

export const select = async <T>(question: string, choices: { label: string; value: T; hint?: string }[]): Promise<T> => {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive prompt requires a TTY. Pass flags instead (e.g. --project, --env).");
  }

  return new Promise((resolve) => {
    let index = 0;
    let rendered = 0;

    const render = () => {
      if (rendered > 0) process.stdout.write(`\x1b[${rendered}A`);
      const lines = [
        `? ${question}`,
        ...choices.map(
          (c, i) => ` ${i === index ? "❯" : " "} ${c.label}${i === index && c.hint ? `  ${c.hint}` : ""}`
        )
      ];
      process.stdout.write(lines.map((l) => `\x1b[2K${l}`).join("\n") + "\n");
      rendered = lines.length;
    };

    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      showCursor();
      resolve(choices[index].value);
    };

    const onData = (chunk: Buffer) => {
      const key = chunk.toString("utf8");
      if (key === "\r" || key === "\n") return finish();
      if (key === "\u0003") {
        showCursor();
        process.exit(130);
      }
      if (key === "\u001b[A" || key === "k") index = (index - 1 + choices.length) % choices.length;
      else if (key === "\u001b[B" || key === "j") index = (index + 1) % choices.length;
      else if (key >= "1" && key <= "9") {
        const n = Number(key) - 1;
        if (n < choices.length) index = n;
      } else {
        return;
      }
      render();
    };

    hideCursor();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    render();
  });
};

export const input = async (question: string, fallback?: string): Promise<string> => {
  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = fallback ? ` (${fallback})` : "";
  return new Promise((resolve) => {
    rl.question(`? ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || fallback || "");
    });
  });
};

export const password = async (question: string): Promise<string> => {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive prompt requires a TTY. Pass the value via flag or env var.");
  }
  return new Promise((resolve) => {
    let value = "";
    process.stdout.write(`? ${question}: `);
    const onData = (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      if (s === "\r" || s === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value.trim());
      } else if (s === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      } else if (s === "\b" || s === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += s;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
};
