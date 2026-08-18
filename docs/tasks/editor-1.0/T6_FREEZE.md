# T6 Editor 1.0 冻结与全量验证

> 状态：**全量未通过**。重开前先合 [T1-A](T1_A_MOVE.md)、[T1-C](T1_C_AUDIT.md)、[T6-tc-tests](T6_TC_TESTS.md)。  
> 合同变化：否（禁止再改 Schema 判别器）  
> 工人先读：[02_WORKER.md](02_WORKER.md)  
> **本包唯一允许跑 `npm test` / e2e / `build:desktop` 的任务。** 修红过程中不要把五条命令当循环。T1-A / T6-tc-tests 可跑当前红命令 `typecheck`。

预备切片已合入：[T6-docs](T6_DOCS.md)、[T6-scan](T6_SCAN.md)、[T1-D](T1_D_CONTRACTS_GEN.md)、[T6-CI](T6_CI.md)、[T6-nav](T6_NAV.md)。  
T1-A / T1-C 已纳入本轮冻结，必须在重开 T6 全量之前合入。扫描仍可白名单 `migrateProjectV8ToCourseProjectV9`。`legacy-runtime-v2` / `legacy-whole-canvas` 的 src 白名单必须保持 `[]`。不要在 T6 偷偷改判别器。

> 依赖：T1-B 已合入  
> 并行：全量验证否

## 一句话

从**当前第一条红命令**继续，不要把已绿步骤重跑一遍。修红时只跑失败的命令或失败的测试文件。整轮五条只在红项清完后跑 **一次**。不要打发布 tag，不要宣称 Editor 1.0 已发布。

## 已绿 / 当前红（以已合入的 T6_FREEZE_HANDOFF 为准）

| 命令 | 状态 | 重开时 |
|---|---|---|
| `npm run check:contracts` | 已绿 | 除非本轮改了 `artifacts/contracts/**`，否则 **不要重跑** |
| `npm run typecheck` | **红** | 只追这一条，直到绿 |
| `npm test` | 未跑 | typecheck 绿之前 **不要跑** |
| `npm run build:desktop` | 未跑 | 前序红时 **不要跑** |
| `npm run test:e2e` | 未跑 | 前序红时 **不要跑** |

## 逐步算法

1. 读最新 `T6_FREEZE_HANDOFF.md`，从第一条仍红的命令接着做，不要从 `check:contracts` 重来。
2. 修 typecheck：只跑 `npm run typecheck`（或 `npx tsc --noEmit` 看同一套错误）。不要顺带 `npm test`。
3. typecheck 变绿后，才跑 `npm test`。若 `npm test` 红：记下失败文件，**只** `npx vitest run <失败文件>` 直到那些文件绿，不要每改一次就 `npm test` 整包。那一批文件都绿之后，再 `npm test` **一次**确认没有新红。
4. `npm test` 绿后才 `npm run build:desktop`，再 `npm run test:e2e`。中途失败同样只追红，不回头重跑已绿命令。
5. 上述都绿之后，整轮五条只再跑 **一次** 写入最终 HANDOFF。这是本冻结允许的唯一完整全量。
6. 若五条一次通过：再扩展 CI（保留 `check:contracts`，加 typecheck 与 `npm test`）。Electron 在 `ubuntu-latest` 不稳就不要加假绿 job。
7. 写 HANDOFF：每条命令何时绿过、本轮重跑了几次、最后一次整轮结果。明确未视觉复核、未 accepted、未打 tag。


## 允许修改

```text
.github/workflows/check-contracts.yml
.github/workflows/*.yml
docs/tasks/editor-1.0/T6_FREEZE_HANDOFF.md
```

仅当全量命令因 **T1-B 机械残留**（测试还在把 `surface-v1` / `legacy-*` 当成 `CourseRuntimeDefinition`）失败时，才允许改那个失败的 `tests/**` 文件，并在 HANDOFF 列出。禁止改 `src/shared/courseProjectSchema.ts`、UI、夹具判别器。typecheck 源码/测试对齐已拆到 [T1-A](T1_A_MOVE.md) 与 [T6-tc-tests](T6_TC_TESTS.md)，本卡不要再改那些文件。

## 禁止

