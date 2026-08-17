# AI-native 轻量编辑器：剩余工作并行执行索引

> PLAN_VERSION: 2.0
> UPDATED: 2026-08-16
> BASELINE: P0–P2 已完成；P3–P6 尚未完成
> EXECUTION_MODE: 文件独占的并行 lane；最终集成与全量 Gate 串行
> FULL_TEST_POLICY: 所有全量测试只允许在 `Z1` 执行一次
> AI_POLICY: 当前版本不增加任何可见 AI 能力，只保留未接入的纯接口

本文是剩余工作的唯一领取入口。原执行计划中 P0–P2 的完成记录继续有效；原计划 P3–P6 的串行任务描述仅作需求来源，不再作为派发顺序。

## 1. 领取方式

一个执行 AI 只领取一个 lane 文档，并在该 lane 内按顺序完成任务包。除 `SHELL` lane 外，任何 lane 都不得修改 `src/renderer/App.tsx`；需要 App 接线时，只在交付记录中提交一个窄接线请求，由 `SHELL` 或最终集成任务处理。

开始前必须：

1. 读取本索引、[共享合同](AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md)和所领取的 lane 文档。
2. 运行 `git status --short`，保存已有修改，不清理、不覆盖其他工作。
3. 确认所需文件没有被其他 lane 独占。
4. 只领取状态为 `READY` 且依赖已满足的任务包。

## 2. 并行 lane

| Lane | 文档 | 可立即开始 | 独占核心文件 | 产出 |
|---|---|---:|---|---|
| LAYOUT | [10_LAYOUT_POLICY_LANE](AI_NATIVE_PARALLEL_10_LAYOUT_POLICY_LANE.md) | 是 | 新增的布局/壳层纯策略文件及其单测 | 课型与壳层策略纯函数 |
| SHELL | [20_SHELL_UI_LANE](AI_NATIVE_PARALLEL_20_SHELL_UI_LANE.md) | 否，等 LAYOUT | `App.tsx`、`ScenePanel.tsx`、`RightSidebar.tsx`、`TopToolbar.tsx`、`globals.css` | P3 轻量壳层接入 |
| FLOW | [30_FLOW_LANE](AI_NATIVE_PARALLEL_30_FLOW_LANE.md) | 是 | Flow 工作区、Flow 面板及其测试 | P4 就地文本与轻量结构编辑 |
| AI-BOUNDARY | [40_AI_INTERFACE_LANE](AI_NATIVE_PARALLEL_40_AI_INTERFACE_LANE.md) | 是 | `Workspace.tsx` 的遗留 AI 减法、`DesignTokensEditor.tsx`、新增纯接口及测试 | P5 无可见 AI 的接口边界 |
| RELEASE | [50_RELEASE_LANE](AI_NATIVE_PARALLEL_50_RELEASE_LANE.md) | 是，先做 fixture/单测 | export/course、代表样例和其窄测试 | P6 发布/导出事实 |
| DOCS | [60_DOCS_LANE](AI_NATIVE_PARALLEL_60_DOCS_LANE.md) | 否，等集成候选 | README、认知索引、Skill、能力卡生成源 | 只声明真实可达能力 |
| FINAL | [90_FINAL_GATE](AI_NATIVE_PARALLEL_90_FINAL_GATE.md) | 否，最后执行 | 只做集成修补与验证，不承接新功能 | 唯一全量 Gate |

### 2.1 Wave 1 可直接派发文本

把下面四条分别交给四个独立 AI/task；不要把两个 lane 合并给同一个共享上下文：

```text
读取 docs/plans/AI_NATIVE_PARALLEL_00_INDEX.md、AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md 和 AI_NATIVE_PARALLEL_10_LAYOUT_POLICY_LANE.md。只领取 LAYOUT lane，严格按文件独占与最小测试合同执行；不得修改 App/UI，也不得运行 typecheck、build、E2E 或全量测试。
```

```text
读取 docs/plans/AI_NATIVE_PARALLEL_00_INDEX.md、AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md 和 AI_NATIVE_PARALLEL_30_FLOW_LANE.md。只领取 FLOW lane，按 C1→C2→C-G 执行；不得修改 App/Workspace，跨层接线只提交 INTEGRATION_REQUEST；只跑文档列出的最小测试。
```

```text
读取 docs/plans/AI_NATIVE_PARALLEL_00_INDEX.md、AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md 和 AI_NATIVE_PARALLEL_40_AI_INTERFACE_LANE.md。只领取 AI-BOUNDARY lane，先删除遗留可见 AI，再实现未挂载纯接口；禁止新增可见 AI、模型、网络、Clipboard、IPC 或 Store 接线；只跑最小测试。
```

