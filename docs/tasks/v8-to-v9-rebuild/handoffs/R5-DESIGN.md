HANDOFF
- task: R5-DESIGN
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451` — **本任务未进入、未修改、未 commit 该 worktree**
- outcome: 只产出教师可审阅的 Spatial 编辑/运行 UI 合同。状态为 **coordinator-proposed freeze**（符合根计划 §5.5 即视为实现前合同）。未开始 R5-A，未改产品源码，未跑测试，未宣称 V9 编辑器可用，未标 art/accepted。实现仍等 R3-CUT + 本合同冻结。
- owned files changed:
  - `docs/tasks/v8-to-v9-rebuild/artifacts/R5_SPATIAL_UI_CONTRACT.md`（新建，合同正文）
  - `docs/tasks/v8-to-v9-rebuild/handoffs/R5-DESIGN.md`（本文件）
  未改 `07_R5_SPATIAL_AUTHORING.md`、`00_INDEX.md`、产品 worktree、Schema、App/Workspace。
- donor files/functions consulted:
  - `COURSEWARE_DEVELOPMENT_PLAN.md` §0.4-4、§5.1–5.7、§12
  - `07_R5_SPATIAL_AUTHORING.md` 第 3 节
  - `V9_EDITOR_UI_DESIGN_SPEC.md` §3–5.3；`V9_EDITOR_UI_SPATIAL_REFERENCE.png`（参考，已列出覆盖条款）
  - `01_SHARED_EXECUTION_CONTRACT.md`；`handoffs/R2-GATE.md`；`handoffs/R2-B.md`（选择框/八向/viewport）；`handoffs/R2-C.md`（双击/选区格式）
  - 供体反例（只读）：`SpatialWorkspace.tsx` 粉框控制器、独立 `spatial-workspace__controls`、minimap、textarea；`RightSidebar.tsx` 在 Spatial 下用 `SpatialElementsPanel` / 整页 `SpatialCameraPanel` 替换元素与属性
  - V8 合同锚点（只读）：`Workspace.tsx` `canvas-view-controls`；`SelectionOverlay.ts` 手柄视觉；`courseEditorLayout.ts` 共享内容 + 本页镜头树；`courseProjectSchema.ts` spatial-2d infinite bounds / camera / path / relation
- donor 舍弃部分:
  - 参考图独立缩放条、小地图、画布顶镜头工具条、彩虹镜头框当选择合同
  - 弱化 Spatial inspector / 粉色矩形控制器 / Spatial textarea 文字
  - 把有限 Slide 坐标扩大成伪无限
  - 第二套元素/媒体/组件/图层/控制器
  - `projectMode`
  - Focusky 级时间线
- focused validation command: 无。本任务纯文档，按 `07_R5` §3.3 不跑测试。
- validation result: n/a（未跑 vitest / typecheck / build / E2E / 视觉）
- validation entry / fixture / backend: n/a
- validation proves / does not prove:
  - proves: 无运行证明。只冻结教师可见 UI 合同与和旧参考图的覆盖表。
  - does not prove: 任何产品行为、V9 编辑器可用性、R5 实现、Player、保存重开
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS: 无（未改产品、未要求 R5-Z 接线）
- DECISION_REQUESTS: G1–G4 已由协调者于 2026-08-17 按建议默认拍板（见合同 §16）。不是实现阻塞。教师最终验收若否决再改合同；§5.5 已裁定项不开放。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - R2 Gate 仍未 `verified`；R5 实现仍锁在 R3-CUT
  - 供体 RightSidebar 的 Spatial 换皮仍存在于计划目录源码，实现时必须按合同改接同一套 V8 页签，不得把该换皮当母体
  - G3（global 非控制器项是否 viewport）若教师否决，需修订合同 §6.1 后再让 R5-A 冻结坐标空间
- rollback point: 删除上述两份新建 Markdown。产品 worktree 无本任务 diff。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified
- freeze: **coordinator-proposed freeze**

## 合同路径

[`artifacts/R5_SPATIAL_UI_CONTRACT.md`](../artifacts/R5_SPATIAL_UI_CONTRACT.md)

## 冻结摘要（给 R5-A 以后读）

1. 无限 world，无 1280×720 页边界；坐标可负、可大范围；禁止伪无限。
2. 缩放条、选择框、八向、旋转柄、真实教师控制台与 Slide 同源；控制台 viewport/global，不随 world pan/zoom。
3. 左栏：共享内容 → 全局层（全课）→ 分隔 → 页面 → 本页镜头。坐标 / semantic zoom / path 不进导航。
4. 镜头调度在默认页面属性；path/relation 渐进披露，不替代 Properties。
5. 共享 MediaTab、Components、Properties、Nodes、Animation/Interaction。
6. 双击文字、选区格式、媒体命中改属性不得退化。
7. 不新增 `projectMode`。未确认前不实现。
