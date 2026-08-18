# T1-B1 HANDOFF

- 范围：T1-B1 增加新 Runtime 判别器（`canvas-runtime` 与 `surface-runtime`），保留旧判别器（`surface-v1` 与 `legacy-runtime-v2`）
- 合同是否变化：是（纯 additive 增加 enum 值，同步更新 artifacts/contracts）
- 分支 / SHA：`cursor/t1-b1-runtime-discriminators-de5c`
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：
  - `npx vitest run tests/unit/courseProjectCoreContract.test.ts tests/unit/courseProjectRoundTrip.test.ts`（2 files passed, 22 tests passed）
  - `npm run check:contracts`（合同 JSON 快照已是最新状态；共 4 个合同产物文件通过校验）
  - `git diff --check`（无输出，干净）
- 未验证（交给 T6）：全量 test / typecheck / e2e / build:desktop
- 停下来的原因（若有）：无
- 下游：T1-B（生产写入切换与旧判别器清理）
