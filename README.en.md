# Crush Monitor

[简体中文](README.md) · English

A Jev-powered tool for looking at conversations with your crush or partner. It helps you make sense of emotions and intentions, and spot replies you could have worded better.

AI doesn't know your relationship or what happens outside the chat. Take the results lightly—as another perspective. Your own judgment and an honest conversation still matter more.

## Features

- **WeChat-style conversation view:** analysis sits beneath each message.
- **Emotions and intentions:** the top three probabilities from 12 emotion and 35 intention categories.
- **Affection score and reply grades:** a conversation-level score, SSS–D grades for your replies, and suggested next steps.
- **Ongoing analysis:** paste more messages to continue. Overlapping excerpts are detected, long conversations run in batches, and results survive a page refresh.
- **Run locally with your own key:** use your own TypeSafe account and API credits. No hosted deployment required.

The interface and analysis labels are currently in Chinese. This README provides English setup instructions; it does not add an English UI.

## Why Jev?

Jev is TypeSafe's model for structured judgments, returning classifications, scores and probabilities. This app needs short, per-message assessments rather than long generated answers. Emotion and intention judgments can also run in parallel within a request.

- [Launch post by founder Diogo Almeida](https://x.com/CompleteSkeptic/status/2099925682726002904)
- [Official introduction](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [Get an API key](https://console.typesafe.ai/)

## Run locally

Install Node.js 22.12+ and get a TypeSafe API key. Download or clone this repository, then run these commands in the project directory. The same commands work on macOS, Windows and Linux.

```sh
npm ci
npm run setup
```

Edit the generated `.env`:

```dotenv
TYPESAFE_API_KEY=your_api_key
PORT=3178
HOST=127.0.0.1
```

Build and start:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3178/** and leave the terminal running. Next time, just run `npm start`. Restart after changing your key.

## Usage

1. Copy your conversation, or open a text export and copy its contents. Paste into the input field.
2. Select your own name and click **开始分析** (Analyze). Relationship settings are available in **聊天设置** (Chat settings).
3. Read the emotion, intention and reply labels. Click a label for details.
4. Paste new messages to continue the conversation.

### Supported text formats

| Source | What to paste |
| --- | --- |
| WeChat | Desktop multi-message copy: name, Chinese date/time, then message body on separate lines |
| QQ | `Name: 09-17 19:26:53`, followed by the body on the next line; dates with a year also work |
| WhatsApp | [Export a chat](https://faq.whatsapp.com/1180414079177245/), open the `.txt` file and copy its contents; the two common layouts below are supported |
| iMessage / other apps | Format each message as `Name: body`; English names and names containing spaces work |

```text
[9/17/26, 7:26:53 PM] Alex: Dinner tonight?
[9/17/26, 7:27:00 PM] Me: Sounds good
```

```text
17/09/2026, 19:26 - Alex: Dinner tonight?
17/09/2026, 19:27 - Me: Sounds good
```

If copying from iMessage or another app gives you only the message bodies, add `Alex:` / `Me:` yourself. The app cannot recover missing sender information. Native iMessage bulk-copy compatibility has not been verified; only the manually labelled text format is supported. WhatsApp exports can vary by locale and version. The formats above have automated parser tests, not end-to-end verification on every client.

Multiline bodies and consecutive messages from the same person are preserved. Dates are kept as copied: the parser does not guess day/month order or missing years. Only two-person text conversations are supported—not images, audio, ZIP/HTML exports or chat databases. The app does not monitor messaging apps in the background.

## Notes

- The affection score combines six dimensions: keeping the conversation going, engagement, care, openness, intimacy and concrete actions. Click the score for a breakdown. An explicit refusal that still applies limits the score. **It is not the probability that someone likes you.**
- Long conversations are processed in batches; the full history is not capped at 500 messages. New imports analyze new content and revisit recent messages from the other person. Previous grades for your own replies are retained.
- Scoring uses recent messages and relevant original excerpts from history, including invitations, care, refusals and retractions. Old scores are not evidence for new scores. Retrieval can miss context.
- Each model request stays within 500 messages and 12,000 text characters. Overlong individual messages are retained but need splitting before analysis. Paste at most 250,000 characters at a time; total history depends on browser storage capacity.
- Chats and results stay in this browser's local database. **清空聊天，重新开始** (Clear chat and start over) deletes them. Other browsers or URL ports do not share the same data; clearing browser data also removes it.
- Original messages needed for analysis are sent to TypeSafe using your account's credits. Local storage does not mean offline inference.
- If analysis fails, check the terminal, API key and account credits. Never commit `.env` or private conversations.

## Development

React + TypeScript + Vite + Express, using the TypeSafe SDK with `jev-1.13.0`.

```sh
npm run dev        # http://127.0.0.1:5178/
npm test           # local tests; no model calls
npm run check:live # real model check; uses your API credits
```

## License

[MIT](LICENSE). Not affiliated with WeChat, Tencent, TypeSafe or any messaging platform mentioned here.
