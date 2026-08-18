# R4 — 强文本 Flow 作者态、运行目录与共享能力

> 状态：`R4-A/B/C/D` lane_candidate；`R4-Z` engineering candidate for this stage（已释放壳层热点锁）；合同 [`artifacts/R4_FLOW_UI_CONTRACT.md`](artifacts/R4_FLOW_UI_CONTRACT.md)
> R4-Z / R5-Z 均已交付。R6-Z 仍不得抢壳层，除非协调者明确领取。
> 设计 Gate：合同已 coordinator-proposed freeze。四条实现 lane 已交付。

## 1. 阶段可见结果

教师能从用户可见入口创建空白 Flow 页面，直接点选 block、双击就地编辑，使用当前产品最强的选区级文字能力；普通 paragraph 不进入课程树或通用 z-order 图层。媒体、组件、Runtime、属性、互动和全局层沿用成熟 V8 能力。运行态目录可完全收起，仅保留贴边三角按钮。

R4 不建立 FlowElementsTab/FlowPropertiesTab 等第二套弱面板；只新增 Flow 必需的文档 block 编辑区与目录结构。

## 2. 任务与依赖

| ID | 任务 | 独占写入 | 可并行 | 依赖 |
|---|---|---|---|---|
| R4-DESIGN | Flow 编辑/运行 UI 合同与教师确认 | 设计说明/图，不改产品代码 | 可与 R3、R5-DESIGN | R2-Z |
| R4-A | Flow 文档模型、结构命令、selection/history | `flowEditorCommands/Slice/View` 与测试 | 否 | R3-CUT；R4-DESIGN 确认 |
| R4-B | 强文本 FlowWorkspace 与 block 编辑 | Flow 文档编辑组件、text bridge 与测试 | R4-C/D | R4-A |
| R4-C | 媒体/组件/Runtime/global overlay 接口 | Flow authoring adapter 与测试 | R4-B/D | R4-A |
| R4-D | Flow Player host、运行目录、print plan/Docx 基础 | player flow 与独立 export helper/测试 | R4-B/C | R4-A |
| R4-Z | Flow 中央接线与真实产品冒烟 | App/store/Workspace/ScenePanel/RightSidebar/TopToolbar 热点 | 不与 R5-Z 并行 | R4-B/C/D |

## 3. R4-DESIGN — 先确认 UI

### 3.1 必须产出

一张编辑态和两张运行态（目录展开/收起）设计图或等价高保真说明，必须标出：

- 课程树只含 Flow page 与可导航 heading/section；
- block 直接点击、双击、caret/选区、上下文工具出现位置；
- paragraph 不进入课程树或 z-order 图层；
- 共享 MediaTab、Components、Properties、Interaction、global authoring scope 的入口；
- 浮层媒体/组件/Runtime 与普通文档 block 的不同 ownership；
- 贴边三角目录按钮和长文滚动；
- Undo/Redo、右键、Delete 和键盘焦点边界。

### 3.2 禁止

- 不以现有弱化 `FlowElementsTab`/`FlowPropertiesTab` 截图作为实现合同；
- 不把每个 paragraph 画成图层行；
- 不创建 Flow 专用媒体库、组件库或通用属性系统；
- 不在未确认前开始代码实现。

### 3.3 Gate

合同已写入 [`artifacts/R4_FLOW_UI_CONTRACT.md`](artifacts/R4_FLOW_UI_CONTRACT.md)。与旧 `V9_EDITOR_UI_FLOW_REFERENCE.png` 冲突以合同 C1–C12 为准。R4-A 在 R3-CUT 之后 `READY`；实现不得使用弱化 `FlowElementsTab` / `FlowPropertiesTab`。

## 4. R4-A — 文档模型与结构命令

### 4.1 独占路径

- `src/renderer/course/flowEditorCommands.ts`
- `src/renderer/course/flowEditorSlice.ts`
- `src/renderer/course/flowEditorView.ts`
- Flow 纯模型 helper 与对应最多两个测试

### 4.2 冻结接口

- Flow page/block/heading 的稳定 ID 与 authoring address；
- selection 包含 page、block、text range、authoring scope；
- insert/split/merge/move/delete/indent/outdent/format 命令；
- 一次动作一次 history/revision；
- 普通 block 与 overlay layer 的明确分类。

### 4.3 必须闭合

- heading/section 可导航，paragraph/quote/list/table/formula/media 等普通 block 不是课程级 location；
- paragraph 不进入通用 z-order layer；
- Delete/Backspace 在文本、block、overlay 三种焦点中语义明确；
- cut/copy/paste/duplicate 保留结构和引用；
- 结构命令保存重开稳定；
- 不修改 App/store/Workspace/UI 热点。

### 4.4 最轻量验证

```powershell
npx vitest run tests/unit/flowEditorCommands.test.ts tests/unit/flowEditorView.test.ts
git diff --check -- src/renderer/course/flowEditorCommands.ts src/renderer/course/flowEditorSlice.ts src/renderer/course/flowEditorView.ts tests/unit/flowEditorCommands.test.ts tests/unit/flowEditorView.test.ts
```

## 5. R4-B — 强文本 FlowWorkspace

### 5.1 独占路径

- `src/renderer/ui/FlowWorkspace.tsx` 或经设计确认的单一文档编辑组件
- Flow text edit/range formatting bridge
- Flow block 上下文工具组件
- 对应最多两个测试

