# T10 — 中央接线、Mixed 自适应与统一输入

> Wave：3（串行）
> 依赖：T02–T09B HANDOFF 全部到齐
> 职责：只做热点接线与窄冲突修复，不重写 lane 功能

## 1. 独占热点

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/ui/TopToolbar.tsx`
- `src/renderer/styles/globals.css`
- 上述接线直接对应的 App/shell/store/workspace 单测

只有本任务可以处理 Wave 1/2 的 `INTEGRATION_REQUEST`。若请求实际上缺少 lane 内功能，退回原 owner，不在热点中临时实现第二套逻辑。

## 2. 集成顺序

1. 核对 T02–T09B 所有 HANDOFF 的 baseline、导出符号、最小测试和未决风险。
2. 先接 store 的 V9 command wrapper 与稳定 selection/session；不保留隐藏 V8 写路径。
3. 接课程结构与布局推导，再接左栏全局层固定分区和三类页面树。
4. 接 Slide/Flow/Spatial Workspace 与右栏能力，保证切 location 时事务完整。
5. 接有效图层、属性、媒体、右键菜单和 T02 动作路由。
6. 最后接全局 keydown/contextmenu、试运行、保存/重开和 Mixed Player 入口。
7. 只在所有行为正确后做最小 CSS 收敛，对照根目录 UI 参考图。

## 3. 必须成立的 UI

### 3.1 左栏

- 四态均固定显示“共享内容 → 全局层（全课）”，与页面树有分隔。
- 纯 Slide 是紧凑缩略图；纯 Flow 是页面—标题目录；纯 Spatial 是页面—镜头；Mixed 是统一课程树。
- 全局层不是 location，不改变 active location、课程顺序或 Pure/Mixed。
- 新增内容始终可创建 Slide、Flow、Spatial；不依赖导入。

### 3.2 工作区与右栏

- active location 决定中央 surface、元素/图层/属性、快捷键和当前位置试运行。
- 切换前提交/取消当前编辑事务，清空上一 surface 的临时 selection/hover/draft，不串页。
- 选择 global scope 时当前 location 只作预览上下文；命令 owner、图层与属性同步切 global。
- 图层紧凑单行，右键、Delete、复制、排序、锁定、隐藏等入口调用同一动作。

### 3.3 输入与控制器

- Delete/Backspace 在非文本焦点跨 Slide/Flow/Spatial/global 工作；文字编辑时不误删元素。
- 鼠标右键、Shift+F10/Menu、工具按钮和图层菜单结果一致。
- 控制器 selection chrome、八向 resize、属性折叠和试运行使用同一配置；删除“定位控制器”。
- 声音导入/管理入口可达，不显示“暂不能管理”。

## 4. 保存、历史与错误

- 选择 location/global scope 不写 history 或 dirty。
- 新增/删除/排序/转换各自一次原子 history。
- 保存/重开后从项目重新推导 layout，结果一致。
- 命令失败显示具体原因，不吞返回值。
- V8 只在显式导入路径出现，默认保存/发布只写 V9。

## 5. 最小验证

中央集成仍不运行全量。按实际接线分组运行：

```powershell
npx vitest run tests/unit/editorStoreV9Ownership.test.ts tests/unit/multiSurfaceStoreClosure.test.ts
npx vitest run tests/unit/editorShellMultiSurface.test.tsx tests/unit/scenePanelSurfaceNav.test.tsx
npx vitest run tests/unit/workspaceCourseLocationGate.test.tsx tests/unit/rightSidebarDocumentControl.test.tsx
npx vitest run tests/unit/courseAuthoringControls.test.tsx tests/unit/editorShellCollapse.test.tsx
git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/Workspace.tsx src/renderer/ui/ScenePanel.tsx src/renderer/ui/RightSidebar.tsx src/renderer/ui/TopToolbar.tsx src/renderer/styles/globals.css
```

禁止 typecheck、build、全量 test、Playwright/Electron 和 preservation visual。跨类型错误可用编辑器/单测定位，最终类型检查由 T12 统一运行。

## 6. 验收

- T02–T09B 所有 `INTEGRATION_REQUEST` 已闭合或有明确退回记录。
- 七种 surface 组合能由 store/view model 正确推导。
- UI 与修订后的四张参考图一致，尤其是全局层固定入口、Flow 层级和控制器动作。
- 无第二 App/Shell/Store、无持久化 mode、无可见 AI。
- 只可标记 `integration candidate`，不能宣称完整通过。

## 7. 交付记录

尚未执行。
