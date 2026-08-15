# repo-index

这是项目认知索引的精简结构化层，供 Agent 快速定位模块、功能和最低充分测试。

## 文件

- `manifest.json`：索引基准、覆盖范围和新鲜度规则。
- `modules.json`：稳定子系统、入口、依赖和禁止依赖。
- `features.json`：高价值功能到文件、不变量和证据的映射。
- `tests.json`：开发循环、纵切提交和阶段 Gate 的最小命令。

人类与新 Agent 的首屏入口是 [`PROJECT_COGNITION_INDEX.md`](../PROJECT_COGNITION_INDEX.md)。

## 使用规则

1. 先读 `manifest.json` 的 `sourceBaselineCommit`。
2. 查看该提交之后是否修改了当前任务涉及的 `src/`、`tests/`、`scripts/`、`agent-kit/`、`.agents/` 或 `package.json`。
3. 如有相关变化，以当前源码为准，并更新受影响的索引条目。
4. docs-only 提交不要求全量重建索引。
5. JSON 只记录真实存在的路径和命令，不描述期望中的未来目录。

## 维护边界

- `modules.json` 和 `features.json` 少量人工维护，因为它们表达产品边界。
- 不收录局部变量或全部导出符号。
- 不在当前阶段生成完整 import graph、循环依赖图、Git 热点或测试覆盖数据库。
- 如果未来确有重复检索成本，再增加一个无依赖、可重复生成的 `generated/` 子目录；生成物不能成为架构真相。
