# T6-tc-tests HANDOFF

- 范围：修复 `scripts/validate-project.ts` 以及测试文件（`courseProjectCoreContract.test.ts`、`editorStore.test.ts`、`spatialCanvasBackground.test.ts`、`v9SlideProductIntegration.test.tsx`）中过时的类型字面量与断言，使其对齐 V9 / T2 / T3 / T1-B 合并后的语义并消除本卡范围内的 tsc 报错。
- 合同是否变化：否
- 分支 / SHA：`cursor/t6-tc-tests-de5c` (`e9ff5ec21d13e4517b85023c03c11b463f634c30`)
- 允许列表外改动：无
- 最小验证命令与结果：
  1. `npm run typecheck`（退出码 1，本卡 5 个允许文件已全部不在报错列表中，仅剩 T1-A 范围的 `src/player/**`、`src/renderer/ui/**` 与 `tests/unit/publishedComponentMount.test.ts` 错误）
  2. `git diff --check`（退出码 0，无任何输出）
  3. `npx vitest run tests/unit/courseProjectCoreContract.test.ts tests/unit/editorStore.test.ts tests/unit/spatialCanvasBackground.test.ts tests/unit/v9SlideProductIntegration.test.tsx`（退出码 0，4 个测试文件全部通过，80 passed）
- 剩余 tsc 错误文件（全部属于 T1-A / 宿主 / Published 合同范围，按规则保留现场不越界修改）：
  - `src/player/surfaces/flow/FlowSurfaceHost.ts`
  - `src/player/surfaces/publishedComponentMount.ts`
  - `src/player/surfaces/spatial/SpatialSurfaceHost.ts`
  - `src/renderer/ui/FlowWorkspace.tsx`
  - `tests/unit/publishedComponentMount.test.ts`
- 未验证（交给 T6）：全量 `npm test`、`npm run test:e2e`、`npm run build:desktop` 等全量套件。
- 停下来的原因（若有）：所有本卡范围修复已完成，剩余类型错误均在 T1-A 防火墙保护文件内。
- 下游：等待 T1-A 合入后解除剩余 `src/player/**` 与 `publishedComponentMount` 类型报错，推进全量 T6 验证。
