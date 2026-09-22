import { Router } from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseChat } from "../shared/parser";
import { LAYA_CASES } from "../shared/layaFixtures";
import {
  ANSWER_LABELS,
  CHOICE_LABELS,
  QUESTION_LABELS,
  VALIDATION_SCHEMA,
  validationPayload,
} from "../shared/layaValidation";

export const labInputSchema = z.object({
  raw: z.string().min(1).max(12000),
  selfName: z.string().min(1).max(80).default("我"),
  targetIndex: z.number().int().nonnegative().optional(),
  relation: z.enum(["crush", "new", "couple"]).default("crush"),
  scope: z.enum(["message", "overview"]).default("message"),
});
export function parseLabInput(body: unknown) {
  const value = labInputSchema.parse(body);
  const parsed = parseChat(value.raw);
  const names = [...new Set(parsed.messages.map((m) => m.speaker))];
  if (
    parsed.warnings.length ||
    !parsed.messages.length ||
    parsed.messages.length > 80 ||
    names.length > 2 ||
    (names.length === 2 && !names.includes(value.selfName))
  )
    throw new Error(
      "请使用两人聊天格式，并正确填写我方昵称；每条消息以“昵称：”开头。",
    );
  const messages = parsed.messages.map((m) => ({
    sender:
      m.speaker === value.selfName ? ("self" as const) : ("other" as const),
    text: m.text,
  }));
  const targetIndex = value.targetIndex ?? messages.length - 1;
  if (!messages[targetIndex]) throw new Error("目标消息序号超出范围");
  return {
    messages,
    targetIndex,
    relation: value.relation,
    scope: value.scope,
  };
}
export function localLayaUrl() {
  const url = new URL(process.env.LAYA_URL || "http://127.0.0.1:3179");
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("LAYA_URL 必须是本机 HTTP 地址");
  return url.origin;
}
export const layaValidationRouter = Router();
layaValidationRouter.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    origin !== `${req.protocol}://${req.headers.host}` &&
    !["http://127.0.0.1:5178", "http://localhost:5178"].includes(origin)
  ) {
    res.status(403).json({ error: "请求来源不允许" });
    return;
  }
  next();
});
layaValidationRouter.get("/cases", (_req, res) =>
  res.json({
    schema: VALIDATION_SCHEMA,
    cases: LAYA_CASES,
    questionLabels: QUESTION_LABELS,
    answerLabels: ANSWER_LABELS,
    choiceLabels: CHOICE_LABELS,
  }),
);
layaValidationRouter.get("/health", async (_req, res) => {
  try {
    const response = await fetch(`${localLayaUrl()}/health`, {
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    res.status(response.status).json(await response.json());
  } catch {
    res
      .status(503)
      .json({ error: "Laya 服务未启动。请运行 npm run laya:serve。" });
  }
});
layaValidationRouter.get("/report", async (_req, res) => {
  try {
    const text = await readFile(
      fileURLToPath(new URL("../artifacts/laya-mlx.json", import.meta.url)),
      "utf8",
    );
    const report = JSON.parse(text);
    if (report.schema !== VALIDATION_SCHEMA) throw new Error("stale");
    res.json(report);
  } catch {
    res
      .status(404)
      .json({
        error: "还没有当前版本的评测报告，请运行 npm run laya:evaluate。",
      });
  }
});
let active = 0;
layaValidationRouter.post("/analyze", async (req, res) => {
  let input;
  try {
    input = parseLabInput(req.body);
  } catch (error) {
    res
      .status(400)
      .json({
        error:
          error instanceof z.ZodError
            ? "输入不符合要求（最多12,000字）"
            : (error as Error).message,
      });
    return;
  }
  if (active >= 2) {
    res.setHeader("Retry-After", "1");
    res.status(429).json({ error: "本地模型正在处理请求，请稍后重试" });
    return;
  }
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  active++;
  try {
    const payload = validationPayload(input);
    const response = await fetch(`${localLayaUrl()}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
      redirect: "error",
    });
    const body = await response.json();
    if (!controller.signal.aborted)
      res
        .status(response.status)
        .json({ ...body, schema: VALIDATION_SCHEMA, payload });
  } catch {
    if (!controller.signal.aborted)
      res
        .status(502)
        .json({ error: "本地推理未完成，请检查 Laya 服务是否运行。" });
  } finally {
    active--;
  }
});
