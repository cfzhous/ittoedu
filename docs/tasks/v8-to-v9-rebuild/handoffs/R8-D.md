HANDOFF
- task: R8-D
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: Wave 8a 机器 Gate 全量 Vitest **未绿**。只在产品 worktree 运行一次 `npm test`（`vitest run`），未改任何产品源码，未 commit，未领取 R8-E。失败文件不是 `ScenePanel` / `scenePanelReorder` 未完成形态，因此 **未** 等待 180 秒重跑。`scenePanelReorder.test.tsx` 不存在。
- owned files changed: 仅本 HANDOFF。产品 worktree 零 diff（R8-D 未写源码）。
- donor files/functions consulted: `10_R8_FINAL_FULL_GATE.md` §11.5；`00_INDEX.md`；`01_SHARED_EXECUTION_CONTRACT.md`；产品 `package.json` `"test": "vitest run"`
- focused validation command:
  ```
  npm test
  ```
  工作目录：产品 worktree。未加 `--watch`。未跑 typecheck / build / e2e / `npm run verify` / Electron（作为 R8-D 任务命令）。
- validation result: **blocked。** Vitest v4.1.10。

  | 项 | 数量 |
  |---|---|
  | 通过的文件 | **158** |
  | 失败的文件 | **29** |
  | 文件合计 | 187 |
  | 通过的测试 | **1030** |
  | 失败的测试 | **77** |
  | 测试合计 | 1107 |
  | Duration | 69.12s（Start at 22:06:07） |

  终端 footer 记 `exit_code: 0`，与 Vitest 打印的 29 failed 不一致；R8-D **仍按失败处理**，不把本 lane 标绿。
- preflight (开始前，产品 worktree):
  - `git branch --show-current`: `codex/v8-to-v9-rebuild`
  - `git rev-parse HEAD`: `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
  - `git status --short`: 大量未 commit 的 R0–R8 产品改动（含已修改的 `src/renderer/ui/ScenePanel.tsx`、`src/renderer/store/editorStore.ts` 等热点，以及大量 `?? src/renderer/course/` / V9 测试）。R8-D 未触碰。
- R8-B 竞态: 失败列表 **没有** `ScenePanel.tsx` 语法崩溃，也没有 `scenePanelReorder` 文件。`ScenePanel` 当时仍无 `@dnd-kit` / `reorderCourseSurfaces` UI，但不构成「只因 B 未写完而红」的重跑条件。`flowProductIntegration` 缺的是 `data-testid="add-flow-page"`（现为 `data-alias-testid`），owner=R6，不是 R8-B。
- validation entry / fixture / backend:
  - entry: 仓库默认 `vitest run`（unit + integration；含 Agent Kit / V8 技能测试）
  - fixture: 各测试自带；默认 store 在 R3-CUT 后为 V9
  - backend: 成熟 V8 App + Course Project V9 candidate（CUT 后默认 `v9-slide-candidate`）
- validation proves / does not prove:
  - proves: 全量 Vitest 在冻结基线 SHA 的脏工作树上跑完；158 文件 / 1030 测试绿；29 文件 / 77 测试红，失败名与首条断言如下。
  - does not prove: typecheck、desktop build、Playwright e2e、三视口视觉、17 项体验、教师验收。自动化不得宣称 art/accepted。
- narrow UI smoke, if authorized: 未授权。未做。
- INTEGRATION_REQUESTS: 无（Gate 只记录回派，不接线）。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`npm run check:ai-capabilities`、`npm run typecheck`、`npm run build` / `build:desktop`、`npm run test:e2e`、三视口视觉、17 项体验、`npm run verify`。
  - `tests/unit/coursewareAuthoringRunner.test.ts` 在 Vitest 内触发了 Playwright `locator.click`（等 `export-menu-trigger`，被 `modal-backdrop` 挡住）。R8-D 没有另开 Electron，但该用例可能与 R8-A 的 Electron 槽争用。
  - 主因聚类（不是放宽断言，只作回派索引）：
    1. **R3-CUT 后默认已是 `v9-slide-candidate`**，R2/R3 适配测试仍断言「未注入 candidate 时为 v8」。
    2. **V8 `editorStore` 单测**仍按 V8 `assetFiles` / `globalLayer` / `projectDocumentSchema` 读写，CUT 后走 V9 迁移或 V9 形状。
    3. **R6 新增菜单**把 `add-flow-page` 改成 primary 按钮的 `data-alias-testid`。
    4. **R7 recovery** 仍把 V9 包写进 V8 恢复通道；V8 skill/e2e 脚本因能力清单证据过期或超时失败。
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`；R8-D 无产品改动可回滚。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 失败文件 × owner × 失败测试 × 首条断言

