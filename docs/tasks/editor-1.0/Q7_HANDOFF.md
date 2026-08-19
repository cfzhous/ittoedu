# Q7 HANDOFF

- 范围：讲义纸面媒体：本地文件替换（纯函数命令 `importAndReplaceFlowMediaBlock` + `FlowMediaBlockProperties` 隐藏文件 input/按钮交互 + 单元测试）
- 合同是否变化：否
- 分支 / SHA：`cursor/q7-flow-file-replace-489b`
- 允许列表外改动（必须空，除非重命名机械 import）：无（仅允许修改列表：`src/renderer/course/flowEditorCommands.ts`、`src/renderer/ui/PropertiesTab.tsx`、`tests/unit/flowMediaBlockEdit.test.ts`、`docs/tasks/editor-1.0/Q7_HANDOFF.md`）
- 最小验证命令与结果：
  ```bash
  npx vitest run tests/unit/flowMediaBlockEdit.test.ts tests/unit/flowWorkspaceMedia.test.tsx
  # 2 passed (2 test files, 12 tests passed)
  git diff --check
  # clean
  ```
- 未验证（交给 T6）：`npm test`、`npm run typecheck`、e2e
- 停下来的原因（若有）：无
- 下游：车道 Q 父代理合并
