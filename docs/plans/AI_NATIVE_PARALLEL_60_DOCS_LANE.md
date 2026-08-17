# DOCS lane：文档、Skill 与能力事实收口

> LANE_ID: DOCS
> OWNER_SCOPE: 用户文档、项目认知、课件 Skill、Agent Kit 能力卡
> START_STATE: F1 BLOCKED
> DEPENDS_ON: I1、E2
> REQUIRED_READING: [执行索引](AI_NATIVE_PARALLEL_00_INDEX.md)、[共享合同](AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md)

本 lane 只能在集成候选真实可达后开始。它不负责实现能力，只负责删除过期宣称并把源码事实写清楚。

## F1 — 同步真实可达能力

> TASK_ID: F1
> STATUS: DONE
> DEPENDS_ON: I1、E2

### 允许修改

- `README.md`
- `PROJECT_COGNITION_INDEX.md`
- `COURSEWARE_DEVELOPMENT_PLAN.md` 的完成状态/当前入口
- `AGENTS.md` 中直接声明当前产品路线的窄段落
- `.agents/skills/orchestrate-courseware/**`
- `.agents/skills/build-courseware-project/**`
- `agent-kit/capabilities/index.json`
- `scripts/generate-ai-capabilities.ts`，仅当校验规则本身确需变化
- 新并行计划文档的状态/完成记录

### 禁止修改

- `src/**`、`tests/**`、Schema、IPC
- 历史 donor 文件和旧计划正文；只能明确标为历史/被替代
- 为了让文档成立而修改产品代码

### 事实审计清单

1. 删除或改写暗示以下能力已在编辑器可见的文字：
   - “复制 AI 稳定引用”
   - “应用 AI Patch”
   - 可直接粘贴给 Codex
   - 内置模型、聊天、Provider 或批量 AI 工作流
2. 明确当前状态：
   - 编辑器外 Skill 可从教学 Markdown 构建 V9；
   - 编辑器内没有可见 AI；
   - 只保留未挂载的稳定地址/上下文/单目标预检纯接口；
   - 不声称 AI 精改闭环已可用。
3. 明确全局控制器可从 Slide/Flow/Spatial 当前页修改，但工程中仍只有一个 global item。
4. 明确纯 Slide/Flow/Spatial/Mixed 是从 locations/surfaces 推导，不持久化模式。
5. 只把 I1/E2 已验证的 Flow、壳层、保存、发布与导出能力写成“已支持”。
6. `CourseStudioApp` 等 donor 入口只记录不可达事实，不删除历史文件。
7. 能力卡只保留机器真实可达能力；编辑器 UI 不可达的纯接口标为 internal/reserved，而不是 user workflow。

### 已知需要优先核对的过期表述

- `README.md` 的“编辑与 AI 精确修改”及“复制/应用 AI Patch”描述。
- `PROJECT_COGNITION_INDEX.md` 中“AI 精改闭环”和旧串行执行入口。
- Skill/能力卡中任何把 V8 或可见 AI 当默认路线的说明。

### 最小验证

本 lane 的例外命令只有：

```powershell
npm run check:ai-capabilities
npm run test:agent-kit
git diff --check -- README.md PROJECT_COGNITION_INDEX.md COURSEWARE_DEVELOPMENT_PLAN.md AGENTS.md .agents/skills agent-kit/capabilities
```

不得运行 `npm test`、typecheck、build、E2E 或 `verify:full`。

### 验收

- 所有文档互相一致，并链接到并行执行索引。
- 普通教师文档没有可见 AI 工作流承诺。
- 能力卡 canonical、大小/来源检查通过。
- 没有把测试存在但 UI 不可达的能力写成已上线。

### 交付

按共享合同 §6 交付，并列出“删除的过期宣称 / 新的真实表述 / 源码证据”。

### 停止条件

- 源码与 I1/E2 交付记录冲突。
- 需要删除 donor/历史文件。
- 需要新增产品能力才能让文档成立。

## 11. 交付记录

### F1 交付（2026-08-16）

- 状态：`DONE`（最小验证三条命令全部通过，未运行 typecheck/build/E2E/全量测试）。
- 修改文件：
  - `README.md`：改写“编辑与 AI 精确修改”为“编辑与外部 AI 协作边界”，删除“复制 AI 稳定引用/应用 AI Patch/必须走编辑器事务”等过期宣称；新增教师控制器单副本事实；状态句改为 integration candidate；修正 `current:course-selection` 与 `test:e2e` 描述。
  - `PROJECT_COGNITION_INDEX.md`：路线句由“AI 精改闭环”改为“外部 AI 接口预留（当前不提供编辑器内 AI 精改闭环）”；执行入口指向并行索引；三处生产接线标记已闭合；新增并行收敛完成事实与下一步（Z1/Z2）。
  - `COURSEWARE_DEVELOPMENT_PLAN.md`：CURRENT_STAGE/STATUS 改为 integration candidate；§3.1 机器证据句、§3.2 生产真相缺口→已闭合、§3.3 体验问题处理状态、§7 Now/Next/Then 完成注解（只改状态，不改产品决策正文）。
  - `AGENTS.md`：窄段落明确“编辑器内没有可见 AI；`courseAiHandoff`/`courseAiPatch` 是未挂载纯接口（internal/reserved），不得宣称可用工作流”。
  - `.agents/skills/build-courseware-project/SKILL.md`：删除“应用 AI Patch 导入”与 `current:course-selection` 读编辑器选择的不实说明；磁盘 Patch 仅用于工程已关闭。
  - `agent-kit/capabilities/index.json`：`authoring:stable-patch` 标为 `reserved` 并写明编辑器 UI 不可达；`surface:flow` 作者边界去掉“AI patching”；`export:semantic-static` 增加 App PDF 路径 Slide capture 缺口限制。
  - `docs/plans/AI_NATIVE_PARALLEL_00_INDEX.md`、`60_DOCS_LANE.md`、`90_FINAL_GATE.md`：状态与交付记录更新（F1 DONE；Z1 READY）。
- 最小验证：
  - `npm run check:ai-capabilities` → 通过（12 cards）。
  - `npm run test:agent-kit` → 通过。
  - `git diff --check -- README.md PROJECT_COGNITION_INDEX.md COURSEWARE_DEVELOPMENT_PLAN.md AGENTS.md .agents/skills agent-kit/capabilities` → clean。
- 已知风险：
  - `src/main/ipc.ts`、`src/main/fileDialogs.ts` 仍有孤儿 AI Patch 文件选择 handler 与文案（无 renderer 调用方），`scripts/patch-course-project.ts` 的拒绝文案仍写“应用 AI Patch”——均属产品代码，不在 DOCS lane 允许范围，建议 Z1/集成 lane 清理。
  - `docs/USER_GUIDE.md`、`docs/AI_COURSEWARE_AUTHORING.md` 等文档不在本 lane 允许列表，未逐一核对可见 AI 宣称。
