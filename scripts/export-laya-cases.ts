import { mkdir, writeFile } from "node:fs/promises";
import { LAYA_CASES } from "../shared/layaFixtures";
import { VALIDATION_SCHEMA, validationPayload } from "../shared/layaValidation";
import { buildRequest } from "../tests/jev-reference";
const cases = LAYA_CASES.map((c) => ({
  id: c.id,
  title: c.title,
  expected: c.expected,
  payload: validationPayload(c),
}));
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/laya-inputs.json",
  JSON.stringify(
    {
      schema: VALIDATION_SCHEMA,
      description:
        "27 author-written synthetic Chinese chat development cases. Expected labels never enter model inputs. No training or calibration on this set.",
      cases,
    },
    null,
    2,
  ),
);
const original = LAYA_CASES.slice(0, 3).map((c) =>
  buildRequest({
    revision: 1,
    relation: c.relation,
    task: "other_messages",
    targetIds: [String(c.targetIndex)],
    messages: c.messages.map((m, i) => ({
      ...m,
      id: String(i),
      kind: "text",
      timestamp: null,
    })),
  }),
);
await writeFile(
  "artifacts/laya-original-prompts.json",
  JSON.stringify(original, null, 2),
);
console.log(
  `Exported ${cases.length} cases and 3 original Jev payloads for capacity comparison.`,
);
