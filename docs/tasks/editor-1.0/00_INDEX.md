# Editor 1.0 收尾任务包

> 执行入口。总纲：[COURSEWARE_DEVELOPMENT_PLAN.md](../../../COURSEWARE_DEVELOPMENT_PLAN.md) 12.1  
> 共享约束：[01_SHARED.md](01_SHARED.md)  
> 更新日期：2026-08-18  
> 已锁定：删除 V8 导入，不保留密封导入器。

本包取代已删除的 `docs/tasks/v8-to-v9-rebuild/**`。不要领取 R0–R8，不要从 `f272756` 再开 worktree。

## 当前产品

Course Project V9 已是默认工程真相。本包做合同冻结、去掉过渡命名、删掉 V8 文件链，然后发布 Gate。未完成冻结与教师 `accepted` 前，不得宣称 Editor 1.0 已发布。

## 卫生清理（本轮已完成，不要重做）

- 删除 `docs/tasks/v8-to-v9-rebuild/**`
- 删除 `.agents/skills/build-project-v8-courseware/**` 及其专用测试
- 删除 `MULTI_SURFACE_DEVELOPMENT_PLAN.md`、根目录评估稿、过时 Skill 重构方案
- 文档与索引改为：当前格式是 V9；打开非 9 的 `.h5lesson` 为不受支持；执行入口是本任务包

代码里的导入 UI、migration、双后端、`project: 8` 能力产物仍在，由 T2–T4 删除或改写。

## 并行规则

```text
T0  串行（基线、tag、V9 夹具、工作区产品补丁先收口）
 │
 ▼
T1  串行（独占 courseProject* 合同文件）
 │
 ├──────────────┬──────────────┐
 ▼              ▼              ▼
T2 删 V8 导入   T4 能力链/CLI  T3 单后端   ← 三个独立 worktree/分支可并行
                               │           ← 同一 worktree 内 T2 与 T3 都碰 editorStore，禁止同时改
                               ▼
                              T5 Read Model（T3 之后）
 │
 ▼
T6  全量验证（T2 + T3 + T4 + T5 全部完成后，只此一次）
```

| 任务 | 并行 | 依赖 | 独占热点 |
|---|---|---|---|
| [T0](T0_BASELINE.md) | 否 | 无 | 无 Schema 改动；先处理未提交产品补丁 |
| [T1](T1_SCHEMA.md) | 否 | T0 | `courseProjectSchema.ts`、`courseProjectTypes.ts`、`courseProjectModel.ts` |
| [T2](T2_REMOVE_V8.md) | 可与 T3/T4 分树并行 | T1 | `courseProjectArchive.ts`、`App.tsx` 导入 UI、`createCourseProject.ts`、migration |
| [T3](T3_BACKEND.md) | 可与 T2/T4 分树并行 | T1 | `editorStore.ts` 后端分支、`slideBackendPort.ts`、`v9SlideVerticalSlice.ts` |
| [T4](T4_CAPABILITIES.md) | 可与 T2/T3 并行 | T1 | `scripts/generate-ai-capabilities.ts`、`scripts/validate-project.ts`、`artifacts/ai-capabilities/**` |
| [T5](T5_READ_MODEL.md) | 否 | T3 | 新建 `src/renderer/course/read-model/`；不重写 Workspace |
| [T6](T6_FREEZE.md) | 否 | T2–T5 | CI、合同哈希、教师验收 |

同一 worktree 若要连续做 T2 与 T3：先 T2 再 T3。不要同一提交改 Schema 判别器和教师可感知 UI。

## 验证规则

每个任务只跑该文件「最小验证」列出的 1–2 个 Vitest 文件，外加一次对本任务 diff 的 `git diff --check`。

禁止在 T0–T5 运行：`npm test`、`npm run typecheck`、`npm run test:e2e`、`npm run build:desktop`、`npm run verify`、`npm run verify:full`。

**全量验证只在 T6。** 中间发现的类型/构建风险写入 HANDOFF，交给 T6。

## 领取方式

1. 读 [01_SHARED.md](01_SHARED.md) 和本任务卡。
2. `git status --short`：不属于本任务的改动一律保留。
3. 只改本任务「允许修改」的文件；热点文件冲突时停下来，不要抢。
4. 完成后写短 HANDOFF：范围、合同是否变化、跑了哪条最小验证、未验证项、回滚点、下游依赖。
