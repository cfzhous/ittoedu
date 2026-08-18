HANDOFF
- task: R8-FIX-SLIDE-PREVIEW-COMP
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: `SlidePublishedAdapter.appendLayerNode` 对 component/runtime 补了可见后备（有 staticFallback 且能 resolve 则 `<img>`，否则 wrap 不透明背景 + 标题类文案 / `packageId` / runtime values）。teacher-controller 仍跳过；native text/image 路径未动；`isScopedVisible` 仍用 `entry.visibility.locationIds` 对 `location.id`。定向 e2e「Component API 4 全局组件」**1 passed（1.2m）**，原首错 `:1893` 像素差已过。未 skip、未改断言、未改 `editor.spec.ts`。未回滚 GLOBAL-SCENE-LABEL 勾选框 `scene.name`，未回滚 GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。未 commit。未领取 R8-G。未宣称 art/accepted。不是项目级 engineering candidate。定向整条绿 → `lane_candidate`。
- owned files changed (product worktree):
  - `src/player/surfaces/slide/SlidePublishedAdapter.ts`（同文件 helper：`firstKeyedString` / `firstAnyString` / `firstVisibleText` / `appendFallbackImage` / `applyVisibleTextFallback`；`appendLayerNode` 的 component/runtime 分支。`#render` 的 `if (!isScopedVisible(entry, location.id)) continue` 未改）
  - `tests/unit/publishedCourseNavigation.test.ts`（新增：include 全局 component 在未选 location 不出现、所选 location 有可见文字后备「教师全局导航」）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行与状态条。
  **未改**：`tests/e2e/editor.spec.ts`、PlayerApp、Phaser compositor、`publishedDynamicHosts.ts`、`PropertiesTab.tsx`、schema、persist、`App.tsx`、`Workspace.tsx`、导出条。
- donor files/functions consulted:
  - `FlowSurfaceHost` overlay/`renderBlockDom` component 后备（有 staticFallback 则图，否则可见文字占位）
  - `publishedDynamicHosts.ts` 注释（不要抄 donor 899 行 compositor、不要 import SurfaceRuntimeAuthoring）
  - [`handoffs/R8-FIX-GLOBAL-SCENE-LABEL.md`](R8-FIX-GLOBAL-SCENE-LABEL.md) / [`handoffs/R8-F-RECHECK-6.md`](R8-F-RECHECK-6.md) 原首错 `:1893` averagePixelDifference === 0
- donor 舍弃部分:
  - 改 e2e 断言 / skip / 阈值 / 改截图目标为 overlay
  - 把 `isScopedVisible` 改成用 `scene.id` 比 `locationIds`
  - PlayerApp / Phaser compositor / SurfaceRuntimeAuthoring
  - 预修「Runtime API 2 / Component API 4 导出」
  - 回滚 GLOBAL-SCENE-LABEL 勾选框、GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E
- focused validation command:
  ```
  npx vitest run tests/unit/publishedCourseNavigation.test.ts
  npm run build:player
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "Component API 4 全局组件"
  git diff --check -- src/player/surfaces/slide/SlidePublishedAdapter.ts tests/unit/publishedCourseNavigation.test.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `build:player` + `build:renderer`（未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（本轮无监听）。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run tests/unit/publishedCourseNavigation.test.ts` | 0 | **1 file / 3 tests passed**；1.66s；Start at 05:32:08 |
  | 2 | `npm run build:player` | 0 | vite 1.42s；写入 `dist-player/player.iife.js` |
  | 3 | `npm run build:renderer` | 0 | vite 2.71s；写入 `dist-renderer/` |
  | 4 | `npx playwright test tests/e2e/editor.spec.ts -g "Component API 4 全局组件"` | 0 | Playwright。**1 passed（1.2m）**。原 `:1893` 已过；include「场景 2」、保存重开文案、`openCoursePreviewOverlay`、`course-preview-next` 与像素差均过 |
  | 5 | `git diff --check --` 上列 2 个 owned 路径 | 0 | 无输出 |

  Electron 槽已释放。`:5173` 本轮无监听。
- validation entry / fixture / backend:
  - entry: `mountPublishedCourseTryRun` → `createPublishedCourseSession` → `SlidePublishedAdapter.appendLayerNode`；Electron 编辑器（spec `launchEditor`）
  - fixture: 空白 Course Project V9；e2e 走导入 `com.example.global-nav` + include「场景 2」；unit 在 published payload 上注入 include 全局 component（无新 fixture 文件）
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: include 仅「场景 2」后，整课预览第一页无全局组件后备、第二页有不透明文字/背景，`.slide-published-adapter` 两页截图像素差 > 0.02；定向「Component API 4 全局组件」e2e 绿；adapter DOM 单测绿
  - does not prove: 全量 `npm run test:e2e`（留给下一轮 R8-F-RECHECK）；「Runtime API 2 / Component API 4 导出」；真实 Phaser 组件运行时（本刀只补静态可见后备）；typecheck；全量 Vitest；`build:desktop`
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Vitest + Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-SLIDE-PREVIEW-COMP
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-SLIDE-PREVIEW-COMP-01
  - target hotspot file: src/player/surfaces/slide/SlidePublishedAdapter.ts appendLayerNode
  - exported symbol / callback: appendLayerNode component/runtime 可见后备（staticFallback 图或背景+文字）
  - required user-visible behavior: include 仅所选 location 时，整课预览未选页看不到全局组件、所选页看得到可见后备
  - focused test proving lane side: editor.spec「Component API 4 全局组件」1 passed（1.2m）；publishedCourseNavigation 3 passed
  - exact wiring requested: 本刀标 implemented / lane_candidate。全量 e2e 留给 R8-F-RECHECK。不要领取 R8-G。不要预修导出条。
  - risk if omitted: 协调者仍按 :1893 像素差 0 分类该条
  - status: implemented
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-SLIDE-PREVIEW-COMP
  - target stage integrator: 协调者（账本）
  - id: R8F-GLOBAL-PREVIEW-VIS-01
  - target hotspot file: src/player/surfaces/slide/SlidePublishedAdapter.ts appendLayerNode
  - exported symbol / callback: 同 R8F-SLIDE-PREVIEW-COMP-01（SCENE-LABEL 留下的预览像素差）
  - required user-visible behavior: include 仅「场景 2」后 course-preview 两页截图像素差 > 0.02
  - focused test proving lane side: 本轮定向 e2e 1 passed，原 :1893 已过
  - exact wiring requested: 原 SCENE-LABEL 留下的 open 项可标 implemented。不要领取 R8-G。
  - risk if omitted: 账本仍把「Component API 4 全局组件」记成预览像素差 blocked
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - 未跑「Runtime API 2 / Component API 4 导出」（禁止本轮预修）
  - 后备不是 Phaser 真组件；导出/PDF 仍可能另走快照路径
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `appendLayerNode` 的 component/runtime 空 div 分支并删除同文件 helper；删除 `publishedCourseNavigation.test.ts` 新增用例。不要回滚 SCENE-LABEL 勾选框。
- next recommended owner: 协调者派 **R8-F-RECHECK** 跑全量 e2e。不要领取 R8-G。
