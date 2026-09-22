import type { AnalysisRequest } from "../shared/types";
import {
  validationPayload,
  type TypedQuestion,
} from "../shared/layaValidation";
import { LAYA_DIMENSIONS } from "../shared/layaPrompts";
import { engineKey, predictContext } from "./layaClient";

const events = {
  boundary: "explicit refusal or request to stop pursuing or contacting",
  reopen: "explicitly withdraw an earlier refusal or reopen contact",
  invitation: "specific invitation or proposal to meet",
  confirmation: "confirm a concrete plan",
  cancellation: "cancel or reschedule a plan",
  care: "specific personal care or support",
  preference: "explicit personal preference",
  disclosure: "share a personal feeling or vulnerable detail",
  commitment: "explicit romantic affection, love or relationship commitment",
  question: "a question needing an answer",
  correction: "correct a previous claim or misunderstanding",
  none: "no explicit event worth remembering",
};
const choice = (
  instructions: string,
  criteria: Record<string, string>,
): TypedQuestion => ({ type: "choice", instructions, criteria });
export type LayaJob = {
  messages: { id: string; sender: "self" | "other"; text: string }[];
  requiredIds: string[];
  questions: Record<string, TypedQuestion>;
  evidence: Record<string, { instructions: string; after: number }>;
};
export function layaJobs(input: AnalysisRequest): LayaJob[] {
  const messages = input.messages.map((m, i) => ({
    id: String(i),
    sender: m.sender,
    text: m.kind === "text" ? m.text : "[unreadable attachment]",
  }));
  const index = (id: string) => input.messages.findIndex((m) => m.id === id);
  const critical = (last: number) => [
    ...new Set(
      (input.memory ?? []).flatMap((e) => {
        const original = index(e.id),
          resolved = e.resolvedBy ? index(e.resolvedBy) : -1;
        return original <= last
          ? [
              original,
              original - 1,
              ...(resolved <= last && resolved >= 0 ? [resolved] : []),
            ]
              .filter((i) => i >= 0)
              .map(String)
          : [];
      }),
    ),
  ];
  if (input.task !== "overview")
    return input.targetIds
      .filter((id) => input.messages[index(id)].kind === "text")
      .map((id) => {
        const last = index(id);
        const base = validationPayload({
          messages: input.messages,
          targetIndex: last,
          relation: input.relation,
        });
        const keys =
          input.task === "other_messages"
            ? { emotion: "emotions", intent: "intents" }
            : { quality: "score", enough: "enough" };
        const questions: Record<string, TypedQuestion> = {};
        for (const [key, suffix] of Object.entries(keys))
          questions[`${id}_${suffix}`] = base.questions[key];
        questions[`${id}_event`] = choice(
          "What event does the last message explicitly express? Do not infer unstated facts.",
          events,
        );
        return {
          messages: messages.slice(0, last + 1),
          requiredIds: [
            ...new Set([
              ...critical(last),
              String(last),
              ...(last ? [String(last - 1)] : []),
            ]),
          ],
          questions,
          evidence: {},
        };
      });
  const last = messages.length - 1;
  const base = validationPayload({
    messages: input.messages,
    targetIndex: last,
    relation: input.relation,
    scope: "overview",
  });
  const questions = { ...base.questions };
  for (const [key, d] of Object.entries(LAYA_DIMENSIONS))
    questions[`affinity_${key}_enough`] = {
      ...base.questions.enough,
      instructions: `Is there enough direct evidence to judge this: ${d.question} No relevant opportunity means insufficient, not a negative signal.`,
    };
  if (input.relation === "couple")
    questions.rapport = {
      type: "score",
      instructions:
        "How well do both people understand and respond to each other?",
      criteria: [
        "unaddressed conflict or misunderstanding",
        "often misses the point",
        "basic understanding",
        "specific mutual understanding",
        "sustained understanding, support and coordination",
      ],
    };
  else
    questions.stage = choice(
      "Which relationship milestone is directly supported by this chat? Friendliness alone is not romance.",
      {
        unknown: "not enough evidence",
        contact: "initial contact only",
        flow: "mutual flowing conversation",
        flirt: "reciprocated romantic flirting",
        date: "mutually confirmed concrete date",
        mutual: "both explicitly express romantic love",
      },
    );
  questions.pending = {
    type: "noul",
    instructions:
      "Is the last message from self awaiting an answer from other? If other spoke last, answer false.",
  };
  const evidence = {
    evidence: {
      instructions:
        "Which message most directly shows other's approach or distance toward self?",
      after: -1,
    },
    actionEvidence: {
      instructions:
        "Which message most directly explains what self should do next?",
      after: -1,
    },
  };
  const jobs: LayaJob[] = [
    {
      messages,
      requiredIds: [
        ...new Set([
          ...critical(last),
          String(last),
          ...(last ? [String(last - 1)] : []),
        ]),
      ],
      questions,
      evidence,
    },
  ];
  for (const event of input.memory ?? []) {
    const source = index(event.id);
    jobs.push({
      messages,
      requiredIds: [
        ...new Set([
          String(source),
          String(last),
          ...(event.resolvedBy ? [String(index(event.resolvedBy))] : []),
        ]),
      ],
      questions: {
        [`memory_${event.id}_status`]: choice(
          `Is the specific event in message ${source} still active? Only explicit later evidence can resolve it. Changing topics or being busy does not withdraw a refusal.`,
          {
            active: "still applies or awaits response",
            resolved:
              "explicitly fulfilled, cancelled, answered, withdrawn or corrected later",
            uncertain: "unclear",
          },
        ),
      },
      evidence: {
        [`memory_${event.id}_proof`]: {
          instructions: `Which later message explicitly resolves the specific event in message ${source}? If none, select none.`,
          after: source,
        },
      },
    });
  }
  return jobs;
}
export async function inferLaya(input: AnalysisRequest, signal?: AbortSignal) {
  const answers: Record<string, unknown> = {};
  const usage = { input_tokens: 0, output_tokens: 0 };
  let identity = "",
    model = "laya-multilingual",
    contextCount = 0;
  for (const [i, job] of layaJobs(input).entries()) {
    const result = await predictContext(job, signal);
    const key = engineKey(result.engine);
    if (identity && identity !== key)
      throw new Error("分析期间模型发生变化，请重新分析");
    identity = key;
    model = result.engine.model;
    Object.assign(answers, result.answers);
    usage.input_tokens += result.usage?.input_tokens ?? 0;
    usage.output_tokens += result.usage?.output_tokens ?? 0;
    if (i === 0) contextCount = result.usedMessageIds.length;
  }
  return { answers, usage, engineKey: identity, model, contextCount };
}
