# T07 — Flow 作者能力与运行态目录

> Wave：2，可与 T05/T06/T08/T09 并行
> 依赖：T02/T03/T04
> 关键 UI：页面是父节点，标题是子节点；运行态目录用贴边三角按钮

## 1. 可见结果

教师可从空白 Flow 工程或新增流式页面开始，在连续长文中直接编辑标题与正文，完成 block 新增、选择、多选、复制、Delete、排序、层级、媒体、属性、图层和试运行。运行态目录可完全收起，只留下贴视口边缘的三角唤起按钮。

## 2. 独占文件

- `src/renderer/course/flowEditorCommands.ts`
- `src/renderer/course/flowEditorSlice.ts`
- `src/renderer/course/flowEditorView.ts`
- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/ui/FlowOutlinePanel.tsx`
- `src/renderer/ui/FlowElementsTab.tsx`
- `src/renderer/ui/FlowPropertiesTab.tsx`
- `src/player/surfaces/flow/**`
- 对应 `flow*` 单测

不修改 ScenePanel、App/store/Workspace/RightSidebar/global CSS、PublishedCourseApp 或导出模块。

## 3. 作者态合同

### 3.1 页面与目录层级

- Flow surface/page 是左栏强父节点。
- 只有 heading/section anchor 出现在“本页目录”；paragraph、quote、list item、table、formula、media 等普通 block 不成为课程级同层节点。
- block 排序和缩进只改变页面内部结构，不移动整个页面。
- 选择全局层时不改变这棵树；global 只是正交 authoring scope。

### 3.2 就地编辑

- heading、paragraph、quote、list item 支持直接点选/双击编辑。
- composition、草稿、blur/Enter/Ctrl+Enter、Escape 和外部 selection 变化有明确事务。
- 画布与属性栏写同一 V9 字段；一次编辑只产生一个 history step。
- 保存投影重建不能丢弃已提交文本。

### 3.3 结构动作

- 插入标题/段落/列表/表格/公式/代码/提示/媒体。
- copy/duplicate/delete/move up/down/indent/outdent 走 T02 adapter。
- 删除维护父子、顺序、目录锚点和互动引用；多选原子提交。
- 有效图层显示 global/surface/flow block 来源，并支持语义允许的锁定、隐藏和排序。

## 4. 运行态目录

- 展开态：目录抽屉在视口左侧；三角按钮贴抽屉右边缘并指向左。
- 收起态：抽屉完全离场；只保留贴视口最左边的窄三角按钮并指向右。
- 按钮使用 viewport 坐标，不随长文滚动或缩放离场。
- 目录只列可导航标题，点击使用稳定 anchor，支持键盘与 aria-label。
- 目录开合是运行会话状态，不写回工程/history。

## 5. 不做

- 不把 Flow 做成多个 1280×720 Slide。
- 不新增第二套“讲义大纲”或把所有 block 平铺到左栏。
- 不改跨 surface Player 导航/导出；交给 T09。
- 不扩张重型文档编辑器功能。

## 6. 最小验证

```powershell
npx vitest run tests/unit/flowEditorCommands.test.ts tests/unit/flowEditorSlice.test.ts
npx vitest run tests/unit/flowWorkspace.test.tsx tests/unit/flowAuthoringTargets.test.tsx
npx vitest run tests/unit/flowUnifiedLayers.test.tsx tests/unit/flowStructuralEntry.test.tsx
npx vitest run tests/unit/flowSurfaceHost.test.ts tests/unit/flowRuntimeToc.test.ts
git diff --check -- src/renderer/course/flowEditorCommands.ts src/renderer/course/flowEditorSlice.ts src/renderer/course/flowEditorView.ts src/renderer/ui/FlowWorkspace.tsx src/renderer/ui/FlowOutlinePanel.tsx src/renderer/ui/FlowElementsTab.tsx src/renderer/ui/FlowPropertiesTab.tsx src/player/surfaces/flow
```

不存在的 host/TOC 测试应由本任务新增；每次只跑触及组。禁止 typecheck、build、全量 test/E2E/visual。

## 7. 验收

- 页面和标题目录层级无扁平回归。
- 画布就地文字提交后重新渲染仍有效。
- Delete/右键/结构动作有统一 history 和引用维护。
- 运行态展开/收起完全符合参考图，且不写项目。
- ScenePanel、store、PublishedCourseApp 和导出接线以请求交付 T10/T09。

## 8. 交付记录

尚未执行。

