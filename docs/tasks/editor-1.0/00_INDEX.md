# Editor 1.0 收尾任务包

> 执行入口。总纲：[COURSEWARE_DEVELOPMENT_PLAN.md](../../../COURSEWARE_DEVELOPMENT_PLAN.md) 12.2  
> 共享约束：[01_SHARED.md](01_SHARED.md)  
> 更新日期：2026-08-18  
> 已锁定：删除 V8 导入，不保留密封导入器。  
> 12.2：增加车道 P（教师可见缺陷 P1–P7）。合同冻结仍是 T0–T6。

本包取代已删除的 `docs/tasks/v8-to-v9-rebuild/**`。不要领取 R0–R8，不要从 `f272756` 再开 worktree。

## 当前产品

Course Project V9 已是默认工程真相。本包同时做两件事：合同冻结（车道 C），以及 2026-08-18 定位的试运行/媒体/课程树/画布底色收口（车道 P）。未完成冻结、P 车道视觉复核与教师 `accepted` 前，不得宣称 Editor 1.0 已发布。

## 卫生清理（12.1 已完成，不要重做）

- 删除 `docs/tasks/v8-to-v9-rebuild/**`
- 删除 `.agents/skills/build-project-v8-courseware/**` 及其专用测试
- 删除 `MULTI_SURFACE_DEVELOPMENT_PLAN.md`、根目录评估稿、过时 Skill 重构方案
- 文档与索引改为：当前格式是 V9；打开非 9 的 `.h5lesson` 为不受支持；执行入口是本任务包

代码里的导入 UI、migration、双后端、`project: 8` 能力产物仍在，由 T2–T4 删除或改写。

## 并行规则

两条车道。**不要**把 P 的 UI 修进行 T1/T6 的合同提交。

```text
车道 C 合同
T0  串行（基线、tag、V9 夹具、工作区已有产品补丁先收口）
 │
 ▼
T1  串行（独占 courseProject*；含 Spatial/Flow 可选 backgroundColor）
 │
 ├──────────────┬──────────────┐
 ▼              ▼              ▼
T2 删 V8 导入   T4 能力链/CLI  T3 单后端   ← 三个独立 worktree 可并行
                               │           ← 同一 worktree 内 T2 与 T3 都碰 editorStore，禁止同时改
                               ▼
                              T5 Read Model（T3 之后；与 P7 抢 NodesTab）
 │
 ▼
T6  全量验证（T2–T5 与 P1–P7 全部完成后，只此一次）


车道 P 教师可见（12.2 定位）
不阻塞 T0 夹具；T0 未提交的控制器/图层补丁先收口，再领会碰同一文件的 P 任务。
T1 未合入前，P5 只允许 CSS 默认白，不写新持久化字段。

P1 运行宿主 ─┬─ 建议先于 P2（否则跳转时仍无法点控制器）
P3 Flow 编辑媒体 ─┤  与 P1 分文件，可并行
P4 Spatial 编辑 ──┤  与 P1 抢 SpatialSurfaceHost 时：先 P1 再 P4
P6 课程树 ────────┤  可与 P1 并行；Store 接线与 T3/P2 互斥
P7 图层控制器 ────┘  可与 P1 并行；与 T5 抢 NodesTab

P2 Mixed 保留试运行   ← 独占 editorStore 激活路径；与 T3、P6 的 Store 接线互斥
P5 画布底色           ← CSS 可与 P4 并行；持久化属性等 T1 字段
```

