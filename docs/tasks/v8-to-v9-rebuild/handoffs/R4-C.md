HANDOFF
- task: R4-C
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 落地 Flow **共享媒体/组件/Runtime/global overlay 适配**，证明文中 block vs 浮层所有权。默认图片/视频/声音插入 `FlowMediaBlock`（随正文、不进图层）；显式 Alt/菜单「作为浮层添加」才进 `surfaceLayerItems`（全局 scope 则进 `globalLayerItems`）。Component/Runtime/图形默认页面浮层；组件可「嵌入为文档块」。文中媒体 ↔ 浮层、组件 ↔ 文档块各一次 history，失败给可读原因，禁止 silent 把文中图写进图层。`projectFlowUnifiedOverlays` / `getEffectiveCourseLayerOrder` 只有真实 overlay；paragraph/heading/文中 media/文中 component 排除。点击全局项进入真实 global scope；控制器是 viewport 浮层，可设逐 location 显隐。Delete 走 R4-A `executeFlowDelete`。未改 App/store/Workspace/ScenePanel/RightSidebar/MediaTab/ComponentsTab/PropertiesTab/NodesTab，未复制这些面板，未改 R4-A 命令文件，未 commit。本 lane 为 integration candidate，不是 art/accepted，**不宣称 Flow UI 已可用**。
- owned files changed (product worktree, new):
  - `src/renderer/course/flowSharedAuthoringAdapters.ts`
  - `src/renderer/course/flowOverlayProjection.ts`
  - `src/renderer/authoring/flowOverlayAuthoring.ts`
  - `tests/unit/flowSharedAuthoringAdapters.test.tsx`
  - `tests/unit/flowUnifiedLayers.test.tsx`
  计划侧：本 HANDOFF。未改账本 / `00_INDEX.md` / UI 热点。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/ui/MediaTab.tsx`（V8 点选即 `addImageNode`/`addVideoNode`；无 Flow 文中/浮层分流）
  - `git show 4755034:tests/unit/flowUnifiedLayers.test.tsx`、`flowAuthoringTargets.test.tsx`（Player host / 弱画布命中）
  - `git show 4755034:src/renderer/ui/FlowElementsTab.tsx`（确认反模式后丢掉）
  - 产品 R4-A：`insertFlowEditorBlock`、`executeFlowDelete`、`selectFlowOverlay` / `selectFlowGlobalScope`、`buildFlowEditorView().overlayLayers`、`isFlowZOrderLayerBlock`
  - 产品 R3：`getEffectiveCourseLayerOrder`、`allocateCourseLayerOrder`、`setGlobalLayerVisibleAtLocation`、`patchEffectiveLayerItem`、`deleteEffectiveLayerItem`、`sceneNodeToCourseLayerItem`、教师控制器 global owner
  - `v9SlideContentCommands` 的 image/video/component/runtime 层构造（只作 overlay 形态参考）
- donor 舍弃部分:
  - `FlowElementsTab` / `FlowPropertiesTab` / CourseStudio 弱面板整文件
  - donor `flowUnifiedLayers.test.tsx` 的 Player/`FlowSurfaceHost`/`PublishedCourseApp` 捕获（属 R4-D）
  - donor `flowAuthoringTargets.test.tsx` 的 `surface:…/block:…` 与持久 `hitId`
  - 把 paragraph 当 `flow-block` 图层行的 `buildFlowEffectiveLayers`
  - 改 MediaTab/NodesTab/ComponentsTab 或复制右栏
- focused validation command:
  ```
  npx vitest run tests/unit/flowSharedAuthoringAdapters.test.tsx tests/unit/flowUnifiedLayers.test.tsx
  git diff --check -- src/renderer/course/flowSharedAuthoringAdapters.ts src/renderer/course/flowOverlayProjection.ts src/renderer/authoring/flowOverlayAuthoring.ts tests/unit/flowSharedAuthoringAdapters.test.tsx tests/unit/flowUnifiedLayers.test.tsx
  ```
- validation result: Vitest 2 files / 9 tests passed，1.74s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset -- <owned files>`，文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `insertFlowSharedMedia` / `insertFlowSharedComponent` / `insertFlowSharedRuntime` / `insertFlowSharedShape`、`resolveFlowMediaInsertPlacement`、`convertFlowMediaBlockToOverlay` / `convertFlowOverlayMediaToDocument`、`convertFlowComponentBlockToOverlay` / `convertFlowOverlayComponentToDocument`、`executeFlowSharedDelete`、`classifyFlowSharedInteraction`、`enterFlowGlobalAuthoring`、`setFlowOverlayVisibleAtLocation`、`resolveFlowOverlayAuthoringTarget`、`projectFlowUnifiedOverlays`、`getEffectiveCourseLayerOrder`
  - fixture: 内存纯 Flow V9（H1/H2 + paragraph + 文中 image/audio/component + surface 文字浮层 + global 教师控制器）
  - backend: 纯 V9 document 适配；未接 App/Workspace/MediaTab/NodesTab/Player
