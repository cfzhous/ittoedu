# T04 — 右键菜单与紧凑有效图层 UI 原语

> Wave：1，可与 T02/T03 并行
> 性质：无 store 的受控展示组件

## 1. 目标

提供可复用但不泛化过度的 UI 原语：一个支持鼠标与键盘的编辑右键菜单，以及一个不会把名称挤成竖排的紧凑有效图层列表。具体命令和 App 接线留给 surface lane 与 T10。

## 2. 独占文件

允许在新目录中新增：

- `src/renderer/ui/editor-actions/EditorContextMenu.tsx`
- `src/renderer/ui/editor-actions/EffectiveLayerList.tsx`
- `src/renderer/ui/editor-actions/editorActions.css`
- `tests/unit/editorContextMenu.test.tsx`
- `tests/unit/effectiveLayerList.test.tsx`

若仓库已有完全等价原语，优先扩展现有窄组件，但不得修改 NodesTab/PropertiesTab/RightSidebar/globals.css。

## 3. 右键菜单合同

- 输入为 T02 的稳定 snapshot、动作列表和 `onInvoke(actionId, snapshot)`。
- 未选中目标上右键时由调用方先更新 selection；组件不自行读画布。
- 禁用项显示原因；不可用动作不能点击或用键盘触发。
- 支持鼠标右键、`Shift+F10`、Menu 键、方向键、Enter/Space、Escape。
- 菜单自动限制在 viewport 内，关闭后恢复触发元素焦点。
- 多选集合内右键保持多选；菜单显示打开瞬间的快照。

## 4. 有效图层合同

每行保持单行紧凑布局，至少包含：

- 拖动柄；
- 来源标签：全课 / 当前内容 / 本页 / 当前状态 / Flow / 世界 / 镜头等；
- 可截断名称与完整 title/aria-label；
- 眼睛、锁和更多菜单；
- selected、locked、hidden、disabled 状态。

列表只发出受控事件：select、rename、reorder、toggleVisibility、toggleLock、openMenu。跨 owner 拖拽由调用方拒绝并说明，组件不伪造排序。

## 5. 不做

- 不读写 store/project/history。
- 不实现具体删除、锁定、排序或复制命令。
- 不修改现有全局 CSS、右栏、画布或 ScenePanel。
- 不新增 UI 库或依赖。

## 6. 最小验证

```powershell
npx vitest run tests/unit/editorContextMenu.test.tsx tests/unit/effectiveLayerList.test.tsx
git diff --check -- src/renderer/ui/editor-actions tests/unit/editorContextMenu.test.tsx tests/unit/effectiveLayerList.test.tsx
```

禁止全量测试、typecheck、build、E2E 和截图基线更新。

## 7. 验收

- 长名称、长列表和 1366 宽度下不会形成竖排文字。
- 菜单与列表均可键盘操作并有清晰焦点。
- 组件不持有业务真相，能被 Slide/Flow/Spatial/global 共用。
- 所有热点接线需求以 `INTEGRATION_REQUEST` 交给 T10。

## 8. 交付记录

HANDOFF
- task: T04
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 交付无 store 的受控右键菜单与紧凑有效图层原语。组件不读画布/store、不执行删除/锁定/排序命令；菜单绑定打开瞬间的 snapshot，图层只发出受控事件。T02 并行期间未 import 其独占文件；菜单对 snapshot 使用泛型，并用 `toEditorContextMenuActions` 把 T02 的 `{ actionId, enabled, reason }` 映到 `{ id, label, enabled, reason }`。
- files changed:
  - `src/renderer/ui/editor-actions/EditorContextMenu.tsx`
  - `src/renderer/ui/editor-actions/EffectiveLayerList.tsx`
  - `src/renderer/ui/editor-actions/editorActions.css`
  - `tests/unit/editorContextMenu.test.tsx`
  - `tests/unit/effectiveLayerList.test.tsx`
  - `docs/tasks/v9-editor/05_CONTEXT_MENU_AND_LAYER_UI.md`（本 HANDOFF）
