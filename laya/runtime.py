"""Offline inference and strict capacity checks. Never silently truncate chat evidence."""
import hashlib
import importlib.metadata
import json
import math
import os
import time
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")


class CapacityError(ValueError):
    def __init__(self, audit):
        super().__init__("输入超过完整保留预算，请缩短上下文或题目；没有执行截断推理。")
        self.audit = audit


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def inspect_input(tok, state, questions, max_len, head_max_len, to_internal, render_options):
    encode = lambda text: tok(text, add_special_tokens=False)["input_ids"]
    text = state if isinstance(state, str) else json.dumps(state, ensure_ascii=False)
    state_tokens = len(encode(text.replace(tok.mask_token, " ")))
    rows = {}
    for qid, definition in questions.items():
        q = to_internal(definition)
        ins = len(encode(f'{q["t"]} question: {q["ins"]}'.replace(tok.mask_token, " ")))
        option_lengths = [len(encode(" " + v.replace(tok.mask_token, " "))) for v in render_options(q)]
        # Upstream limits each option to 48 text tokens, then may shrink it again.
        option_tokens = sum(n + 1 for n in option_lengths)
        prefix_tokens = ins + option_tokens
        total = prefix_tokens + 4 + state_tokens
        fits = (all(n <= 48 for n in option_lengths)
                and head_max_len - option_tokens >= max(16, ins)
                and total <= max_len)
        rows[qid] = {
            "fits": fits, "instructionTokens": ins, "optionTokens": option_tokens,
            "optionCount": len(option_lengths), "maxOptionTokens": max(option_lengths, default=0),
            "stateTokens": state_tokens, "totalTokens": total,
            "headBudget": head_max_len, "sequenceBudget": max_len,
        }
    return {"fits": bool(rows) and all(r["fits"] for r in rows.values()), "questions": rows}


def validate_answers(questions, result):
    answers = result.get("answers", {})
    if set(answers) != set(questions):
        raise ValueError("模型输出缺少问题或包含未知问题")
    for key, question in questions.items():
        answer = answers[key]
        if answer.get("type") != question["type"]:
            raise ValueError("模型输出类型不匹配")
        if question["type"] == "noul":
            p = answer["noul"]
            if not isinstance(p, (int, float)) or not math.isfinite(p) or not 0 <= p <= 1:
                raise ValueError("模型输出概率无效")
            continue
        expected = set(question["criteria"]) if question["type"] == "choice" else {str(i) for i in range(len(question["criteria"]))}
        probabilities = answer["probabilities"]
        if set(probabilities) != expected or any(not math.isfinite(p) or not 0 <= p <= 1 for p in probabilities.values()):
            raise ValueError("模型输出候选分布无效")
        if abs(sum(probabilities.values()) - 1) > 0.005:
            raise ValueError("模型输出概率之和无效")
        if not math.isfinite(answer["confidence"]) or not 0 <= answer["confidence"] <= 1:
            raise ValueError("模型输出确定度无效")
        if question["type"] == "choice" and answer["choice"] not in expected:
            raise ValueError("模型选择了未知类别")
        if question["type"] == "score" and (not math.isfinite(answer["score"]) or not 0 <= answer["score"] <= len(expected) - 1):
            raise ValueError("模型输出评分无效")


class Runtime:
    def __init__(self, model_dir, backend="mlx", dtype="float16", head_max_len=None, batch_size=8):
        path = Path(model_dir).expanduser().resolve(strict=True)
        started = time.perf_counter()
        if backend == "mlx":
            from laya_mlx import load
            from laya_mlx.common import render_options
            self.agent = load(str(path), device="gpu", dtype=dtype, batch_size=batch_size)
            device = "gpu"
            version = importlib.metadata.version("laya-mlx")
        elif backend == "torch":
            import torch
            torch.set_num_threads(4)
            from laya import Agent
            from laya.common import render_options
            self.agent = Agent(str(path), device="cpu")
            dtype, device = "float32", "cpu"
            version = importlib.metadata.version("laya") + "/torch-" + importlib.metadata.version("torch")
        else:
            raise ValueError("Unknown backend")
        head_max_len = head_max_len or min(512, self.agent.cfg["max_len"] - 128)
        self.render_options = render_options
        self.agent.cfg["head_max_len"] = head_max_len  # In memory only; checkpoint files are unchanged.
        if not 4 < head_max_len < self.agent.cfg["max_len"]:
            raise ValueError("Invalid head token budget")
        self.identity = {
            "backend": backend, "device": device, "dtype": dtype, "runtimeVersion": version,
            "model": "laya-multilingual" if "mmBERT" in self.agent.cfg.get("encoder", "") else "laya", "modelPath": str(path),
            "maxTokens": self.agent.cfg["max_len"], "headTokens": head_max_len,
            "batchSize": batch_size, "loadMs": round((time.perf_counter() - started) * 1000, 2),
            "weightsSha256": sha256(path / "model.safetensors"),
            "tokenizerSha256": sha256(path / "tokenizer/tokenizer.json"),
            "tokenizerConfigSha256": sha256(path / "tokenizer/tokenizer_config.json"),
            "encoderConfigSha256": sha256(path / "encoder/config.json"),
            "configSha256": sha256(path / "rl_agent_config.json"),
            "calibration": "checkpoint defaults; not calibrated for Chinese chat",
        }

    def inspect(self, state, questions):
        return inspect_input(self.agent.tok, state, questions, self.agent.cfg["max_len"],
                             self.agent.cfg["head_max_len"], self.agent._to_internal, self.render_options)

    def predict(self, state, questions):
        started = time.perf_counter()
        audit = self.inspect(state, questions)
        if not audit["fits"]:
            raise CapacityError(audit)
        result = self.agent.system_one(state, questions)
        validate_answers(questions, result)
        return {**result, "engine": self.identity, "audit": audit,
                "latencyMs": round((time.perf_counter() - started) * 1000, 2)}
