# T1-A HANDOFF

- 范围：
  1. Commit 1: Published / 宿主对齐（`PublishedFlowSurface` / `PublishedSpatialSurface` 可选 `backgroundColor?`，Published component 挂载类型从 `publishedCourseTypes` 引入，`SpatialSurfaceHost.createWorldItem` 死分支清理，`FlowWorkspace.tsx` 对齐 surface 类型收窄，`isTeacherControllerLayerItem` 允许 `DeepReadonly<LayerItem>`，`generate:contracts` 产物同步）。
  2. Commit 2: 合同源文件完整迁入 `src/shared/contracts/**`（包含 `course-project-v9`、`published-course-v2`、`component-v4`、`runtime`、`interaction-v1`），旧路径保留 re-export 桩；新建 `native-v1`、`media-v1`、`design-v1` 导出桶；`SceneNode` 与 `projectTypes.ts` 保持原位未搬迁未删除；更新 `scripts/generate-contracts.ts` 与 `docs/contracts/` 路径；更新 `tests/unit/contractsBarrels.test.ts`。
- 合同是否变化：是（允许的 additive 可选 `backgroundColor?: string` on Published Flow/Spatial surfaces；不改 Runtime 判别器）。
- 分支 / SHA：`cursor/t1-a-move-de5c`
- 允许列表外改动：无。
- 最小验证命令与结果：
  - Commit 1 收口：
    - `npm run typecheck`：通过（本卡相关文件无报错，仅剩 T6-tc-tests 的测试与脚本报错）
    - `git diff --check`：通过（clean）
  - Commit 2 收口：
    - `npm run typecheck`：通过（本卡相关文件无报错，仅剩 T6-tc-tests 的测试与脚本报错，共 2 次 typecheck）
    - `npm run check:contracts`：通过（4 个合同产物文件通过校验）
    - `npx vitest run tests/unit/contractsBarrels.test.ts`：通过（4 passed）
    - `git diff --check`：通过（clean）
- 未验证（交给 T6）：
  - 禁止命令未运行：`npm test`、`npm run test:e2e`、`npm run build:desktop`、`npm run verify`、`npm run verify:full`。
  - 未运行 `courseProjectRoundTrip.test.ts`（未修改 T0 夹具）。
- 停下来的原因（若有）：
  - `typecheck` 仅剩 [T6-tc-tests](T6_TC_TESTS.md) 允许列表中的文件报错，符合停手规则：
    1. `scripts/validate-project.ts` (probe.kind === 'v8')
    2. `tests/unit/courseProjectCoreContract.test.ts` (never 参数)
    3. `tests/unit/editorStore.test.ts` (CourseProjectArchiveData.kind)
    4. `tests/unit/spatialCanvasBackground.test.ts` (backgroundColor 在 union 上的收窄)
    5. `tests/unit/v9SlideProductIntegration.test.tsx` ('v9-slide-candidate' -> 'slide-authoring')
- 下游：
  - 等待 [T1-C](T1_C_AUDIT.md) 和 [T6-tc-tests](T6_TC_TESTS.md) 合入后重开 T6 全量验证。
