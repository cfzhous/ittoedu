# T6-docs HANDOFF

- 范围：创建三份合同说明文档（`docs/contracts/COURSE_PROJECT_V9.md`、`docs/contracts/V9_COMPATIBILITY_POLICY.md`、`docs/contracts/EDITOR_1_0_ARCHITECTURE_BOUNDARY.md`），基于当前源码已成立事实规范 V9 工程格式、兼容性演进策略及 Editor 1.0 架构边界。
- 合同是否变化：否（仅新增文档，未修改 Schema / 未冻结哈希）。
- 分支 / SHA：`cursor/t6-docs-de5c`
- 允许列表外改动（必须空，除非重命名机械 import）：无（仅包含允许列表中的 4 个文件）。
- 最小验证命令与结果：
  - `git diff --check`（输出干净无空白错误）。
  - 确认三份合同文档非空，内容与源码一致，且未宣称 Editor 1.0 已发布。
- 未验证（交给 T6）：全量测试套件、类型检查、E2E 测试、Desktop 构建以及合同哈希冻结。
- 停下来的原因（若有）：无（任务顺利完成）。
- 下游：T6 全量验证接 CI 与合同哈希冻结；T1-B 之后按需更新文档中关于 `legacy-*` 字段的存在状态表述。