```text
读取 docs/plans/AI_NATIVE_PARALLEL_00_INDEX.md、AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md 和 AI_NATIVE_PARALLEL_50_RELEASE_LANE.md。只领取 RELEASE 的 E1，复用代表 Mixed fixture 做发布/导出定向断言；不得修改编辑器 UI，不运行 build、E2E 或全量测试。
```

## 3. 执行波次

### Wave 1：立即并行

- AI-A：领取 LAYOUT。
- AI-C：领取 FLOW。
- AI-D：领取 AI-BOUNDARY。
- AI-E：领取 RELEASE 的 fixture/定向单测部分。

这四个 lane 的生产文件互不重叠，可在独立 worktree/分支中同时执行。若多个 AI 共享同一工作树，也必须严格遵守文件独占表。

### Wave 2：壳层接入

- LAYOUT 完成后，AI-B 领取 SHELL。
- FLOW、AI-BOUNDARY、RELEASE 未完成的后续包继续各自在原 lane 串行执行。

### Wave 3：窄集成与事实文档

- SHELL、FLOW、AI-BOUNDARY、RELEASE 全部交付后，由 FINAL 的 `I1` 做一次窄集成。
- `I1` 通过后，DOCS 根据此时源码事实更新文档和能力卡。

### Wave 4：唯一全量 Gate

- DOCS 完成后执行 FINAL 的 `Z1`。
- `Z1` 失败时只把失败项回派给文件归属 lane；修复者只跑对应最小测试。
- 所有回派修复合并后，最多再执行一次 `Z1`，不得让每个 lane 自行跑全量。

## 4. 依赖与状态

| Task | 依赖 | 状态 | 可并行组 |
|---|---|---|---|
| A1 课型推导 | P2-G | DONE | Wave 1 |
| A2 左栏策略 | A1 | DONE | LAYOUT 内串行 |
| A3 右栏/术语策略 | A1 | DONE | 与 A2 共用新策略文件，必须由同一 LAYOUT owner 顺序完成 |
| B1 左栏接入 | A2 | DONE | Wave 2 |
| B2 右栏/术语接入 | A3 | DONE | 可与 B1 并行，但同属 SHELL 独占文件时顺序完成 |
| B3 收起与视觉收敛 | B1、B2 | DONE | SHELL 内串行 |
| C1 Flow 就地文本 | P2-G | DONE | Wave 1 |
| C2 Flow 结构收敛 | C1 | DONE | FLOW 内串行 |
| D0 移除可见 AI | P2-G | DONE | Wave 1 |
| D1 稳定上下文纯接口 | D0 | DONE | AI-BOUNDARY 内串行 |
| D2 单目标预检纯接口 | D1 | DONE | AI-BOUNDARY 内串行 |
| D3 批量拒绝边界 | D2 | DONE | AI-BOUNDARY 内串行 |
| E1 Mixed/导出 fixture 与单测 | P2-G | DONE | Wave 1 |
| E2 真实发布导出纵切 | I1 | DONE（清单已交付，Z1 按清单执行） | Final 前 |
| I1 窄集成 | B3、C2、D3、E1 | DONE | 串行 |
| F1 文档/Skill/能力卡 | I1、E2 | DONE | Wave 3 |
| Z1 最终全量 Gate | F1 | DONE（2026-08-17 全绿） | 唯一全量验证 |

## 5. 协调者职责

协调者只做以下事情：

- 分配 lane、维护状态和依赖。
- 审查文件归属及交付记录。
- 在 `I1` 处理窄 App 接线请求和跨 lane 类型问题。
- 在 `Z1` 统一运行全量验证并按归属回派。

协调者不得在 lane 执行期间顺手改其独占文件，也不得因为某个包通过而提前宣称整个产品完成。

## 6. 完成口径

- 每个任务包通过最小测试：只称该包 `engineering candidate`。
- `I1` 通过：只称集成候选。
- `Z1` 全部通过：项目整体可称 `engineering candidate`。
- 真实视觉/互动复核后才可提议 `art candidate`。
- 只有教师明确验收才可称 `accepted`。

## 7. 执行状态（2026-08-16）

- Wave 1–3 全部完成：LAYOUT、FLOW、AI-BOUNDARY、RELEASE（E1/E2 清单）、SHELL、DOCS（F1）均已 DONE；I1 窄集成 DONE（integration candidate）。
- 唯一剩余任务：Z1（全量 Gate，按 [RELEASE lane E2 清单](AI_NATIVE_PARALLEL_50_RELEASE_LANE.md) 执行）与 Z2（真实体验复核）。
