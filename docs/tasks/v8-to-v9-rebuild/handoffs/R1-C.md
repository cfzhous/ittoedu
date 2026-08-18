HANDOFF
- task: R1-C
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 Published Course V2 纯 producer（`export/course/`），从未经过编辑器的最小 V9 内存工程生成 V2 payload，并用 R1-A `publishedCourseV2Schema` 校验。保留 global/surface/scene/state ownership、location 顺序、资源/组件闭包；Flow `blocks`（含 runs）与 Spatial `world`/`paths`/`relations`/`camera` 原样拷贝，不从 DOM/Phaser/Player 反建，也不声称已播放。未改 App/store/UI、R0-D、R1-A 协议文件、默认 V8 `buildPublishedLesson.ts` / Player。本 lane 为 integration candidate。未 commit。
- owned files changed (product worktree, new):
  - `src/renderer/export/course/buildPublishedCourse.ts`
  - `src/renderer/export/course/index.ts`
  - `tests/unit/buildPublishedCourseV2.test.ts`
  - `tests/unit/publishedCourseProtocol.test.ts`
  计划侧：本 HANDOFF。未改 `src/renderer/export/buildPublishedLesson.ts` 或其它既有 V8 export 文件。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/export/course/buildPublishedCourse.ts`：`buildPublishedCourseV2Payload`、`collectPublishedCourseAssetIds`、`collectPublishedCourseComponentKeys`、`CoursePublishSources`、`BuildPublishedCourseOptions`、surface/layer/Flow/Spatial 纯数据投影
  - 断言摘取：`tests/unit/coursePublishPipeline.test.ts`（资产/组件闭包、拒绝裸 V8）；`tests/unit/courseProjectProtocol.test.ts`（one-way V2、拒绝 `createdAt`）；`tests/unit/spatialPathPipeline.test.ts` 前三个 payload/schema 断言（paths/relations 拷贝与校验、缺字段 default `[]`）
- donor 舍弃部分:
  - 整文件迁入 HEAD `coursePublishPipeline.test.ts`、`publishedCourseSpatial.test.ts`、`spatialPathPipeline.test.ts`
  - `export/course/index.ts` 对 `flowDocx` / `printArtifacts` / `buildCoursePackages` / `buildCoursePptx` / `buildCoursePrintArtifacts` 的再导出（那些文件在 `f272756` 不存在，属 R7）
  - `publishedCourseToPlayerDocument`、`startPublishedCourse`、`PublishedCourseApp`、`CoursePlayer`、Spatial/Flow host 渲染断言
  - 对 `../buildPublishedLesson` 的 `encodePublishedCode` 硬依赖：改为本文件内 UTF-16LE 拷贝 + 既有 `bytesToBase64`，避免改/绑默认 V8 lesson publisher
- focused validation command:
  ```
  npx vitest run tests/unit/buildPublishedCourseV2.test.ts tests/unit/publishedCourseProtocol.test.ts
  git diff --check -- src/renderer/export/course tests/unit/buildPublishedCourseV2.test.ts tests/unit/publishedCourseProtocol.test.ts
  ```
- validation result: Vitest 2 files / 6 tests passed，1.30s。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `buildPublishedCourseV2Payload` / `collectPublishedCourseAssetIds` / `collectPublishedCourseComponentKeys` / `publishedCourseV2Schema`
  - fixture: 测试内构造的最小混合 V9 内存对象（Slide + Flow + Spatial，含 global/surface/scene/state、资源与组件包字节）；另有纯 Flow runs 与纯 Spatial path/relation 工程。不经过 App/Workspace。
  - backend: 纯 producer + R1-A Schema；默认产品仍为 V8 `buildPublishedLesson` / V8 Player
- validation proves / does not prove:
  - proves: 内存 V9 → Published V2 且 schema 通过；ownership/location/资产闭包；未引用资源不打入；Flow blocks（含 runs、嵌套 section）与 Spatial world/paths/relations/camera 保留；作者字段（createdAt/revision/label/locked/runtime.source）不在 payload；裸 V8 与缺字节拒绝；损坏 Spatial 引用被 schema 拒绝
  - does not prove: 未接 Workspace/MediaTab/默认导出按钮；未接真实 Player/FlowSurfaceHost/SpatialSurfaceHost；未生成 standalone HTML/web package/PPTX；未跑 archive round-trip（R1-Z）；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS: 无。R1-Z 直接 import 下列符号，不要改 App 或默认 V8 export。
- DECISION_REQUESTS: 无
- remaining risks / untested full checks: 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）。默认产品导出仍走 V8 `buildPublishedLesson.ts`。Flow/Spatial host 尚未存在，payload 只保证数据保留。R1-B archive 与本 producer 的串联留给 R1-Z。
- rollback point: 删除产品 worktree 中上述 4 个未跟踪文件（`src/renderer/export/course/` 目录与两个测试）；不回退 R0-D / R1-A / 并行 lane 文件。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified

## R1-Z 可调用的符号

`src/renderer/export/course/index.ts`（与 `buildPublishedCourse.ts` 相同）：

- `buildPublishedCourseV2Payload(input: CoursePublishSources, options?: BuildPublishedCourseOptions): PublishedCourseV2Payload`
- `collectPublishedCourseAssetIds(sources: Pick<CoursePublishSources, 'project' | 'components'>): Set<string>`
- `collectPublishedCourseComponentKeys(project: CourseProjectDocument): Set<string>`
- 类型：`CoursePublishSources`、`BuildPublishedCourseOptions`、`PublishedCourseAssetProjection`

输入必须是已通过 `courseProjectDocumentSchema` 的 Course Project V9 内存对象 + `assetFiles` / `components` 字节。输出再交给 R1-A `publishedCourseV2Schema`（producer 内部已 parse 一次）。不要调用 Player。

## Flow / Spatial 保留方式

Producer 对 Flow 递归 `cloneJson` `blocks`（component block 只合并 manifest 默认 props，不丢 id/runs/嵌套 section）。对 Spatial 拷贝 `world.bounds`、`world.layerItems`、`world.paths ?? []`、`world.relations ?? []`、`camera`、`semanticZoom`。未实现 host 时这些字段仍在 payload 中，测试不断言播放成功。
