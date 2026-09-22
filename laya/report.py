"""Summarize measured outputs; never re-label failed examples to improve a score."""
import argparse
import json
import statistics
from pathlib import Path

LABELS = {"emotion": "情绪", "intent": "意图", "boundary": "当前有效拒绝", "action": "下一步建议",
          "enough": "证据充分性", "quality": "我方回复质量", "affinity_intimacy": "亲密表达", "affinity_action": "实际行动"}


def compare(mlx, reference):
    if (mlx["schema"] != reference["schema"] or not mlx.get("inputSha256")
            or mlx["inputSha256"] != reference.get("inputSha256")
            or any(mlx["engine"][key] != reference["engine"][key]
                   for key in ["weightsSha256", "tokenizerSha256", "configSha256"])):
        raise ValueError("Cannot compare different schemas, inputs or model files")
    rows = {row["id"]: row for row in reference["cases"]}
    result = {"choiceAgreed": 0, "choiceTotal": 0, "booleanAgreed": 0, "booleanTotal": 0,
              "maxProbabilityDifference": 0, "maxScoreDifference": 0}
    for row in mlx["cases"]:
        for key, answer in row["answers"].items():
            other = rows[row["id"]]["answers"][key]
            if answer["type"] == "noul":
                result["booleanTotal"] += 1
                result["booleanAgreed"] += int((answer["noul"] >= .5) == (other["noul"] >= .5))
                delta = abs(answer["noul"] - other["noul"])
            else:
                delta = max(abs(p - other["probabilities"][label]) for label, p in answer["probabilities"].items())
                if answer["type"] == "choice":
                    result["choiceTotal"] += 1
                    result["choiceAgreed"] += int(answer["choice"] == other["choice"])
                else:
                    result["maxScoreDifference"] = max(result["maxScoreDifference"], abs(answer["score"] - other["score"]))
            result["maxProbabilityDifference"] = max(result["maxProbabilityDifference"], delta)
    return result


