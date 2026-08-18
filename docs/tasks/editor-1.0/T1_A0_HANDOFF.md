# T1-A0 HANDOFF

- 范围：创建 `src/shared/contracts` 下 5 个子目录及根 barrel 的 re-export 入口与对应单元测试。
  - `src/shared/contracts/course-project-v9/index.ts`
  - `src/shared/contracts/published-course-v2/index.ts`
  - `src/shared/contracts/component-v4/index.ts`
  - `src/shared/contracts/runtime/index.ts`
  - `src/shared/contracts/interaction-v1/index.ts`
  - `src/shared/contracts/index.ts`
  - `tests/unit/contractsBarrels.test.ts`
- 合同是否变化：否
- 分支 / SHA：`cursor/t1-contracts-barrels-de5c`
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：
  - `npx vitest run tests/unit/contractsBarrels.test.ts`：1 passed (3 tests passed)
  - `git diff --check`：clean
- 未验证（交给 T6）：全局类型检查及全量测试套件（按工人协议不执行全量套件）
- 停下来的原因（若有）：无
- 下游：T1-A（实际文件移动与 import 路径迁移）