- 改 Schema / 类型判别器、RuntimeHost、教师 UI、P8 挂载、画布色。
- 打 tag `editor-v1.0.0`、开 `release/1.x`。
- 写「Editor 1.0 已发布」或把课例标成 `accepted` / `art candidate`。
- 为了绿而删测试、放宽 schema、把失败命令从 CI 拿掉。
- 运行完整 `npm run verify:full`，除非 HANDOFF 说明教师清单要求。
- 把 Vite `chunks larger than 500 kB` 当缺陷修。
- **修红过程中**把五条命令从头再跑一遍。已绿的 `check:contracts` 不要重跑。`npm test` / desktop / e2e 在 typecheck 仍红时不要开跑。

## 分支与收口

1. 从 `origin/cursor/cloud-agent-1787062947578-owgrj` 建 `cursor/t6-freeze-de5c`。
2. 按上面的「逐步算法」只追当前红项。不要从 `check:contracts` 重来。
3. `git diff --check`。
4. 当前红项与后续命令都绿之后，才扩展 GitHub Actions（可同一 workflow 加 job，或新 yml）：
   - 保留现有 `check:contracts` job
   - 增加 `typecheck`：`npm ci` 后 `npm run typecheck`
   - 增加 `test`：`npm ci` 后 `npm test`
   - `build:desktop` / `test:e2e` 若在 `ubuntu-latest` 无法稳定跑 Electron，**不要**加一个会假绿的 job；HANDOFF 写明缺口。本地已经跑过即可。
5. 不要改合同快照，除非 `check:contracts` 证明源码与快照不一致——那种情况 **停**，不要手改巨大 JSON。
6. 写 `T6_FREEZE_HANDOFF.md`：每条命令何时绿过、本轮各条重跑了几次、最后一次整轮五条的结果。明确 **未** 做视觉课例复核、**未** 教师 accepted、**未** 打 tag。

## 最小验证

修红时只跑当前红命令或红测文件。整轮五条只在红项清完后跑 **一次**，外加 `git diff --check`。不要再拆到别的任务补跑，也不要每改一行就全量。

## 完成判定

- [ ] 五条命令的结果写进 HANDOFF（通过或失败即停）
- [ ] 未宣称发布 / 未打 tag
- [ ] 已 push `cursor/t6-freeze-de5c`
- [ ] 有 `T6_FREEZE_HANDOFF.md`

## 目标

冻结合同、接上 CI、扫禁止项、教师 `accepted` 后才能发布。T6-docs / T6-scan / T1-D / T6-CI / T6-nav 已合入；本切片只跑全量命令并扩展 CI。不要再改 Schema 判别器。发现新的教师缺陷就开新的车道 P，不要塞进合同提交。

发布准备（tag `editor-v1.0.0`、分支 `release/1.x`）**不属于本工人**：未获教师 `accepted` 不要打发布 tag。

## 全量验证（只在这里跑，且只跑一次证明轮）

下面五条是冻结证明门，**不是**修红循环。修红时不要按这个列表从头执行。红项清完后按顺序跑 **一次**，失败则只追那条红，不要回头重跑已绿命令：

```powershell
npm run check:contracts
npm run typecheck
npm test
npm run build:desktop
npm run test:e2e
```

发布前另加（可分日，但同属 T6）：

- 三视口对照
- 17 项真人工作流，或教师确认的等价清单
- 干净 Windows 启动与导出
- 大工程与恢复
- T0 永久 V9 夹具：`open → validate → save-as → reopen → 稳定 ID 不变 → Player 关键状态等价 → 所需导出成功`
- P1–P8 课例复核：试运行/整课预览控制器可拖可点；三种表面视频能播；Flow/Spatial 编辑能看见图/视频；画布默认白可改色；课程树能删组、能跨组挪演示页；图层「场景/世界」无全局控制器；Flow/Spatial（及 Slide 试运行）互动组件可交互，缺包才用后备

不要运行完整 `npm run verify:full`，除非教师或发布清单明确要求。

## Editor 1.0 Done Definition

以下全部成立才能发布：

- V9 是唯一持久化 Schema，也是唯一 AI Builder 输出。
- 没有用户可达的 V8 默认真相、导入、双后端、candidate 产品语义。
- Runtime 合同无迁移型 legacy 字段。
- V9 合同有机器快照与哈希。
- 真实 V9 夹具可打开、保存、重开、播放、导出。
- 文档与能力索引不再把 Project V8 写成当前格式。
- 自动化、视觉、真人验收通过。
- P1–P8 课例视觉/互动复核已通过（不得只靠 Vitest）。
- **教师明确 `accepted`。** 重建合入时的 `art candidate` 不能代替。
- 内部投影适配器可以存在，不得形成第二份工程真相。
