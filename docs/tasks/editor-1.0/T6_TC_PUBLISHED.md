# T6-tc-published 对齐 Published 类型与宿主

> 状态：**并入 [T1-A](T1_A_MOVE.md)，不要单独领取**  
> 并行：不要单独开工人  
> 合同变化：允许 **additive** 给 Published Flow/Spatial 加可选 `backgroundColor?`（工程侧 T1-E 已有；Published 类型/Schema 漏了）  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

让 `npm run typecheck` 不再报 Published 画布色、组件挂载 import、Spatial `kind === 'component'` 死分支、Flow 联合类型未收窄。不要改 Runtime 判别器。

## 允许修改

```text
src/shared/publishedCourseTypes.ts
src/shared/publishedCourseSchema.ts
src/renderer/export/course/buildPublishedCourse.ts
src/player/surfaces/publishedComponentMount.ts
src/player/surfaces/flow/FlowSurfaceHost.ts
src/player/surfaces/spatial/SpatialSurfaceHost.ts
src/renderer/ui/FlowWorkspace.tsx
src/renderer/course/globalLayerCommands.ts
tests/unit/publishedComponentMount.test.ts
artifacts/contracts/**
docs/tasks/editor-1.0/T6_TC_PUBLISHED_HANDOFF.md
```

改 schema 后必须 `npm run generate:contracts`。不要手写巨大 JSON。

## 禁止

- 改 `courseProjectTypes` / `courseProjectSchema` 的 Runtime 判别器或 `LayerFrame.mode`。
- 改 `App.tsx`、图层树、画布色 UI 接线、P8 挂载策略（只修类型/import/把已有字段抄进 Published）。
- 运行 `npm test` / e2e / `build:desktop`。
- 打 tag、宣称已发布。

## 逐步算法

1. `PublishedFlowSurface` 与 `PublishedSpatialSurface` 增加可选 `backgroundColor?: string`（缺省仍由 `resolveCourseSurfaceBackgroundColor` 当白）。**不要**给 Slide surface 顶层加这个字段。
2. `publishedFlowSurfaceSchema` / `publishedSpatialSurfaceSchema` 同步 `backgroundColor: colorSchema.optional()`，然后 `npm run generate:contracts`。
3. `buildPublishedCourse.ts` 在 `type === 'flow'` 与 spatial 分支把工程 `surface.backgroundColor` **按已有则抄、省略则不要写成 `#ffffff`**（与 P5 缺省不脏写一致）。
4. `publishedComponentMount.ts`（及其单测）从 `publishedCourseTypes` 引入 `PublishedCourseAsset` / `PublishedCourseComponent` / `PublishedCourseExecutableCode`，不要从 `componentTypes` 伪造 export。
5. `SpatialSurfaceHost.ts` `createWorldItem` 的最终 `else`：控制流上此时 `kind` 已不可能是 `'component'`（前面分支已处理）。删掉 `item.kind === 'component'` 比较，填充色用非 component 的后备色。
6. `FlowWorkspace.tsx`：`find(type === 'flow')` 的结果仍是 `CourseSurfaceDocument` 联合。先收窄 `type === 'flow'` 再读 `backgroundColor`。
7. `isTeacherControllerLayerItem(layer.item)`：`layer.item` 是 `DeepReadonly<LayerItem>`。放宽守卫参数，或在调用处断言为 `LayerItem`，不要改浮层模型。

## 最小验证（若误领：红项优先）

本卡不要单独领取。若仍改了这些文件：只跑一次 `npm run typecheck`，以及（仅当改了 schema）一次 `npm run check:contracts`。禁止 `npm test` / e2e / desktop。

若 typecheck 仍只剩测试文件错误，那是 T6-tc-tests 的范围：HANDOFF 列出剩余文件，不要改测试卡的文件。

## 完成判定

- [ ] 本卡允许文件不再出现在 `tsc` 报错里（或 HANDOFF 列剩余全是 tests/validate-project）
- [ ] 合同快照已再生且 `--check` 通过
- [ ] 已 push `cursor/t6-tc-published-de5c`
- [ ] 有 `T6_TC_PUBLISHED_HANDOFF.md`
