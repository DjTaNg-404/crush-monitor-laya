# Crush Monitor · 本地 Laya 版

[English](README.en.md)

粘贴两人聊天，查看对方的情绪与意图、我方回复质量、六维好感信号及下一步建议。支持微信、QQ、WhatsApp 和手动「昵称：内容」格式，支持追加聊天、历史事件检索与浏览器本地保存。

这是原 Crush Monitor 的本地 Laya fork。**主界面已经使用本机 Laya，不需要 Jev API key。** 首次安装需要联网下载依赖与模型，之后分析在本机运行。模型属于分类／评分模型，不生成回复文本。结果是实验性解读，不能代表对方的真实想法。

## 快速开始

准备 [Node.js](https://nodejs.org/) 22.12+（推荐 24）、Git，以及 [uv](https://docs.astral.sh/uv/getting-started/installation/) 或 Python **3.12**。使用 uv 时脚本会自动准备 Python。

```bash
git clone https://github.com/DjTaNg-404/crush-monitor-laya.git
cd crush-monitor-laya
npm ci
npm run setup
npm start
```

打开 **http://127.0.0.1:3178**。`npm start`会构建页面、启动模型、等待模型就绪，再启动产品服务；Ctrl+C 同时停止服务。再次使用只需`npm start`。

`setup` 可重复执行，会保留已有 `.env`。它创建 `.runtime/venv`，按平台安装依赖，再下载固定版本的多语言 checkpoint（权重约 615 MiB）到 `.runtime/models/laya/multilingual`。权重、环境、个人聊天和 `.env` 不会提交到 Git。

| 平台                        | 默认后端                       | 状态                                                      |
| --------------------------- | ------------------------------ | --------------------------------------------------------- |
| Apple Silicon，macOS 14+    | MLX GPU / FP16                 | 已在 Apple Silicon 实机验证                               |
| Linux / Windows / Intel Mac | 官方 Laya + PyTorch CPU / FP32 | 提供安装路径；CPU 推理在 macOS 验证，其他系统尚未实机验证 |

建议至少 8 GB 内存，并为依赖、缓存和模型预留数 GB 空间。CPU 首次加载与长聊天分析会更慢。安装失败时可重跑 `npm run setup`，不会删除模型或聊天记录。

## 使用已有模型

首次先复制 `.env.example` 为 `.env`，设置：

```dotenv
LAYA_MODEL_PATH=/absolute/path/to/laya/multilingual
LAYA_BACKEND=auto
```

然后照常运行 `npm run setup`、`npm start`。目录需包含 `model.safetensors`、`rl_agent_config.json`、`encoder/config.json`、`tokenizer/tokenizer.json` 和 `tokenizer/tokenizer_config.json`。安装脚本发现已有模型时不再下载权重。中文请使用 **multilingual** checkpoint；默认不会自动切换到英文模型。

`LAYA_BACKEND=torch` 可强制 CPU，需要重新运行 `npm run setup` 安装对应依赖。端口冲突时修改 `PORT`，或修改 `LAYA_URL=http://127.0.0.1:其他端口`；统一启动仅支持本机地址。不要把本地服务暴露到公网。

## 原项目功能与本地模型的区别

保留了聊天解析、增量分析、历史事件、六维加权合成、拒绝优先与等待规则。替换了模型调用、题目表述、上下文选择、启动和缓存身份管理。

- Laya multilingual 总容量为 1,024 tokens，问题与候选也占容量。逐条分析以目标消息为末尾，不让后续回复影响之前的我方评分。
- 长聊天先保留目标、必要历史原话与撤回证据，再按真实 tokenizer 预算加入近期完整消息。总览详情显示实际参考条数。其余聊天仍保存在浏览器中。
- 必要证据本身过长时明确报错，不截断后再显示成功。可缩短单条长消息或分段导入。
- 模型权重、分词器、配置、运行后端和评分版本共同确定缓存身份。旧 Jev 结果或不同模型结果不会直接作为本次分析缓存。
- 浏览器 IndexedDB 保存聊天。推理请求只发到回环地址；正常运行启用离线模式，不调用云模型。首次安装会访问 npm、PyPI/GitHub 与 Hugging Face。

## 已知效果与限制

情绪分类和明确拒绝通常比细粒度意图、回复质量绝对分值、下一步建议稳定。中文反话、含蓄表达、朋友边界及拒绝撤回仍会误判；模型置信度也不是正确率。拒绝优先规则只能修正**被识别出的**拒绝，不能消除漏判。

早期独立验证页的 26 组中文挑战样例：情绪 6/7、意图 6/12、边界 20/21、回复评分区间 2/8、行动建议 2/4；对应英文翻译使用同一多语言模型：6/7、6/12、19/21、3/8、0/4。分母是各类预设检查项数量。这是人工编写的小规模诊断集，**不是产品准确率，也不是与 Jev 的对照结论**。主界面另有上下文与规则处理，不能直接套用这组结果。语料和复测脚本见 [验证说明](laya/README.md)。

## 开发与验证

```bash
npm run dev           # 模型 + API + Vite，打开 http://127.0.0.1:5178
npm test              # 解析、增量、规则、Laya 请求与缓存身份
npm run laya:test     # Python 输入校验、完整消息预算、HTTP 服务
npm run build         # 类型检查与生产构建
npm run check:live    # 已启动模型时，验证真实总览
npm run check:product # 已启动产品时，检查完整 API 流程
```

另有 [本地验证页](http://127.0.0.1:3178/laya-validation)，用于查看模型原始分布；它与主界面评估目的不同。CI 不下载权重，真实模型验证由上述本机命令完成。

## 来源与许可

保留上游项目的 MIT 许可，见 [LICENSE](LICENSE)。本 fork 使用 [Laya](https://github.com/NandhaKishorM/laya)、[Laya-MLX](https://github.com/mizorewww/laya-mlx) 和 [官方模型](https://huggingface.co/convaiinnovations/laya)。模型由原发布者以 Apache-2.0 发布，单独下载；第三方组件遵循各自许可。模型仓库 revision 和后端版本固定在安装文件中。
