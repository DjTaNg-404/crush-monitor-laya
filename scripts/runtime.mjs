import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const root = fileURLToPath(new URL("../", import.meta.url));
export const python = resolve(
  root,
  process.platform === "win32"
    ? ".runtime/venv/Scripts/python.exe"
    : ".runtime/venv/bin/python",
);
export const backend =
  process.env.LAYA_BACKEND && process.env.LAYA_BACKEND !== "auto"
    ? process.env.LAYA_BACKEND
    : process.platform === "darwin" && process.arch === "arm64"
      ? "mlx"
      : "torch";
export function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.once("error", finish);
    child.once("exit", (code) =>
      finish(code === 0 ? null : new Error(`${command} exited ${code}`)),
    );
    function finish(error) {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      error ? reject(error) : resolve();
    }
  });
}
