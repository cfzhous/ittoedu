# 并行任务共享合同

> APPLIES_TO: `AI_NATIVE_PARALLEL_*_LANE.md` 与 `AI_NATIVE_PARALLEL_90_FINAL_GATE.md`
> PURPOSE: 让多个 AI 同时工作时保持数据语义、文件归属和验证边界一致

## 1. 不可改变的产品合同

1. Course Project V9 是唯一写入真相；不得新增 V10、`projectMode` 或迁移系统。
2. 原 `App.tsx`、Store、Workspace 和文件生命周期保持唯一正式入口。
3. `teacher-controller` 始终只在 `project.globalLayerItems` 保存一份；不得复制到 scene/surface/world/state。
4. 一次教师提交只产生一次 history 和一次 revision；无变化不得提交。
5. Trial/Player 的移动、折叠、相机与其他会话状态不得写回工程。
6. 当前版本不增加可见 AI：没有 AI 按钮、复制引用、Clipboard、Patch 文件选择、确认应用、聊天、模型、账号、Provider 或网络调用。
7. P5 只允许未挂载的窄类型、纯函数、parser/preflight 和批量拒绝边界。
8. 不新增依赖、Schema、IPC、第二 Store/Workspace/Shell 或通用 command framework。

## 2. 文件独占规则

- 一个生产文件同一时间只属于一个 lane。
- 非 SHELL lane 不得修改 `src/renderer/App.tsx`；需要接线时提交“集成请求”，格式见 §5。
- FLOW lane 不得修改壳层、导出、AI 接口文件。
- AI-BOUNDARY lane 不得修改 Flow、ScenePanel、RightSidebar、Schema、Store 或 IPC。
- RELEASE lane 不得为了测试方便修改编辑器 UI 或数据模型。
- DOCS lane 不得修改生产代码，也不得把测试存在但 UI 不可达的能力写成“已支持”。
- 未列入允许文件的相邻改动必须停止并交给协调者，不得自行扩大范围。

## 3. 最小测试政策

普通任务包只允许运行：

- 该包列出的 1–3 个精确 Vitest 文件；
- 必要时一个精确 `node --test` 文件；
- `git diff --check -- <本包文件>`。

普通任务包禁止运行：

- `npm test`
- `npm run test:compat`
- `npm run build` / `npm run build:desktop`
- `npm run prepare:e2e`
- 任意 Playwright/Electron E2E
- `npm run verify` / `npm run verify:full`

`npm run typecheck` 也不在每包重复执行；只在 `I1` 执行一次。最终全量命令只在 `Z1` 执行。

如果最小测试暴露跨 lane 问题，记录归属和复现命令后停止；不得用全量测试寻找更多问题。

## 4. 实施纪律

1. 开始前记录 `git status --short`，不得清理他人修改。
2. 先写或更新最小断言，再做实现。
3. 不用 `as any`、静默 catch、测试专用生产分支或放宽断言掩盖失败。
4. 不重排、格式化或重命名无关代码。
5. 使用 `apply_patch` 编辑文件。
6. 任务包只在合同、最小断言和定向测试同时成立时标记 `DONE`。

## 5. 接线请求格式

非 SHELL lane 若需要 App/跨 lane 接线，只在交付中提供：

```text
INTEGRATION_REQUEST
来源任务：C1 / D2 / E1
目标文件：src/renderer/App.tsx
需要的输入：精确类型/prop/callback
需要的动作：一条窄描述
禁止副作用：history/revision/dirty/Clipboard/IPC 等
覆盖断言：应由哪个现有测试补哪一条断言
```

不得在自己的分支直接修改目标文件。

## 6. 每包交付格式

```text
TASK_ID：
状态：DONE / BLOCKED
修改文件：
可见结果：
关键不变量：
最小验证：命令 + 结果
Integration request：无 / 按 §5
Pipeline status：engineering candidate / unusable
已知风险：
```

## 7. 停止条件

出现任一情况立即停止并交给协调者：

- 需要 Schema、IPC、依赖、第二入口或持久化新字段。
- 需要修改其他 lane 的独占文件。
- 无法同时满足单一全局控制器和任意页面作者入口。
- 最小测试连续三次因同一跨模块原因失败。
- 需求必须增加可见 AI 或模型调用才能成立。
