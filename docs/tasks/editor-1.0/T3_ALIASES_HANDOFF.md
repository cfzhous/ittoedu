# T3_ALIASES HANDOFF

- 范围：移除 `slideBackendPort.ts` 与 `editorStore.ts` 中残留的 `candidate` 函数别名（`isV9SlideCandidateBackend`、`isSlideCandidateBackend`、`executeSlideCandidateCommand`、`selectSlideCandidateBackend`、`selectSlideCandidateDocument`），并更新 `tests/unit/v9SlideBackendSelection.test.ts`。未改 session 字段名（`slideCandidateSnapshot`、`slideCandidateSidecar`、`slideCandidateEffectiveLayers`、`v9ContentEdit` 等），未改 `canvasMode`、背景色与新建工程运行时协议。
- 合同是否变化：否
- 分支 / SHA：`cursor/t3-aliases-de5c` / `2fbd4b67a6fae77fb2a95ab7dd8f1aaaea172947`
- 允许列表外改动（必须空，除非重命名机械 import）：空
- 最小验证命令与结果：`npx vitest run tests/unit/v9SlideBackendSelection.test.ts`（3 passed, 100% 通过）
- 未验证（交给 T6）：全量测试套件、类型检查及其他引用 `selectSlideCandidate*` 的 UI/测试文件（如 `App.tsx`、`Workspace.tsx`、`PropertiesTab.tsx` 等外部引用需在对应任务/T6 统一推进）。
- 停下来的原因（若有）：无
- 下游：T6-scan 可从白名单中移除非必要的别名项，T1-B 可以无别名冲突地推进 `editorStore.ts`。
