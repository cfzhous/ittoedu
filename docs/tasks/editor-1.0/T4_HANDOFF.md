# T4 HANDOFF

- 范围：能力索引当前 `protocols.project = 9`；新增 `validate:course-project`（与 `validate:project` 同入口）；删除 `run-courseware-behavior` 与 `schemas/project-v8.json` 作为当前权威。未改 `PROJECT_SCHEMA_VERSION = 8`。
- 合同是否变化：机器产物与 CLI 文案（工程 Schema 判别器未改）。
- 分支 / SHA：`cursor/t4-capabilities-v9-de5c` `2ad9be7`，已合入集成分支。
- 允许列表外改动：无。
- 最小验证：`npx vitest run tests/unit/aiCapabilities.test.ts tests/unit/validateProject.test.ts` → 15 passed, 4 skipped；`git diff --check` 干净。
- 未验证（交给 T6）：课例冷启动、四格式导出、`courseware-components` 目录不在时 catalog 为 `unavailable`（4 个 skipped）。
- 下游：T6 Builder/导出 Gate。不要依赖已删的 `run-courseware-behavior`。