不得新增 FlowElementsTab/FlowPropertiesTab；不得改中央 RightSidebar/MediaTab/PropertiesTab。

### 5.2 必须闭合

- block 可直接命中、点击选择、双击进入就地编辑；
- caret、range selection、IME、选区级粗体/斜体/颜色、段落/标题、列表、表格、公式；
- 上下文工具只在当前 block 内或其下方出现，不靠图层双击“改名/改正文”；
- selection 变化、blur、composition、Undo/Redo 不丢文本；
- 长文滚动、键盘导航和焦点保护完整；
- 属性写 R4-A 同一字段，不维护第二份草稿真相。

### 5.3 最轻量验证

```powershell
npx vitest run tests/unit/flowInlineTextEditor.test.tsx tests/unit/flowWorkspace.test.tsx
git diff --check -- src/renderer/ui/FlowWorkspace.tsx src/renderer/authoring tests/unit/flowInlineTextEditor.test.tsx tests/unit/flowWorkspace.test.tsx
```

## 6. R4-C — 共享媒体、组件、Runtime 与 global scope

### 6.1 独占路径

- `src/renderer/course/flowSharedAuthoringAdapters.ts`
- Flow 专用 overlay projection
- Flow authoring target tests

不得修改 MediaTab、ComponentsTab、PropertiesTab、NodesTab 或复制它们。

### 6.2 必须闭合

- 导入的图片/视频/声音可从共享 MediaTab 插入 Flow 并继续命中、选择、改属性；
- Component/Runtime 从共享入口插入，props/variant/preset/nested content 与作者目标可用；
- 普通文档 media block 不自动变成 z-order layer；只有真实 overlay 进入统一图层；
- 点击全局层进入真实 global authoring scope，控制器和普通 global item 可选、可编辑、可设置逐 location 显隐；
- interaction、右键、Delete 与 R4-A selection 合同一致。

### 6.3 最轻量验证

```powershell
npx vitest run tests/unit/flowSharedAuthoringAdapters.test.tsx tests/unit/flowUnifiedLayers.test.tsx
git diff --check -- src/renderer/course src/renderer/authoring tests/unit/flowSharedAuthoringAdapters.test.tsx tests/unit/flowUnifiedLayers.test.tsx
```

## 7. R4-D — Player、目录与文档导出基础

### 7.1 独占路径

- `src/player/surfaces/flow/flowModel.ts`
- `src/player/surfaces/flow/flowRuntimeToc.ts`
- `src/player/surfaces/flow/FlowSurfaceHost.ts`
- `src/renderer/export/course/flowDocx.ts` 和 Flow print plan 的独立 helper
- 对应最多两个测试

### 7.2 必须闭合

- Player 使用 Published V2 Flow 数据，不从作者 DOM 反序列化；
- heading/section 目录跳转正确；
- 目录完全收起后只留贴边三角按钮，展开不遮挡关键正文；
- global/controller/audio 与课程运行会话一致；
- print/PDF/DOCX 结构保留标题、正文、列表、表格、公式和媒体 fallback；
- R7 负责最终导出菜单/文件交付，本任务只闭合纯 helper 与 host。

### 7.3 最轻量验证

```powershell
npx vitest run tests/unit/flowSurfaceHost.test.ts tests/unit/flowRuntimeToc.test.ts
git diff --check -- src/player/surfaces/flow src/renderer/export/course/flowDocx.ts tests/unit/flowSurfaceHost.test.ts tests/unit/flowRuntimeToc.test.ts
```

## 8. R4-Z — Flow 中央接线

### 8.1 独占热点

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `ScenePanel.tsx`、`RightSidebar.tsx`、`TopToolbar.tsx`
- 现有共享 Elements/Media/Components/Properties/Nodes 的必要窄接线
- `src/renderer/styles/globals.css`（必要时）

R4-Z 与 R5-Z 必须串行，不得同时持有热点锁。

### 8.2 接线步骤

1. 关闭 R4-B/C/D blocking 集成请求。
2. 新建工程入口可创建空白 Flow；统一“主按钮+下拉”留给 R6。
3. 课程树显示 page→heading/section；普通 block 不上树、不进通用图层。
4. FlowWorkspace 与共享右栏、MediaTab、Components、global scope 使用同一 selection/command/history。
5. 试运行进入真实 FlowSurfaceHost；保存重开保持结构与选择边界。
6. 不复制弱化 Flow 面板，不影响 Slide 默认能力。

### 8.3 最轻量验证

```powershell
npx vitest run tests/unit/flowProductIntegration.test.tsx tests/unit/flowUnifiedLayerEntry.test.tsx
git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui src/renderer/styles/globals.css
```

只做一次真实 UI 冒烟：空白 Flow → 标题+两段正文 → 双击/IME/局部格式 → 插入图片与组件 → 进入全局层并设置当前页隐藏 → 保存重开 → 试运行并收起目录。

## 9. R4 Gate

- 教师确认的 UI 合同已实现；
- 可从空白创建并完成上述真实纵切；
- paragraph 不污染树/图层；
- 媒体、组件、属性、互动和 global scope 不是占位；
- Slide 既有入口无回归；
- 未运行全量测试/build/E2E/visual。

R4 完成后等待 R5-Z；二者都完成才进入 R6。
