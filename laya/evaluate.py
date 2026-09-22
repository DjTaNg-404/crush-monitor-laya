"""Frozen synthetic cases: report actual failures, input budgets and backend parity."""
import argparse
import json
import os
import statistics
import time
from pathlib import Path

from runtime import CapacityError, Runtime, sha256


def evaluate(runtime, fixtures, repeats):
    rows = []
    for case in fixtures["cases"]:
        payload = case["payload"]
        try:
            # Warmup for this shape, excluded from steady-state timings.
            result = runtime.predict(**payload)
            timings = []
            for _ in range(repeats):
                result = runtime.predict(**payload)
                timings.append(result["latencyMs"])
            checks = []
            for key, expected in case["expected"].items():
                answer = result["answers"][key]
                if "labels" in expected:
                    predicted = answer["choice"]
                    passed = predicted in expected["labels"]
                    top3 = sorted(answer["probabilities"], key=answer["probabilities"].get, reverse=True)[:3]
                    top3_passed = any(label in expected["labels"] for label in top3)
                elif "boolean" in expected:
                    predicted = answer["noul"]
                    passed = (predicted >= 0.5) == expected["boolean"]
                    top3_passed = None
                else:
                    predicted = answer["score"]
                    passed = expected["range"][0] <= predicted <= expected["range"][1]
                    top3_passed = None
                checks.append({"question": key, "expected": expected, "predicted": predicted,
                               "passed": passed, "top3Passed": top3_passed})
            rows.append({"id": case["id"], "title": case["title"], "checks": checks,
                         "answers": result["answers"], "audit": result["audit"],
                         "medianMs": statistics.median(timings), "timingsMs": timings})
            print(case["id"], f'{sum(c["passed"] for c in checks)}/{len(checks)}', round(statistics.median(timings)), "ms", flush=True)
        except CapacityError as e:
            rows.append({"id": case["id"], "title": case["title"], "error": str(e), "audit": e.audit})
            print(case["id"], "CAPACITY FAILURE", flush=True)
    groups = {}
    for row in rows:
        for check in row.get("checks", []):
            key = check["question"]
            group = groups.setdefault(key, {"passed": 0, "total": 0, "top3Passed": 0})
            group["passed"] += int(check["passed"])
            group["total"] += 1
            group["top3Passed"] += int(check["top3Passed"] or False)
    return {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "schema": fixtures["schema"],
            "engine": runtime.identity, "dataset": fixtures["description"], "groups": groups,
            "capacityFailures": sum("error" in r for r in rows), "cases": rows,
            "limitations": "Author-written synthetic development cases; no human review, no held-out accuracy claim, no fitted calibration."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="artifacts/laya-inputs.json")
    parser.add_argument("--output", default="artifacts/laya-mlx.json")
    parser.add_argument("--model-dir", default=os.getenv("LAYA_MODEL_PATH") or str(Path(__file__).resolve().parent.parent / ".runtime/models/laya/multilingual"))
    parser.add_argument("--backend", choices=["mlx", "torch"], default="mlx")
    parser.add_argument("--dtype", choices=["float16", "float32"], default="float16")
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("repeats must be positive")
    fixtures = json.loads(Path(args.input).read_text())
    model = Runtime(args.model_dir, backend=args.backend, dtype=args.dtype)
    report = evaluate(model, fixtures, args.repeats)
    report["inputSha256"] = sha256(args.input)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["groups"], ensure_ascii=False, indent=2))
    if report["capacityFailures"]:
        raise SystemExit(2)