未失败的 Spatial 文件不列入。R5 本轮无失败文件。

### R2 — Slide / 组件 / 文字 / 动画 / V9 Slide 接缝

**`tests/integration/componentCatalogV8Matrix.test.ts`**
- 逐包按需嵌入，并覆盖属性编辑、插入删除、撤销重做和状态覆盖 — `expected '朗读设计' to be '基础属性编辑 1 · 语文朗读标注'`
- 保存重开后保留四个精确包、来源元数据、实例与状态覆盖 — `expected [ Array(1) ] to have a length of 4 but got 1`

**`tests/integration/componentTextEditSession.test.ts`**
- 把命名状态中的文字写为该状态 override，且可单步撤销 — `expected '基础标题' to be '反馈状态标题'`

**`tests/unit/componentPackageManagement.test.tsx`**
- imports multiple packages in one undoable transaction — `expected undefined to be { manifest, files, … }`
- deletes only unused packages and keeps delete undoable with runtime data — `expected {…} to be undefined`（包仍在）
- blocks deletion while any scene or global instance still references the package — 文案缺「1 个全局实例」（收到「0 个全局实例」）
- replaces every scene/global instance in one undo step and preserves props — `Cannot read properties of undefined (reading 'node')`（`project.globalLayer`）
- rejects a different ID or incompatible scope without changing the project — `expected [Function] to throw an error`
- deletes an unreferenced package from the management list — `expect(element).not.toBeInTheDocument()` 仍找到 `component-package-com.example.managed`

**`tests/unit/designTokens.test.tsx`**
- edits font and color tokens through undoable project commands — `designTokens.fonts` `expected length 2 but got 1`

**`tests/unit/developerMode.test.tsx`**
- 场景运行时源码更新进入正常撤销历史 — `runtime?.source` `expected undefined to be 'CoursewareRuntime.define(…)'`
- 代码编辑器拒绝模块语法，只提交通过校验的运行时源码 — `Unable to find a label with the text of: 场景运行时源码`
- 创建组件可编辑副本会生成新身份、切换当前实例且一次撤销恢复 — `expected undefined to be 'com.example.developer.editable.…'`
- 可编辑组件提交前复用完整包校验并保护现有实例作用域 — 期望 throw `'仍有场景实例'`，实际 `'Cannot read properties of undefined (reading 'manifest')'`

**`tests/unit/editorFormattingUi.test.tsx`**
- shows transparency rather than stored opacity — `expected 1 to be +0`
- keeps only playback initial visibility in common properties — 缺 `playbackInitialVisibility: "hidden"`
- remaps existing rich runs when the plain text field is edited — `expected [] to deeply equal [{ start: 0, end: 3, … }]`

**`tests/unit/formulaNode.test.ts`**
- uses the normal state-override and undo/redo command path — objectContaining `type: 'formula'` 不匹配

**`tests/unit/formulaNodeUi.test.tsx`**
- uses linear input and one history transaction instead of editable AST JSON — AST `type: 'row'` deep equal 失败
- keeps a custom accessible description and makes review/restoration explicit — `Unable to find an element with the text: 使用自定义描述`
- groups a selected expression before applying a script template — `expected { type: 'row' } to deeply equal { type: 'script' }`

**`tests/unit/imageSafeAreas.test.tsx`**
- adds, edits, removes, and undoes a stable safe area from image properties — `expected [] to deeply equal [ ObjectContaining { id: /^safe_area_/ } ]`
- does not let the editor exceed the 16-area schema limit — `expect(element).toBeDisabled()` 按钮未 disabled

**`tests/unit/sceneStateUi.test.tsx`**
- edits playback initial visibility without changing stable canvas visibility — `expected 'inherit' to be 'hidden'`
- keeps video diagnostics scoped to the selected scene when legacy ids repeat — `Unable to find an element with the text: /会覆盖该视频/`
- labels which authored state is used by each scene thumbnail — 找不到 button name `打开场景“场景 1”；缩略图使用状态“初始”`（可访问树是课树 `课程结构`）

