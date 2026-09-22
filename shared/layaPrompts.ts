/** English task definitions, Chinese evidence preserved verbatim. No labels derived from fixtures. */
import type { EMOTIONS } from "./labels";
import type { INTENTS } from "./intents";
export const LAYA_EMOTIONS: Record<keyof typeof EMOTIONS, string> = {
  happy: "joy, happiness or excitement",
  confused: "confusion or not understanding",
  angry: "real anger, not playful insults",
  sad: "sadness or grief",
  shy: "shyness or embarrassment",
  caring: "concern and care for the other person",
  teasing: "playful teasing or joking",
  calm: "neutral factual statement",
  annoyed: "impatience or irritation",
  surprised: "surprise",
  disappointed: "disappointment or unmet expectations",
  unknown: "unclear or none of these emotions",
};
export const LAYA_INTENTS: Record<keyof typeof INTENTS, string> = {
  share: "share personal experiences or updates",
  answer: "answer a previous specific question",
  inform: "notify factual information or arrangements",
  ask: "ask for information",
  clarify: "ask for clarification of meaning",
  explain: "explain reasons or clear up misunderstanding",
  opinion: "express an opinion",
  agree: "agree with a view or proposal",
  disagree: "disagree or correct a claim",
  acknowledge: "briefly acknowledge receiving a message",
  continue: "keep the conversation going",
  change: "change the topic",
  joke: "make a friendly joke",
  vent: "vent frustrations or complaints",
  comfort_seek: "seek emotional comfort",
  validation: "seek affirmation or approval",
  help: "request practical help",
  advice: "offer advice or a solution",
  care: "show concern for the other person",
  comfort: "comfort or encourage the other person",
  praise: "give a compliment",
  thanks: "express gratitude",
  apologize: "apologize and repair hurt",
  attention: "seek attention or companionship",
  interest: "indirectly probe romantic interest",
  invite_hint: "hint at meeting or doing something together",
  invite: "directly invite or arrange an activity together",
  flirt: "playfully express romantic interest",
  affection: "express affection or missing the other person",
  ease: "ease tension or awkwardness",
  refuse: "decline a specific proposal or invitation",
  boundary: "set boundaries or ask behavior to stop",
  close: "end this conversation for now",
  other: "a clear purpose outside these categories",
  unknown: "insufficient context to determine the purpose",
};
export const LAYA_ACTIONS = {
  continue: "continue the current topic",
  ask: "ask a light specific follow-up question",
  empathize: "first acknowledge feelings and offer comfort",
  flirt: "reciprocate established playful romantic interest",
  invite: "suggest a specific activity together",
  clarify: "gently clarify an ambiguous meaning",
  wait: "wait for their answer to my pending question",
  close: "end this conversation for now",
  respect: "respect their refusal and stop pursuing or contacting them",
  insufficient: "not enough information to advise",
};
export const LAYA_DIMENSIONS = {
  initiative: {
    question:
      "Does other initiate or extend conversation with self? Message count alone is not evidence.",
    levels: [
      "explicitly unwilling to continue talking",
      "only passive replies or repeatedly ends topics",
      "naturally responds and maintains conversation",
      "asks follow-up questions or starts new topics",
      "consistently initiates and explicitly wants to stay in touch",
    ],
  },
  engagement: {
    question:
      "How attentively does other respond to what self says? Short or slow replies alone are not negative.",
    levels: [
      "explicitly ignores or belittles self",
      "repeatedly avoids the point or responds dismissively",
      "normally answers and follows the topic",
      "responds thoughtfully to details or jokes",
      "consistently engages deeply and follows up on earlier details",
    ],
  },
  care: {
    question:
      "Does other show personalized care for self's feelings and needs, beyond ordinary politeness?",
    levels: [
      "mocks or dismisses expressed distress",
      "unwilling to respond to expressed needs",
      "ordinary politeness and basic consideration",
      "offers specific comfort or remembers personal needs",
      "proactively provides sustained personal care and concrete support",
    ],
  },
  openness: {
    question:
      "How willingly does other share personal life and feelings with self? Normal privacy is not rejection.",
    levels: [
      "explicitly refuses personal contact and requests distance",
      "deliberately keeps relevant conversation superficial",
      "naturally shares everyday life and opinions",
      "voluntarily shares personal details or feelings",
      "shows trust by sharing vulnerable feelings or important inner thoughts",
    ],
  },
  intimacy: {
    question:
      "What romantic closeness does other express toward self? Friendly banter is not romance. Judge current words, not relationship status.",
    levels: [
      "explicit romantic rejection that still applies",
      "explicitly limits the relationship to non-romantic friendship",
      "friendly but no clear romantic meaning",
      "personal expressions of missing self or reciprocated flirting",
      "explicit romantic love or mutually welcomed intimacy",
    ],
  },
  action: {
    question:
      "Does other translate interest in self into concrete plans or actions? No invitation opportunity is not rejection.",
    levels: [
      "explicitly rejects further contact with no alternative",
      "repeatedly avoids or declines plans without alternatives",
      "general possibilities or no concrete plans discussed",
      "proposes or accepts specific plans, or actively reschedules",
      "both confirm concrete plans or text directly shows follow-through",
    ],
  },
} as const;
