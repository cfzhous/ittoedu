# T06 — 全局层、教师控制台、声音与统一图层

> Wave：2，可与 T05/T07–T09 并行
> 核心决策：全局层保留为四态可见作者入口，与页面形态正交
> 中央壳接线：T10；Player 控制器接线：T09

## 1. 可见结果

- 左栏可进入“共享内容 → 全局层（全课）”；它不是 location，也不改变 Pure/Mixed。
- 右侧有效图层紧凑展示 global/surface/page/state/world 等真实来源，并能进行 owner 允许的排序、锁定、隐藏、复制、删除/状态隐藏。
- 教师控制台的选择框、拖动、八向 resize、属性折叠与预览一致；移除无意义的“定位控制器”。
- 声音可导入、试听、重命名、删除、引用检查并在发布中工作。

## 2. 独占文件

允许修改：

- `src/renderer/ui/NodesTab.tsx`
- `src/renderer/ui/PropertiesTab.tsx`
- `src/renderer/ui/MediaTab.tsx`
- `src/shared/teacherControllerLayout.ts`
- `src/shared/teacherControllerConsistency.ts`
- 允许新增 `src/renderer/course/globalLayerCommands.ts`
- 允许新增 `src/renderer/course/effectiveLayerCommands.ts`
- 直接对应的 global/controller/media/layer 单测

以下只读：App/store/Workspace/ScenePanel/RightSidebar/globals.css、T05 Slide 文件、Player 文件，以及 T09B 独占的 `src/renderer/project/**` 资源事务。若声音/媒体导入需要底层资产改动，向 T09B 提交请求；其他接线提交给对应 owner。

## 3. 全局与共享层合同

- global 入口固定存在于四态壳层，选择它只切 authoring owner，active location 继续提供预览上下文。
- `globalLayerItems` / `surfaceLayerItems` 继续保存与发布；不迁移到 V10，不物化为每页副本。
- 统一有效图层保留真实 owner 和稳定 `authoringAddress`。
- owner 内可排序；跨 owner 拖动必须执行明确 scope move 或拒绝并说明，不能假排序。
- global 删除提示影响范围；默认教师控制器删除后提供显式恢复命令。
- 锁定项可选择/查看，除 unlock 外所有写操作统一拒绝。

## 4. 教师控制台合同

- 作者态动作集固定为：上一场景、下一场景、场景目录、重播、声音、全屏、收起；控制台内不出现“试运行”或“定位”。
- 控制器内容框与 selection chrome 共享规范坐标和 viewport transform。
- pointermove 实时更新预览，pointerup 只提交一次 history。
- 属性面板折叠值、画布预览、当前位置试运行和真实 Player 读取同一 V9 配置。
- global controller 在不同 surface 上保持同一稳定 authoring address；Spatial 中它属于 viewport 层，不随 world 缩放。

本任务实现共享布局/一致性纯合同与面板命令；Workspace/Phaser 接线交给 T10/T05，Player 会话交给 T09。

## 5. 声音与媒体

- 元素/媒体面板恢复声音导入入口和声音库管理。
- 支持试听、重命名、删除、全局音量/静音/声道/ducking。
- 删除被互动动作引用的声音前给出引用清单并阻止或执行明确修复。
- 图片/视频/声音共用 asset 真相；Flow/Spatial 不复制二进制资产。
- 不保留“声音暂不能从此面板管理”作为完成状态。

## 6. 最小验证

```powershell
npx vitest run tests/unit/globalLayerCommands.test.ts tests/unit/effectiveLayerCommands.test.ts
npx vitest run tests/unit/globalLayerUi.test.tsx tests/unit/nodesTabDocumentControl.test.tsx
npx vitest run tests/unit/propertiesTabDocumentControl.test.tsx tests/unit/mediaTab.test.tsx
npx vitest run tests/unit/teacherControllerLayout.test.ts tests/unit/teacherControllerConsistency.test.ts
npx vitest run tests/unit/assetTransactions.test.ts tests/unit/batchMediaAndInsertion.test.ts
git diff --check -- src/renderer/ui/NodesTab.tsx src/renderer/ui/PropertiesTab.tsx src/renderer/ui/MediaTab.tsx src/shared/teacherControllerLayout.ts src/shared/teacherControllerConsistency.ts src/renderer/course/globalLayerCommands.ts src/renderer/course/effectiveLayerCommands.ts
```

只运行与实际修改对应的组。禁止 typecheck、build、全量 test/E2E/visual。

## 7. 验收

- 全局层入口不会被统一有效图层替代或隐藏。
- 长名称不竖排，图层锁定/隐藏/排序有真实命令结果。
- 控制器不存在选择框错位、反向 resize 或只在试运行折叠的模型原因。
- 声音管理功能不再是禁用占位。
- 所有热点/Player 接线请求完整交付。

## 8. 交付记录

