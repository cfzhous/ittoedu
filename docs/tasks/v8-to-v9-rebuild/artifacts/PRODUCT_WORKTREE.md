# 唯一活动产品工作区登记

> owner：协调者
> 更新：2026-08-18（已测通过的 V9 重建合回 `main` 与仓库根目录）

| 字段 | 值 |
|---|---|
| 角色 | **当前产品 = 仓库根目录** |
| 绝对路径 | `C:\Users\74755\Documents\HTML课件编辑器` |
| 分支 | `main` |
| 产品提交 | `95eacc19b4ec9c0e07f01c74b8999959db71a1e4`（`codex/v8-to-v9-rebuild`） |
| 基线 SHA | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
| 启动命令 | 在仓库根目录执行 `npm run dev` 或 `npm start` |
| 开发渲染地址 | `http://127.0.0.1:5173/` |
| 入口 | `src/renderer/main.tsx` 直接渲染成熟 V8 `App`（默认 backend 已是 Course Project V9） |
| 任务包 | `docs/tasks/v8-to-v9-rebuild/` |

规则：

- 日常启动、构建和验证都在仓库根目录进行。
- `codex/v8-to-v9-rebuild` 是合入前的产品分支，不再作为第二套当前版。
- `codex/v9-editor-v8-base` 只作历史供体与计划取证。
- 不得引入 CourseStudio / controlled UI / 第二产品路由。
