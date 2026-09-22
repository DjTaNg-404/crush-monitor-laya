import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { python } from "./runtime.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

const env = {
  ...process.env,
  HF_HUB_OFFLINE: "1",
  TRANSFORMERS_OFFLINE: "1",
  USE_TF: "0",
  PYTHONDONTWRITEBYTECODE: "1",
};
async function run(command, args) {
  await new Promise((yes, no) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    const forward = (signal) => child.kill(signal);
    const interrupt = () => forward("SIGINT"),
      terminate = () => forward("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.on("error", no);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
      code === 0 ? yes() : no(new Error(`${command} exited ${code ?? signal}`));
    });
  });
}
try {
  const [mode, ...args] = process.argv.slice(2);
  if (!existsSync(python)) throw Error("请先运行 npm run setup。");
  if (mode === "serve") await run(python, ["-B", "laya/serve.py", ...args]);
  else if (mode === "evaluate") {
    await run(process.execPath, [
      "--import",
      "tsx",
      "scripts/export-laya-cases.ts",
    ]);
    await run(python, ["-B", "laya/evaluate.py", ...args]);
  } else if (mode === "test")
    await run(python, [
      "-B",
      "-m",
      "unittest",
      "discover",
      "-s",
      "laya",
      "-p",
      "test_*.py",
    ]);
  else if (mode === "challenge")
    await run(python, ["-B", "laya/challenge.py", ...args]);
  else if (mode === "report")
    await run(python, ["-B", "laya/report.py", ...args]);
  else throw Error("Unknown Laya command");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
