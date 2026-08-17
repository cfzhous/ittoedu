# V9 编辑器无降级完整化：并发任务索引

> 状态：任务包已就绪，尚未执行
> 唯一长期总纲：[`COURSEWARE_DEVELOPMENT_PLAN.md`](../../../COURSEWARE_DEVELOPMENT_PLAN.md)
> UI 基准：[`V9_EDITOR_UI_DESIGN_SPEC.md`](../../../V9_EDITOR_UI_DESIGN_SPEC.md) 与根目录五张 `V9_EDITOR_UI_*` 图片
> 全量验证所有者：仅 `T12`

本目录是执行入口，不是第二份产品计划。任何任务描述与根总纲、当前 Schema 或源码事实冲突时，先停止并提交 `DECISION_REQUEST`，不得自行改写产品方向。

## 1. 最终目标

在 Course Project V9 单一工程真相上恢复不低于 V8 的编辑器表面，并完整接通 Slide、Flow、Spatial、Mixed、全局层、教师控制台、声音、Player 与导出。中间任务采用最小验证；所有全量测试、构建和三视口视觉门禁只在最终整合完成后统一运行。

## 2. 执行前必读

每个执行模型必须依次阅读：

1. 根目录 [`AGENTS.md`](../../../AGENTS.md)；
2. [`COURSEWARE_DEVELOPMENT_PLAN.md`](../../../COURSEWARE_DEVELOPMENT_PLAN.md)；
3. [`01_SHARED_CONTRACT.md`](01_SHARED_CONTRACT.md)；
4. 自己领取的唯一任务文档；
5. `PROJECT_COGNITION_INDEX.md` 中与该任务有关的入口。

不得把 `docs/plans/AI_NATIVE_*`、M3–M8 阶段计划或历史评估报告当作当前指令；它们只可用于取证。

## 3. 波次与依赖

| Wave | 可执行任务 | 并发规则 | 进入条件 |
|---|---|---|---|
| 0 | `T01` 基线与供体审计 | 串行 | 立即开始 |
| 1 | `T02` 动作路由、`T03` 课程结构、`T04` 右键/图层 UI | 三者可并行 | `T01` 交付基线与供体矩阵 |
| 2 | `T05` Slide、`T06` 全局层/控制器/声音、`T07` Flow、`T08` Spatial、`T09` Player/导出、`T09A` 高级作者能力、`T09B` 工程生命周期 | 七者可并行；严格文件独占 | Wave 1 合同冻结 |
| 3 | `T10` 中央集成与 Mixed | 串行 | T02–T09B 全部交付或明确豁免 |
| 4 | `T11` 体验清单与事实文档 | 串行 | T10 成为 integration candidate |
| 5 | `T12` 最终全量 Gate | 串行，唯一全量入口 | T11 完成 |

## 4. 任务清单

| ID | 文档 | 主要产出 | 状态 |
|---|---|---|---|
| T01 | [`02_BASELINE_AND_DONOR_AUDIT.md`](02_BASELINE_AND_DONOR_AUDIT.md) | 安全恢复基线、V8/V9 缺口与 Git 供体矩阵 | READY |
| T02 | [`03_ACTION_ROUTING_AND_SELECTION.md`](03_ACTION_ROUTING_AND_SELECTION.md) | 统一 selection snapshot、动作可用性与入口路由合同 | WAIT_T01 |
| T03 | [`04_COURSE_STRUCTURE_AND_LAYOUT_POLICY.md`](04_COURSE_STRUCTURE_AND_LAYOUT_POLICY.md) | 三类空白创建、Pure/Mixed 推导、课程树模型 | WAIT_T01 |
| T04 | [`05_CONTEXT_MENU_AND_LAYER_UI.md`](05_CONTEXT_MENU_AND_LAYER_UI.md) | 可访问右键菜单与紧凑有效图层 UI 原语 | WAIT_T01 |
| T05 | [`06_SLIDE_V8_PARITY.md`](06_SLIDE_V8_PARITY.md) | Slide 选择/变换/文字/状态/剪贴板无降级 | WAIT_WAVE1 |
| T06 | [`07_GLOBAL_CONTROLLER_AUDIO_AND_LAYERS.md`](07_GLOBAL_CONTROLLER_AUDIO_AND_LAYERS.md) | 可见全局层、控制器、声音、共享层与图层管理 | WAIT_WAVE1 |
| T07 | [`08_FLOW_AUTHORING_AND_RUNTIME_TOC.md`](08_FLOW_AUTHORING_AND_RUNTIME_TOC.md) | Flow 页面—标题层级、就地编辑、运行态目录 | WAIT_WAVE1 |
| T08 | [`09_SPATIAL_AUTHORING.md`](09_SPATIAL_AUTHORING.md) | 无限画布、世界元素、镜头/路径/关系与 Player host | WAIT_WAVE1 |
| T09 | [`10_PLAYER_PUBLISH_AND_EXPORT.md`](10_PLAYER_PUBLISH_AND_EXPORT.md) | 跨 surface Player、控制器运行态、发布与导出一致性 | WAIT_WAVE1 |
| T09A | [`10A_ADVANCED_AUTHORING_REACHABILITY.md`](10A_ADVANCED_AUTHORING_REACHABILITY.md) | 互动/自动化、Runtime/Component、设计令牌和开发入口无降级 | WAIT_WAVE1 |
| T09B | [`10B_PROJECT_LIFECYCLE_AND_COMPATIBILITY.md`](10B_PROJECT_LIFECYCLE_AND_COMPATIBILITY.md) | 新建/打开/保存/另存/恢复、资源 sidecar 与 V8 显式导入 | WAIT_WAVE1 |
| T10 | [`11_CENTRAL_INTEGRATION_AND_MIXED.md`](11_CENTRAL_INTEGRATION_AND_MIXED.md) | 热点文件接线、Mixed 切换、统一快捷键与试运行 | WAIT_T02_T09B |
| T11 | [`12_EXPERIENCE_CHECKLIST_AND_FACT_SYNC.md`](12_EXPERIENCE_CHECKLIST_AND_FACT_SYNC.md) | 最终人工检查清单、事实文档与能力卡同步 | WAIT_T10 |
| T12 | [`13_FINAL_FULL_GATE.md`](13_FINAL_FULL_GATE.md) | 唯一全量自动化与真实体验 Gate | WAIT_T11 |