| 任务 | 并行 | 依赖 | 独占热点 |
|---|---|---|---|
| [T0](T0_BASELINE.md) | 否 | 无 | 无 Schema 改动；先处理未提交产品补丁 |
| [T1](T1_SCHEMA.md) | 否 | T0 | `courseProjectSchema.ts`、`courseProjectTypes.ts`、`courseProjectModel.ts` |
| [T2](T2_REMOVE_V8.md) | 可与 T3/T4 分树并行 | T1 | `courseProjectArchive.ts`、`App.tsx` 导入 UI、`createCourseProject.ts`、migration |
| [T3](T3_BACKEND.md) | 可与 T2/T4 分树并行 | T1 | `editorStore.ts` 后端分支、`slideBackendPort.ts`、`v9SlideVerticalSlice.ts` |
| [T4](T4_CAPABILITIES.md) | 可与 T2/T3 并行 | T1 | `scripts/generate-ai-capabilities.ts`、`scripts/validate-project.ts`、`artifacts/ai-capabilities/**` |
| [T5](T5_READ_MODEL.md) | 否 | T3；与 P7 互斥同改 | 新建 `src/renderer/course/read-model/`；不重写 Workspace；**保留 P7 图层分组** |
| [P1](P1_PLAYBACK_HOSTS.md) | 可与 P3/P6/P7/T2/T4 分树 | T0 补丁收口 | `SlidePublishedAdapter.ts`、`FlowSurfaceHost.ts`、`SpatialSurfaceHost.ts`、`publishedDynamicHosts.ts` |
| [P2](P2_TRYRUN_LOCATION.md) | 否（相对 T3/P6-store） | 建议 P1 | `editorStore.ts` 的 `activateCourseLocation` / `apply*Backend` |
| [P3](P3_FLOW_EDIT_MEDIA.md) | 可与 P1 并行 | T0 若已改 FlowWorkspace 则接在其后 | `FlowWorkspace.tsx` |
| [P4](P4_SPATIAL_EDIT_MEDIA.md) | 与 P1 抢 Spatial host 时串行 | 建议 P1 后 | `Workspace.tsx` Spatial 层、`stageViewportTransform.ts`、`SpatialSurfaceHost.ts`（若 P1 未改视频） |
| [P5](P5_CANVAS_BACKGROUND.md) | CSS 可并行；字段等 T1 | T1（持久化） | `globals.css`、Spatial/Flow 属性、宿主背景 |
| [P6](P6_COURSE_TREE.md) | UI 可与 P1 并行 | 无 | `ScenePanel.tsx`、`AddCourseContentMenu.tsx`、`courseLocationCommands.ts`；Store 接线避开 T3/P2 窗口 |
| [P7](P7_LAYER_CONTROLLER.md) | 可与 P1 并行；与 T5 互斥同改 | 无 | `NodesTab.tsx` |
| [T6](T6_FREEZE.md) | 否 | T2–T5 **和** P1–P7 | CI、合同哈希、教师验收 |

同一 worktree 若要连续做 T2 与 T3：先 T2 再 T3。同一 worktree 若 P2 与 T3 都要改 `editorStore`：先 T3 再 P2（P2 只改激活路径上的 `canvasMode`，不要回退 T3 命名）。P7 与 T5：先 P7 再 T5，或 T5 只改 import 并在 HANDOFF 声明未动分组。

不要同一提交改 Schema 判别器和教师可感知 UI。T1 的 `backgroundColor?` 与 P5 接线必须两个提交。

## 验证规则

每个任务只跑该文件「最小验证」列出的 1–2 个 Vitest 文件，外加一次对本任务 diff 的 `git diff --check`。

禁止在 T0–T5 与 P1–P7 运行：`npm test`、`npm run typecheck`、`npm run test:e2e`、`npm run build:desktop`、`npm run verify`、`npm run verify:full`。

**全量验证只在 T6。** 中间发现的类型/构建风险写入 HANDOFF，交给 T6。P 车道的课例视觉复核也等到 T6 前集中做，中间最多记「工程上已接线」。

## 领取方式

1. 读 [01_SHARED.md](01_SHARED.md) 和本任务卡。
2. `git status --short`：不属于本任务的改动一律保留。
3. 只改本任务「允许修改」的文件；热点文件冲突时停下来，不要抢。
4. 完成后写短 HANDOFF：范围、合同是否变化、跑了哪条最小验证、未验证项、回滚点、下游依赖。
