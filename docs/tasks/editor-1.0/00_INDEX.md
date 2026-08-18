# Editor 1.0 收尾任务包

> 执行入口。总纲：[COURSEWARE_DEVELOPMENT_PLAN.md](../../../COURSEWARE_DEVELOPMENT_PLAN.md) 12.5  
> 共享约束：[01_SHARED.md](01_SHARED.md)  
> 工人协议（第三方模型必读）：[02_WORKER.md](02_WORKER.md)  
> 更新日期：2026-08-18  
> 已锁定：删除 V8 导入，不保留密封导入器。  
> 12.5：T6 全量验证仍等 P5-persist；合同说明 / 禁止项扫描 / 合同快照 / 合同桶可与 P5-persist 并行。  
> 12.4：剩余任务卡写成逐步算法 + 文件防火墙，供高性价比第三方工人执行；父代理只合入与复检。  
> 12.3：P8 Flow/Spatial 互动组件；P1/P3/P4 已合入后可领取 P8。  
> 12.2：车道 P（P1–P7）。合同冻结仍是 T0–T6。

本包取代已删除的 `docs/tasks/v8-to-v9-rebuild/**`。不要领取 R0–R8，不要从 `f272756` 再开 worktree。

## 当前产品

Course Project V9 已是默认工程真相。未完成冻结、P 车道视觉复核与教师 `accepted` 前，不得宣称 Editor 1.0 已发布。

## 合入状态（对照 `origin/cursor/cloud-agent-1787062947578-owgrj`）

**已合入 — 禁止重做**

| 任务 | 要点 |
|---|---|
| [T0](T0_BASELINE.md) | `tests/fixtures/course-project-v9/*.h5lesson` + round-trip |
| [T1](T1_SCHEMA.md) **E** | Spatial/Flow 可选 `backgroundColor?` |
| [T2](T2_REMOVE_V8.md) | 打开只接受 schema 9；无导入 UI |
| [P1](P1_PLAYBACK_HOSTS.md) | 试运行控制器可拖可点；三表面 video |
| [P2](P2_TRYRUN_LOCATION.md) | Mixed 跳转保持 `canvasMode === 'run'` |
| [P3](P3_FLOW_EDIT_MEDIA.md) | Flow 编辑图/视频 blob |
| [P4](P4_SPATIAL_EDIT_MEDIA.md) | Spatial 选框随转；编辑 video |
| [P5](P5_CANVAS_BACKGROUND.md) **CSS** | 无限画布默认白 |
| [P6](P6_COURSE_TREE.md) | 删组、演示页跨组、主按钮文案 |
| [P7](P7_LAYER_CONTROLLER.md) | 控制器只在「全局」 |
| [T4](T4_CAPABILITIES.md) | 能力索引 `project: 9`；`validate:course-project` |
| [P8](P8_FLOW_SPATIAL_COMPONENTS.md) | Flow/Spatial/Slide Published 挂 Component API 4 |
| [T3](T3_BACKEND.md) | 单一 `slide-authoring`；Flow/Spatial 时 `slideBackend === null` |
| [T5](T5_READ_MODEL.md) | NodesTab 经 `course/read-model` 取投影；`groupedVisualRows` 未改 |

**可领取（互斥见表）**

| 任务 | 分支名 | 互斥 |
|---|---|---|
| [P5](P5_CANVAS_BACKGROUND.md) **persist** | `cursor/p5-canvas-persist-de5c` | 只改背景色；禁止回退 P8 组件挂载。`editorStore` 只许改 `derivedV8ProjectFromSpatial` 的颜色来源。已有工人在写，不要再开第二个 persist |
| [T6-docs](T6_DOCS.md) | `cursor/t6-docs-de5c` | 只写 `docs/contracts/**` |
| [T6-scan](T6_SCAN.md) | `cursor/t6-scan-de5c` | 只新建禁止项测试；禁止改 `src/` |
| [T1-D](T1_D_CONTRACTS_GEN.md) | `cursor/t1-contracts-gen-de5c` | 只新增 generate/check 脚本与 `artifacts/contracts/**`；`package.json` 只加两条 script |
| [T1-A0](T1_A0_CONTRACTS_BARRELS.md) | `cursor/t1-contracts-barrels-de5c` | 只新建 `src/shared/contracts/**` re-export |

**必须等待**

| 任务 | 等什么 |
|---|---|
| [T6](T6_FREEZE.md) 全量验证 / CI / tag | P5-persist 合入；T6-docs、T6-scan、T1-D 合入更稳 |
| [T3-aliases](T3_ALIASES.md) | P5-persist（抢 `editorStore.ts`） |
| [T1](T1_SCHEMA.md) A（真迁移）/ C | T1-A0 合入后由父代理改看板 |
| [T1](T1_SCHEMA.md) B | 先改 T0 `canvas-runtime` 夹具 + 生产写入，再删 `legacy-*`；生产写入抢 `editorStore`，等 P5-persist |

## 卫生清理（12.1 已完成，不要重做）

- 删除 `docs/tasks/v8-to-v9-rebuild/**`
- 删除 `.agents/skills/build-project-v8-courseware/**` 及其专用测试
- 删除 `MULTI_SURFACE_DEVELOPMENT_PLAN.md`、根目录评估稿、过时 Skill 重构方案

代码里的双后端已由 T3 收口，不要重做 T2 / T3 / T4。

## 并行规则

两条车道。**不要**把 P 的 UI 修进行 T1/T6 的合同提交。

```text
已合入：T0 → T1-E → T2 → T3 → T4 → T5
         P1 P2 P3 P4 P5-CSS P6 P7 P8

现在可并行（分 worktree）：
  P5-persist 画布色接线
  T6-docs / T6-scan / T1-D / T1-A0

然后：
  P5-persist 合入 → T3-aliases、T1-B
  预备切片合入 → T6 全量验证（唯一全量）
```

P5-persist 禁止回退 P8 的组件挂载；只改背景色相关行。

T3 与 T5 均已合入。不要再改 `editorStore` 后端命名，也不要再改 `groupedVisualRows`。

不要同一提交改 Schema 判别器和教师可感知 UI。

## 验证规则

每个任务只跑该文件「最小验证」列出的命令，外加 `git diff --check`。

禁止在 T0–T5 与 P1–P8 运行：`npm test`、`npm run typecheck`、`npm run test:e2e`、`npm run build:desktop`、`npm run verify`、`npm run verify:full`。

**全量验证只在 T6。**

## 领取方式（第三方工人）

1. 读 [02_WORKER.md](02_WORKER.md)。
2. 看本页「合入状态」：已合入的不要做；等待中的不要抢。
3. 只读 **一张** 任务卡 + [01_SHARED.md](01_SHARED.md)。
4. 从 `origin/cursor/cloud-agent-1787062947578-owgrj` 建 `cursor/<slug>-de5c`。
5. 只改「允许修改」列表。热点冲突则停。
6. 写 `<TASK>_HANDOFF.md`，push，不要开 PR。
