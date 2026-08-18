# T6 Editor 1.0 冻结与全量验证

> 状态：**可领取**（T1-B / T6-CI / T6-nav / T6-docs / T6-scan / T1-D 已合入）  
> 并行：否。本包唯一全量验证。  
> 合同变化：否（禁止再改 Schema 判别器）  
> 工人先读：[02_WORKER.md](02_WORKER.md)  
> **本包唯一允许跑 typecheck / 全量 test / e2e / build:desktop 的任务**

预备切片已合入：[T6-docs](T6_DOCS.md)、[T6-scan](T6_SCAN.md)、[T1-D](T1_D_CONTRACTS_GEN.md)、[T6-CI](T6_CI.md)、[T6-nav](T6_NAV.md)。  
T1-A / T1-C 仍暂缓。扫描仍可白名单 `migrateProjectV8ToCourseProjectV9`。`legacy-runtime-v2` / `legacy-whole-canvas` 的 src 白名单必须保持 `[]`（T1-B 已删）。不要在 T6 偷偷改判别器。

> 依赖：T1-B 已合入  
> 并行：全量验证否

## 一句话

按顺序跑全量验证；把 CI 从只跑 `check:contracts` 扩到 typecheck 与 `npm test`。不要打发布 tag，不要宣称 Editor 1.0 已发布。自动化最多 `engineering candidate`。

## 允许修改

```text
.github/workflows/check-contracts.yml
.github/workflows/*.yml
docs/tasks/editor-1.0/T6_FREEZE_HANDOFF.md
```

仅当全量命令因 **T1-B 机械残留**（测试还在把 `surface-v1` / `legacy-*` 当成 `CourseRuntimeDefinition`）失败时，才允许改那个失败的 `tests/**` 文件，并在 HANDOFF 列出。禁止改 `src/shared/courseProjectSchema.ts`、UI、夹具判别器。

## 禁止

- 改 Schema / 类型判别器、RuntimeHost、教师 UI、P8 挂载、画布色。
- 打 tag `editor-v1.0.0`、开 `release/1.x`。
- 写「Editor 1.0 已发布」或把课例标成 `accepted` / `art candidate`。
- 为了绿而删测试、放宽 schema、把失败命令从 CI 拿掉。
- 运行完整 `npm run verify:full`，除非 HANDOFF 说明教师清单要求。
- 把 Vite `chunks larger than 500 kB` 当缺陷修。

## 逐步算法

1. 从 `origin/cursor/cloud-agent-1787062947578-owgrj` 建 `cursor/t6-freeze-de5c`。
2. **按顺序**跑，失败即停，把完整命令、退出码、第一段错误写入 HANDOFF：

```text
npm run check:contracts
npm run typecheck
npm test
npm run build:desktop
npm run test:e2e
```

3. `git diff --check`。
4. 若 2 全部通过：扩展 GitHub Actions（可同一 workflow 加 job，或新 yml）：
   - 保留现有 `check:contracts` job
   - 增加 `typecheck`：`npm ci` 后 `npm run typecheck`
   - 增加 `test`：`npm ci` 后 `npm test`
   - `build:desktop` / `test:e2e` 若在 `ubuntu-latest` 无法稳定跑 Electron，**不要**加一个会假绿的 job；HANDOFF 写明缺口。本地已经跑过即可。
5. 不要改合同快照，除非 `check:contracts` 证明源码与快照不一致——那种情况 **停**，不要手改巨大 JSON。
6. 写 `T6_FREEZE_HANDOFF.md`：每条命令通过/失败；CI 加了什么；明确 **未** 做视觉课例复核、**未** 教师 accepted、**未** 打 tag。

## 最小验证

就是上面的全量五条，外加 `git diff --check`。不要再拆到别的任务补跑。

## 完成判定

- [ ] 五条命令的结果写进 HANDOFF（通过或失败即停）
- [ ] 未宣称发布 / 未打 tag
- [ ] 已 push `cursor/t6-freeze-de5c`
- [ ] 有 `T6_FREEZE_HANDOFF.md`

## 目标

冻结合同、接上 CI、扫禁止项、教师 `accepted` 后才能发布。T6-docs / T6-scan / T1-D / T6-CI / T6-nav 已合入；本切片只跑全量命令并扩展 CI。不要再改 Schema 判别器。发现新的教师缺陷就开新的车道 P，不要塞进合同提交。

发布准备（tag `editor-v1.0.0`、分支 `release/1.x`）**不属于本工人**：未获教师 `accepted` 不要打发布 tag。

## 全量验证（只在这里跑）

按顺序，失败即停，不要拆到其他任务补跑：

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
