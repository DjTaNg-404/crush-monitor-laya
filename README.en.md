# Crush Monitor · Local Laya

[中文](README.md)

Paste a two-person conversation to inspect emotion, intent, reply quality, six affinity dimensions and suggested next steps. Supports WeChat, QQ, WhatsApp and `Name: message` transcripts, incremental imports, historical evidence and browser-local persistence.

The **main application runs local Laya inference**. No Jev key or cloud model is required. This is an experimental interpretation tool: scores do not establish someone's feelings. Laya classifies and scores; it does not generate replies.

## Quick start

Install Git, Node.js 22.12+ (24 recommended), and [uv](https://docs.astral.sh/uv/getting-started/installation/) or Python **3.12**. With uv, setup can install Python automatically.

```bash
git clone https://github.com/DjTaNg-404/crush-monitor-laya.git
cd crush-monitor-laya
npm ci
npm run setup
npm start
```

Open **http://127.0.0.1:3178**. Startup builds the UI, starts Laya, waits for readiness and starts the API. Ctrl+C stops the services together. Subsequent launches only need `npm start`.

Setup preserves `.env`, creates `.runtime/venv`, installs platform dependencies and downloads only the pinned multilingual checkpoint (~615 MiB of weights). Everything is cached under `.runtime/`. Installation needs network access; inference runs offline. Models, environments, credentials and private conversations are excluded from Git.

- **Apple Silicon / macOS 14+**: MLX GPU / FP16, tested on Apple Silicon.
- **Linux, Windows, Intel Mac**: official Laya + PyTorch CPU / FP32. CPU inference has been tested on macOS; other operating systems have not been tested on physical machines.

At least 8 GB RAM and several GB of free storage are recommended. CPU startup and long conversations are slower.

## Existing model and settings

Before setup, copy `.env.example` to `.env` and set `LAYA_MODEL_PATH` to an absolute local checkpoint directory. It must contain `model.safetensors`, `rl_agent_config.json`, `encoder/config.json`, `tokenizer/tokenizer.json` and `tokenizer/tokenizer_config.json`. Setup then skips model downloads. Use the **multilingual** checkpoint for Chinese; automatic language routing is not enabled.

Set `LAYA_BACKEND=torch` and rerun setup to install the CPU backend. Default `auto` uses MLX on Apple Silicon and CPU elsewhere. Change `PORT` for the web server and `LAYA_URL=http://127.0.0.1:<port>` for the model service. The managed launcher supports loopback only. Do not expose this local application publicly.

## Behavior and limitations

The original parser, incremental workflow, history retrieval, six-dimension scoring and refusal/wait rules remain. Model calls, English task definitions, token budgeting, startup and cache identity have changed.

Laya multilingual has a **1,024-token total limit**, including questions and answer options. Each target is evaluated with a causal prefix. Required source messages and withdrawal evidence are retained first, then complete recent messages are added within the actual tokenizer budget. The overview detail shows its included message count. All imported text remains in browser storage. If required evidence itself exceeds capacity, analysis reports an error instead of silently truncating it.

Cache identity includes weights, tokenizer, configuration, backend and rubric version. Old Jev results and results from a different runtime are invalidated. Normal inference stays offline on loopback; initial installation contacts package registries, GitHub and Hugging Face.

Emotion and explicit refusals have been more reliable than fine-grained intent, absolute reply scores and next-action advice. Sarcasm, indirect language, friendship boundaries and withdrawn refusals remain difficult. Confidence is not accuracy, and refusal-priority rules cannot correct refusals the model fails to detect.

The early standalone lab's 26 authored Chinese cases yielded emotion 6/7, intent 6/12, boundary 20/21, reply-score ranges 2/8 and action 2/4. Their English translations with the same multilingual checkpoint yielded 6/7, 6/12, 19/21, 3/8 and 0/4. Denominators count checks, not cases. These are **small diagnostic sets, not product accuracy or a comparison with Jev**. The main product applies additional context and business rules. See [evaluation notes](laya/README.md) for fixtures and reproduction.

## Development

```bash
npm run dev            # model + API + Vite at http://127.0.0.1:5178
npm test
npm run laya:test
npm run build
npm run check:live     # requires a running model
npm run check:product  # requires a running application
```

The optional lab at `/laya-validation` shows raw model distributions. CI runs lightweight checks without downloading weights; live model validation is separate.

## Attribution

The original project's MIT license is retained in [LICENSE](LICENSE). This fork uses [Laya](https://github.com/NandhaKishorM/laya), [Laya-MLX](https://github.com/mizorewww/laya-mlx) and the [official Apache-2.0 model](https://huggingface.co/convaiinnovations/laya), downloaded separately. Third-party components retain their own licenses. Model revision and backend versions are pinned in the setup files.
