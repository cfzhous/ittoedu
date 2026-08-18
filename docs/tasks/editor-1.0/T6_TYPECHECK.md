# T6 全量验证因 typecheck 停手：定向修复

> 状态：Published/宿主切片**并入** [T1-A](T1_A_MOVE.md)。测试切片仍独立。  
> 上游：[T6 freeze](T6_FREEZE.md) 在 `npm run typecheck` 失败即停；HANDOFF 已合入  
> 工人先读：[02_WORKER.md](02_WORKER.md)

| 切片 | 卡 | 分支 |
|---|---|---|
| 合同真迁移 + Published 类型对齐 | [T1-A](T1_A_MOVE.md) | `cursor/t1-a-move-de5c` |
| 顶层字段审计 | [T1-C](T1_C_AUDIT.md) | **已合入** |
| 测试与 validate-project | [T6-tc-tests](T6_TC_TESTS.md) | `cursor/t6-tc-tests-de5c` |

禁止改 Runtime 判别器、打 tag、宣称 Editor 1.0 已发布。

三张卡都不要跑 `npm test` / e2e / desktop。绿过的 `check:contracts` 不要重跑（T1-A commit 2 除外，因为它改 `generate-contracts.ts`）。T1-A 与 T6-tc-tests 允许只跑当前红命令 `npm run typecheck`；T1-C 只跑自己的新测文件。不要宣称 freeze 完成。
