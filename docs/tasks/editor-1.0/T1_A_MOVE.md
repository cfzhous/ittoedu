# T1-A 合同源文件迁入 `src/shared/contracts/`

> 状态：**可领取**（本轮冻结收口；必须在重开 T6 全量之前）  
> 并行：可与 [T1-C](T1_C_AUDIT.md)、[T6-tc-tests](T6_TC_TESTS.md) 分树。**不要**再领 [T6-tc-published](T6_TC_PUBLISHED.md)，那张卡并进本任务。  
> 合同变化：允许 Published Flow/Spatial **additive** `backgroundColor?`；不改 Runtime 判别器  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

把 V9 / Published / Component / Runtime / Interaction 的**源文件**迁进 `src/shared/contracts/**`，旧路径改成 re-export 以免全仓库改 import。迁之前先补上 T6 typecheck 暴露的 Published 画布色与组件 import。不拆 `projectTypes.ts` 里的 `SceneNode`。

## 允许修改

```text
src/shared/courseProjectTypes.ts
src/shared/courseProjectSchema.ts
src/shared/publishedCourseTypes.ts
src/shared/publishedCourseSchema.ts
src/shared/componentTypes.ts
src/shared/componentSchema.ts
src/shared/runtimeTypes.ts
src/shared/runtimeSchema.ts
src/shared/surfaceRuntimeTypes.ts
src/shared/interactionTypes.ts
src/shared/interactionSchema.ts
src/shared/contracts/**
scripts/generate-contracts.ts
src/renderer/export/course/buildPublishedCourse.ts
src/player/surfaces/publishedComponentMount.ts
src/player/surfaces/flow/FlowSurfaceHost.ts
src/player/surfaces/spatial/SpatialSurfaceHost.ts
src/renderer/ui/FlowWorkspace.tsx
src/renderer/course/globalLayerCommands.ts
tests/unit/contractsBarrels.test.ts
tests/unit/publishedComponentMount.test.ts
artifacts/contracts/**
docs/contracts/COURSE_PROJECT_V9.md
docs/contracts/V9_COMPATIBILITY_POLICY.md
docs/contracts/EDITOR_1_0_ARCHITECTURE_BOUNDARY.md
docs/tasks/editor-1.0/T1_A_HANDOFF.md
```

机械 import：仅当搬文件后旧相对路径编不过，允许在**同一搬迁 commit**里改被搬文件内部的相对 import。不要顺手改 `App.tsx` / `editorStore.ts` 的业务逻辑。

## 禁止

- 删除 `SceneNode` 或把整个 `projectTypes.ts` 搬进合同桶。
- 改 Runtime 判别器、`LayerFrame.mode`、`PROJECT_SCHEMA_VERSION = 8` 的数值。
- 新增 `projectMode`、可见 AI、Hash/审批。
- 运行 `npm test` / e2e / `build:desktop`。
- 打 tag、宣称 Editor 1.0 已发布。

## 两个 commit

### Commit 1 — T6 typecheck：Published 画布色与挂载 import（先于搬文件）

1. `PublishedFlowSurface` / `PublishedSpatialSurface` 增加可选 `backgroundColor?: string`。不要给 Slide surface 顶层加该字段。
2. `publishedFlowSurfaceSchema` / `publishedSpatialSurfaceSchema` 同步 `backgroundColor: colorSchema.optional()`。
3. `buildPublishedCourse.ts`：flow / spatial 分支**有字段才抄**；省略不要写成 `#ffffff`。
4. `publishedComponentMount.ts` 及其单测：从 `publishedCourseTypes`（或搬迁后的合同路径）引入 `PublishedCourseAsset` / `PublishedCourseComponent` / `PublishedCourseExecutableCode`。
5. `SpatialSurfaceHost.ts` `createWorldItem` 最终 `else`：此时不可能是 `kind === 'component'`，删掉该比较。
6. `FlowWorkspace.tsx`：`find(type === 'flow')` 后先收窄再读 `backgroundColor`。
7. `isTeacherControllerLayerItem`：接受 `DeepReadonly<LayerItem>` 或调用处断言，不要改浮层模型。
8. `npm run generate:contracts`。

