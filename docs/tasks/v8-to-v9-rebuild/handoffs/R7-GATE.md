# R7-GATE — 交付阶段 Gate

> 日期：2026-08-17
> 教师授权：R0-G「确认，之后不要频繁问我，自行决定。」
> 窗口证据：[R7-Z 交付中央接线](08d3720c-cbdf-41cd-9ef2-25d43ebd12c2) [`handoffs/R7-Z.md`](R7-Z.md)
> 产品 worktree：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` @ `f272756`（未 commit）
> 冒烟：`output/r7-z-smoke/`（Vite `:5175` + Electron 独立 user-data-dir；无 `VITE_V9_CANDIDATE_SMOKE`）

## 裁决

**本阶段交付接线通过，execution = `engineering candidate for this stage`。** 壳层热点锁已释放。不把产品标为 `art candidate` / `accepted`。

对照 `09_R7` §9：

| 项 | 结果 |
|---|---|
| persistence 缺口已盘点并补上 | 通过。R7-A V9-only recovery 读写；App 仅 `offer` 弹框 |
| 整课预览与 Slide 试运行不再用派生 V8 HTML 冒充三类 Player | 通过。`createPublishedCourseSession`；Flow/Spatial 当前位置仍走真实 host |
| 导出入口至少有一条真实写文件路径 | 通过。`r7-z-course.html` 1 700 583 bytes，含 `__H5_COURSE_PAYLOAD__`，无 `.course-nav` |
| `R3CUT-R7B-01` / `R7B-R7Z-01` verified | 通过。试运行 `next()`：slide → flow |
| `R4D-R7-01` verified | 通过。菜单 + `buildFlowDocx`；playbook 禁止为四种格式各冒烟 |
| `R1D-R7E-01` verified（模块） | 通过。`SurfaceRuntimeAuthoringBridge` 已交付。host 薄接 `R7E-R7Z-01` 仍 open、non-blocking，按 §9 允许 documented |
| 未跑全量 typecheck/test/build/E2E/visual | 遵守 |

账本升 **verified**：`R7A-R7Z-01`、`R7B-R7Z-01`、`R7C-R7Z-01`、`R7D-R7Z-01`、`R4D-R7-01`、`R3CUT-R7B-01`、`R1D-R7E-01`、`R6Z-R7B-01`。

仍 open（non-blocking）：`R7E-R7Z-01`（无 Surface Runtime V1 宿主可薄接；不要为它重写 R7-B）。

## R8 仍 LOCKED

交付 Gate 通过 **不等于** R8 `READY`。教师 2026-08-17 报告的编辑态回归必须先处理：

1. **编辑画布单击/双击闪黑屏**（「隔离页面已连接，正在启动 Player…」）。根因：R6-Z 把 Workspace 按 `locationId:generation` 整棵重挂。协调者已在本 Gate 后立刻去掉该 `key`，并让同一 location 的 `switchCourseAuthoringLocation` 不再涨 generation。尚未做窗口复核。
2. **左栏课树不能拖排页面**：R6 统一树丢掉 `@dnd-kit`。命令仍在，UI 未接。不阻塞本 Gate，但阻塞「V8 可达编辑能力零降级」的 R8 宣称。
3. PPTX/PDF/DOCX 未各写一次文件（R7 预算只冒烟一个 HTML）。
4. recovery offer 框未在 fresh profile 弹出（无恢复文件时正确）。

## R8 已按 11.4 拆分并行

教师 2026-08-17 要求把本文件第 1–2 项与 R8 同时拆成可并行子任务并执行。Wave 8a：R8-A 窗口证明第 1 项；R8-B 恢复课树拖排；R8-C/D 跑机器命令。Electron 仍互斥。**禁止**把产品标为 `accepted`。

## 仍不是

- art candidate / accepted
- 全量 typecheck / E2E / 视觉
- 编辑态黑屏已窗口关闭（代码已改，未冒烟）
