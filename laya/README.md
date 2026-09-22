# Laya 开发验证

主产品安装与启动见根目录 README。主界面 `/` 和原始分布验证页 `/laya-validation` 都使用同一个本机模型服务。

## 复现

```bash
npm ci
npm run setup
npm start
```

另开终端执行：

```bash
npm run check:product
npm run laya:challenge -- --language zh
npm run laya:challenge -- --language en
```

`fixtures/challenge-zh.json` 与 `challenge-en.json` 是 26 组一一对应的人工合成中英语料，没有真实私人聊天。预期标签与评分范围预先写在语料中，绝不传给模型。结果写入忽略的 `artifacts/challenge-*.json`。命令遇到 HTTP 错误返回失败；标签或评分不命中会如实记入结果，不作为工程构建失败。它测试验证页的原始输出，不是经过主产品规则修正后的建议。

最初 27 组中文开发样例保存在 `shared/layaFixtures.ts`：

```bash
npm run laya:evaluate
# 对照 CPU 需要先安装 laya/requirements-torch.txt（可设置 LAYA_BACKEND=torch 后重跑 setup）
npm run laya:reference
npm run laya:report
```

这些评测直接加载模型，CPU/MLX 都会占用额外内存。Apple Silicon 默认为 MLX；其他平台运行评测时指定 `--backend torch`。`requirements.lock` 保存了早期 Apple Silicon 实验环境，**不是跨平台安装文件**。正式安装使用 `requirements-common.txt` 加对应后端文件。

## 主产品管线

浏览器 → Express `/api/analyze` → Laya 英文分类／评分题目 → Python `/v1/context` → 完整消息 token 预算 → 本地模型 → 原产品的评分合成、拒绝／等待规则与记忆更新。

- 多语言 checkpoint 默认最大序列 1,024，运行时题目预算 512；不改模型权重。
- 单条问题的 35 个意图候选完整保留，不用短名单伪装全分布。
- 目标消息的未来回复物理隔离；历史记忆传入原话，不能只靠旧分类作证据。
- 原话预算使用实际 tokenizer；问题、选项和必要消息超预算时返回 422。
- 评分按原规则从 0–4 映射至 0–100。置信度独立展示，不能解释为喜欢的概率或正确率。
- `/api/health` 提供模型缓存身份；权重／分词器／配置／后端／题目版本变化会使旧结果失效。
- 模型服务只绑定回环地址；普通推理禁止联网下载。启动器等待模型健康后才提供产品 API。

## 结果应如何理解

根目录 README 记录的是迁移前独立验证页的小规模诊断结果。它不代表所有语言、真实聊天或主产品管线的表现。English checkpoint 在先前英文样例中比 multilingual 更好，但这里为中文及混合输入固定使用 multilingual；尚未加入自动模型路由。

模型对中文细粒度意图、质量分数和行动建议仍不稳定。不能仅因为服务跑通、分类置信度高或者规则覆盖了部分错误，就宣称产品判断准确。`tests/jev-reference.ts` 只保留上游请求结构供回归与容量比较，不会调用 Jev。