### Commit 2 — 真迁移（git mv + 旧路径桩）

目标树（文件名可保留，目录必须在 contracts 下）：

```text
src/shared/contracts/course-project-v9/types.ts    ← courseProjectTypes.ts
src/shared/contracts/course-project-v9/schema.ts   ← courseProjectSchema.ts
src/shared/contracts/published-course-v2/types.ts
src/shared/contracts/published-course-v2/schema.ts
src/shared/contracts/component-v4/types.ts
src/shared/contracts/component-v4/schema.ts
src/shared/contracts/runtime/types.ts
src/shared/contracts/runtime/schema.ts
src/shared/contracts/runtime/surface.ts            ← surfaceRuntimeTypes.ts
src/shared/contracts/interaction-v1/types.ts
src/shared/contracts/interaction-v1/schema.ts
```

1. `git mv`，修正被搬文件内部相对 import（指向仍留在 `src/shared/` 的 `projectTypes` 等）。
2. 旧路径改成一行：`export * from './contracts/...'`，保证现有 `@/shared/courseProjectTypes` 仍然可用。
3. 各 `contracts/*/index.ts` 改为从**本目录** export，不再从 `../../courseProjectTypes`。
4. 新建（只 re-export，不搬 `projectTypes.ts`）：

```text
src/shared/contracts/native-v1/index.ts   ← TextNode / ImageNode / FormulaNode / ShapeNode / VideoNode / TeacherControllerNode 等现有导出
src/shared/contracts/media-v1/index.ts    ← ProjectMediaSettings 与现有媒体类型
src/shared/contracts/design-v1/index.ts   ← ProjectDesignTokens
```

从 `projectTypes.ts` 具名 export。`SceneNode` 不要放进 native-v1 的公开桶（它是内部适配器）。根 `contracts/index.ts` 增加这三个子目录。
5. `scripts/generate-contracts.ts` 的 import 与 `sourceOfTruth` 改成新路径。
6. `docs/contracts/*.md` 里「权威类型在 courseProjectTypes.ts」改成 `src/shared/contracts/course-project-v9/`，并写明旧路径仍是 re-export。
7. `tests/unit/contractsBarrels.test.ts`：断言可从 `native-v1` / `media-v1` / `design-v1` import 至少一个真实符号；`COURSE_PROJECT_SCHEMA_VERSION` 仍为 9。
8. `npm run generate:contracts`（manifest 的 sourceOfTruth 变了）。

## 最小验证（红项优先，禁止全量）

当前 T6 红项是 `typecheck`。`check:contracts` 已绿，但本卡改 `generate-contracts.ts` 的 `sourceOfTruth`，所以 **只在 commit 2 收口时重跑这一条绿命令**。不要跑 `npm test` / e2e / desktop。不要每改一个文件就 typecheck；每个 commit 收口最多一次。

Commit 1 收口：

```powershell
npm run typecheck
git diff --check
```

Commit 2 收口：

```powershell
npm run typecheck
npm run check:contracts
npx vitest run tests/unit/contractsBarrels.test.ts
git diff --check
```

不要跑 `courseProjectRoundTrip.test.ts`，除非你改了 T0 夹具（本卡不要改夹具）。  
`typecheck` 若只剩 [T6-tc-tests](T6_TC_TESTS.md) 允许列表里的文件，**停**，HANDOFF 列出，不要改那张卡的文件。

## 完成判定

- [ ] 合同源文件在 `src/shared/contracts/**`；旧路径只是 re-export
- [ ] `SceneNode` / `projectTypes.ts` 未搬迁
- [ ] 两个 commit
- [ ] 已 push `cursor/t1-a-move-de5c`
- [ ] 有 `T1_A_HANDOFF.md`

## 下游

T1-C 与 T6-tc-tests 合入后重开 T6 全量。
