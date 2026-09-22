import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { root, python, backend, run } from "./runtime.mjs";

const dev = process.argv.includes("--dev");
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 4000);
  timer.unref();
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
function launch(args) {
  const child = spawn(args[0], args.slice(1), {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    },
  });
  children.add(child);
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping) stop(code || 1);
  });
  return child;
}
async function available(port) {
  await new Promise((yes, no) => {
    const server = net.createServer();
    server.once("error", () =>
      no(
        new Error(
          `Port ${port} is in use. Stop the previous instance or change PORT / LAYA_PORT / LAYA_URL.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(yes));
  });
}
try {
  if (!existsSync(python)) throw new Error("Run npm run setup first.");
  const url = new URL(process.env.LAYA_URL || "http://127.0.0.1:3179");
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.pathname !== "/"
  )
    throw new Error(
      "Managed startup requires LAYA_URL=http://127.0.0.1:<port>",
    );
  const port = Number(url.port || 80);
  if (process.env.LAYA_PORT && Number(process.env.LAYA_PORT) !== port)
    throw new Error("LAYA_PORT and LAYA_URL must use the same port.");
  await available(port);
  await available(Number(process.env.PORT || 3178));
  if (!dev)
    await run(process.execPath, [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
    ]);
  if (!dev)
    await run(process.execPath, ["node_modules/vite/bin/vite.js", "build"]);
  if (stopping) process.exit(0);
  launch([
    python,
    "-B",
    "laya/serve.py",
    "--backend",
    backend,
    "--port",
    String(port),
  ]);
  let ready = false;
  for (let i = 0; i < 180 && !stopping; i++) {
    try {
      const r = await fetch(new URL("/health", url), {
        signal: AbortSignal.timeout(1500),
      });
      ready = r.ok && (await r.json()).ready;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready)
    throw new Error(
      "Laya failed to become ready. Check the model path and Python output above.",
    );
  if (!stopping)
    launch([
      process.execPath,
      "--import",
      "tsx",
      ...(dev ? ["--watch"] : []),
      "server/index.ts",
    ]);
  if (!stopping && dev)
    launch([
      process.execPath,
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
    ]);
} catch (error) {
  console.error(error.message);
  stop(1);
}
