HANDOFF
- task: R7-D
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree **只新建** Published V2 驱动的 PPTX / 打印产物模块与测试。页列表来自 `buildPublishedCourseV2Payload` 产物（`mixedPrintPlan` 或默认推导）：Slide 按 scene；Spatial **每个 camera frame 一页**（视口 1120×760，**禁止**把 infinite world 裁成 1280×720）；Flow 按 `buildFlowPrintPlan` / `renderFlowPrintHtml`，DOCX 直接 `import buildFlowDocx`。`globalLayerItems` 与教师控制器（除非 `includeInStaticExports`）**默认不进** PPTX/PDF/DOCX/混合打印 HTML。缺字体、缺资源、体积过大返回中文 `report`，不 throw 吞掉。未改壳层、`buildPptx.ts`、`flowDocx.ts`、`flowPrintPlan.ts`、`export/course/index.ts`；未 commit。
- owned files changed (product worktree, new):
  - `src/renderer/export/course/buildCoursePptx.ts`
  - `src/renderer/export/course/buildCoursePrintArtifacts.ts`
  - `tests/unit/coursePptxExport.test.ts`
  - `tests/unit/coursePrintArtifacts.test.ts`
  计划侧：本 HANDOFF
- donor files/functions consulted:
  - `git show 4755034:src/renderer/export/course/buildCoursePptx.ts`（Slide LayerItem → PPTX 映射）
  - `git show 4755034:src/renderer/export/course/buildCoursePrintArtifacts.ts` + `printArtifacts.ts`（mixed print 页列表、Flow fragment、Spatial frame）
  - 产品 `buildPublishedCourse.ts`、`flowPrintPlan.ts`、`flowDocx.ts`、`buildPptx.ts`（`buildPdfPrintHtml`）、`spatialModel.ts`（`spatialRuntimeCameraFromPose` / `isPublishedScopedVisible`）
  - R6-A `addCourseFlowPage` / `addCourseSpatialPage`（mixed fixture）
- donor 舍弃部分:
  - 直接吃 `CourseProjectDocument` 而非 Published V2
  - 供体 `renderSpatialSvgMarkup`（产品 Spatial host 未导出；本 lane 用 Published V2 最小 SVG frame renderer）
  - 供体 `printArtifacts.ts` 独立文件（逻辑收敛进 `buildCoursePrintArtifacts.ts`）
  - Flow host `captureFlow` / Slide `captureSlide` 硬依赖（R7-D 只产 bytes/文件清单，capture 为可选注入）
- focused validation command:
  ```
  npx vitest run tests/unit/coursePptxExport.test.ts tests/unit/coursePrintArtifacts.test.ts
  git add -N src/renderer/export/course/buildCoursePptx.ts src/renderer/export/course/buildCoursePrintArtifacts.ts tests/unit/coursePptxExport.test.ts tests/unit/coursePrintArtifacts.test.ts
  git diff --check -- src/renderer/export/course/buildCoursePptx.ts src/renderer/export/course/buildCoursePrintArtifacts.ts tests/unit/coursePptxExport.test.ts tests/unit/coursePrintArtifacts.test.ts
  git reset
  ```
- validation result: Vitest 2 files / 5 tests passed。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `buildCourseExportPageList`、`buildCoursePptx`、`buildCoursePrintArtifacts`、`auditCourseExportAssets`、`auditCourseExportFonts`、`shouldOmitPublishedItemFromStaticExport`
  - fixture: `createBlankCourseProject` + `addCourseFlowPage` + `addCourseSpatialPage` → `buildPublishedCourseV2Payload`
  - backend: 纯内存 Published V2；未接导出菜单 / `showSaveDialog`
- validation proves / does not prove:
  - proves: V2 页列表三类规则；PPTX zip 非空；Spatial 视口 1120×760；全局/HUD 不进 slide XML 与混合 HTML；Flow print/DOCX helper 可 import 且 TOC 抽屉不进文件；缺资源中文 report 不 throw
  - does not prove: 真实写文件、Electron 打印、Slide 运行时快照 capture、typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R7-D
  - target stage integrator: R7-Z
  - target hotspot file: 导出菜单 / Export preflight continue handler（App / TopToolbar / export dialog）
  - exported symbol / callback: buildCourseExportPageList、buildCoursePptx、buildCoursePrintArtifacts、buildFlowDocx、uniqueFlowDocxFilename
  - required user-visible behavior: 「继续导出」PPTX 调 `buildCoursePptx(publishedV2)` 写 `.pptx`；PDF/打印调 `buildCoursePrintArtifacts` 返回的 `pdf-html` / 混合 HTML 走现有 `exportPdf`；DOCX 调 `buildFlowDocx`（或 print artifacts 已产出的 docx bytes）。全局图层与教师控制器默认不进文件——**不要**在 Z 阶段重新争论。缺资源/字体/体积展示 `report` 中文项。
  - focused test proving lane side: tests/unit/coursePptxExport.test.ts、tests/unit/coursePrintArtifacts.test.ts
  - exact wiring requested: 关闭 R4D-R7-01。R7-Z 从 `buildPublishedCourseV2Payload` 结果调用上述入口；不要回头改 R7-D 文件挂菜单；不要改 `export/course/index.ts` 除非 Z 统一 re-export。
  - risk if omitted: 导出菜单仍走 V8 `buildPptx` / 无 V2 页列表；DOCX helper 继续闲置；HUD 被打进 PPTX/PDF
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 typecheck / build / E2E
  - Spatial PPTX 页为 SVG data URL 嵌入，复杂 Phaser/Runtime 图层未做真实 host capture
  - Slide PDF 页需 R7-Z 注入 `captureSlideScene` 才有 raster 图像；无 capture 时 report 警告并仍产出混合 HTML
- rollback point: 删除产品 worktree 上述 4 个新文件
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 导出 API（实名）

| 函数 | 作用 |
|---|---|
| `buildCourseExportPageList(published)` | 从 Published V2 + `mixedPrintPlan` 推导统一页列表 |
| `buildCoursePptx(published, options?)` | 产 PPTX `bytes`；Slide scene + Spatial camera frame 各一页 |
| `buildCoursePrintArtifacts(published, options?)` | 产 `{ pages, files[], report[], warnings[] }`；含混合 print HTML、可选 pdf-html、Flow DOCX |
| `shouldOmitPublishedItemFromStaticExport(item)` | HUD/教师控制器默认过滤 |
| `auditCourseExportAssets` / `auditCourseExportFonts` | 中文 report 项 |

## 页列表规则（写死）

1. **Slide**：`mixedPrintPlan.entries[kind=slide-scenes].sceneIds` 每个 scene 一页。
2. **Spatial**：`mixedPrintPlan.entries[kind=spatial-frames].cameraFrameIds` 每个 camera frame 一页；渲染视口 `SPATIAL_EXPORT_VIEWPORT = 1120×760`，**不是** Slide 1280×720，**不是** 整张 infinite world 单页。
3. **Flow**：`mixedPrintPlan.entries[kind=flow-document]` → `buildFlowPrintPlan` 文档结构；DOCX 调 `buildFlowDocx`；运行态 TOC **永不**进文件。

## global / HUD 不进文件（写死）

- `published.globalLayerItems` **全部**默认排除在 PPTX、混合 print HTML、Flow DOCX 之外。
- 教师控制器：`includeInStaticExports !== true` 时排除；与视口 HUD 一致。
- R7-Z **不得**再争论此规则。