- focused validation commands:
  - `npx vitest run tests/unit/editorContextMenu.test.tsx tests/unit/effectiveLayerList.test.tsx`
  - `git diff --check -- src/renderer/ui/editor-actions tests/unit/editorContextMenu.test.tsx tests/unit/effectiveLayerList.test.tsx`
- results: 15 passed / 0 failed；`git diff --check` 无空白错误。
- INTEGRATION_REQUESTS:

INTEGRATION_REQUEST
- requester: T04
- target owner: T10
- target file: `src/renderer/App.tsx`
- exported symbol / callback: `EditorContextMenu`, `toEditorContextMenuActions`, `onInvoke(actionId, snapshot)`, `onOpenChange`
- required behavior: 在 App 壳挂一份受控菜单（不要写入 store）。打开前用 T02 `captureEditorMenuSnapshot` 冻结当前 selection；`actions` 由 T02 availability + 标签经 `toEditorContextMenuActions` 生成。`onInvoke` 把同一份冻结 snapshot 交给 T02 路由，由 surface/global adapter 写 history。`Shift+F10` / `Menu` / `ContextMenu` 与鼠标右键共用这一入口；`Escape` 只关菜单并恢复触发元素焦点。未选中目标上打开时由 App/调用方先更新 selection，再 `open=true`。换目标必须先关再开，菜单在 `open` 期间不会因 hover 或 snapshot 重渲染改绑定。
- focused test that proves the lane side: `tests/unit/editorContextMenu.test.tsx`（冻结 snapshot、禁用项不可触发、Escape 恢复焦点、viewport 夹紧）
- risk if omitted: 右键/键盘菜单在默认 V9 路径仍然不存在，§6.1 完成门槛无法闭合。

INTEGRATION_REQUEST
- requester: T04
- target owner: T10
- target file: `src/renderer/ui/Workspace.tsx`
- exported symbol / callback: `EditorContextMenu` 受控 `open` + `anchorPoint`；打开前的 selection 更新
- required behavior: Slide 画布 `contextmenu` 先选中命中目标（已在多选集合内则保持多选），再把 client 坐标与 T02 snapshot 交给 App 菜单。组件不读 Phaser/store。空白画布右键也走同一入口（粘贴/全选/适配视图由 T02 决定可用性）。
- focused test that proves the lane side: `tests/unit/editorContextMenu.test.tsx`（`onOpenRequest` 可返回打开瞬间 snapshot；取消则不打开）
- risk if omitted: Slide 画布仍无右键，只能靠工具栏/图层按钮。

INTEGRATION_REQUEST
- requester: T04
- target owner: T10
- target file: `src/renderer/ui/FlowWorkspace.tsx`
- exported symbol / callback: 同上受控菜单入口
- required behavior: Flow block 右键/Shift+F10 使用同一 `EditorContextMenu` 与同一 T02 snapshot/动作 ID（insert-before/after、indent/outdent、delete、duplicate 等）。不要在 Flow 里再做一份菜单 DOM。
- focused test that proves the lane side: `tests/unit/editorContextMenu.test.tsx`
- risk if omitted: Flow 键盘/右键与画布入口分裂。

INTEGRATION_REQUEST
- requester: T04
- target owner: T10
- target file: `src/renderer/ui/SpatialWorkspace.tsx`
- exported symbol / callback: 同上受控菜单入口
- required behavior: Spatial world / camera / path / relation 右键共用同一菜单；snapshot.owner 使用 T02 的 `spatial-world|spatial-camera|spatial-path|spatial-relation`。坐标用屏幕坐标作 `anchorPoint`。
- focused test that proves the lane side: `tests/unit/editorContextMenu.test.tsx`
- risk if omitted: Spatial 无限画布没有与 Slide/Flow 同一套动作入口。

