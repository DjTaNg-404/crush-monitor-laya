"""Download only the fixed multilingual checkpoint, never sibling weights or remote code."""
import os
from pathlib import Path
from huggingface_hub import snapshot_download

REPO = "convaiinnovations/laya"
REVISION = "1c5edc17a7acd8701df6fc341c0d179f1c62c982"
ROOT = Path(__file__).resolve().parent.parent


def main():
    existing = os.getenv("LAYA_MODEL_PATH", "").strip()
    model = Path(existing).expanduser().resolve() if existing else ROOT / ".runtime/models/laya/multilingual"
    required = ["rl_agent_config.json", "model.safetensors", "encoder/config.json", "tokenizer/tokenizer.json", "tokenizer/tokenizer_config.json"]
    if not existing:
        print("Downloading Laya multilingual (~615 MiB), cached for offline use.", flush=True)
        snapshot_download(REPO, revision=REVISION, local_dir=str(model.parent),
                          allow_patterns=[f"multilingual/{p}" for p in required] + ["README.md"])
    missing = [p for p in required if not (model / p).is_file()]
    if missing:
        raise SystemExit(f"Incomplete model at {model}: {', '.join(missing)}")
    print(f"Local model ready: {model}")


if __name__ == "__main__":
    main()
