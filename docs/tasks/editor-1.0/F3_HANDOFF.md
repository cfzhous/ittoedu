# F3 HANDOFF

- 范围：替换 `FlowFormulaBlockProperties` 桩实现，选中 Flow formula 块时挂载 `FormulaAuthoringEditor` 并通过 `commitFlowFormulaAst` 提交 AST 与无障碍文本；新增单元测试 `tests/unit/flowFormulaProperties.test.tsx`。
- 合同是否变化：否
- 分支 / SHA：`cursor/f3-flow-formula-props-44bf`
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：`npx vitest run tests/unit/flowFormulaProperties.test.tsx` (1 passed)；`git diff --check` (clean)
- 未验证（交给 T6）：全量测试套件、端到端测试与打包构建（按协议禁止第三方工人执行）
- 停下来的原因（若有）：无（按规则正常完成并停止）
- 下游：父代理合并与后续复检；无需额外迁移