INTEGRATION_REQUEST
- requester: T04
- target owner: T10
- target file: `src/renderer/ui/RightSidebar.tsx`
- exported symbol / callback: `EffectiveLayerList` 及其 `onSelect` / `onRename` / `onReorder` / `onToggleVisibility` / `onToggleLock` / `onOpenMenu`
- required behavior: Slide / Flow / Spatial / 全局有效图层都渲染 `EffectiveLayerList`，不要继续用 `NodesTab` 或 `RightSidebar` 内联 `FlowLayerList` 当最终表面。行数据由调用方投影：`sourceKind` → 全课/当前内容/本页/当前状态/Flow/世界/镜头，`ownerKey` 必须是真实 owner。`onOpenMenu` 打开同一份 `EditorContextMenu`。`onReorder` 若 `fromOwnerKey !== toOwnerKey` 必须拒绝并说明，不得让列表本地改序（组件本身也不会改序）。侧栏按 1366 宽度约 280px 使用；长名称靠 flex+nowrap+ellipsis 单行截断。不要改 `globals.css`，组件已 import `editorActions.css`。
- focused test that proves the lane side: `tests/unit/effectiveLayerList.test.tsx`（280px 单行、来源标签、受控事件、跨 owner 拖拽不改 DOM 顺序、键盘 F2/方向键/Shift+F10）
- risk if omitted: 图层面板仍是旧 NodesTab/Flow 行，1366 下名称竖排与跨 surface 图层合同无法恢复。

INTEGRATION_REQUEST
- requester: T04
- target owner: T10
- target file: `src/renderer/ui/ScenePanel.tsx`
- exported symbol / callback: `EditorContextMenu`（location / scene / state 目标）
- required behavior: 课程树/场景/状态行右键与 Shift+F10 走同一菜单。未选中先选中，已在多选内保持多选。动作 ID 用 T02 的 rename/duplicate/delete/move-forward/move-backward 等；不要在 ScenePanel 内写独立命令。
- focused test that proves the lane side: `tests/unit/editorContextMenu.test.tsx`
- risk if omitted: 只有画布有右键，课程结构仍无键盘/鼠标动作入口。

INTEGRATION_REQUEST
- requester: T04
- target owner: T10
- target file: `src/renderer/store/editorStore.ts`
- exported symbol / callback: 无。不要为菜单或图层列表新增 store 字段。
- required behavior: 菜单开关、冻结 snapshot、图层行投影都放在 App/adapter 局部状态。T04 组件禁止读 store；T10 也不要把 hover 或临时 `hitId` 写进 snapshot。
- focused test that proves the lane side: `tests/unit/editorContextMenu.test.tsx`（hover/rerender 不换绑定 snapshot）
- risk if omitted: selection 与菜单目标再次分叉，Undo/保存重开无法复现打开瞬间的动作。

INTEGRATION_REQUEST
- requester: T04
- target owner: T10
- target file: `src/renderer/styles/globals.css`
- exported symbol / callback: 无
- required behavior: 不要把有效图层或右键样式写进 globals。`editorActions.css` 已由两个原语自行 import。
- focused test that proves the lane side: `tests/unit/effectiveLayerList.test.tsx`（行高 32px、nowrap、ellipsis、操作列 84px）
- risk if omitted: 再次出现全局 CSS 把名称挤成竖排，或与 T04 布局规则冲突。

- visual/manual evidence: 未截图（任务禁止）。jsdom 在宽度 280 的容器（1366 右栏量级）下断言行 `display:flex; flex-wrap:nowrap; height:32px; writing-mode:horizontal-tb`，名称 `white-space:nowrap; text-overflow:ellipsis`。菜单在 400×300 viewport 下从 (390,280) 夹紧到可视区内。
- remaining risks: 默认产品仍显示旧 NodesTab/FlowLayerList，直到 T10 接线；T02 snapshot 字段是 `focus` / `targets`，与菜单测试夹具的窄 bag 不同，T10 必须传 T02 对象而不是改 T04 去读 store；跨 owner 拒绝文案由调用方提供；Phaser 画布需要受控 `anchorPoint`，不能指望菜单自己命中 canvas。
- status: engineering candidate


