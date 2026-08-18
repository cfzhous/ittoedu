# R5-GATE — Spatial 阶段 Gate

> 日期：2026-08-17
> 教师授权：R0-G「确认，之后不要频繁问我，自行决定。」
> 窗口证据：[R5-Z Spatial中央接线](12aac0d4-a7d8-4e37-95a4-178c959b4d1b) [`handoffs/R5-Z.md`](R5-Z.md)
> 产品 worktree：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` @ `f272756`

## 裁决

**本阶段通过，execution = `engineering candidate for this stage`。** 壳层热点锁已释放，允许启动 R4-Z。不把产品标为 `accepted`，不宣称「Spatial 编辑器已可用」，不进入 R6（仍等 R4-Z）。

对照 R5 Gate 清单（默认 V9 真实 Electron，无 `VITE_V9_CANDIDATE_SMOKE`）：

| 项 | 结果 |
|---|---|
| 空白 Spatial 可见入口 | 通过。顶栏下拉「空白无限画布」；默认新建仍是 Slide |
| 无 1280×720 白页；无限 world | 通过 |
| 插入文字/图片/组件；双击文字 | 通过 |
| 八向变换；选择框/手柄同 Slide | 通过（西向 resize；`#5b9cff`、11×11） |
| 新建两镜头 + path/relation；保存重开 | 通过。schemaVersion 9 |
| 左栏本页镜头 + 全局层 | 通过 |
| 缩放条改 sessionCamera；控制器屏幕尺寸不随 world zoom | 通过（100%→120%） |
| 当前位置试运行 = SpatialSurfaceHost | 通过。`.spatial-surface` infinite，无 Slide iframe |
| 未复制弱化 SpatialWorkspace / 粉框 / 小地图 | 通过 |

账本：`R5B-R5Z-01`、`R5C-R5Z-01` 升 **verified**。`R5D-R5Z-01` 升 **verified**，范围仅限 Workspace **当前位置试运行**。整课 iframe 仍是 `R3CUT-R7B-01`。

## 仍不是

- art candidate / accepted
- 全量 typecheck / E2E / 视觉（R8）
- Flow 作者界面（R4-Z）
- 工程内「主按钮+下拉三类 surface」（R6）
- 顶栏整课预览走 Published V2 Player（R7）
