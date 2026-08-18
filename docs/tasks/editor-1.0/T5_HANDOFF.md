# T5 HANDOFF

- 范围：
  - 新建 `src/renderer/course/read-model/index.ts`，作为内部 Read Model / 投影与适配器的隔离导出入口。
  - 修改 `src/renderer/ui/NodesTab.tsx` 的 import 路径，改为从 `../course/read-model` 引入 `courseLayerItemToSceneNode` 与有效图层投影类型及辅助函数。
  - 保持 `groupedVisualRows` 逻辑与 P7 一致（控制器仅出现在「全局」分组）。
  - 新增 `tests/unit/readModelBoundary.test.ts`，断言 `NodesTab.tsx` 源码不直接 import `courseProjectArchive`、`courseProjectMigration` 或未隔离的投影模块。
- 合同是否变化：否
- 分支 / SHA：`cursor/t5-read-model-de5c`
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：
  - `npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx tests/unit/readModelBoundary.test.ts` (PASS: 2 files, 10 tests)
  - `git diff --check` (PASS: 0 issues)
- 未验证（交给 T6）：
  - 全量测试 (`npm test`)、Typecheck (`npm run typecheck`)、E2E 测试 (`npm run test:e2e`)、Desktop 构建 (`npm run build:desktop`)
- 停下来的原因（若有）：无
- 下游：T6 全量验证与扫描
