# T0 HANDOFF

- **范围**：新建 `tests/fixtures/course-project-v9/` 永久 V9 归档夹具（10 个可打开 `.h5lesson`），并把 `tests/unit/courseProjectRoundTrip.test.ts` 接到这些文件。未改 Schema，未开始 P1–P7，未删除 `tests/fixtures/courseware-v8/`，未打 `pre-v9-contract-freeze` tag。
- **合同是否变化**：否。
- **最小验证**：`npx vitest run tests/unit/courseProjectRoundTrip.test.ts`；对本任务 diff 跑 `git diff --check`。
- **未验证**：typecheck、全量 Vitest、e2e、desktop build（按任务卡留给 T6）。
- **回滚点**：本分支 `cursor/t0-v9-fixtures-de5c` 的夹具提交；丢弃夹具目录与 round-trip 接线即可回退。
- **下游**：T1 可以开始独占 Schema。Tag `pre-v9-contract-freeze` 由父任务在收口提交上打。T2 把通用保存/导出/恢复迁到本目录后再删 V8 夹具。
