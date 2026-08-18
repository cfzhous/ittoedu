# R4-GATE — Flow 阶段 Gate

> 日期：2026-08-17
> 教师授权：R0-G「确认，之后不要频繁问我，自行决定。」
> 窗口证据：[R4-Z Flow中央接线](c7be4f23-81c0-441e-965d-f0e6cb04303f) [`handoffs/R4-Z.md`](R4-Z.md)
> 产品 worktree：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` @ `f272756`
> 冒烟：`output/r4-z-smoke/evidence.json`（`outcome: passed`，无 `VITE_V9_CANDIDATE_SMOKE`）

## 裁决

**本阶段通过，execution = `engineering candidate for this stage`。** 壳层热点锁已释放。R6-A/B/C 已是 `lane_candidate`，允许启动 **R6-Z**。不把产品标为 `accepted`，不宣称「Flow 编辑器已可用」。

对照 R4 Gate / 冒烟清单：

| 项 | 结果 |
|---|---|
| 空白 Flow 可见入口 | 通过。顶栏下拉「空白流式讲义」`new-flow-project`；默认新建仍是 Slide |
| 稿纸不是 1280×720 Phaser | 通过。`workspace--flow`；readingWidth 760 |
| 树 = 页面 + heading；paragraph 不上树 | 通过 |
| 图层只 overlay | 通过。冒烟图层=教师控制器+示例计数器 |
| 就地/属性格式；无正文框 | 通过 |
| 文中图 + 浮层组件 | 通过 |
| 全局层 + 当前页显隐 | 通过 |
| 保存重开 schemaVersion 9 / flow | 通过 |
| 当前位置试运行 FlowSurfaceHost；目录 fixed 贴边三角 | 通过。`.flow-surface-host` |
| Spatial / Slide 未回退 | 通过。`new-spatial-project`、本页镜头仍在 |

账本：下列请求升 **verified**（`R4D-R4Z-01` 仅限 Workspace **当前位置试运行**）：

`R4A-R4Z-01`、`R4A-R4Z-02`、`R4B-R4Z-01`、`R4B-R4Z-02`、`R4B-R4Z-03`、`R4C-R4Z-01`、`R4C-R4Z-02`、`R4C-R4Z-03`、`R4C-R4Z-04`、`R4D-R4Z-01`。

整课 iframe 仍是 `R3CUT-R7B-01`。工程内主按钮+下拉三类 surface 仍是 R6-Z。

## 仍不是

- art candidate / accepted
- 全量 typecheck / E2E / 视觉（R8）
- Mixed 工程内统一新增（R6-Z）
- 顶栏整课预览走 Published V2 Player（R7）
