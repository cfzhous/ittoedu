# 唯一活动产品工作区登记

> owner：协调者 / R0-A
> 更新：2026-08-18（卫生清理：已移除计划目录 `output/worktrees/` 下全部过期 T-* / v9-parity 检出；活动产品仍仅此 worktree）

| 字段 | 值 |
|---|---|
| 角色 | **唯一活动产品 worktree** |
| 绝对路径 | `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` |
| 分支 | `codex/v8-to-v9-rebuild` |
| 基线 SHA | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
| 启动命令 | 在产品 worktree 根目录执行 `npm run dev` |
| 开发渲染地址 | `http://127.0.0.1:5173/` |
| 入口 | `src/renderer/main.tsx` 直接渲染成熟 V8 `App` |
| 计划/供体目录 | `C:\Users\74755\Documents\HTML课件编辑器`（`codex/v9-editor-v8-base` @ `475503498323`，只读供体） |
| 任务包 | `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild\` |

规则：

- 所有产品源码修改必须在产品 worktree 进行。
- 计划目录不得再被称作“当前版”。
- 供体目录已有未提交修改属于用户/计划工作，不得清理或覆盖。
- R0-G 已确认 `f272756` 为产品主干。允许按任务包移植纯 V9 协议/库代码；仍不得引入 CourseStudio / controlled UI / 第二产品路由，R3-CUT 前不得切换默认 backend。
