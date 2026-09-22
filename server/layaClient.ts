import { createHash } from "node:crypto";
import { RUBRIC } from "../shared/types";

export function localUrl(path: string) {
  const base = new URL(process.env.LAYA_URL || "http://127.0.0.1:3179");
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password
  )
    throw new Error("LAYA_URL 必须是本机 HTTP 地址");
  return new URL(path, base);
}
export function engineKey(engine: Record<string, unknown>) {
  const {
    weightsSha256,
    tokenizerSha256,
    tokenizerConfigSha256,
    encoderConfigSha256,
    configSha256,
    backend,
    dtype,
    runtimeVersion,
    headTokens,
  } = engine;
  return createHash("sha256")
    .update(
      JSON.stringify({
        RUBRIC,
        weightsSha256,
        tokenizerSha256,
        tokenizerConfigSha256,
        encoderConfigSha256,
        configSha256,
        backend,
        dtype,
        runtimeVersion,
        headTokens,
      }),
    )
    .digest("hex");
}
export async function health(signal?: AbortSignal) {
  const response = await fetch(localUrl("/health"), {
    redirect: "error",
    signal: AbortSignal.any([
      AbortSignal.timeout(5000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok) throw new Error("本地 Laya 服务尚未就绪");
  const body = await response.json();
  if (!body.ready || !body.engine?.weightsSha256)
    throw new Error("本地模型身份无效");
  return {
    configured: true,
    model: body.engine.model,
    engineKey: engineKey(body.engine),
  };
}
let tail: Promise<unknown> = Promise.resolve();
export function predictContext(
  payload: unknown,
  signal?: AbortSignal,
): Promise<any> {
  const request = tail
    .catch(() => {})
    .then(async () => {
      signal?.throwIfAborted();
      const response = await fetch(localUrl("/v1/context"), {
        redirect: "error",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([
          AbortSignal.timeout(120000),
          ...(signal ? [signal] : []),
        ]),
      });
      const body = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(body.error || body.detail || "本地推理失败"),
          { status: response.status },
        );
      return body;
    });
  tail = request;
  return request;
}
