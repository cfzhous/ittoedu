# T1-B HANDOFF

- 范围：T1-B 切换生产写入与 T0 夹具至 `canvas-runtime`（API 2）与 `surface-runtime`（API 3），并从 Schema、类型、合同快照与禁止标记扫描白名单中彻底删除 `legacy-runtime-v2`、`legacy-whole-canvas`、`surface-v1`
- 合同是否变化：是（删除旧判别器与旧 frame 模式，同步生成 artifacts/contracts）
- 分支 / SHA：`cursor/t1-b-switch-de5c`
  - Commit 1 (`db07f10`): `feat(courseProject): switch runtime persistence to canvas-runtime and surface-runtime`
  - Commit 2 (`850b1cf`): `feat(schema): remove legacy-runtime-v2, legacy-whole-canvas, and surface-v1 discriminators`
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：
  - `npx vitest run tests/unit/courseProjectCoreContract.test.ts tests/unit/courseProjectRoundTrip.test.ts tests/unit/editor10ForbiddenTokens.test.ts tests/unit/validateProject.test.ts`（4 files passed, 42 tests passed）
  - `npx vitest run tests/unit/v9SlideContentCommands.test.ts tests/unit/spatialWorkspaceAuthoring.test.ts tests/unit/buildPublishedCourseV2.test.ts`（3 files passed, 18 tests passed）
  - `npm run check:contracts`（合同 JSON 快照已是最新状态；共 4 个合同产物文件通过校验）
  - `git diff --check`（无输出，干净）
- 未验证（交给 T6）：全量 test / typecheck / e2e / build:desktop
- 停下来的原因（若有）：无
- 下游：T6 冻结切片（全量验证与发布准备）