- validation proves / does not prove:
  - proves: 默认媒体插入文中 block 且不进 `getEffectiveCourseLayerOrder`；Alt/显式 placement 才进 overlay；音频无 native 浮层形态时拒绝并保持文中块；组件/Runtime/图形默认浮层，组件可嵌入文档块；互转一次 revision；paragraph/音频不能 silent 进图层；图层投影排除 paragraph/heading/文中 media/component，含控制器 viewport 浮层；全局入口切 scope 并可逐页隐藏控制器；文档焦点 Delete 不删浮层，overlay 焦点删浮层；hitId 不进 authoringAddress
  - does not prove: 未接真实 MediaTab/ComponentsTab/NodesTab/ScenePanel/FlowWorkspace/Player；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。未开始 R4-B/D/Z。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R4-C
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/ui/MediaTab.tsx、src/renderer/store/editorStore.ts、src/renderer/App.tsx
  - exported symbol / callback: insertFlowSharedMedia、resolveFlowMediaInsertPlacement
  - required user-visible behavior: Flow 页下点选图片/视频/声音默认插入文中 media block（随正文、不进图层）。卡片菜单或 Alt 点击走「作为浮层添加」才进 surfaceLayerItems（已在全局层则进 globalLayerItems）。插入失败必须把 reason 显示给教师（未选页、资产为空、声音不能作浮层），禁止空回调假成功。
  - focused test proving lane side: tests/unit/flowSharedAuthoringAdapters.test.tsx（默认文中 / Alt 浮层 / 空资产拒绝 / 音频 overlay 拒绝）
  - exact wiring requested: R4C-R4Z-01。Flow 页不要再调用 addImageNode/addVideoNode。默认 insertFlowSharedMedia({ assetId })；Alt 或菜单 insertFlowSharedMedia({ assetId, altKey: true }) 或 menuAction: 'insert-overlay'。失败时用返回的 reason，不要吞掉。
  - risk if omitted: 点选即进图层，合同 C5/C9 回退；或空回调看起来已插入
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-C
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/ui/NodesTab.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: projectFlowUnifiedOverlays、flowNodesTabOverlayIds、buildFlowEditorView().overlayLayers、getEffectiveCourseLayerOrder
  - required user-visible behavior: Flow 页图层只列本页真实浮层（surface/global，含教师控制器）。heading/paragraph/文中 media/文中 component 不是图层行。空态沿用合同 A10。
  - focused test proving lane side: tests/unit/flowUnifiedLayers.test.tsx
  - exact wiring requested: R4C-R4Z-02。Flow 页 NodesTab 用 overlayRows / nodesTabIds，不要把 view.blocks 画成图层，也不要直接把 projectEffectiveLayers.unifiedRows 里可能混入的文档 id 当行。
  - risk if omitted: 右栏再次出现段落/文中图行
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-C
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/ui/ScenePanel.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: enterFlowGlobalAuthoring、listFlowGlobalAuthoringItems、setFlowOverlayVisibleAtLocation、selectFlowAuthoringFromOverlayHit
  - required user-visible behavior: 点击「共享内容 → 全局层（全课）」进入真实 global authoring scope，不改课程树、不创建 location。控制器和普通 global item 可选、可改属性、可设当前页显隐。控制器是视口浮层，不是稿纸页脚。
  - focused test proving lane side: tests/unit/flowSharedAuthoringAdapters.test.tsx（enterFlowGlobalAuthoring + 逐页隐藏控制器）
  - exact wiring requested: R4C-R4Z-03。入口调用 enterFlowGlobalAuthoring(document, locationId)；点全局行用 selectFlowAuthoringFromOverlayHit 或 selectFlowOverlay(..., 'global')。逐页显隐走 setFlowOverlayVisibleAtLocation。不要把控制器写进 Flow blocks。
  - risk if omitted: 全局层仍是假入口，或控制器被画成文档页脚
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-C
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/ui/ComponentsTab.tsx、src/renderer/ui/ElementsTab.tsx、src/renderer/App.tsx
  - exported symbol / callback: insertFlowSharedComponent、insertFlowSharedRuntime、insertFlowSharedShape、convertFlowMediaBlockToOverlay、convertFlowOverlayMediaToDocument、convertFlowComponentBlockToOverlay、convertFlowOverlayComponentToDocument、executeFlowSharedDelete、classifyFlowSharedInteraction
  - required user-visible behavior: 组件/Runtime 默认页面浮层；右键「嵌入为文档块」才写 FlowComponentBlock。图形无 shape block，只能浮层。右键互转各一次 history。App Delete 按焦点走 executeFlowSharedDelete（即 R4-A executeFlowDelete）。互动只绑浮层，文档段落拒绝画布入场动画。
  - focused test proving lane side: tests/unit/flowSharedAuthoringAdapters.test.tsx（默认浮层、嵌入文档块、互转、Delete 分流）
  - exact wiring requested: R4C-R4Z-04。组件默认 insertFlowSharedComponent({ packageId })；菜单 embed-document 必须带 staticFallbackAssetId。图形 insertFlowSharedShape。Delete 不要另写一套。不要新建 Flow 专用组件/属性面板。
  - risk if omitted: 组件默认进正文或图形被做成假文档块；Delete 误删块/浮层
  - status: open
  ```
- DECISION_REQUESTS: 无。声音没有 native 浮层类型；显式「作为浮层添加」返回 `FLOW_AUDIO_OVERLAY_REASON`（「声音没有页面浮层形态，请插入文中媒体块」），不升 V10，不 silent 写入图层。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未接真实 MediaTab / ComponentsTab / NodesTab / ScenePanel / FlowWorkspace
  - 音频 overlay 因 schema 无 native audio 层而拒绝；R4-Z 接线须展示该 reason
  - Runtime 不能嵌入为文档块（无 FlowRuntimeBlock）
- rollback point: 删除产品 worktree 上述 5 个未跟踪文件。基线仍为 `f272756`。未改热点。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified
