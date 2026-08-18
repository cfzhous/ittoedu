HANDOFF
- task: R7-C
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 新建 V2 课程 HTML/网页包导出模块，入口统一吃 `buildPublishedCourseV2Payload`（只 import producer）；单 HTML 与网页包共用同一 payload；产出相对路径文件清单、无本机绝对路径、资源可离线；HTML 壳嵌入 `window.__H5_COURSE_PAYLOAD__` + player bundle 占位，不 import `CoursePlayer`、不恢复 `.course-nav`。V2 缺资源预检在 lane 内 `collectCoursePackageExportPreflight` 中文报告；**未改** `exportPreflight.ts` / `buildStandaloneHtml.ts` / `buildWebPackage.ts` / `export/course/index.ts` / 壳层。未 commit。未开始 R7-Z/R8 或其他 R7 lane。
- owned files changed (product worktree, new):
  - `src/renderer/export/course/buildCoursePackages.ts`
  - `tests/unit/coursePackageExport.test.ts`
  计划侧：本 HANDOFF。
- donor files/functions consulted:
  - 主仓库 `src/renderer/export/course/buildCoursePackages.ts`（窄摘，去掉 CoursePlayer 依赖）
  - 只读 `buildPublishedCourse.ts`（`buildPublishedCourseV2Payload`、`CoursePublishSources`）
  - 只读 `buildStandaloneHtml.ts` / `buildWebPackage.ts`（V8 壳与路径安全模式）
  - Mixed fixture：`createBlankCourseProject` + `addCourseFlowPage` / `addCourseSpatialPage`（R6-A 命令，只调用）
- focused validation command:
  ```
  npx vitest run tests/unit/coursePackageExport.test.ts
  git add -N src/renderer/export/course/buildCoursePackages.ts tests/unit/coursePackageExport.test.ts
  git diff --check -- src/renderer/export/course/buildCoursePackages.ts tests/unit/coursePackageExport.test.ts
  git reset
  ```
- validation result: Vitest 1 file / 3 tests passed。`git diff --check` 无输出、exit 0（新文件先 `git add -N` 再 check，随后 `git reset`）。
- validation entry / fixture / backend:
  - entry: `buildCoursePackages`；`buildPublishedCourseStandaloneHtml`；`buildPublishedCourseWebPackageFiles` / `buildPublishedCourseWebPackage` / `buildPublishedCourseWebPackageAsync`；`collectCoursePackageExportPreflight`
  - fixture: `createBlankCourseProject` + `addCourseFlowPage` + `addCourseSpatialPage` mixed V9；缺素材 hero.png preflight
  - backend: Published Course V2 in-memory；player bundle 字符串占位；未接 App 导出菜单 / 真实 CoursePlayer（R7-B/Z）
- validation proves / does not prove:
  - proves: 单 HTML 与网页包同一 V2 payload；manifest 仅相对路径；standalone 内嵌 Data URL / web-package 内 `./assets/` 与 `./component-assets/`；无 `.course-nav`；缺素材 bytes 中文 blocking preflight；zip 往返路径图不变
  - does not prove: 未接 TopToolbar 导出对话框写文件（R7-Z）；未挂真实 CoursePlayer 启动（R7B-R7Z-01）；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R7-C
  - target stage integrator: R7-Z
  - target hotspot file: src/renderer/App.tsx / src/renderer/ui/TopToolbar.tsx / 现有 Export menu + preflight dialog
  - exported symbol / callback: buildCoursePackages(sources, 'standalone-html' | 'web-package', loadPlayerBundle())；buildPublishedCourseStandaloneHtml；buildPublishedCourseWebPackageAsync；collectCoursePackageExportPreflight
  - required user-visible behavior: 当 `courseSession !== null`（V9 工程）时，导出菜单「单 HTML / 网页包」改调上述 V2 入口，而不是只走 V8 `buildStandaloneHtml` / `buildWebPackageFromProjectAsync`；预检对话框在 V9 会话下合并 `collectCoursePackageExportPreflight` 结果；「继续导出」真实写到用户选择路径
  - focused test proving lane side: tests/unit/coursePackageExport.test.ts（mixed fixture + manifest + preflight）
  - exact wiring requested: `buildHtml()` / `handleExportHtml` / `handleExportWebPackage` 在 courseSession 分支改用 buildCoursePackages 或 buildPublishedCourseStandaloneHtml / buildPublishedCourseWebPackageAsync；preflight UI 读取 collectCoursePackageExportPreflight；保留 V8 显式导入与 V8 工程回落路径
  - risk if omitted: 默认 V9 工程导出仍生成 V8 lesson HTML，与 Spatial/Flow 试运行及整课 Player 不一致；缺资源只在 publish 抛错、教师看不到中文预检
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - `export/course/index.ts` 尚未 re-export 本模块（R7-Z 接线时追加，避免 R6-Z HMR 扫到）
  - 真实 player bundle 体积与单 HTML 警告阈值仍走现有 `exportSize`（R7-Z 接线时验证）
  - Flow/Spatial 运行时网络预检仍只在 V8 `collectExportPreflight`；V9 组件/runtime 网络项可后续并入 collectCoursePackageExportPreflight
- rollback point: 删除产品 worktree 中上述 2 个未跟踪文件。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结导出（实际导出名）

### buildCoursePackages.ts

- `COURSE_PLAYER_CSS`
- `collectCoursePackageExportPreflight(project, delivery, resources, playerBundle?, now?)`
- `buildPublishedCourseStandaloneHtml(sources, playerBundleOrOptions)`
- `buildPublishedCourseWebPackageFiles(sources, playerBundleOrOptions)`
- `buildPublishedCourseWebPackage(sources, playerBundleOrOptions)`
- `buildPublishedCourseWebPackageAsync(sources, playerBundleOrOptions)`
- `buildCoursePackages(sources, delivery, playerBundleOrOptions)` → `{ manifest, files, payload }`
- 类型：`PublishedCoursePackageOptions`、`CoursePackageDelivery`、`CoursePackageExportResources`、`CoursePackagePreflightReport`、`BuildCoursePackagesResult`
