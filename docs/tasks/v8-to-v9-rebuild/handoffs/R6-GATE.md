# R6-GATE — Mixed 阶段 Gate

> 日期：2026-08-17
> 教师授权：R0-G「确认，之后不要频繁问我，自行决定。」
> 窗口证据：[R6-Z Mixed中央接线](2adc1048-ef8f-4502-89ea-b8b576c3f23d) [`handoffs/R6-Z.md`](R6-Z.md)
> 产品 worktree：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` @ `f272756`
> 冒烟：`output/r6-z-smoke/`（Vite `:5174` + Electron 独立 user-data-dir；无 `VITE_V9_CANDIDATE_SMOKE`）
> 脚本日志：终端 842529（`PASS 01–05、06–10`；`FAIL 05b`；收尾 `Date.ISOString` 写 evidence 失败，协调者已按日志补 `evidence.json`）

## 裁决

**本阶段通过，execution = `engineering candidate for this stage`。** 壳层热点锁已释放。不把产品标为 `accepted`，不宣称「Mixed 编辑器已可用」。

对照 R6 冒烟清单：

| 项 | 结果 |
|---|---|
| 默认 Slide 主按钮加两 scene，旧 scene 仍在 | 通过。`02-two-scenes.png`：场景 1/2/3；状态「已新建场景」 |
| 下拉加 Flow 与 Spatial | 通过。`03-mixed-tree.png`：一棵树含演示场景、流式讲义、无限画布 |
| Flow/Spatial 主按钮再加本态一页 | 通过。日志 `flow pages=2`、`spatial pages=2`；`08-saved.png` 两套讲义 + 两套画布 |
| Spatial 主按钮 ≠ 加镜头；`add-spatial-camera` 保留 | 通过（代码）。冒烟 `05b` 在刚新增后立刻 `isVisible` 未绿，属激活时机；树仍有「本页镜头 / 全景」 |
| 三类切换 + 全局层 | 通过。`07-global-layer.png`：正在编辑全局层 |
| 顶栏三类空白工程未回退 | 通过。日志 `09-blank-entries`；TopToolbar 仍有 `new-spatial-project` / `new-flow-project` |
| FlowWorkspace / SpatialLocationWorkspace | 通过。未拆第三分支 |
| Mixed 试运行上一/下一 | **不做本阶段。** `R6Z-R7B-01` 保持 open |

Mixed 主按钮冻结修正：`kind === 'mixed'` 时跟随**当前激活 surface**（与 R6-Z `panelLayoutForActiveLocation` 一致），不再永远「新建场景」。已写回 playbook §2.1。

账本升 **verified**：`R6A-R6Z-01`、`R6B-R6Z-01`、`R6C-R6Z-01`。

仍 open：`R6Z-R7B-01`（整课/Mixed 试运行导航，R7-B）。

允许 **R7-Z** 在 R7-A–E 均有 HANDOFF 且不再与开发 lane 抢壳层后领取。R7-B/D 此时仍可能在跑，Z 不得抢跑。

## 仍不是

- art candidate / accepted
- 全量 typecheck / E2E / 视觉（R8）
- 保存对话框走完并重开（08 只证明 `desktopAPI`）
- 整课 Player / 导出写文件（R7）