## 5. 热点文件所有权

以下文件在 Wave 1/2 中一律只读，只允许 `T10` 修改：

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/ui/TopToolbar.tsx`
- `src/renderer/styles/globals.css`

Lane 需要这些文件接线时，提交 `INTEGRATION_REQUEST`，不能越权修改。若当前工作树已含用户修改，所有任务都必须保留并基于真实 diff 工作。

## 6. 能力覆盖对照

| 能力域 | 主 owner | 集成/验证 owner |
|---|---|---|
| Git 基线、V8 donor、回归缺口 | T01 | T12 |
| 统一 selection、右键、Delete、剪贴板动作语义 | T02/T04 | T10/T12 |
| 三类创建、Pure/Mixed、课程树 | T03 | T10/T12 |
| Slide scene/state/画布/文字/公式/变换 | T05 | T10/T12 |
| global/surface、控制器、声音、图层/属性 | T06 | T10/T09/T12 |
| Flow 作者与运行目录 | T07 | T10/T09/T12 |
| Spatial 作者、镜头/路径/关系与 host | T08 | T10/T09/T12 |
| 跨 surface Player、发布和导出 | T09 | T10/T12 |
| 互动/自动化/Runtime/Component/设计令牌/开发 | T09A | T10/T09/T12 |
| 新建/打开/保存/恢复/V8 导入/资源 | T09B | T10/T12 |
| App/store/shell/快捷键/试运行/Mixed 接线 | T10 | T12 |
| 文档、能力卡、人工验收清单 | T11 | T12 |

## 7. 最小验证政策

`T01`–`T11` 只能执行各自文档列出的定向命令。除 `T12` 外，禁止运行：

```text
npm run typecheck
npm test
npm run build
npm run build:desktop
npm run prepare:e2e
npm run test:e2e
npm run verify
npm run verify:full
npm run verify:editor-preservation:visual
全目录 vitest / playwright
```

中间任务不得重捕视觉基线，不得以放宽测试或删除断言换取绿灯。

## 8. 派发模板

把以下文本和单一任务文档交给一个模型：

```text
读取 AGENTS.md、COURSEWARE_DEVELOPMENT_PLAN.md、docs/tasks/v9-editor/00_INDEX.md、01_SHARED_CONTRACT.md，以及你领取的唯一任务文档。只修改该任务授权文件；热点文件只提交 INTEGRATION_REQUEST。保留现有脏工作树，不清理、不覆盖其他改动。只运行任务文档列出的最小验证，严禁全量 typecheck/test/build/E2E。按共享合同的 HANDOFF 模板交付。
```

同一个模型一次只领取一个任务。Wave 2 可以分配给七个独立模型，但不得让两个模型共享同一个独占文件。

## 9. 状态维护

- 协调者只更新本表的 `状态` 与每个任务末尾的交付记录。
- 产品决策只更新根总纲；任务不得自行把 Focusky 级能力、可见 AI、V10 或新框架塞入当前范围。
- `T12` 失败后，只把具体失败回派给文件 owner；修复者仍只跑最小测试，再由 `T12` 统一复跑受影响 Gate。
