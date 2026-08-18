# T3 HANDOFF

- **范围**：
  - 重命名 `SlideCandidateBackend` → `SlideAuthoringBackend`，`createSlideCandidateBackend` → `createSlideAuthoringBackend`。
  - 文件重命名：`src/renderer/course/v9SlideVerticalSlice.ts` → `slideAuthoringBackend.ts`，`src/renderer/store/v9SlideUiProjection.ts` → `slideEditorProjection.ts`。
  - 删除/坍缩 `V8SlideBackend`、`V8_SLIDE_BACKEND`、`SLIDE_BACKEND_DUAL_WRITE_REFUSED`、`getSlideBackendKind()` 的 `v8` 臂。
  - Store 始终持有单一 V9 Course Project 文档与单一 `slide-authoring` 后端，不再维护候选状态与双写拒绝。
  - 更新 `tests/unit/v9SlideBackendSelection.test.ts`、`tests/unit/v9SlideViewportAdapter.test.ts` 及相关测试至单一文档事务断言。
  - 保留 P2 的 Mixed 试运行 `canvasMode` 保持逻辑与手势行为。
- **合同是否变化**：否（纯内部命名与后端收口，无 Schema 判别器变动，教师手感不变）。
- **最小验证**：
  - `npx vitest run tests/unit/v9SlideBackendSelection.test.ts` (PASS: 3/3)
  - `npx vitest run tests/unit/v9SlideViewportAdapter.test.ts` (PASS: 8/8)
  - `npx vitest run tests/unit/tryRunLocationMode.test.ts` (PASS: 2/2)
  - `git diff --check` (PASS)
- **未验证**：全量测试、Typecheck、E2E 测试、Desktop 构建（按 01_SHARED / 00_INDEX 约束留给 T6）。
- **回滚点**：`cursor/t3-single-backend-de5c` 起点 `origin/cursor/cloud-agent-1787062947578-owgrj`。
- **下游**：T5 可在正式 `SlideAuthoringBackend` / `slideEditorProjection.ts` 命名上构建 Read Model；T6 全量验证与扫描。
