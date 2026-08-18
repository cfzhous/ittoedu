# Editor 1.0 收尾任务包

> 执行入口。总纲：[COURSEWARE_DEVELOPMENT_PLAN.md](../../../COURSEWARE_DEVELOPMENT_PLAN.md) 12.5  
> 共享约束：[01_SHARED.md](01_SHARED.md)  
> 工人协议（第三方模型必读）：[02_WORKER.md](02_WORKER.md)  
> 更新日期：2026-08-18  
> 已锁定：删除 V8 导入，不保留密封导入器。  
> 12.5：T6 typecheck 停手。本轮补 T1-A / T1-C 后再按红项优先重开 T6（已绿不重跑，整轮五条只一次）。不得宣称 Editor 1.0 已发布。  
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
| [P5](P5_CANVAS_BACKGROUND.md) **persist** | Spatial/Flow 画布色写入可选字段；编辑与宿主同读；缺省不脏写 |
| [T1](T1_A0_CONTRACTS_BARRELS.md) **A0** | `src/shared/contracts/**` 只做 re-export |
| [T1](T1_D_CONTRACTS_GEN.md) **D** | `generate:contracts` / `check:contracts` 快照 |
| [T6-docs](T6_DOCS.md) | `docs/contracts/` 三份说明 |
| [T6-scan](T6_SCAN.md) | 禁止项棘轮测试 + 白名单 |
| [T3-aliases](T3_ALIASES.md) | 去掉 candidate 函数别名；session 字段名未改 |
| [T6-CI](T6_CI.md) | GitHub Actions 只跑 `check:contracts` |
| [T1](T1_B1_ADD_DISCRIMINATORS.md) **B1** | 增加 `canvas-runtime` / `surface-runtime`；旧值当时仍合法 |
| [T6-nav](T6_NAV.md) | 文档导航接到 `docs/contracts/` 与 generate/check:contracts |
| [T1](T1_B_SWITCH.md) **B** | 生产写入与夹具改为 `canvas-runtime` / `surface-runtime`；旧判别器已删 |
| [T1](T1_C_AUDIT.md) **C** | 顶层 `.strict()`；未知键测试；`PROJECT_SCHEMA_VERSION` 仍为 8 |
| [T6-tc-tests](T6_TC_TESTS.md) | 测试与 `validate-project.ts` 对齐 V9 archive / slide-authoring |
| [T1](T1_A_MOVE.md) **A** | 合同源文件在 `src/shared/contracts/**`；旧路径 re-export；Published Flow/Spatial `backgroundColor?` |

**可领取（互斥见表）**

| 任务 | 分支名 | 互斥 |
|---|---|---|
| [T6](T6_FREEZE.md) 重开 | `cursor/t6-freeze-resume-de5c` | Windows e2e 27/27；catalog/authoring 夹具已改 V9；未视觉复核、未 accepted |

**必须等待**

| 任务 | 等什么 |
|---|---|
| 发布 tag / `accepted` | 教师明确验收 |

## 卫生清理（12.1 已完成，不要重做）

- 删除 `docs/tasks/v8-to-v9-rebuild/**`
- 删除 `.agents/skills/build-project-v8-courseware/**` 及其专用测试
- 删除 `MULTI_SURFACE_DEVELOPMENT_PLAN.md`、根目录评估稿、过时 Skill 重构方案

代码里的双后端已由 T3 收口，不要重做 T2 / T3 / T4。

## 并行规则

两条车道。**不要**把 P 的 UI 修进行 T1/T6 的合同提交。

```text
已合入：T0 → T1-E → T2 → T3 → T4 → T5
         P1 P2 P3 P4 P5-CSS P5-persist P6 P7 P8

现在可并行（分 worktree）：
  T6 freeze 重开（红项优先）

然后：
  教师视觉复核与 accepted；不要由自动化打发布 tag
  教师视觉复核与 accepted；不要由自动化打发布 tag
```

P5-persist 已合入。不要回退宿主上的 P8 组件挂载，也不要再改画布色接线。

T3 与 T5 均已合入。不要再改 `editorStore` 后端命名，也不要再改 `groupedVisualRows`。T1-B 已合入：不要把 `legacy-runtime-v2` 写回 Schema。

不要同一提交改 Schema 判别器和教师可感知 UI。

## 验证规则

每个任务只跑该文件「最小验证」列出的命令，外加 `git diff --check`。

**红项优先。** 当前 T6 红项是 `typecheck`。绿过的 `check:contracts` 不要重跑（除非本卡改了 `scripts/generate-contracts.ts` 或 `artifacts/contracts/**`）。修红时只跑红命令或红测文件。不要每次修改后跑 T6 五条命令。

禁止在中间任务运行：`npm test`、`npm run test:e2e`、`npm run build:desktop`、`npm run verify`、`npm run verify:full`。  
本轮例外：只有 [T1-A](T1_A_MOVE.md) 与 [T6-tc-tests](T6_TC_TESTS.md) 允许 `npm run typecheck`（因为那就是当前红项）。[T1-C](T1_C_AUDIT.md) 不要跑 typecheck。

**全量验证只在 T6，且整轮五条只在红项清完后跑一次。**

## 领取方式（第三方工人）

1. 读 [02_WORKER.md](02_WORKER.md)。
2. 看本页「合入状态」：已合入的不要做；等待中的不要抢。
3. 只读 **一张** 任务卡 + [01_SHARED.md](01_SHARED.md)。
4. 从 `origin/cursor/cloud-agent-1787062947578-owgrj` 建 `cursor/<slug>-de5c`。
5. 只改「允许修改」列表。热点冲突则停。
6. 写 `<TASK>_HANDOFF.md`，push，不要开 PR。
