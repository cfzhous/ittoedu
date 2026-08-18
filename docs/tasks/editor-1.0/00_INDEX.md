# Editor 1.0 收尾任务包

> 执行入口。总纲：[COURSEWARE_DEVELOPMENT_PLAN.md](../../../COURSEWARE_DEVELOPMENT_PLAN.md) 12.4  
> 共享约束：[01_SHARED.md](01_SHARED.md)  
> 工人协议（第三方模型必读）：[02_WORKER.md](02_WORKER.md)  
> 更新日期：2026-08-18  
> 已锁定：删除 V8 导入，不保留密封导入器。  
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

**可领取（互斥见表）**

| 任务 | 分支名 | 互斥 |
|---|---|---|
| [T3](T3_BACKEND.md) | `cursor/t3-single-backend-de5c` | 独占 `editorStore` backend 命名；必须保留 P2 |
| [T4](T4_CAPABILITIES.md) | `cursor/t4-capabilities-v9-de5c` | 只动 scripts / artifacts / 能力文档 |
| [P8](P8_FLOW_SPATIAL_COMPONENTS.md) | `cursor/p8-flow-spatial-components-de5c` | 独占 Flow/Spatial/Slide Published 宿主组件分支 |

**必须等待**

| 任务 | 等什么 |
|---|---|
| [P5](P5_CANVAS_BACKGROUND.md) **persist** | P8 合入（同宿主文件） |
| [T5](T5_READ_MODEL.md) | T3 合入 |
| [T6](T6_FREEZE.md) | T3、T4、T5、P5-persist、P8 |
| [T1](T1_SCHEMA.md) A/C/D | 父代理改看板为可领取 |
| [T1](T1_SCHEMA.md) B | 先改 T0 `canvas-runtime` 夹具，再删 `legacy-*` |

## 卫生清理（12.1 已完成，不要重做）

- 删除 `docs/tasks/v8-to-v9-rebuild/**`
- 删除 `.agents/skills/build-project-v8-courseware/**` 及其专用测试
- 删除 `MULTI_SURFACE_DEVELOPMENT_PLAN.md`、根目录评估稿、过时 Skill 重构方案

代码里的双后端、`project: 8` 能力产物由 **T3 / T4** 收口，不要重做 T2。

## 并行规则

两条车道。**不要**把 P 的 UI 修进行 T1/T6 的合同提交。

```text
已合入：T0 → T1-E → T2
         P1 P2 P3 P4 P5-CSS P6 P7

现在可并行（分 worktree）：
  T3 单后端     T4 能力/CLI     P8 组件挂载

然后：
  T3 合入 → T5
  P8 合入 → P5-persist
  全部完成 → T6（唯一全量）
```

P8 与 P5-persist **禁止**同时改 `FlowSurfaceHost` / `SpatialSurfaceHost` / `FlowWorkspace` / Spatial `Workspace`。

T3 与 T5 **禁止**同时改 `editorStore` 后端命名。T5 只在 T3 之后改 NodesTab import。

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
