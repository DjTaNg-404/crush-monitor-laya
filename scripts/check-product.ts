/** Live integration checks. Uses authored synthetic conversations only. */
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseChat, toMessages } from "../shared/parser";
import { collectEvents } from "../shared/memory";
import { incrementalJobs, overviewJob } from "../shared/incremental";
import {
  requestContextKey,
  RUBRIC,
  type AnalysisRequest,
  type AnalysisResponse,
  type LineResult,
} from "../shared/types";

const base =
  process.env.APP_URL || `http://127.0.0.1:${process.env.PORT || 3178}`;
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname),
  "Use a loopback APP_URL",
);
const health = await (await fetch(`${base}/api/health`)).json();
assert(health.configured && health.engineKey);
let requests = 0;
async function analyze(input: AnalysisRequest) {
  const response = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120000),
  });
  const result: AnalysisResponse & { error?: string } = await response.json();
  assert.equal(response.status, 200, result.error);
  assert.equal(result.rubricVersion, RUBRIC);
  assert.equal(result.engineKey, health.engineKey);
  assert.equal(
    result.contextHash,
    createHash("sha256").update(requestContextKey(input)).digest("hex"),
  );
  assert.equal(result.revision, input.revision);
  requests++;
  return result;
}
for (const [self, raw] of [
  [
    "我",
    "我：今天答辩怎么样？\n对方：通过了，我好开心！\n我：太好了！你这段时间的努力没有白费。\n对方：谢谢你一直鼓励我！",
  ],
  [
    "Me",
    "Me: How did your presentation go?\nThem: It went really well! I'm so happy.\nMe: That's wonderful. Your hard work paid off.\nThem: Thanks for cheering me on!",
  ],
]) {
  const messages = toMessages(parseChat(raw).messages, self);
  let lines: Record<string, LineResult> = {};
  const jobs = incrementalJobs(messages, "crush", 1, {}, {}, true);
  const results = await Promise.all(jobs.map(analyze));
  for (const result of results)
    for (const line of result.lines ?? []) lines[line.id] = line;
  assert.equal(Object.keys(lines).length, messages.length);
  for (const message of messages) {
    const line = lines[message.id];
    if (message.sender === "other") {
      assert.equal(Object.keys(line.intents ?? {}).length, 35);
      assert.equal(Object.keys(line.emotions ?? {}).length, 12);
    } else assert.equal(typeof line.score.value, "number");
  }
  let events = collectEvents(lines, {});
  const final = await analyze(overviewJob(messages, "crush", 1, events));
  assert.equal(final.overview?.affinityDimensions?.length, 6);
  assert(final.overview?.contextCount);
  assert.deepEqual(
    incrementalJobs(messages, "crush", 2, lines, events, false),
    [],
  );
  const appended = [
    ...messages,
    {
      id: "appended",
      sender: "self" as const,
      text: "Would you like to get coffee tomorrow?",
      timestamp: null,
      kind: "text" as const,
    },
  ];
  const next = incrementalJobs(appended, "crush", 2, lines, events, true);
  assert(next.some((job) => job.targetIds.includes("appended")));
  assert(
    !next.some(
      (job) =>
        job.task === "self_message" &&
        job.targetIds.some((id) => id !== "appended"),
    ),
  );
  await Promise.all(next.map(analyze));
  console.log(
    `PASS full analysis, incremental append and cache identity (${self})`,
  );
}
const refusal = toMessages(
  parseChat(
    "Me: Can I take you on a date?\nThem: No. I do not want a romantic relationship with you. Stop pursuing me and do not contact me again.",
  ).messages,
  "Me",
);
const rejected = await analyze({
  revision: 3,
  task: "overview",
  relation: "crush",
  messages: refusal,
  targetIds: [],
});
assert.equal(rejected.overview?.action, "respect");
assert.equal(rejected.overview?.boundaryApplied, true);
const long = [
  refusal[1],
  ...Array.from({ length: 90 }, (_, i) => ({
    id: `long-${i}`,
    sender: i % 2 ? ("self" as const) : ("other" as const),
    text: `This is ordinary conversation about the weather and today's work, message ${i}.`,
    timestamp: null,
    kind: "text" as const,
  })),
];
const historical = await analyze({
  revision: 4,
  task: "overview",
  relation: "new",
  messages: long,
  targetIds: [],
  memory: [{ id: refusal[1].id, kind: "boundary", status: "active" }],
});
assert((historical.overview?.contextCount ?? 999) < long.length);
assert(historical.overview?.memoryEvidenceIds?.includes(refusal[1].id));
assert.equal(historical.memoryUpdates?.length, 1);
const oversized = await fetch(`${base}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    revision: 5,
    task: "self_message",
    relation: "crush",
    targetIds: ["large"],
    messages: [
      {
        id: "large",
        sender: "self",
        text: "hello ".repeat(1700),
        kind: "text",
        timestamp: null,
      },
    ],
  }),
});
assert.equal(oversized.status, 422);
console.log(
  `PASS refusal rule, history retrieval, bounded context, explicit capacity error; ${requests} live requests`,
);
