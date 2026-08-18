# R3-G — 原子切换前 Gate

> 日期：2026-08-17
> 教师授权：R0-G「确认，之后不要频繁问我，自行决定。」
> 窗口证据：[R3 真实窗口冒烟](b0285cc0-d844-43b8-b7fc-1f2ff22c7df4) [`handoffs/R3-SMOKE.md`](R3-SMOKE.md)
> 产品 worktree：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` @ `f272756`

## 裁决

**允许进入 R3-CUT。** 不把产品标为 `accepted`，不宣称「V9 编辑器可用」。CUT 之后默认真相才是 V9。

对照 R3-G 清单（candidate 真实 Electron，非浏览器 5173）：

| 项 | 结果 |
|---|---|
| 三 location 显隐，课程顺序不变 | 通过 |
| owner 内图层拖排 | 通过（首次拖排无变化，键盘/鼠标重试通过） |
| MediaTab 导入图片+声音并入画布 | 通过；状态栏「已选：图片」 |
| 控制器西向 resize + 快速拖动，选框跟手 | 通过（宽 595→643，随后 left/top 跟手） |
| 试运行 | 通过 `workspace--run` |
| 桌面壳 desktopAPI | 通过 |
| 无 smoke env 仍为 V8 | 通过 |
| 产品工具栏保存已是 V9 zip | **未证明**（仍走 V8 `saveProject`，对话框已取消）。这正是 CUT 要切的入口 |
| 双击选区粗体 / 出现动画预览 | 本冒烟未覆盖；R2 对应请求保持 `integrated`，不挡 CUT 切默认写入 |

R0-B 曾受阻的桌面对话框此次用 Electron + mock `showOpenDialog` 导入真实文件，不再以「Vite 无 desktopAPI」阻止切换。账本中无 `baseline-fail`。

## 仍不是

- art candidate / accepted
- 全量 typecheck / E2E / 视觉（R8）
- Flow / Spatial 实现（等 CUT 后再开 R4-A / R5-A）
