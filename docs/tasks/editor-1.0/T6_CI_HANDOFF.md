# T6-CI HANDOFF

- 范围：新建 GitHub Actions 工作流 `.github/workflows/check-contracts.yml`，在 `push` 与 `pull_request` 时自动运行 `actions/checkout@v4`、`actions/setup-node@v4`（node-version 24，cache npm）、`npm ci` 与 `npm run check:contracts`。不包含 typecheck、test、e2e 或 build:desktop。
- 合同是否变化：否
- 分支 / SHA：`cursor/t6-ci-de5c`
- 允许列表外改动（必须空，除非重命名机械 import）：无（仅允许列表内的 `.github/workflows/check-contracts.yml` 和 `docs/tasks/editor-1.0/T6_CI_HANDOFF.md`）
- 最小验证命令与结果：
  - `npm run check:contracts`：通过（合同 JSON 快照已是最新状态；共 4 个合同产物文件通过校验）
  - `git diff --check`：通过（干净无错误）
- 未验证（交给 T6）：全量类型检查、全量 Vitest 测试、E2E 测试与 Desktop 构建（属于 T6 冻结切片范围）
- 停下来的原因（若有）：无
- 下游：T6 冻结切片后续在 CI 中按需扩展全量测试与构建验证
