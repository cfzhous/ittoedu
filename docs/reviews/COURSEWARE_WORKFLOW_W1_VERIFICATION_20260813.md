# 课件工作流 W1 验证记录（2026-08-13）

> 历史证据。当时的 `build-project-v8-courseware` 已从仓库删除；现行 Builder 是 `build-courseware-project`，工程格式是 Course Project V9。本记录中的测试数字不得称为当前基线。

## 结论

W1-0–W1-5 的仓库实现、受管用户安装和自动化门禁已完成，当前结果等级为 `engineering candidate`。W2 的两个冷启动课例已建立独立决策草案，但尚未收到有效人类回答、批准或进入成品实现。本记录不代表任何全新课例已经通过真实课堂产品验收；指定人类审阅和 W3 内部正式版验收仍是后续门禁。

## 已完成范围

- 相邻 `courseware-cases` 仓保存两个历史课例及原状态，迁移清单覆盖 178 个文件、64,818,336 字节且逐文件 SHA-256 零差异；迁移基线提交为 `22837e38382d32376fa821afd139144daca1bcfb`，加入 W2 决策草案后的当前提交为 `e66dcfa`。
- `orchestrate-courseware` 升级为 V2 薄核心：最小三文件、`fast | standard | high-risk`、嵌入决策、精确 review scope、级联失效、V1 原字节保留迁移和校验器派生 `implementation-ready`。
- 新 `build-project-v8-courseware` 只使用 Project V8 / Runtime API 2 / Runtime Authoring 1 / Component API 4，通过 Capability Index 的真实 TypeScript 入口构建，不提供影子 Project DSL。
- Authoring Inventory 使用 scene/global 复合稳定绑定，绑定当前呈现脚本、Capability Index 和 `derivedReadiness.exactContentLocations`；会话期 `registered:*`、`dom:*` 和 `targetId` 被拒绝。
- 证据门禁检查真实 `.h5lesson`、HTML、网页包、PDF、PPTX、图片和录屏容器，要求 Project 场景与 `sceneEvidence` 一致、互动幕三帧、静态幕稳定帧，并拒绝重复路径、重复帧字节和自动化验收身份。
- 当前 `.agents` 安装已事务性迁移到编排 V2 + V8 Builder，受管理 V7 已安全退场，幂等重装通过。`.codex` 下另有一份清单外 V7，其树哈希 `975b1127475df849f558d3f9e1b434f5948592c0ccd7fbe97931feb72e3f122d` 等于历史官方发布树；按“非受管内容不静默覆盖/删除”原则等待用户处置。
- 两类前向夹具覆盖原生 FormulaNode、Runtime/Hybrid、高风险隐藏/成功/错误稳定态、640×360 有意义静态后备和 stable-ID Patch；完整端到端夹具真实走过 V2 审批/readiness、Builder 初始化、TypeScript 构建、V8 archive/reopen、人工编辑模拟、局部 Patch 和二次验证。夹具证据保持 `placeholder`，不冒充 W2 产品证据。
- `request_user_input` 已在当前宿主直接调用；用户有效回答为空。数学与语文各一份高风险 V2 决策草案已独立落盘，保留未解决的 blocking decisions、占位内容和 `not-ready` 派生状态，没有把推荐项伪造成用户选择或批准。

## 验证命令与结果

| 检查 | 结果 |
| --- | --- |
| `npm run --silent check:ai-capabilities` | 通过；索引 6327 / 16384 字节，组件目录 `available` |
| `npm run --silent typecheck` | 通过；Renderer / Electron / E2E 三配置 |
| `npm run --silent test` | 通过；129 个文件 / 801 项测试 |
| Electron E2E | 27 / 27 通过；渲染基准 1 / 1、组件矩阵 2 / 2、编辑器真实流程 24 / 24。默认串行套件超过调用层 10 分钟等待预算，拆分同一三个测试文件完成核验；最慢文件 19.3 分钟 |
| `npm run --silent build:desktop` | 通过；Player、Renderer、Electron 生产构建完成；仅保留既有 bundle size / `inlineDynamicImports` 警告 |
| `python -X utf8 -m unittest discover -s .agents/skills/orchestrate-courseware/tests -v` | 15 / 15 通过 |
| Builder / evidence 目标测试 | 4 个文件 / 15 项通过 |
| `npm run --silent install:courseware-skills` | 首次迁移通过；第二次报告两 Skill already current |
| `git diff --check` | 通过 |

Vitest 中出现的 jsdom `HTMLCanvasElement.getContext()` 未实现输出是既有测试环境提示；本轮 801 项测试全部通过，未把该提示当作浏览器或产品视觉证据。

## 尚未解除的门禁

1. 用户回答并确认 W2 草案中的两个主题、面向对象、时长、互动机制和指定人工审阅人；当前 blocking decisions 不得由自动化代答。
2. 处置 `.codex/skills/build-project-v7-courseware` 的清单外副本；未获授权前不得擅自删除或接管。
3. 两个全新课例分别完成真实 Editor/Player 编辑闭环、单 HTML、网页包、PDF、PPTX、逐幕帧、contact sheet、核心互动录屏和人类成品意见。
4. 只有指定人类基于精确 evidence scope 明确接受，课例才可写成 `accepted`；自动化最高为 `engineering candidate`。
5. W3 的 Electron E2E 与桌面生产构建已通过；仍需干净 Windows 启动、组件/工程离线移动、正式版文档审计，以及以前四项为前提的人类产品接受。
