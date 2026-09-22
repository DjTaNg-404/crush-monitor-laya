import test from "node:test";
import assert from "node:assert/strict";
import { validationPayload } from "../shared/layaValidation";
import { LAYA_CASES } from "../shared/layaFixtures";
import { parseLabInput, localLayaUrl } from "../server/layaValidation";

test("Laya self reply payload physically excludes future messages", () => {
  const c = LAYA_CASES.find((c) => c.id === "causal")!;
  const payload = validationPayload(c);
  assert.ok(payload.state.includes(c.messages[1].text));
  assert.ok(!payload.state.includes(c.messages[2].text));
  assert.equal(payload.questions.quality.type, "score");
});
test("Laya intent evaluates all 35 options; expected labels never enter the payload", () => {
  const c = LAYA_CASES[0];
  const payload = validationPayload(c);
  assert.equal(Object.keys(payload.questions.intent.criteria!).length, 35);
  assert.deepEqual(Object.keys(payload).sort(), ["questions", "state"]);
  assert.ok(!JSON.stringify(payload).includes('"expected"'));
  assert.ok(
    !Object.values(payload.questions).some(
      (q) => typeof q.instructions !== "string",
    ),
  );
});
test("Lab accepts supported chat formats and validates participants and target", () => {
  assert.equal(parseLabInput({ raw: "我：你好\n对方：你好" }).targetIndex, 1);
  assert.equal(
    parseLabInput({ raw: "对方：哦。" }).messages[0].sender,
    "other",
  );
  assert.throws(() =>
    parseLabInput({ raw: "甲：你好\n乙：你好", selfName: "我" }),
  );
  assert.throws(() => parseLabInput({ raw: "我：你好", targetIndex: 3 }));
  assert.throws(() => parseLabInput({ raw: "未标注发送人的正文" }));
});
test("All validation labels refer to actual question options", () => {
  for (const c of LAYA_CASES) {
    const { questions } = validationPayload(c);
    for (const [key, expected] of Object.entries(c.expected)) {
      assert.ok(questions[key], `${c.id}/${key}`);
      if ("labels" in expected)
        for (const label of expected.labels)
          assert.ok(label in questions[key].criteria!, `${c.id}/${label}`);
    }
  }
});
test("Laya integration cannot point to a cloud endpoint", () => {
  const previous = process.env.LAYA_URL;
  try {
    process.env.LAYA_URL = "https://example.com";
    assert.throws(localLayaUrl);
    process.env.LAYA_URL = "http://127.0.0.1:3179";
    assert.equal(localLayaUrl(), "http://127.0.0.1:3179");
  } finally {
    if (previous === undefined) delete process.env.LAYA_URL;
    else process.env.LAYA_URL = previous;
  }
});
