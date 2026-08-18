HANDOFF
- task: R2-E
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 scene-only 图层动作、剪贴板、Delete 焦点 guard 与互动命令/诊断。公共输入只用 R2-A 已冻结的 session / snapshot / `SlideCommandResult`。global/surface 写操作返回 `wrong-owner` 或明确 reason，禁止「成功但未操作」。未改 NodesTab / App / store / Workspace / R2-A 三文件 / `v9SlideContentCommands.ts`。未 commit。默认产品仍是 V8。本 lane 为 integration candidate。
- owned files changed (product worktree, new):
  - `src/renderer/course/v9SlideActionCommands.ts`
  - `src/renderer/course/v9SlideClipboard.ts`
  - `src/renderer/course/slideInteractionCommands.ts`
  - `src/renderer/course/slideInteractionView.ts`
  - `tests/unit/v9SlideActionCommands.test.ts`
  计划侧：本 HANDOFF。未改账本。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/slideInteractionCommands.ts`（scene 规则增删改复制移动、锁定写拒绝；去掉 `courseStudioModel`，改为 `commitSlideProjectMutation` / `SlideAuthoringHistory`；global 写改为 `wrong-owner`）
  - `git show 4755034:src/renderer/course/slideInteractionView.ts`（`collectV9InteractionRuleWarnings`、V8 形 scene 投影；补 V9 native video 诊断）
  - 供体 `v9SlideVerticalSlice.ts`：`executeSlideEditorAction`、`copyV9SlideLayers` / `pasteV9SlideLayers`、`deleteV9SlideLayers`、`duplicateNodeInteractionGraph`、`reorderV9SlideLayers`、named-state hide vs structural delete
  - 供体 `editorActionTypes.ts` / `editorActionRouting.ts` 的 action ID 集合与 Delete 焦点 ignore（产品 worktree 无这些文件，ID 表建在本 lane，不迁 R6-C 路由）
  - 产品 V8 `editorStore` copy/paste/delete 与 `App.tsx` `isEditingTarget`：粘贴错开 +20；全选含锁定；Delete 另看文字会话
  - R0-B：f272756 UI 无独立「置顶/置底/上移一层」按钮，图层靠拖排。domain 仍提供 reorder/bring-front/send-back，未改 NodesTab
  - R2-A / R2-SEAM 冻结接口
- donor 舍弃部分:
  - `courseStudioModel` / `updateCourseProject` / `commitCourseHistory`
  - global/surface 图层写、global 互动写、`executeSlideEditorAction` 对 edit-text/fit 的 ok:true 空成功
  - `editorActionRouting.ts` / `editorActionTypes.ts`（R6-C；产品 worktree 不存在）
  - NodesTab 增加置顶/置底按钮
  - 把 V8 App 快捷键改接到 V9（R2-Z）
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideActionCommands.test.ts
  git diff --check -- src/renderer/course/v9SlideActionCommands.ts src/renderer/course/v9SlideClipboard.ts src/renderer/course/slideInteractionCommands.ts src/renderer/course/slideInteractionView.ts tests/unit/v9SlideActionCommands.test.ts
  ```
- validation result: Vitest 1 file / 7 tests passed，2.62s（复跑 3.25s）。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，文件仍为 untracked）。未跑 `tests/unit/editorActionRouting.test.ts`（产品 worktree 无此文件）。
- validation entry / fixture / backend:
  - entry: `executeSlideSceneAction`、`selectAllSlideSceneLayers`、`reorderSlideSceneLayers` / `nudgeSlideSceneLayers`、`patchSlideSceneLayers`、`deleteSlideSceneLayers`、`copySlideSceneClipboard` / paste/duplicate、`shouldIgnoreSlideLayerDeleteForFocus`、`addSlideSceneInteractionRule`、`collectV9InteractionRuleWarnings`
  - fixture: 内存 V9 Slide（scene 文字 + 锁定文字 + Runtime `nodeBindings` + 单击互动；global/surface 各一条只读层）
  - backend: 纯 Slide domain / in-memory session；默认产品仍为 V8 `App`
- validation proves / does not prove:
  - proves: scene 内选择/拖排/上移/置顶/锁定/隐藏/删除一次 history；copy/cut/paste/duplicate 新稳定 ID 并重写互动与 Runtime binding；文字/公式/contenteditable 焦点 Delete 拒绝；global/surface 写 `wrong-owner` 且文档未变；named-state 继承项隐藏、state-owned 结构删除；删除后互动不再引用已删元素，否则 `collectV9InteractionRuleWarnings` 给出原因
  - does not prove: 未接真实 NodesTab / App 快捷键 / 右键菜单；未改默认 V8；未证明 global/surface 图层编辑（R3）；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-E
  - target hotspot file: 禁止改 editorStore.ts / App.tsx / Workspace.tsx / NodesTab.tsx
  - exported symbol / callback: selectSlideCandidateBackend、selectSlideAuthoringSnapshot
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/v9SlideBackendSelection.test.ts
  - exact wiring requested: R2SEAM-R2E-01 已由本任务消费：图层/剪贴板/Delete/互动只走 scene candidate 命令模块；未改 store/App/NodesTab；global/surface 写拒绝；默认 V8 不放 no-op。
  - risk if omitted: （已消费）
  - status: implemented（lane 侧已满足；待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-E
  - target stage integrator: R2-Z
  - target hotspot file: src/renderer/ui/NodesTab.tsx、src/renderer/App.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: executeSlideSceneAction、shouldIgnoreSlideLayerDeleteForFocus、classifySlideAuthoringFocus、SLIDE_SCENE_ACTION_COMMAND_MAP、reorderSlideSceneLayers、copySlideSceneClipboard
  - required user-visible behavior: V9 candidate 注入时，图层拖排/锁/隐/复制/删除与键盘走同一 action ID；文字、公式、contenteditable 中 Delete 不删图层。默认入口仍是 V8，禁止 candidate UI no-op。f272756 无独立置顶/置底/上移一层按钮，不要为接线新增这些按钮。
  - focused test proving lane side: tests/unit/v9SlideActionCommands.test.ts
  - exact wiring requested: 见下方「R2-Z：NodesTab / 快捷键 / Delete 焦点保护」。clipboard payload 由 R2-Z 存在 candidate 旁；本任务不改 store。成功 command 后需 `set` 刷新订阅（见 R2SEAM-R2Z-01）。
  - risk if omitted: V9 candidate 图层动作仍写 V8 project，或 Delete 在文字焦点误删图层
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未接真实 NodesTab 拖排；bring-front/send-back 仅 domain，UI 入口仍是拖排
  - 剪贴板不在 store 中，R2-Z 接线前 candidate 会话外无法粘贴
  - 复杂跨 scene 互动图、组件 nested content 未覆盖