**`tests/unit/simpleEditorMode.test.tsx`**
- creates, updates, removes, and restores a complete entrance animation atomically — animations `expected length 1 but got 2`

**`tests/unit/textEmphasis.test.ts`**
- writes named-state emphasis through the same update and undo path — 缺 `runs` / `style.emphasis: true`
- keeps node and run emphasis when copying and pasting text — paste 结果缺 `runs`

**`tests/unit/v9SlideBackendSelection.test.ts`**
- defaults to the V8 ProjectDocument backend with null candidate getters — `expected { kind: 'v9-slide-candidate', … } to be { kind: 'v8' }`
- injects one V9 candidate without dual-writing V8 project or history — `expected { schemaVersion: 8, … } to be { schemaVersion: 8, … }`（引用不相等 / 内容已变）
- clears the candidate and returns the session to V8 writes — `expected 'v9-slide-candidate' to be 'v8'`

**`tests/unit/v9SlideProductIntegration.test.tsx`**
- keeps the default store backend on V8 and leaves V8 project writes alone — `expected 'v9-slide-candidate' to be 'v8'`
- notifies Zustand after a successful candidate command — V8 `project` 引用/内容不相等（scenes 被改写）
- inserts two staggered texts, west-resizes, applies selection bold, then undoes — 同上，末条 `expect(project).toBe(v8Project)`

**`tests/unit/v9SlideTextTransaction.test.ts`**
- does not hijack the V8 text path when no candidate backend is injected — `expected { kind: 'v9-slide-candidate', … } to be null`

**`tests/unit/v9SlideViewportAdapter.test.ts`**
- leaves the default V8 Workspace path when no candidate is injected — `expected 'v9-slide-candidate' to be 'v8'`

### R3 — global / 媒体 / 控制器 / CUT 默认 backend

**`tests/unit/assetTransactions.test.ts`**
- undoes and redoes video import, metadata, bytes, and node together — `TypeError: assetFiles.video is not iterable`
- restores previous metadata and bytes when replacing an image payload — asset metadata deep equal 失败（`byteLength`/`filename` 未更新）
- undoes and redoes a sound definition with its asset bytes — `TypeError: assetFiles.audio is not iterable`
- blocks named-state background and node override references with locations — 错误文案含 `surfaces.0.scenes.0.presentation.states.0.backgroundAssetId`，不含 `'状态 state_initial'`
- blocks runtime fallback/source and nested component prop references — `expected true to be false`（`deleteAsset` 未挡住）
- conservatively blocks deletion when component executable context is absent — `ZodError` `Missing component package/version: com.test.missing@4.0.0` @ `migrateProjectV8ToCourseProjectV9` ← `loadProject`

**`tests/unit/batchMediaAndInsertion.test.ts`**
- adds a batch in one transaction… — `TypeError: state.assetFiles.asset_a is not iterable`
- imports a media-library batch without creating nodes and undoes it once — `TypeError: assetFiles.asset_library_b is not iterable`
- falls back to the library instead of reporting false placement near the node limit — `errorMessage` 为 `null`，`toContain` 非法参数
- keeps the insertion tab when creating a missing teacher controller — `expected 'properties' to be 'elements'`

**`tests/unit/globalEditorStore.test.ts`**
- 在隐藏、关闭与恢复教师控制器时始终维持双向一致 — `expected 'canvas' to be 'none'`
- accepts only global-capable V4 packages and creates an undoable placement — `expected undefined to match object { layer: 'overlay', … }`
- moves, resizes, edits copy… — `Cannot read properties of undefined (reading 'node')`
- keeps filtered global visibility schema-valid… — `expected { mode: 'all', sceneIds: [] } to deeply equal { mode: 'include', … }`
- canonicalizes include/exclude visibility when its last referenced scene is deleted — `expected undefined to deeply equal { mode: 'include', … }`
- authors native text, image, and shape nodes in the persistent global layer — types `['teacher-controller']` vs 期望再含 `text` 等
- edits scene and global runtime content… — `runtime source` `undefined` vs `CoursewareRuntime.define(…)`
- keeps scene editing isolated when switching to and from the global layer — `undefined (reading 'node')`
- authors, duplicates, copies, and cleans global node interactions — 同上
- keeps scene copies in global scopes and removes deleted controller targets — `expected undefined to deeply equal [ { type: 'scene.in', … } ]`

