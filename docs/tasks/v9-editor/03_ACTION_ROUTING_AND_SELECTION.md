# T02 — 统一动作路由与稳定 Selection 合同

> Wave：1，可与 T03/T04 并行
> 依赖：T01 基线矩阵
> 目标：给键盘、右键、画布、图层和属性提供同一批窄动作语义

## 1. 问题

当前 Delete 只覆盖部分 Slide 条件，右键没有有效动作路由，多选、Flow、Spatial、global/surface owner 和文字编辑焦点各走不同分支。任务只建立最小共享合同，不建立泛化 command bus 或插件系统。

## 2. 允许修改

优先新增并独占：

- `src/renderer/course/editorActionTypes.ts`
- `src/renderer/course/editorActionRouting.ts`
- `tests/unit/editorActionRouting.test.ts`

如当前仓库已有等价窄模块，可在不扩大职责的前提下修改它及对应单测，并在 HANDOFF 解释。以下只读：各 surface command、App/store、所有 UI 热点。

## 3. 必须产出

### 3.1 稳定 Selection Snapshot

至少表达：

- session / project revision；
- active location 与 surface kind；
- authoring owner：global、surface、scene/location、state、flow block、spatial world/camera/path/relation；
- 一个或多个稳定 `authoringAddress`；
- 打开菜单时的 selection 快照；
- 当前焦点是否是 input、textarea、contenteditable、文字/公式编辑会话或 Runtime/Component 作者会话。

### 3.2 动作集合

最低动作 ID：

- select-all、copy、cut、paste、duplicate；
- delete、rename；
- move-forward、move-backward、bring-front、send-back；
- show/hide、lock/unlock；
- edit-text、edit-formula、replace-media；
- insert-before/after、indent/outdent；
- focus/fit/reset-view。

动作可用性返回 `enabled` 与明确 `reason`；不能显示会静默失败的动作。

### 3.3 路由边界

- 路由只把动作交给注入的 surface/global adapter，不直接读写 store。
- Delete/Backspace 在可编辑文本焦点内不删除元素。
- 多选动作一次调用一个 adapter，后续 surface command 负责一个 history step。
- 右键打开后使用稳定快照；hover 或 React 重渲染不能换目标。
- `Escape` 只关闭菜单并恢复焦点；`Shift+F10` / Menu 键与鼠标右键共享入口语义。

## 4. 不做

- 不实现具体 Slide/Flow/Spatial 删除和复制。
- 不修改 `App.tsx`、store、Workspace、ScenePanel、RightSidebar、NodesTab 或全局 CSS。
- 不新增快捷键库、事件总线、插件层或持久化字段。
- 不接入可见 AI。

## 5. 最小验证

```powershell
npx vitest run tests/unit/editorActionRouting.test.ts tests/unit/authoringAddress.test.ts
git diff --check -- src/renderer/course/editorActionTypes.ts src/renderer/course/editorActionRouting.ts tests/unit/editorActionRouting.test.ts
```

若第二个现有测试与实现无关，可只跑新测试并说明。不得扩大到全量 Vitest/typecheck/build/E2E。

## 6. 验收

- 同一 snapshot 对鼠标、键盘和菜单产生相同动作可用性。
- 锁定、跨 owner、多选和编辑焦点都有明确结果。
- 路由不持有项目真相，不绕过 surface command/history。
- 对热点接线需求提交 `INTEGRATION_REQUEST`。

## 7. 交付记录

HANDOFF
- task: T02
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 新增无 React、无 store 的窄动作合同。键盘 / 右键 / 画布 / 图层 / 属性共用同一 `EditorSelectionSnapshot` 与 25 个动作 ID；可用性始终带 `enabled + reason`；路由只调用注入的 global/surface adapter，一次多选只打一次 adapter。未建 command bus 或插件层。
- files changed:
  - `src/renderer/course/editorActionTypes.ts`（新增）
  - `src/renderer/course/editorActionRouting.ts`（新增）
  - `tests/unit/editorActionRouting.test.ts`（新增）
  - 本文件交付记录
- focused validation commands:
  - `npx vitest run tests/unit/editorActionRouting.test.ts tests/unit/authoringAddress.test.ts`
  - `git diff --check -- src/renderer/course/editorActionTypes.ts src/renderer/course/editorActionRouting.ts tests/unit/editorActionRouting.test.ts`