- rollback point: 删除产品 worktree 中上述 5 个未跟踪文件。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## Action ID → command

右键 / 键盘 / 工具栏共用。本任务只定义映射，不改 UI。

| action ID | command | 说明 |
|---|---|---|
| `select-all` | `selectAllSlideSceneLayers` | 当前 scene 全部可选图层（含锁定） |
| `copy` | `copySlideSceneClipboard` | 不写 history；返回 payload |
| `cut` | copy + `deleteSlideSceneLayers` | 一次 history |
| `paste` | `pasteSlideSceneLayers` | 新 ID、+20 错开、重写引用 |
| `duplicate` | `duplicateSlideSceneLayers` | 一次 history |
| `delete` | `deleteSlideSceneLayers` | 先过 Delete 焦点 guard |
| `reorder` | `reorderSlideSceneLayers` | NodesTab 拖排：back-to-front id 列表 |
| `move-forward` / `move-backward` | `nudgeSlideSceneLayers` | domain 上/下移；不要加 UI 按钮 |
| `bring-front` / `send-back` | `nudgeSlideSceneLayers` | domain 置顶/置底；不要加 UI 按钮 |
| `show` / `hide` / `lock` / `unlock` | `patchSlideSceneLayers` | 多选一次 history；锁定项可解锁 |
| `rename` / `edit-text` / `edit-formula` / `replace-media` / `fit` / `reset-view` | 拒绝，明确 reason | 避免假成功；分别属属性栏 / R2-C / R2-D / R2-B |
| `insert-*` / `indent` / `outdent` / `focus` | 拒绝「幻灯片元素不支持该动作」 | Flow/Spatial |

入口：`executeSlideSceneAction(actionId, session, { clipboard, focus, orderedLayerItemIds, expectedRevision, now })`。

global/surface `scope`：任何写动作 `ok: false`、`reason: 'wrong-owner'`、`historyEntry: false`。

## Delete 焦点 guard

```ts
import {
  classifySlideAuthoringFocus,
  shouldIgnoreSlideLayerDeleteForFocus,
  SLIDE_DELETE_FOCUS_GUARD_REASON,
  executeSlideSceneAction,
} from '@/renderer/course/v9SlideActionCommands'
```

`shouldIgnoreSlideLayerDeleteForFocus` 在下列焦点为 true：`input` / `textarea` / `select` / `contenteditable` / `text-edit-session` / `formula-edit-session` / `runtime-author-session` / `component-author-session`。

`executeSlideSceneAction('delete'|'cut'|'duplicate')` 在同一焦点下也会拒绝（`SLIDE_DELETE_FOCUS_GUARD_REASON`），避免漏接 UI 时误删。

## R2-Z：NodesTab / 快捷键 / Delete 焦点保护

默认 V8：`selectSlideCandidateBackend(state) === null` 时继续现有 `copySelectedNodes` / `deleteSelectedNodes` / NodesTab store action。不要包一层 no-op。

V9 candidate：

1. **NodesTab 行内锁/隐/复制/删除** → `executeSlideSceneAction('lock'|'unlock'|'hide'|'show'|'duplicate'|'delete', session, { expectedRevision })`。不要新增置顶/置底/上移一层按钮。
2. **NodesTab 拖排** → 保持 V8 `visualNodes = nodes.reverse()`，`arrayMove` 后再 `.reverse()` 得到 back-to-front id，调用 `executeSlideSceneAction('reorder', session, { orderedLayerItemIds })`。
3. **App 快捷键** → 先保留 V8 `isEditingTarget`（input/textarea/contenteditable 跳过全部编辑器快捷键）。Delete/Backspace 再调用 `shouldIgnoreSlideLayerDeleteForFocus({ textEditSession: Boolean(editingTextNodeId), formulaEditSession, ...event.target })`；为 true 则不要 `preventDefault`、不要删图层。Ctrl+A/C/X/V/D → `select-all` / `copy` / `cut` / `paste` / `duplicate`。
4. **clipboard** → copy/cut 的 `result.clipboard` 由 R2-Z 存在 candidate 旁（本任务不改 store）。paste 把该 payload 传回。
5. 成功 command 后 `set` 刷新 Zustand 订阅（R2SEAM-R2Z-01）。一次会话一个 backend，不双写 V8 project。