**`tests/unit/globalLayerUi.test.tsx`**
- shows native elements and only enables global-compatible component packages — global items `expected length 3 but got 1`
- edits global placement, every component copy field, and both runtime content tables — `undefined (reading 'node')`
- offers a state-free scene directory… — `Unable to find a label with the text of: 目标场景`

**`tests/unit/mediaTab.test.tsx`**
- 显示媒体元数据，把视频添加为画布元素，并删除未使用图片 — `Unable to find an element with the text: lesson.mp4`
- 可复用已导入图片，在当前场景创建新的可编辑图片元素 — 找不到 button `将图片“diagram.png”添加到画布`
- 删除声音定义，并在素材字节缺失时禁用视频添加 — 找不到 button `将视频“lesson.mp4”添加到画布`

**`tests/unit/presenterSettingsUi.test.tsx`**
- 关闭画布控制器后显示警告，并可一键修复 — `Unable to find [data-testid="controller-consistency-notice"]`
- updates the enabled state and the authored-command strategy — `expected true to be false`
- detects, saves, replaces, and removes an additional hardware binding — `expected [] to deeply equal [ ObjectContaining { command: 'next' } ]`
- saves a modified PageDown because only the unmodified key is built in — `expected undefined to match object { key: 'PageDown', ctrlKey: true }`

**`tests/unit/v9GlobalLayerUiAdapter.test.tsx`**
- keeps the default store backend on V8 and does not paint candidate source labels — `expected 'v9-slide-candidate' to be 'v8'`
- reorders inside one owner with one history entry and refuses moving the controller onto a scene — `expected +0 to be 1`（history past）

**`tests/unit/v9MediaTabAdapter.test.tsx`**
- keeps the default V8 MediaTab path when no candidate is injected — `expected 'v9-slide-candidate' to be 'v8'`
- imports image and sound into the candidate sidecar… — sidecar `expected {}` 但收到已写入的 `asset_…`

### R6 — 课树 / 统一新增菜单

**`tests/unit/flowProductIntegration.test.tsx`**
- shows course tree pages and headings, hides paragraphs, cameras, and slide add-scene — `Unable to find an element by: [data-testid="add-flow-page"]`（DOM 有 `scene-panel`；primary 现为 `add-content-primary` + `data-alias-testid`）。跨 lane 说明：测试文件属 R4，失败点是 R6 菜单 testid。

### R7 — persistence / 交付 / 遗留 V8 skill runner

**`tests/unit/recoveryWriteCoordinator.test.ts`**
- 拒绝把 V9 工程包写成 V8 恢复副本 — `expected vi.fn() to not be called at all, but actually been called 1 times`（写入了 zip `PK\x03\x04…`）

**`tests/unit/coursewareAuthoringRunner.test.ts`**
- rejects output aliases and wrong extensions before launching Electron — `Test timed out in 5000ms`
- runs a real native text Editor round trip… — `run-courseware-authoring.ts` 失败：`locator.click` timeout；`export-menu-trigger` 被 `div.modal-backdrop` 拦截

**`tests/unit/projectV8CoursewareEndToEnd.test.ts`**
- runs V2 readiness, init, real TS build… — `init_v8_implementation.py` 失败：`Capability evidence is stale` / `generation-evidence.json` 过期（提示 `npm run generate:ai-capabilities`；R8-D **未**执行该命令）

**`tests/unit/projectV8CoursewareSkill.test.ts`**
- binds evidence to exact bytes and never lets automation grant accepted — `Test timed out in 5000ms`

### R4 / R5 / R8-B

- R4：无独立失败文件（Flow 壳层那条记在 R6）。
- R5：无失败文件。
- R8-B：无失败文件。不要把本 HANDOFF 的红测派给 R8-B，除非后续复跑出现 `ScenePanel` / `scenePanelReorder` 专属失败。

## 未跑集合（R8-D 授权外）

- typecheck（R8-C）
- `check:ai-capabilities`（R8-C）
- `build` / `build:desktop`（R8-E）
- `test:e2e` / Playwright 产品路径（R8-F）
- 三视口视觉（R8-G）
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full`（任何 R8 子任务均禁止）
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-D 不领取 R8-E。机器全绿才能进入项目级 `engineering candidate`；本任务不是。quality 保持 `unverified`。禁止 art/accepted。
