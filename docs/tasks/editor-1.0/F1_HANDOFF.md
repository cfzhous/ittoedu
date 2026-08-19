# F1 HANDOFF
- 范围：`FlowWorkspace` 稿纸闲置态渲染 heading / paragraph / quote / list / table 的 text runs，就地编辑保持 richEditor
- 合同是否变化：否
- 分支 / SHA：cursor/f1-flow-paper-runs-44bf / 35ec7be
- 允许列表外改动（必须空，除非重命名机械 import）：空
- 最小验证命令与结果：`npx vitest run tests/unit/flowWorkspace.test.tsx` (7 passed) + `git diff --check` (clean)
- 未验证（交给 T6）：`npm test`, `typecheck`, `e2e`, `desktop`
- 停下来的原因（若有）：无
- 下游：F2 / F3 / Lane F 集成

