HANDOFF
- task: R3-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 V9 MediaTab 数据/资源/声音命令与 asset sidecar adapter。图片/视频可入库、批量入库或按 V8 网格加入画布；单张加入画布调用 R2-D `addSlideImageLayer` / `addSlideVideoLayer`（同一套错开）；替换已有 assetId 走 `replaceSlideMediaAsset`；裁剪/适配走 `updateSlideNativeLayerContent`。声音可导入、提供试听 bytes、改名、声道/音量/循环、全局静音/声道/ducking，删除受引用保护。只写 `CourseProjectDocument` + sidecar；V8 `createImageAssetImport` / `createMediaAssetImport` / `planMediaBatchImport` / `commitMediaBatchImport` 默认行为未改。未改 MediaTab / App / store / Workspace / 其他中央热点。未接线 UI。未 commit。本 lane 为 integration candidate。
- owned files changed (product worktree):
  - `src/renderer/course/v9MediaAudioCommands.ts`（新建）
  - `src/renderer/project/v9AssetAdapter.ts`（新建；sidecar / hash 去重 / 引用 / 发布清单覆盖）
  - `src/renderer/project/assetManager.ts`（V9 窄扩展：`courseAssetMetaConflicts`、`cloneCourseAssetBytes`；V8 工厂函数未改）
  - `src/renderer/project/mediaBatch.ts`（V9 窄扩展：`MEDIA_BATCH_CANVAS_LIMIT`、`layoutMediaBatchFrames`；V8 `planMediaBatchImport` / `commitMediaBatchImport` 未改）
  - `src/player/AudioManager.ts`（构造参数改为 `AudioManagerProjectSource`，可读 V8 `ProjectDocument` 与 V9 `CourseProjectDocument.media`；播放逻辑未改）
  - `tests/unit/v9MediaAudioCommands.test.ts`（新建）
  计划侧：本 HANDOFF。未改 `audioManager.test.ts`、MediaTab、账本、archive 默认路径。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/v9SlideVerticalSlice.ts`：`importV9SlideAssets`、`addV9SlideMediaLayers`、`importAssetsIntoProject`、`layoutV9MediaBatch`（只摘入库 + 批量网格语义，未迁 CourseStudio / 第二媒体库）
  - 产品 V8 `MediaTab.tsx`（只读：图片/视频/声音库、试听 Blob、全局声音设置所需数据）
  - 产品 V8 `editorStore`：`importSound` / `importSounds` / `updateSound` / `deleteSound` / `updateAudioSettings` / `deleteAsset` / `layoutMediaBatchNodes` / `MAX_BATCH_CANVAS_ITEMS`
  - 产品 V8 `App.tsx` `prepareAssetBatch` + `planMediaBatchImport` / `commitMediaBatchImport`
  - 产品 `assetManager.ts`：`createImageAssetImport`、`createMediaAssetImport`、`buildAssetContentHashIndex`
  - R2-D：`addSlideImageLayer` / `addSlideVideoLayer` / `replaceSlideMediaAsset` / `updateSlideNativeLayerContent` / `offsetDefaultSlideInsertion`
  - `collectPublishedCourseAssetIds`、`collectCourseProjectReferences`
- donor 舍弃部分:
  - CourseStudio / 第二媒体库 / `importCourseAssets` store 接线 / `CourseStudioApp` 导入按钮
  - 整文件覆盖 `v9SlideVerticalSlice.ts` 的媒体插入
  - MediaTab / ElementsTab / App / store（R3-Z）
  - 把 V8 `saveProject` 写成 V9 archive
- focused validation command:
  ```
  npx vitest run tests/unit/v9MediaAudioCommands.test.ts tests/unit/audioManager.test.ts
  git diff --check -- src/renderer/project src/renderer/course/v9MediaAudioCommands.ts src/player/AudioManager.ts tests/unit/v9MediaAudioCommands.test.ts tests/unit/audioManager.test.ts
  ```
- validation result: Vitest 2 files / 20 tests passed，1.44s（本任务 4 个 + `audioManager` 16 个）。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，文件仍为 untracked）。未改 `audioManager.test.ts`。
- validation entry / fixture / backend:
  - entry: `openCourseMediaSession`、`importCourseMediaAssets`、`dedupeCourseMediaImports`、`addCourseLibraryMediaToCanvas`、`importAndPlaceCourseMedia`、`replaceCourseLayerMedia`、`updateCourseMediaFitCrop`、`deleteCourseAsset`、`importCourseSounds`、`readCourseSoundPreview`、`updateCourseSound`、`updateCourseAudioSettings`、`deleteCourseSound`、`AudioManager`（V9 document）、`createImageAssetImport` / `createMediaAssetImport`
  - fixture: 内存 V9 Slide（空 assets + sidecar）；声音引用交互规则
  - backend: 纯 command/adapter / in-memory candidate session；写 `CourseProjectDocument` + asset sidecar；默认产品仍为 V8
- validation proves / does not prove:
  - proves: MediaTab 所需图片/视频/声音库数据可由命令读写；导入/批量/加入画布/替换/裁剪适配/删除保护；声音导入与试听 bytes、改名、音量/静音/声道/ducking、互动引用保护；sidecar 稳定 ID、内容 hash 复用、引用清理与发布清单覆盖；单张入画布与 R2-D 错开一致；V8 assetManager 工厂路径仍为 `assets/${id}.ext`；AudioManager 可读 V9 `media.audio` 且 V8 测试仍过
  - does not prove: 未接真实 MediaTab / App / store / Workspace / Player；未把命令挂到 candidate backend 方法表；未跑 typecheck/build/E2E/视觉；undo/redo 的 sidecar history 由 R3-Z 按返回的 `nextSession`+`sidecar` 保存
- narrow UI smoke, if authorized: 未授权；未启动 App；未改 MediaTab。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R3-B
  - target stage integrator: R3-Z
  - target hotspot file: src/renderer/ui/MediaTab.tsx、src/renderer/App.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: openCourseMediaSession、readCourseMediaLibrary、readCourseSoundPreview、importCourseMediaAssets、importAndPlaceCourseMedia、addCourseLibraryMediaToCanvas、replaceCourseLayerMedia、updateCourseMediaFitCrop、deleteCourseAsset、importCourseSounds、updateCourseSound、deleteCourseSound、updateCourseAudioSettings、dedupeCourseMediaImports、layoutMediaBatchFrames、nextCourseMediaSession
  - required user-visible behavior: candidate 下同一套 Elements 内嵌 MediaTab 恢复完整图片/视频/声音工作流（导入、批量、加入画布、替换、裁剪/适配、试听、改名、声道/音量/静音/ducking、删除保护）。不得用元素页底部一行“导入声音”替代。默认 V8 继续走现有 editorStore/App 路径。禁止 candidate 时 MediaTab no-op。
  - focused test proving lane side: tests/unit/v9MediaAudioCommands.test.ts（注明尚未接真实 MediaTab，只证明 command/adapter）；tests/unit/audioManager.test.ts（V8 保护）
  - exact wiring requested: R3-Z 在 V9 candidate 会话把 MediaTab 的 store 读写换成上述命令；`onImportImage`/`onImportAudio`/`onImportVideo` 先用 V8 `createImageAssetImport`/`createMediaAssetImport` + `dedupeCourseMediaImports`，再 `importAndPlaceCourseMedia` 或 `importCourseSounds`。加入画布对已入库素材调用 `addCourseLibraryMediaToCanvas`（内部已调 R2-D）。候选 sidecar 与 `nextSession` 一起保存；undo/redo 必须同时恢复 sidecar（与 V8 `commitAssetBatch` 相同）。不要双写 V8 `project.assets` / `assetFiles`。不要把 V8 save 写成 V9 archive。
  - risk if omitted: candidate 下 MediaTab 空白或 no-op；或误把 V8 媒体库接到 V9 session；或保存后 sidecar 丢失导致无法试听/入画布。
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未把媒体命令挂到 `SlideCandidateBackend` 方法表
  - sidecar 不在 Slide history 内；R3-Z 必须把 `CourseMediaSession.sidecar` 与 session 一起纳入 candidate 历史
  - 命名状态下批量插入沿用 R2-D 的 `visible: false` + override `visible: true`，定向测试未覆盖该分支
- rollback point: 删除产品 worktree 中 `src/renderer/course/v9MediaAudioCommands.ts`、`src/renderer/project/v9AssetAdapter.ts`、`tests/unit/v9MediaAudioCommands.test.ts`；还原 `assetManager.ts` / `mediaBatch.ts` / `AudioManager.ts` 的本任务 diff；其他 lane 文件保持不动；基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified
