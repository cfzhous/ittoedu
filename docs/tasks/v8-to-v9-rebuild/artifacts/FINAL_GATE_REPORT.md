# FINAL_GATE_REPORT

> owner：R8-Z 汇总；协调者可追加失败行
> 当前状态：Wave 8a；**R8-F 通过**（RECHECK-13 全量前 23 绿 + [`R8-F-LAST4.md`](../handoffs/R8-F-LAST4.md) 定向后 4 绿）；G/H/Z 未领；不提交

- typecheck/unit/build results: capabilities / typecheck / Vitest / `build:desktop` **verified**；现有 27 条 e2e **verified**（23 全量 + 4 定向，教师豁免再跑一遍 27）。未宣称项目级 engineering candidate（留给 R8-Z）。
- unresolved issues: [`R8-C-TRIAGE.md`](../handoffs/R8-C-TRIAGE.md)、[`R8-D-TRIAGE.md`](../handoffs/R8-D-TRIAGE.md)
- machine status: C–F verified；项目级 `engineering candidate` 仍由 R8-Z 写
- experience status: `unverified`
- teacher decision: `pending`

## R8 失败记录

| ID | Command/step | First error | Reproduction | Owner | Requirement | Repair task | Recheck | Status |
|---|---|---|---|---|---|---|---|---|
| R8C-CAP-01 | `npm run check:ai-capabilities` | 来源溯源证据过期 `generation-evidence.json` | 产品 worktree 跑该命令 | 能力清单生成物 | Agent Kit 门禁 | R8-FIX-CAP | `check` + `aiCapabilities.test.ts` | verified |
| R8C-TSC-01 | `npm run typecheck` / `tsc --noEmit` | 全链 exit 0（renderer / electron / e2e） | 产品 worktree 跑 typecheck | 壳层 store | 机器 Gate | R8-FIX-SHELL | R8-C-RECHECK-3 | verified（LASTSCENE+AUTHORING 后快照） |
| R8D-CUT-01 | `npm test` 中 `v9Slide*Adapter` / ProductIntegration / recoveryWriteCoordinator | 已按默认 `v9-slide-candidate` 跟切；V9 恢复包会 `write` | 7 个指定 Vitest 文件 | R3-CUT 测试 | CUT 后默认 V9 | R8-FIX-CUT-TESTS | 7 files / 34 passed | verified |
| R8D-STORE-01 | `npm test` 中 asset/global/media 优先 6 文件 | sidecar→`assetFiles`；global/runtime 投影 | 6 files / 40 passed | editorStore / V9 投影 | V8 能力零降级 | R8-FIX-STORE | 定向 6 文件 | verified |
| R8D-STORE-02 | componentPackageManagement / developerMode / formulaNode / textEmphasis / simpleEditorMode / sceneStateUi | 组件包副本、命名状态 override、入场 history、缩略图 a11y | 6 files / 40 passed；全量保持 | V9 写入余量 | V8 能力零降级 | R8-FIX-STORE-REST | R8-D-RECHECK-2 | verified |
| R8D-LASTSCENE-01 | `editorStore.test.ts` 末场景 `deleteScene` | 末场景先 `return false`，不跑 `runV9DocumentMutation` | 该文件 62 passed；全量保持 | V9 `deleteScene` 早退 | 末场景不写 no-op history | R8-FIX-STORE-LASTSCENE | R8-D-RECHECK-2 | verified |
| R8D-AUTHORING-01 | `coursewareAuthoringRunner.test.ts` Electron round-trip | 打开 V8 后点「导入为当前课程工程」再导出 | 该文件 3/3；全量保持 | V8 显式导入 + PDF/HTML 最短补丁 | 不静默打开 V8；导入后可导出 | R8-FIX-AUTHORING-MODAL | R8-D-RECHECK-2 | verified |
| R8D-R6-01 | `flowProductIntegration` | 已改查 `add-content-primary` + `data-alias-testid=add-flow-page` | 该文件 5 passed | R6 菜单 testid | 工程内新增 | R8-FIX-R6-TESTID | 5 passed | verified |
| R8E-BUILD-01 | `npm run build:desktop` | player/renderer/electron 三段 exit 0 | 产品 worktree 跑该命令 | dist | 机器 Gate | R8-E | 本任务 | verified |
| R8F-LAYER-01 | `componentCatalogMatrix` 图层 `.node-item` | 已跟切：4 组件 + 1 可见控制器；删除点组件 | 该 spec「目录 UI」1 passed | 有效图层含控制器 | 图层可见控制器；数的是组件节点 | R8-FIX-E2E | 定向 catalog spec | implemented |
| R8F-TRYRUN-01 | `editor.spec` 简洁模式试运行 | 已跟切：`course-try-run-host` CoursePlayer，无 blob iframe | 该 spec「简洁模式完成文字」1 passed | CoursePlayer 试运行 DOM | 试运行可见且可操作，不退回 blob iframe | R8-FIX-E2E | 定向 editor spec | implemented |
| R8F-SELECT-01 | `editor.spec`「Player 与编辑交互层…」 | 画布 `selectLayers` 成功且非空选切 `properties` | 该 spec `-g "Player 与编辑交互层"` 1 passed | 画布点选打开属性 | 与 `selectNode` 同 | R8-FIX-SELECT-TAB | 定向该条 | implemented |
| R8F-SCENE-DEL-01 | `editor.spec`「流程 1：场景新增、排序与删除」 | 同页多于一幕可删；确认「删除场景」走 `deleteScene(sceneId)` | 该 spec `-g "流程 1：场景新增"` 1 passed | 课树 slide-scene 删除入口 | V8 可发现删除且可撤销 | R8-FIX-SCENE-LAYER | 定向该条 | implemented |
| R8F-LAYER-DND-01 | `editor.spec`「流程 3：节点层级排序与撤销」 | 键盘上移跳过教师控制器，同来源反序可撤销 | 该 spec `-g "流程 3：节点层级"`；RECHECK-4 全量 39.5s 绿 | 同 owner 排序被跨 owner 投放打断 | 同来源 z-order；控制器留全课 | R8-FIX-SCENE-LAYER | R8-F-RECHECK-4 | verified |
| PRE-R8-01 | 编辑态单击/双击闪隔离 Player 启动层 | 窗口复验通过：无盖层、blob 不换、双击进文字编辑 | `output/r8-a-recheck/evidence.json` | Workspace preview `useEffect` | 不闪启动层；双击能进文字编辑 | R8-FIX-PREVIEW | R8-A-RECHECK | verified |
| R8F-IMPORT-01 | `editor.spec`「统一画布：场景/全局运行时…」 | 打开 schema 8 后完整显式导入；保存为 V9 | 该 spec `-g "统一画布：场景/全局运行时"` 1 passed | 打开 V8 必须显式导入 | 确认导入后再编；保存为 V9 | R8-FIX-E2E-IMPORT | 定向该条 | implemented |
| R8F-TEXT-TXN-01 | `editor.spec`「文字编辑事务…」 | 换 source 先 commit；撤销回到「画布编辑中的草稿」 | RECHECK-4 全量 45.6s 绿 | V9 `beginTextEdit` 换 source 不先 commit | 画布 overlay → 属性栏是两步 history | R8-FIX-TEXT-TXN | R8-F-RECHECK-4 | verified |
| R8F-COMP-DBL-01 | `editor.spec`「流程 4：组件导入…」 | 画布双击挂载 `canvas-plain-text-editor` 并写回标题 | RECHECK-5 全量 40.7s 绿 | V9 `onDoubleClickCapture` 命中组件后早退 | 画布双击打开组件文字编辑 | R8-FIX-COMP-DBLCLICK | R8-F-RECHECK-5 | verified |
| R8F-COMP-XFORM-01 | `editor.spec`「流程 4：组件导入…」拖拽 | 场景 component/runtime 写入 frame/rotation；拖后 X>400 | RECHECK-5 全量 40.7s 绿 | `nativeFrames` / `transformSelectedSlideNativeLayers` 只收 native | 场景组件可移动/缩放 | R8-FIX-COMP-XFORM | R8-F-RECHECK-5 | verified |
| R8F-GLOBAL-TEXT-01 | `editor.spec`「V8 全局层：原生元素、双击文字…」 | 属性栏收到「全课程统一标题」；overlay 关闭 | RECHECK-6 全量 1.3m 绿 | `locateEditableNative` 拒 global；begin 回退 V8 session | 全局原生文字草稿进 V9 投影并可提交 | R8-FIX-GLOBAL-TEXT | R8-F-RECHECK-6 | verified |
| R8F-GLOBAL-LAYER-POS-01 | `editor.spec`「V8 全局层…」:1743 | 图层位置 underlay + 场景可见范围 include；保存重开 4 图层 | RECHECK-6 全量 1.3m 绿 | V9 `CandidateGlobalLayerSettings` 无 underlay/overlay；可见范围改名为「页面」 | 全局属性栏可设图层位置与场景可见范围 | R8-FIX-GLOBAL-LAYER-POS | R8-F-RECHECK-6 | verified |
| R8F-GLOBAL-SCENE-LABEL-01 | `editor.spec`「Component API 4 全局组件…」:1849 | `getByLabel('场景 2')` 可勾选；几何撤销与保存重开已过 | RECHECK-7 全量 1.1m 绿 | 勾选框用 `location.label`（未命名课件 · 场景 2） | Slide 勾选文案对齐 `scene.name` | R8-FIX-GLOBAL-SCENE-LABEL | R8-F-RECHECK-7 | verified |
| R8F-GLOBAL-PREVIEW-VIS-01 | `editor.spec`「Component API 4 全局组件…」:1893 | include 仅场景 2 时预览两页像素差 > 0.02 | RECHECK-7 全量 1.1m 绿 | `SlidePublishedAdapter.appendLayerNode` 对 component 只写空 div | include 仅场景 2 时预览两页画面应不同 | R8-FIX-SLIDE-PREVIEW-COMP | R8-F-RECHECK-7 | verified |
| R8F-RUNTIME-EXPORT-01 | `editor.spec`「Runtime API 2 / Component API 4 导出」:1911 | 夹具 parse V9；PDF/PPTX 动态层与全局 visibility 保留 | RECHECK-9 全量 53.7s 绿 | 夹具仍写 `globalRuntime` / `scenes[].nodes`；纯 Slide 走无 capture 的 `buildCoursePptx` | 跟切 Course Project V9；打开 V8 须显式导入；PDF/PPTX 仍保留动态层、全局 visibility、原生文字 | R8-FIX-E2E-EXPORT | R8-F-RECHECK-9 | verified |
| R8F-CATALOG-PPTX-01 | `componentCatalogMatrix`「目录 UI」:815 | 每页 PPTX 含「静态导出提示」 | RECHECK-9 全量 3.3m 绿 | 纯 Slide `buildPptx` 快照成功时 `addPptxWarnings` 早退 | 互动组件静态化后教师仍能看见导出提示；不撤回快照 | R8-FIX-CATALOG-PPTX | R8-F-RECHECK-9 | verified |
| R8F-PRESENTER-HTML-01 | `editor.spec`「流程 5」:354 | 离线单 HTML `playerSceneIndex` 为 0；两页像素差过 0.05 | RECHECK-10 全量 1.1m 绿 | V9 `#course-root` 不挂 `__H5_LESSON_PLAYER__`；发布文字无字号 | 离线 Presenter 可翻页；现有 scene-index / escape 断言仍可用 | R8-FIX-PRESENTER-HTML | R8-F-RECHECK-10 | verified |
| R8F-IMAGE-ASPECT-01 | `editor.spec`「补充流程：图片导入」:2467 | 东向拉伸后宽/高保持初始比 | RECHECK-12 全量 1.4m 绿 | V9 overlay `previewResize` 不读 `preserveAspectRatio` | 属性栏已勾选时东向拉伸锁比 | R8-FIX-IMAGE-ASPECT | R8-F-RECHECK-12 | verified |
| R8F-SIMPLE-FADE-01 | `editor.spec`「简洁模式」:886 | 点「预览」后 2s 内文字 motion alpha 降到 stable 的 90% 以下 | RECHECK-12 全量 33.5s 绿 | V9 点「淡入」即自动 `requestNodeMotionPreview`，stable 采到 alpha 0 | 选效果不自动播；「预览」才播；编辑画布保持可见 | R8-FIX-SIMPLE-FADE | R8-F-RECHECK-12 | verified |
| R8F-RICHTEXT-01 | `editor.spec`「流程 8」:2726 / :2743 | overlay 关闭后 `.form-textarea` 仍在；首字 `fontWeight < 600` | RECHECK-13 全量 32.6s 绿 | V9 空选区「加粗」走 run 空操作；overlay `execCommand('bold')` 无法在节点级 700 上取消 | 空选区切节点级加粗；局部格式写 run 并提交后属性栏仍投影该文字 | R8-FIX-TEXT-PROPS | R8-F-RECHECK-13 | verified |
| R8F-LAYER-NAME-01 | `editor.spec`「流程 8B」:643 / :524 | `.node-name` 纯图层名；导出页 `sceneCount/textCount/formulaCount` = 1/3/1 | LAST4 定向 2.5m 绿 | 来源徽章写进 `.node-name`；V2 桥无 `payload.project.scenes` / `[data-native-type]` | 图层名与徽章分开；离线 HTML 可取场景与原生图层计数 | R8-FIX-LAYER-NAME | R8-F-LAST4 | verified |

## 最终声明

只有 `10_R8_FINAL_FULL_GATE.md` 的全部机器、视觉、体验和教师条件均满足时，才能把本报告状态更新为 `accepted`。

