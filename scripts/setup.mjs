import "dotenv/config";
import { copyFile, mkdir } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { root, python, backend, run } from "./runtime.mjs";
process.chdir(root);
try {
  try {
    await copyFile(".env.example", ".env", constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await mkdir(".runtime", { recursive: true });
  const uv = process.env.UV || "uv";
  const hasUv = spawnSync(uv, ["--version"], { stdio: "ignore" }).status === 0;
  if (!existsSync(python)) {
    if (hasUv) await run(uv, ["venv", "--python", "3.12", ".runtime/venv"]);
    else {
      const candidates = [
        process.env.PYTHON,
        "python3.12",
        "python3",
        "python",
      ].filter(Boolean);
      const systemPython = candidates.find(
        (p) =>
          spawnSync(
            p,
            ["-c", "import sys; assert sys.version_info[:2] == (3, 12)"],
            { stdio: "ignore" },
          ).status === 0,
      );
      if (!systemPython)
        throw new Error(
          "Install uv (https://docs.astral.sh/uv/getting-started/installation/) or Python 3.12, then rerun npm run setup.",
        );
      await run(systemPython, ["-m", "venv", ".runtime/venv"]);
    }
  }
  if (!["mlx", "torch"].includes(backend))
    throw new Error("LAYA_BACKEND must be auto, mlx or torch");
  const requirements = [
    "-r",
    "laya/requirements-common.txt",
    "-r",
    `laya/requirements-${backend}.txt`,
  ];
  console.log(`Installing local runtime (${backend})…`);
  const env = {
    ...process.env,
    UV_CACHE_DIR: process.env.UV_CACHE_DIR || `${root}/.runtime/uv-cache`,
  };
  if (hasUv)
    await run(uv, ["pip", "install", "--python", python, ...requirements], env);
  else await run(python, ["-m", "pip", "install", ...requirements], env);
  await run(python, ["-B", "laya/download.py"], {
    ...env,
    HF_HUB_OFFLINE: "0",
    TRANSFORMERS_OFFLINE: "0",
  });
  console.log(
    "安装完成。运行 npm start，然后打开 http://127.0.0.1:3178。无需 API key。",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