HANDOFF
- task: T06
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 全局层命令只切 authoring owner、不改 preview location/revision；`globalLayerItems`/`surfaceLayerItems` 继续保存。统一有效图层命令带真实 owner 与 `authoringAddress`，owner 内排序，跨 owner 无 `scopeMove` 拒绝并说明。教师控制台纯合同：动作集为上一场景/下一场景/场景目录/重播/声音/全屏，收起为 chrome；内容框与 selection chrome 同规范坐标；pointermove 预览与 pointerup 提交共用同一几何；Spatial 属 viewport 层。MediaTab 恢复导入/试听/重命名/删除/声音库/全局音量静音声道 ducking；被引用删除先列清单并阻止。未复制脏树的 hideSharedLayerEntries、「声音暂不能从此面板管理」、取消全局层或「定位控制器」。
- files changed:
  - `src/renderer/course/globalLayerCommands.ts`（新建）
  - `src/renderer/course/effectiveLayerCommands.ts`（新建）
  - `src/shared/teacherControllerLayout.ts`
  - `src/shared/teacherControllerConsistency.ts`
  - `src/renderer/ui/NodesTab.tsx`
  - `src/renderer/ui/PropertiesTab.tsx`
  - `src/renderer/ui/MediaTab.tsx`
  - `tests/unit/globalLayerCommands.test.ts`（新建）
  - `tests/unit/effectiveLayerCommands.test.ts`（新建）
  - `tests/unit/teacherControllerLayout.test.ts`
  - `tests/unit/teacherControllerConsistency.test.ts`
  - `tests/unit/nodesTabDocumentControl.test.tsx`
  - `tests/unit/mediaTab.test.tsx`
  - `docs/tasks/v9-editor/07_GLOBAL_CONTROLLER_AUDIO_AND_LAYERS.md`（本 HANDOFF）
- focused validation commands:
  - `npx vitest run tests/unit/globalLayerCommands.test.ts tests/unit/effectiveLayerCommands.test.ts`
  - `npx vitest run tests/unit/globalLayerUi.test.tsx tests/unit/nodesTabDocumentControl.test.tsx`
  - `npx vitest run tests/unit/propertiesTabDocumentControl.test.tsx tests/unit/mediaTab.test.tsx`
  - `npx vitest run tests/unit/teacherControllerLayout.test.ts tests/unit/teacherControllerConsistency.test.ts`
  - `npx vitest run tests/unit/assetTransactions.test.ts tests/unit/batchMediaAndInsertion.test.ts`
  - `git diff --check -- src/renderer/ui/NodesTab.tsx src/renderer/ui/PropertiesTab.tsx src/renderer/ui/MediaTab.tsx src/shared/teacherControllerLayout.ts src/shared/teacherControllerConsistency.ts src/renderer/course/globalLayerCommands.ts src/renderer/course/effectiveLayerCommands.ts`
- results: 10 files / 77 tests passed（含新建 12 条命令测）；`git diff --check` 无输出。未跑 typecheck / build / 全量 / E2E。未提交。
- INTEGRATION_REQUESTS:

INTEGRATION_REQUEST
- requester: T06
- target owner: T10
- target file: `src/renderer/ui/ScenePanel.tsx`
- exported symbol / callback: `selectGlobalAuthoringOwner`（包装 T03 `selectGlobalLayerScope`）；`buildCourseStructureViewModel` 的 `sharedContent → global-layer`
- required behavior: 四态左栏固定「共享内容 → 全局层（全课）」。选中只切 authoring owner，不得改 `activatedLocationId`、不得升 revision、不得写成伪 location。禁止 `hideSharedLayerEntries`，禁止取消全局层入口。
- focused test that proves the lane side: `tests/unit/globalLayerCommands.test.ts`（select global 不改 location/revision）；`tests/unit/globalLayerUi.test.tsx`（现有 V8 入口回归）
- risk if omitted: 教师无法进入全局层，或选择全局层会切走预览页面。

INTEGRATION_REQUEST
- requester: T06
- target owner: T10
- target file: `src/renderer/ui/RightSidebar.tsx`
- exported symbol / callback: `createEffectiveLayerListHandlers`、`listEffectiveLayerCommandItems`、`toEffectiveLayerListItems`；T04 `EffectiveLayerList`
- required behavior: 把 EffectiveLayerList 的 select/rename/reorder/toggleVisibility/toggleLock 接到这些命令；`onReorder` 原样转发，跨 owner 不要本地假排序。`scopeMove: true` 才搬家；教师控制器不能移出 global。删除全局项前展示 `describeGlobalLayerDeleteImpact`。锁定项可选择/查看，除 unlock 外写操作展示 `lockedLayerWriteReason()`。过渡期若仍渲染 NodesTab，传入 `effectiveRows`（不要在 NodesTab 里 import T04）。
- focused test that proves the lane side: `tests/unit/effectiveLayerCommands.test.ts`
- risk if omitted: 图层面板仍是只读检查器，跨 owner 假排序或长名称竖排无法在产品表面消失。

