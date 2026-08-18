HANDOFF
- task: R4-D
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 Flow **运行态 host / 方案 1 目录 / print+DOCX 纯 helper**。Host 只吃 Published Course V2（或等价内存 `FlowPublishedPlaybackDocument`），不从作者 DOM 反序列化。目录默认收起，只留 `position:fixed` 贴边三角；展开 260px 并把正文 `margin-left` 让开，不遮挡关键正文。heading/section（外加 Flow 页面）可跳转，paragraph 不上 TOC。教师控制器复用 `TeacherControllerDom`，叠在视口 overlay，不是文档页脚；显隐复用 `isGlobalLayerItemVisible` 语义；声音走可注入的课程 `CourseAudioApi`（缺省为与 `media.audio.defaultMuted` 一致的会话）。未改 App / store / Workspace / PlayerApp / 现有 V8 Phaser 主链，未创建 `src/player/surfaces/index.ts`，未改 R5-D spatial、R4-A 命令、`buildPublishedCourse.ts` 或导出菜单。未开始 R4-B/C/Z，未 commit。本 lane 为 integration candidate，不是 art/accepted，**不宣称试运行已接上**。
- owned files changed (product worktree, new):
  - `src/player/surfaces/flow/flowModel.ts`
  - `src/player/surfaces/flow/flowRuntimeToc.ts`
  - `src/player/surfaces/flow/FlowSurfaceHost.ts`
  - `src/renderer/export/course/flowPrintPlan.ts`
  - `src/renderer/export/course/flowDocx.ts`
  - `tests/unit/flowRuntimeToc.test.ts`
  - `tests/unit/flowSurfaceHost.test.ts`
  计划侧：本 HANDOFF。未改账本 / `00_INDEX.md` / UI 热点。未碰 `src/player/surfaces/spatial/`。
- donor files/functions consulted:
  - `git show 4755034:src/player/surfaces/flow/FlowSurfaceHost.ts`（语义 article、heading 锚点、`tocOpen` 会话态）
  - `git show 4755034:src/player/surfaces/flow/flowModel.ts`（walk / outline；只取只读遍历）
  - `git show 4755034:src/player/surfaces/flow/flowRuntimeToc.ts`（fixed 抽屉+三角、Esc）
  - `git show 4755034:src/renderer/export/course/flowDocx.ts`（OOXML 结构、媒体/公式 fallback）
  - 产品 `publishedCourseTypes.ts` / Flow blocks、`TeacherControllerDom`、`globalLayerVisibility.ts`、`AudioManager`/`CourseAudioApi`（只读）
  - R4-A：heading/section 才是目录锚点；paragraph 不上树
  - 合同 C10 / §12 方案 1
- donor 舍弃部分:
  - `SlideSurfaceHost` / `SurfaceHost` / `DomPlaybackFreeze` / `src/player/surfaces/index.ts`（当前产品无 Slide compositor，且 R5-D 并行写 spatial）
  - 覆盖式弱化目录（展开抽屉压住正文；收起态 `aria-label`「展开目录」）
  - 把 paragraph 当 TOC 项
  - 作者态 insert/delete/move 写进 Player `flowModel`
  - 把 host 挂进 PlayerApp / 试运行 iframe
- focused validation command:
  ```
  npx vitest run tests/unit/flowSurfaceHost.test.ts tests/unit/flowRuntimeToc.test.ts
  git diff --check -- src/player/surfaces/flow src/renderer/export/course/flowDocx.ts src/renderer/export/course/flowPrintPlan.ts tests/unit/flowSurfaceHost.test.ts tests/unit/flowRuntimeToc.test.ts
  ```
- validation result: Vitest 2 files / 6 tests passed，1.30s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `FlowSurfaceHost` `mount`/`activate`/`setTocOpen`/`destroy`、`buildFlowRuntimeToc`、`buildFlowPrintPlan`/`renderFlowPrintHtml`、`buildFlowDocx`
  - fixture: 内存 Published Course V2 Flow（H1/H2 + paragraph + list + table + formula + audio fallback + 全局教师控制器）
  - backend: 纯 Published V2 in-memory；未接 PlayerApp / 试运行 iframe