def summarize(report):
    times = [row["medianMs"] for row in report["cases"] if "medianMs" in row]
    boundary = [c for row in report["cases"] for c in row.get("checks", []) if c["question"] == "boundary"]
    return {"groups": report["groups"], "latencyMs": {"min": min(times), "median": statistics.median(times), "max": max(times)},
            "boundary": {"positiveCount": sum(c["expected"]["boolean"] for c in boundary),
                         "negativeCount": sum(not c["expected"]["boolean"] for c in boundary),
                         "falsePositives": sum(not c["expected"]["boolean"] and c["predicted"] >= .5 for c in boundary),
                         "falseNegatives": sum(c["expected"]["boolean"] and c["predicted"] < .5 for c in boundary),
                         "brier": statistics.mean((c["predicted"] - int(c["expected"]["boolean"])) ** 2 for c in boundary)},
            "capacityFailures": report["capacityFailures"],
            "maxInputTokens": max(q["totalTokens"] for c in report["cases"] for q in c["audit"]["questions"].values())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts", default="artifacts")
    parser.add_argument("--output", default="artifacts/laya-validation-report.md")
    args = parser.parse_args()
    folder = Path(args.artifacts)
    read = lambda name: json.loads((folder / name).read_text())
    current, reference = read("laya-mlx.json"), read("laya-torch.json")
    parity = compare(current, reference)
    summary, cpu = summarize(current), summarize(reference)
    lines = ["# Laya 本地接入与效果验证", "", "已经实现本机 HTTP 推理服务和独立验证页面。实测支持继续验证情绪、意图等分类；当前回复评分、建议和历史拒绝维持能力不足，暂不将 Laya 接管原来的完整分析流程。", "",
             "验证入口：http://127.0.0.1:3178/laya-validation 。页面不需要云端 API Key，聊天不落盘。", "",
             "## 实测结果", "", "27 组作者编写的中文合成开发样例；预期判据在首次运行前固定且未传给模型。我们根据开发集结果调整了输入格式，因此以下不是独立测试集准确率，也不是产品可用性证明。", "",
             "| 项目 | 通过预设判据 | Top 3 命中 |", "|---|---:|---:|"]
    for key, group in current["groups"].items():
        top = f'{group["top3Passed"]}/{group["total"]}' if key in ["emotion", "intent", "action", "enough"] else "—"
        lines.append(f'| {LABELS.get(key, key)} | {group["passed"]}/{group["total"]} | {top} |')
    lat = summary["latencyMs"]
    lines += ["", f'本次运行环境（详见结果 engine 字段），MLX FP16，每组请求包含 4–9 个问题。每个输入形状预热一次，再重复 3 次；27 组各自中位数的范围为 {lat["min"]:.2f}–{lat["max"]:.2f} ms，中位数 {lat["median"]:.2f} ms。不含模型首次加载、网络和页面渲染。CPU FP32 每组预热后测量一次，其中位数 {cpu["latencyMs"]["median"]:.2f} ms。', "",
              f'全部样例完整保留，无静默截断。最长单题 {summary["maxInputTokens"]}/1024 tokens；题目与候选预算设置为 512 tokens，仅在内存中覆盖。', "",
              f'拒绝判断按 0.5 阈值：正例 {summary["boundary"]["positiveCount"]}，负例 {summary["boundary"]["negativeCount"]}，误报 {summary["boundary"]["falsePositives"]}，漏报 {summary["boundary"]["falseNegatives"]}；开发集 Brier {summary["boundary"]["brier"]:.4f}。未拟合温度或阈值。', "",
              "## 失败样例", ""]
    for cid in ["still_active", "dismiss", "pressure", "wait", "warm_overview", "ambiguous"]:
        row = next(r for r in current["cases"] if r["id"] == cid)
        failed = [c for c in row["checks"] if not c["passed"]]
        if failed:
            lines.append(f'- **{row["title"]}**：' + "；".join(f'{LABELS.get(c["question"], c["question"])}实际为 `{c["predicted"]}`，预期 `{json.dumps(c["expected"], ensure_ascii=False)}`' for c in failed) + "。")
    lines += ["", "`noul` 是模型给出的“是”概率；choice/score 的 confidence 是分布的确定程度，不是正确率。评分是 0–4 等级的期望，未转换为真实好感度。上述未通过项不通过调整预期标签掩盖。", "",
              "## 数值对照", "",
              f'同一输入、权重、tokenizer 和配置下，MLX 与本地原版 PyTorch CPU FP32 的选择一致 {parity["choiceAgreed"]}/{parity["choiceTotal"]}，二分类一致 {parity["booleanAgreed"]}/{parity["booleanTotal"]}；输出概率最大绝对差 {parity["maxProbabilityDifference"]:.6f}，评分最大差 {parity["maxScoreDifference"]:.6f}。这是实现一致性检查，不说明语义答案正确。', "",
              "## 输入格式实验", "", "所有版本使用相同的 27 个聊天样例和相同预期判据。", "",
              "| 版本 | 情绪 | 意图 | 拒绝 | 回复质量 |", "|---|---:|---:|---:|---:|"]
    for filename, title in [("laya-v1-mlx.json", "V1：中文任务说明、关系与目标包装"), ("laya-v2-mlx.json", "V2：英文任务说明、关系与目标包装"), ("laya-mlx.json", "V3：英文任务说明、只给原话前缀")]:
        if not (folder / filename).exists():
            continue
        report = read(filename)
        cells = [f'{report["groups"][k]["passed"]}/{report["groups"][k]["total"]}' for k in ["emotion", "intent", "boundary", "quality"]]
        lines.append(f'| {title} | ' + " | ".join(cells) + " |")
    lines += ["", "当前保留 35 个意图候选在同一分布中。没有将少量候选的概率伪装成完整分类概率。消息模式只发送截至目标的聊天，避免后文泄漏；总览发送整段，超预算明确拒绝。用户的关系预设不进入模型输入，避免给判读额外暗示。", "",
              "## 实现与复现", "", "运行方法见仓库 `laya/README.md`。验证页 → Express `/api/laya/analyze` → 本机 FastAPI → MLX → 本地 multilingual 权重。Python 服务只绑定 127.0.0.1，不下载模型，不改权重。此报告仅测量独立验证页题目；主界面的上下文选择、记忆处理与规则修正另有集成测试。", "",
              f'输入 SHA-256：`{current["inputSha256"]}`', "",
              f'权重 SHA-256：`{current["engine"]["weightsSha256"]}`', "",
              f'Tokenizer SHA-256：`{current["engine"]["tokenizerSha256"]}`', "",
              f'运行时：laya-mlx {current["engine"]["runtimeVersion"]}，依赖固定在 `laya/requirements.lock`。生成时间：{current["at"]}。', "",
              "下一步应先收集经人工标注且未用于调提示的中文聊天测试集；优先检验旧拒绝持续有效、撤回与普通寒暄的区分。主界面已实验性接入；回复评分和下一步建议仍需独立验证或领域训练。没有运行 Jev 云端对照。", ""]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines))
    output.with_suffix(".json").write_text(json.dumps({"current": summary, "reference": cpu, "parity": parity, "engine": current["engine"], "inputSha256": current["inputSha256"]}, ensure_ascii=False, indent=2) + "\n")
    print(output)
    print(json.dumps(parity, indent=2))


if __name__ == "__main__":
    main()
