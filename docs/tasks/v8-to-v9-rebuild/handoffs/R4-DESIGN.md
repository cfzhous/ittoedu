HANDOFF
- task: R4-DESIGN
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`（**只读，未改、未 commit、未跑测试**）
- outcome: 产出教师可审阅的 Flow 编辑/运行 UI 合同，冻结级别 **coordinator-proposed freeze**。一张编辑态 + 两张运行态（目录展开/收起）用 Markdown 结构图与 mermaid 等价高保真说明，未把旧 PNG 或弱化 FlowElementsTab/FlowPropertiesTab 当实现合同。未改任何产品源码，未开始 R4-A，未宣称 V9 编辑器可用，未标 art/accepted。实现仍等 R3-CUT + 本合同。
- owned files changed:
  - `docs/tasks/v8-to-v9-rebuild/artifacts/R4_FLOW_UI_CONTRACT.md`（新建，本合同）
  - `docs/tasks/v8-to-v9-rebuild/handoffs/R4-DESIGN.md`（本 HANDOFF）
  - 未改 `00_INDEX.md`、阶段文档、账本、产品 worktree
- donor files/functions consulted（只读）:
  - `COURSEWARE_DEVELOPMENT_PLAN.md` §0.4.4、§5.3–5.4、§5.7、R4 阶段
  - `docs/tasks/v8-to-v9-rebuild/06_R4_FLOW_AUTHORING.md` §3
  - `01_SHARED_EXECUTION_CONTRACT.md`、`handoffs/R2-GATE.md`、`handoffs/R0-G.md`、`handoffs/R1-A.md`
  - `V9_EDITOR_UI_DESIGN_SPEC.md`、`V9_EDITOR_UI_FLOW_REFERENCE.png`
  - 成熟 V8 壳：产品 worktree `RightSidebar.tsx`、`ElementsTab.tsx`（内嵌 `MediaTab`）、`ScenePanel.tsx`、`TopToolbar.tsx`、`TextEditOverlay.tsx`、`App.tsx` Delete 焦点
  - 供体反例：计划目录 `FlowElementsTab.tsx`、`FlowPropertiesTab.tsx`（整段 `text` patch）
  - R1-A Flow `text` + 可选 `TextRun[]`；`artifacts/V8_CAPABILITY_LEDGER.md` V8-TEXT-01 / V8-CLIP-01（V8 画布无自定义右键）
- donor 舍弃部分:
  - 旧 PNG 中的图层行、整段字体属性、缺共享 MediaTab/组件入口
  - `FlowElementsTab` / `FlowPropertiesTab` 作为产品表面
  - 持久化 `projectMode`
  - 把每个 paragraph 画成图层或课程树节点
- focused validation command: 无（任务纯设计，禁止跑测试）
- validation result: 未跑 Vitest / typecheck / build / E2E / 视觉。计划目录仅新增上述两个 Markdown 文件。
- validation entry / fixture / backend: n/a
- validation proves / does not prove: 证明合同文本覆盖 §3 必标项与 §5.4 硬约束。不证明任何真实 UI、Player 或保存重开。
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS: 无（无产品接线）
- DECISION_REQUESTS: 无。教师尚未逐图确认；按 R0-G 与本任务授权，协调者将符合 §5.4 的合同标为 coordinator-proposed freeze，不阻塞后续在 R3-CUT 之后领取 R4-A。
- remaining risks / untested full checks: 教师最终验收仍可能要求改默认插入（文中媒体 vs 浮层）或运行态目录默认开合；这些已写进合同 §14，不视为未定。R4-A 仍锁在 R3-CUT。未跑 typecheck / 全量 test / build / E2E / 视觉回归（R8）。
- rollback point: 删除计划目录上述两个新建文件。产品 worktree 无 diff。
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified
- freeze: coordinator-proposed freeze
- contract path: `docs/tasks/v8-to-v9-rebuild/artifacts/R4_FLOW_UI_CONTRACT.md`

## 合同摘要（给协调者）

- 壳层：V8 顶栏 / 左栏 / 右栏（元素、图层、属性）+ 元素内嵌 MediaTab；专业组件 / 互动与动画 / 开发。禁止 Flow 专用元素/属性页。
- 树：页面父 + heading/section 子。paragraph 不上树、不进图层。
- 交互：单击选 block，双击就地编辑；选区工具在块内顶或块下；IME 与 V8 选区级粗体/斜体/颜色。
- 所有权：文中媒体默认跟正文；浮层/组件/Runtime/图形/控制器进图层、视口坐标。
- 运行态：方案 1 贴边三角（展开朝左贴抽屉右缘；收起只留最左朝右窄三角）。
- 旧 PNG 冲突条款：合同 C1–C12。

## 未做

- 未改产品代码、未 commit、未跑测试、未开始 R4-A
- 未更新 `00_INDEX.md`（协调者账本）
- 未生成新 PNG（合同明确用 Markdown/mermaid，不以弱化截图代替）