- validation proves / does not prove:
  - proves: Host 真相是 Published V2，改 article.innerHTML 不回写 document；TOC 默认收起、fixed 三角、展开 260px 让开正文；`aria-label` 收起「打开目录」/展开「收起目录」；Esc 收起；heading 跳转；paragraph 不进 TOC；控制器在 overlay 不在 article；print/DOCX 保留标题正文列表表格公式与媒体 fallback，且不含目录抽屉
  - does not prove: 未接真实试运行 / PlayerApp / 导出菜单；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。未开始 R4-B/C/Z。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R4-D
  - target stage integrator: R4-Z
  - target hotspot file: 试运行入口（App 预览 iframe / Player bootstrap）。不要改本任务文件。与 R3CUT-R7B-01 正交：R7-B 负责 iframe 改吃 Published V2；本请求是 V2 到达后对 Flow location 挂真实 FlowSurfaceHost。
  - exported symbol / callback: FlowSurfaceHost、setTocOpen、tocOpen、setLocationId、updatePublishedCourse、buildFlowRuntimeToc
  - required user-visible behavior: 试运行当前 location 为 Flow 时进入真实 FlowSurfaceHost（方案 1 目录：默认可收起，fixed 贴边三角，展开约 260px 正文让开，Esc 收起，aria 打开目录/收起目录）。控制器继续走课程会话（TeacherControllerDom + 同一 AudioManager），不是文档页脚。禁止 FlowElementsTab 式运行 UI，禁止把 host 接进现有 V8 Phaser PlayerApp 主链来假装完成。
  - focused test proving lane side: tests/unit/flowSurfaceHost.test.ts
  - exact wiring requested: R4D-R4Z-01。对 Flow location：`new FlowSurfaceHost(publishedV2, { audio: playerAudio, executeTeacherControllerAction, onNavigateLocation })` 后 `mount(previewRoot)` + `activate()`。不要创建 `src/player/surfaces/index.ts`（与 R5-D spatial 抢文件）；R4-Z 可在热点里按 surface.type 分支。
  - risk if omitted: 试运行仍走 V8 Phaser 投影，目录方案 1 与 Flow 长文不可见
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-D
  - target stage integrator: R7
  - target hotspot file: 导出菜单 / `buildPublishedCourse.ts` 调用点（本任务未改 producer 与菜单）
  - exported symbol / callback: buildFlowPrintPlan、renderFlowPrintHtml、buildFlowMixedPrintEntries、buildFlowDocx、buildFlowDocxFromPlan、uniqueFlowDocxFilename
  - required user-visible behavior: 最终 PDF/DOCX/打印菜单仍归 R7。调用上述 helper 时走文档结构（标题、正文、列表、表格、公式、媒体 fallback）；不得把运行态目录抽屉写进文件。
  - focused test proving lane side: tests/unit/flowSurfaceHost.test.ts（print/DOCX 断言）
  - exact wiring requested: R4D-R7-01。R7 从 Published V2 Flow surface 调 helper；不要回头改 R4-D 文件来挂菜单。mixedPrintPlan 条目可用 `buildFlowMixedPrintEntries`，写入工程/payload 仍归 R7。
  - risk if omitted: helper 闲置，或 R7 另写一套把 TOC DOM 打进 DOCX
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未接真实试运行 iframe；Flow overlay 对非控制器项只做静态 fallback，完整 Phaser 图层合成留给 Player 接线
  - R5-D 并行已写 `src/player/surfaces/spatial/`；本任务未创建双方会抢的 `index.ts`
- rollback point: 删除产品 worktree 上述 7 个未跟踪文件。不要删除 `src/player/surfaces/spatial/`。基线仍为 `f272756`。未改热点。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## Host / TOC API

```ts
new FlowSurfaceHost(publishedV2 | FlowPublishedPlaybackDocument, {
  surfaceId?, locationId?,
  initialTocOpen?,            // default false
  audio?: Pick<CourseAudioApi, 'muted' | 'setMuted' | 'toggleMuted'>,
  executeTeacherControllerAction?,
  onNavigateLocation?,
  courseProgressSource?,
  resolveAsset?,
})

host.mount(container)
host.activate() / suspend() / resume()
host.setLocationId(locationId)
host.updatePublishedCourse(source)
host.tocOpen
host.setTocOpen(open)
host.playbackDocument   // clone；不是 article.innerHTML
host.surface
host.destroy()

buildFlowRuntimeToc(playback) // page + heading/section；无 paragraph
FLOW_RUNTIME_TOC_DRAWER_WIDTH_PX = 260
FLOW_RUNTIME_TOC_CLOSED_ARIA_LABEL = '打开目录'
FLOW_RUNTIME_TOC_OPEN_ARIA_LABEL = '收起目录'
```

收起合同（方案 1）：抽屉 `translateX(-100%)` 完全离场；只留视口最左 `position:fixed` 三角（chevron 朝右，`aria-label`「打开目录」）。展开：抽屉 260px，三角在抽屉右缘朝左，`aria-label`「收起目录」；article `margin-left: 260px` 避免遮挡正文。Esc 在目录内可收起。`tocOpen` 只存在运行会话。

## Print helper 范围

- `buildFlowPrintPlan(surface)` / `renderFlowPrintHtml(plan)` / `buildFlowMixedPrintEntries(surfaces)`
- `buildFlowDocx(surface)` / `buildFlowDocxFromPlan(plan)` / `uniqueFlowDocxFilename(title)`
- 保留：标题、正文、列表、表格、公式、媒体 fallback
- 不含：运行态目录抽屉、教师控制器页脚
- 不改 `buildPublishedCourse.ts`，不挂导出菜单
