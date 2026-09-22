import assert from "node:assert/strict";
import test from "node:test";
import { layaJobs } from "../server/layaAnalysis";
import { engineKey, localUrl } from "../server/layaClient";
import type { AnalysisRequest } from "../shared/types";

const request: AnalysisRequest = {
  revision: 1,
  relation: "crush",
  task: "self_message",
  targetIds: ["b", "d"],
  messages: [
    {
      id: "a",
      sender: "other",
      text: "Please stop pursuing me.",
      kind: "text",
      timestamp: null,
    },
    {
      id: "b",
      sender: "self",
      text: "I understand.",
      kind: "text",
      timestamp: null,
    },
    {
      id: "c",
      sender: "other",
      text: "I changed my mind.",
      kind: "text",
      timestamp: null,
    },
    {
      id: "d",
      sender: "self",
      text: "Let's talk.",
      kind: "text",
      timestamp: null,
    },
  ],
  memory: [{ id: "a", kind: "boundary", status: "resolved", resolvedBy: "c" }],
};

test("Laya production isolates future replies and future boundary withdrawals per target", () => {
  const jobs = layaJobs(request);
  assert.deepEqual(
    jobs[0].messages.map((m) => m.id),
    ["0", "1"],
  );
  assert(!JSON.stringify(jobs[0]).includes("changed my mind"));
  assert(!jobs[0].requiredIds.includes("2"));
  assert(jobs[1].requiredIds.includes("2"));
  assert.deepEqual(Object.keys(jobs[0].questions).sort(), [
    "b_enough",
    "b_event",
    "b_score",
  ]);
});
test("Production overview covers all original fields; memory proof references later messages", () => {
  const jobs = layaJobs({ ...request, task: "overview", targetIds: [] });
  assert.equal(jobs.length, 2);
  for (const key of [
    "initiative",
    "engagement",
    "care",
    "openness",
    "intimacy",
    "action",
  ]) {
    assert(jobs[0].questions[`affinity_${key}`]);
    assert(jobs[0].questions[`affinity_${key}_enough`]);
  }
  assert.equal(jobs[1].evidence.memory_a_proof.after, 0);
  assert(
    jobs[0].requiredIds.includes("0") && jobs[0].requiredIds.includes("2"),
  );
  const couple = layaJobs({
    ...request,
    relation: "couple",
    task: "overview",
    targetIds: [],
  })[0];
  assert(couple.questions.rapport);
  assert(!couple.questions.stage);
});
test("Engine cache identity excludes machine path/load time but includes weights and backend", () => {
  const engine = {
    weightsSha256: "one",
    tokenizerSha256: "tok",
    configSha256: "cfg",
    backend: "mlx",
    dtype: "float16",
    headTokens: 512,
    runtimeVersion: "1",
  };
  assert.equal(
    engineKey(engine),
    engineKey({ ...engine, modelPath: "/different/machine", loadMs: 999 }),
  );
  assert.notEqual(
    engineKey(engine),
    engineKey({ ...engine, weightsSha256: "two" }),
  );
  assert.notEqual(
    engineKey(engine),
    engineKey({ ...engine, backend: "torch" }),
  );
});
test("Main product refuses a remote inference endpoint", () => {
  const old = process.env.LAYA_URL;
  try {
    process.env.LAYA_URL = "https://example.com";
    assert.throws(() => localUrl("/health"));
  } finally {
    if (old === undefined) delete process.env.LAYA_URL;
    else process.env.LAYA_URL = old;
  }
});
