# T6 Editor 1.0 冻结与全量验证

> 状态：**全量验证不可领取**，直到 T1-B 合入（T6-CI / T6-nav / T3-aliases / 合同说明 / 扫描 / 快照已合入）  
> 预备切片已拆出：[T6-docs](T6_DOCS.md)、[T6-scan](T6_SCAN.md)、[T1-D](T1_D_CONTRACTS_GEN.md)、[T6-CI](T6_CI.md)、[T6-nav](T6_NAV.md)  
> 工人先读：[02_WORKER.md](02_WORKER.md)  
> **本包唯一允许跑 typecheck / 全量 test / e2e / build:desktop 的任务**

必须已经合入才能跑下方「全量验证」：T0、T1-E、T2、T3、T4、T5、P1、P2、P3、P4、P5-CSS、P5-persist、P6、P7、P8。  
T1-A/C 若仍暂缓：扫描到其它历史 token 时记入白名单。**不要在 T6 偷偷删判别器**；删 `legacy-*` 是 [T1-B](T1_B_SWITCH.md)。

> 依赖：P5-persist 已合入；全量验证等 T6-docs / T6-scan / T1-D  
> 并行：全量验证否；预备切片可分树

## 目标

冻结合同、接上 CI、扫禁止项、教师 `accepted` 后才能发布。

## 允许修改

```text
docs/contracts/COURSE_PROJECT_V9.md
docs/contracts/V9_COMPATIBILITY_POLICY.md
docs/contracts/EDITOR_1_0_ARCHITECTURE_BOUNDARY.md
artifacts/contracts/**
CI 配置（每个 PR 接 check:contracts / typecheck / test / build:desktop / 关键 E2E）
README.md / docs/USER_GUIDE.md / AGENTS.md   （只补冻结后的版本与命令，不改产品故事）
```

不要再改 Schema 判别器。12.2–12.3 列出的教师缺陷必须已在 P1–P8 合入；本任务只做冻结、CI 与验收，发现新缺陷再开新的车道 P 补丁，不要塞进合同提交。

## 工作项

1. 写合同文档与兼容政策。
2. `check:contracts` 证明磁盘产物与源码生成一致；普通 PR 不得改 V9 合同哈希。
3. 禁止项扫描，正式源码不得出现（测试/历史评论除外，白名单写进合同文档）：

```text
Project V8          （作为当前格式）
schemaVersion: 8    （作为可打开工程）
legacy-runtime-v2
legacy-whole-canvas
v9-slide-candidate
V8SlideBackend
migrateProjectV8
build-project-v8-courseware
导入旧版工程
```

4. 发布准备：tag `editor-v1.0.0`、分支 `release/1.x`。未获教师 `accepted` 不要打发布 tag。

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