- results: 2 files / 19 tests passed；`git diff --check` 无输出。未跑 typecheck / build / 全量 test / E2E。
- INTEGRATION_REQUESTS:

INTEGRATION_REQUEST
- requester: T02
- target owner: T10
- target file: `src/renderer/App.tsx`
- exported symbol / callback: `createEditorSelectionSnapshot`、`interpretEditorEntry`、`routeEditorAction`、`listEditorActions`
- required behavior: 用 `courseSession.sessionId`、`history.present.revision`、active location / surfaceKind / editingScope 与当前选择构造 snapshot。`Ctrl+A/C/X/V/D` 与 Delete/Backspace 先 `interpretEditorEntry` / `resolveEditorActionAvailability`，再 `routeEditorAction`；文本或作者会话焦点内不要 `preventDefault` Delete/Backspace/全选/复制/粘贴。`Escape` 若菜单打开则只关菜单并恢复焦点，不再清空选择。失败 `reason` 必须 `setStatus`，不得吞掉。
- focused test that proves the lane side: `tests/unit/editorActionRouting.test.ts`（文本焦点忽略 Delete；同一 snapshot 可用性一致）
- risk if omitted: 继续停留在 e2e34aa 的「只删单选 Slide、复制粘贴暂不可用、Escape 清空选择」退化入口。

INTEGRATION_REQUEST
- requester: T02
- target owner: T10
- target file: `src/renderer/ui/Workspace.tsx`、`src/renderer/ui/ScenePanel.tsx`、`src/renderer/ui/RightSidebar.tsx`、`src/renderer/ui/TopToolbar.tsx`
- exported symbol / callback: `captureEditorMenuSnapshot`、`interpretEditorEntry`、`listEditorActions`、`routeEditorAction`
- required behavior: 鼠标右键、`Shift+F10`、Menu 键都走 `interpretEditorEntry` → `open-menu`，打开瞬间 `captureEditorMenuSnapshot(live)`；菜单项 `onInvoke(actionId, menuSnapshot)` 不得改读 hover/重渲染后的 live 选择。图层行、属性按钮、空白画布与元素右键共用 `listEditorActions(snapshot)`。
- focused test that proves the lane side: `tests/unit/editorActionRouting.test.ts`（菜单快照不随后续 live 选择变化）
- risk if omitted: T04 菜单原语无法接到真实入口，右键仍不存在。

INTEGRATION_REQUEST
- requester: T02
- target owner: T10
- target file: `src/renderer/store/editorStore.ts`
- exported symbol / callback: `EditorActionAdapters.global` / `EditorActionAdapters.surface`
- required behavior: 注入的 adapter 只转调已有或各 lane 交付的 V9 command（一次调用 = 一个 history step），不在热点里重写删除/复制。`owner === 'global'` 或选择全是 global → global adapter；否则 surface adapter。adapter 必须返回 `{ ok, reason }`。
- focused test that proves the lane side: `tests/unit/editorActionRouting.test.ts`（多选一次 adapter；缺 adapter / 抛错有原因）
- risk if omitted: 路由合同悬空，T05/T07/T08 命令无法从键盘和右键到达。

INTEGRATION_REQUEST
- requester: T02
- target owner: T04
- target file: `src/renderer/ui/editor-actions/EditorContextMenu.tsx`
- exported symbol / callback: `EditorActionAvailability`、`listEditorActions`、`EditorSelectionSnapshot`
- required behavior: 菜单输入为 T02 snapshot + `listEditorActions` 结果；禁用项展示 `reason`，不可点击或键盘触发；`onInvoke(actionId, snapshot)` 原样回传打开时的 snapshot。
- focused test that proves the lane side: `tests/unit/editorActionRouting.test.ts`（每个动作都有 reason）
- risk if omitted: 右键 UI 与动作可用性再次分叉。

- visual/manual evidence: 无 UI 改动；未启动编辑器。
- remaining risks: T10 未接线前产品入口仍是 e2e34aa 退化键盘路径。Adapter 具体删除/复制/层级实现属 T05/T06/T07/T08，本任务只保证调用一次且失败可见。snapshot 需由 T10 从 session 填写 `constraints.clipboardAvailable` / `canDeleteActiveLocation` / 缩进与层级边界，否则粘贴会保持「剪贴板为空」。
- status: engineering candidate


