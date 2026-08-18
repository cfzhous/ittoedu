# Q3 HANDOFF
- 范围：实现 `paintPublishedNativeText` 并在 `SlidePublishedAdapter` 的 native text 分支中使用，支持 block 级别 style 及 runs 富文本分段与样式的局部覆盖；添加 `tests/unit/slidePublishedNativeText.test.ts`。
- 合同是否变化：否
- 分支 / SHA：cursor/q3-published-text-runs-489b / HEAD (see git log)
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：
  `npx vitest run tests/unit/slidePublishedNativeText.test.ts`
  输出：
  ```
  Test Files  1 passed (1)
       Tests  6 passed (6)
  ```
  `git diff --check`：clean
- 未验证（交给 T6）：全量 `npm test`、e2e、typecheck、desktop 构建
- 停下来的原因（若有）：无
- 下游：车道 Q 集成 / 父代理合入
