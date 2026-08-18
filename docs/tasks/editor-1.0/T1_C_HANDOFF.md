# T1-C HANDOFF

- 范围：审计 `CourseProjectDocument` 顶层字段，确认无 `projectMode`、无未受管 AI JSON 或审批证据字段；为 `PROJECT_SCHEMA_VERSION` 添加注释明确其为历史 V8 形状常量（保持数值 8 不变）；增加顶层字段审计单测 `tests/unit/courseProjectTopLevelFields.test.ts`；更新文档 `docs/contracts/COURSE_PROJECT_V9.md` 顶层字段章节。
- 合同是否变化：否（无删除；顶层已是 `.strict()` 且字段全为合法产品字段，已加未知字段测试与常量注释）。
- 分支 / SHA：`cursor/t1-c-audit-de5c`
- 允许列表外改动：无
- 最小验证命令与结果：
  - `npx vitest run tests/unit/courseProjectTopLevelFields.test.ts`（通过：1 文件，5 测试全部通过，877ms）
  - `git diff --check`（输出干净，无空白或冲突标记问题）
  - （注：按任务防火墙指令，严格未运行 `npm run typecheck`、`npm test`、`npm run test:e2e`、`npm run build:desktop`、`npm run verify`、`npm run verify:full`）
- 未验证（交给 T6）：
  - T6 全量验证序列（`check:contracts` -> `typecheck` -> `npm test` -> `build:desktop` -> `test:e2e`）
- 停下来的原因（若有）：无，T1-C 任务已完整就绪。
- 下游：与 T1-A、T6-tc-tests 一并合入后重开 T6 全量。