INTEGRATION_REQUEST
- requester: T06
- target owner: T10
- target file: `src/renderer/App.tsx`
- exported symbol / callback: `MediaTab.onImportAudio`；`restoreDefaultTeacherController`；去掉 `mediaUnavailableReason: '声音与媒体素材库暂不能从此面板管理…'`
- required behavior: ElementsTab/嵌入 MediaTab 传入真实 `onImportAudio`/`onImportVideo`，不要再用「暂不能从此面板管理」作为完成态。默认教师控制器删除后，空选全局属性区调用 `restoreDefaultTeacherController`（V8 遗留路径已用「恢复教师控制器」，不要改回「定位控制器」）。不要新增 locate-controller 动作。
- focused test that proves the lane side: `tests/unit/mediaTab.test.tsx`（导入/试听/引用阻止删除）；`tests/unit/globalLayerCommands.test.ts`（restore）
- risk if omitted: 元素面板声音入口仍是禁用占位；删掉控制台后无法显式恢复。

INTEGRATION_REQUEST
- requester: T06
- target owner: T10
- target file: `src/renderer/ui/Workspace.tsx` / Phaser 画布桥
- exported symbol / callback: `captureGlobalControllerTarget`、`previewGlobalControllerTransform`、`commitGlobalControllerTransform`、`mapGlobalControllerChrome`、`teacherControllerGestureFrame`
- required behavior: 控制器内容框与 selection chrome 用同一规范矩形，经同一 viewport transform。pointermove 只更新预览、不写 history；pointerup 用同一几何提交一次。Spatial 使用 `TEACHER_CONTROLLER_SPATIAL_LAYER = 'viewport'` 与 `teacherControllerViewTransformForSurface('spatial-2d', stage)`（scale=1）。不要在控制台内放「试运行」或「定位」。
- focused test that proves the lane side: `tests/unit/teacherControllerLayout.test.ts`；`tests/unit/globalLayerCommands.test.ts`（preview 不升 revision，commit 一次）
- risk if omitted: 选择框错位、反向 resize，或每次 mousemove 都写 history。

INTEGRATION_REQUEST
- requester: T06
- target owner: T09
- target file: `src/player/renderTeacherController.ts` / `src/player/teacherControllerRuntimeSession.ts`
- exported symbol / callback: `createTeacherControllerLayout`、`TEACHER_CONTROLLER_AUTHORING_ACTIONS`、`TEACHER_CONTROLLER_SPATIAL_LAYER`、`synchronizeCourseTeacherControllerControls`
- required behavior: 属性折叠、画布预览、当前位置试运行和真实 Player 读同一 V9 控制器配置。Spatial 控制器挂 viewport 层，不随 world 缩放。过滤「定位」/「试运行」按钮。`playback.controls` 与是否存在 delivery-visible 全局控制器保持 `synchronizeCourseTeacherControllerControls` 不变量。
- focused test that proves the lane side: `tests/unit/teacherControllerLayout.test.ts`；`tests/unit/teacherControllerConsistency.test.ts`
- risk if omitted: Player 折叠/进度与作者态分叉，或 Spatial 里控制器被镜头缩放。

INTEGRATION_REQUEST
- requester: T06
- target owner: T09B
- target file: `src/renderer/project/**`（声音资产 sidecar / `importSound`）
- exported symbol / callback: 现有 `importSound` / asset 字节真相；不要改 T06 MediaTab 合同
- required behavior: V9 session 下导入声音必须写入 Course Project `media.audio.sounds` 与同一 asset 字节。T06 已在 MediaTab 恢复库管理；若 V9 路径仍只写 V8 `project.assets` 而未进 Course Project media，由 T09B 接 sidecar，不要在 T06 改 `src/renderer/project/**`。
- focused test that proves the lane side: `tests/unit/mediaTab.test.tsx`；`tests/unit/assetTransactions.test.ts`；`tests/unit/batchMediaAndInsertion.test.ts`
- risk if omitted: 面板能点导入，但保存重开后声音库是空的。

INTEGRATION_REQUEST
- requester: T06
- target owner: T05
- target file: `src/renderer/course/v9SlideVerticalSlice.ts`
- exported symbol / callback: `reorderGlobalLayerItems` / `applyEffectiveLayerReorder`
- required behavior: 不要再抛「全局层暂不能调整顺序」。全局/有效图层排序走 T06 命令；锁定拒绝与跨 owner 拒绝文案原样展示。
- focused test that proves the lane side: `tests/unit/globalLayerCommands.test.ts`；`tests/unit/effectiveLayerCommands.test.ts`
- risk if omitted: Slide 画布路径仍把全局排序做成禁用错误，T10 接线后教师仍无法调整全课层级。

- visual/manual evidence: 未截图（任务禁止）。jsdom 断言 NodesTab 长名称 `writing-mode: horizontal-tb` + nowrap/ellipsis；控制器 SE/NW resize 方向与视觉边缘一致；Spatial viewport scale=1。
- remaining risks: 产品表面仍由 T10 挂 ScenePanel/RightSidebar/App；在接线前教师看到的仍是旧 NodesTab/「声音暂不能管理」占位。`scene.go` / 「打开场景目录」作为高级选项保留，以满足现有 `globalLayerUi.test.tsx`；默认作者动作集不含「定位控制器」。跨 owner `scopeMove` 目前把条目插入目标列表并重新规范化 order，不保证与视觉「之前/之后」像素级对齐，T10 若要精确落点需在调用方传入与列表视觉一致的 `placement`。
- status: engineering candidate

