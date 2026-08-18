# T1-D HANDOFF

- 范围：创建 `scripts/generate-contracts.ts`，导出 Course Project V9、Published Course V2 和 Component Manifest 的 JSON Schema 快照到 `artifacts/contracts/`，在 `package.json` 添加 `generate:contracts` 和 `check:contracts` 脚本。
- 合同是否变化：否（仅快照当前 Schema，未改任何判别器或 Schema 源码）。
- 分支 / SHA：`cursor/t1-contracts-gen-de5c`
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：
  - `npx tsx scripts/generate-contracts.ts`：通过，生成 4 个文件（3 个 schema JSON + 1 个 manifest JSON）
  - `npx tsx scripts/generate-contracts.ts --check`：通过，验证磁盘字节一致
  - `git diff --check`：通过，无空白异常
- 未验证（交给 T6）：
  - T6 冻结时把 `npm run check:contracts` 接到 GitHub Actions CI。
  - 全量 test / typecheck / e2e。
- 停下来的原因（若有）：无
- 下游：
  - T6 冻结任务可将 `npm run check:contracts` 接到 CI 门禁。
  - 后续 T1-B 若清理 `legacy-*` 判别器需重新运行 `npm run generate:contracts`。
- 备注说明：
  - Zod 4 `z.toJSONSchema` 在处理 `courseProjectDocumentSchema` 和 `publishedCourseV2Schema` 时，由于内部辅助验证使用了 refine / transform 管道，在默认 `unrepresentable: 'throw'` 下会抛出 "Transforms cannot be represented in JSON Schema"。因此生成脚本传递了 `{ unrepresentable: 'any' }` 参数，成功输出完整的 JSON Schema 规范定义。
