# T09A — 互动、自动化、Runtime/Component 与开发入口无降级

> Wave：2，可与 T05–T09/T09B 并行
> 原则：保留 V8/V9 已有高级作者能力，但不新增可见 AI 或重型手工系统

## 1. 可见结果

专业模式中既有互动、自动化、Runtime、Component、设计令牌和开发工作区仍可发现、可编辑、可保存并进入 Player；不能因为“轻量”而消失、禁用或只剩只读信息。普通教师界面可渐进披露这些入口。

## 2. 独占文件

- `src/renderer/course/slideInteractionCommands.ts`
- `src/renderer/course/slideInteractionView.ts`
- `src/renderer/ui/AutomationTab.tsx`
- `src/renderer/ui/InteractionEditor.tsx`
- `src/renderer/ui/ComponentsTab.tsx`
- `src/renderer/ui/DesignTokensEditor.tsx`
- `src/renderer/ui/DeveloperTab.tsx`
- `src/renderer/authoring/runtimeAuthoringContext.ts`
- Runtime/Component authoring registry 与 edit-session 的 renderer 侧窄文件
- 上述模块直接对应的单测

不修改 RightSidebar/App/store/Workspace/global CSS、Player host、Schema、T09B 独占的项目/资源事务、`courseAiHandoff.ts` 或 `courseAiPatch.ts`。右栏页签接线提交给 T10；package sidecar 变更提交给 T09B。

## 3. 必须闭合

### 3.1 互动与自动化

- 触发器、条件、动作、规则排序/复制/删除使用 V9 稳定目标。
- scene/state/media/audio/global/surface/Runtime/Component 目标可解析；删除目标后引用有诊断或清理。
- 锁定目标不能新增、修改或删除相关写规则，除非先解锁。
- 一次规则操作一次 history；编辑态不执行播放动作。

### 3.2 Component API 4

- 组件包导入/替换/移除、props、variant、preset、nested content 与文本编辑保持可达。
- stable authoring address 跨保存有效；package 生命周期和引用检查不回退。
- Slide/Flow/Spatial 的允许入口使用同一 catalog/asset 真相，不复制包。

### 3.3 Runtime API 2/3

- 既有 Runtime 内容编辑、预览、作者目标、生命周期和导出合同保持可达。
- API 2/3 兼容不因 UI 收敛被删除；同场景/Surface Runtime 的现有限制必须如实提示。
- 不把 Runtime 内部 DOM hitId 当保存地址。

### 3.4 设计令牌与开发入口

- 设计 token 编辑、引用和保存继续工作。
- Developer 工具只在专业模式渐进披露，不从生产入口移除。
- UI 不暴露协议内部 ID 给普通教师，但专业诊断保留必要事实。

## 4. AI 与 Focusky 边界

- `courseAiHandoff` / `courseAiPatch` 仍为未挂载 reserved 接口，本任务不新增调用点、聊天、模型、Provider、网络或 Clipboard。
- 不以本任务宣称 Focusky 级演示等价；只确保现有 Runtime/Component 基础不回退并为远期留出稳定地址/props/事件边界。

## 5. 最小验证

```powershell
npx vitest run tests/unit/slideInteractionCommands.test.ts tests/unit/interactionEditor.test.tsx
npx vitest run tests/unit/componentPackageManagement.test.tsx tests/unit/componentPropertiesEditor.test.tsx
npx vitest run tests/unit/runtimeAuthoringContext.test.ts tests/unit/runtimeContentEditor.test.tsx
npx vitest run tests/unit/designTokens.test.tsx tests/unit/developerMode.test.tsx
git diff --check -- src/renderer/course/slideInteractionCommands.ts src/renderer/course/slideInteractionView.ts src/renderer/ui/AutomationTab.tsx src/renderer/ui/InteractionEditor.tsx src/renderer/ui/ComponentsTab.tsx src/renderer/ui/DesignTokensEditor.tsx src/renderer/ui/DeveloperTab.tsx src/renderer/authoring/runtimeAuthoringContext.ts
```

只跑触及组；禁止 typecheck、build、全量 test/E2E/visual。

## 6. 验收

- 专业模式的高级能力没有 disabled/隐藏到不可达回归。
- 人工命令与锁定/history/稳定地址一致。
- Runtime/Component 能进入发布链，但没有夸大远期能力。
- RightSidebar、Player 和 store 接线请求分别交给 T10/T09。

## 7. 交付记录

HANDOFF
- task: T09A
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 专业模式的互动/自动化、Component API 4 工程目录、Runtime API 2/3 开发工作台与设计 token 保持可发现、可编辑、可保存；未挂载 AI，未宣称 Focusky。锁定目标写规则被命令层拒绝且一次操作一次 history；删除目标后编辑态有诊断。V9 不再把替换/更新一刀切 disabled。V9 尚无 Runtime 创建命令与组件替换 sidecar，入口改为诚实提示而不是假禁用。
- files changed:
  - `src/renderer/course/slideInteractionCommands.ts`（锁定目标写拒绝）
  - `src/renderer/course/slideInteractionView.ts`（删除/不可达目标诊断）
  - `src/renderer/ui/AutomationTab.tsx`（V9 诊断 + 试运行入口；编辑规则不执行播放）
  - `src/renderer/ui/InteractionEditor.tsx`（锁定节点/规则拦截写入）
  - `src/renderer/ui/ComponentsTab.tsx`（V9 共用 catalog、定位稳定 layerItemId、去掉替换 blanket disable）
  - `src/renderer/ui/DesignTokensEditor.tsx`（去掉 AI 文案）
  - `src/renderer/ui/DeveloperTab.tsx`（V9 同场景限制、试运行、组件只读查看；不造假创建入口）
  - `src/renderer/authoring/runtimeAuthoringContext.ts`（persist 只用 content key；识别 ephemeral hitId）
  - 对应单测与本文件交付记录
  - 未改 `runtimeTargetEditSession.ts` / `componentTextEditSession.ts`：会话仍用稳定 `key`/`nodeId`/`packageId`，不把 DOM hitId 当保存地址
- focused validation commands:
  - `npx vitest run tests/unit/slideInteractionCommands.test.ts tests/unit/interactionEditor.test.tsx`
  - `npx vitest run tests/unit/componentPackageManagement.test.tsx tests/unit/componentPropertiesEditor.test.tsx`
  - `npx vitest run tests/unit/runtimeAuthoringContext.test.ts tests/unit/runtimeContentEditor.test.tsx`
  - `npx vitest run tests/unit/designTokens.test.tsx tests/unit/developerMode.test.tsx`
  - `git diff --check -- src/renderer/course/slideInteractionCommands.ts src/renderer/course/slideInteractionView.ts src/renderer/ui/AutomationTab.tsx src/renderer/ui/InteractionEditor.tsx src/renderer/ui/ComponentsTab.tsx src/renderer/ui/DesignTokensEditor.tsx src/renderer/ui/DeveloperTab.tsx src/renderer/authoring/runtimeAuthoringContext.ts`
- results: 8 files / 67 tests passed；`git diff --check` 无输出。未跑 typecheck / build / 全量 test / E2E。未提交。
- INTEGRATION_REQUESTS:

INTEGRATION_REQUEST
- requester: T09A
- target owner: T10
- target file: `src/renderer/App.tsx`
- exported symbol / callback: `handleReplaceComponent` / `onReplaceComponent`
- required behavior: V9 `courseSession !== null` 时不要再 `setStatus('…M4-COMP…请勿替换')`。应打开同一选择器，校验同一 packageId 后调用 T09B 的替换命令（sidecar + 实例 version/props）。`ComponentsTab` 在传入 `onReplaceComponent` 时菜单项已启用。
- focused test that proves the lane side: `tests/unit/componentPackageManagement.test.tsx`（V9「替换组件包」可点并回调 packageId）
- risk if omitted: 教师能点替换，但 V9 工程仍被 App 短路，表现为能力缺失。

INTEGRATION_REQUEST
- requester: T09A
- target owner: T10
- target file: `src/renderer/ui/RightSidebar.tsx`、`src/renderer/App.tsx`
- exported symbol / callback: `onImportExternalComponents`、`onAddCatalogComponents`、`onUpdateCatalogComponent`
- required behavior: 专业模式页签继续挂 `ComponentsTab` / `AutomationTab` / `DeveloperTab`；V9 导入走已有 `importCourseComponentPackages`，更新/加入 catalog 同样写入 `courseSession.componentPackages`，不按 surface 复制包。
- focused test that proves the lane side: `tests/unit/componentPackageManagement.test.tsx`（V9 工程包可管理、不复制）
- risk if omitted: 右栏不传回调时导入/替换按钮会因缺少 handler 而 disabled，看起来像高级入口被关掉。

INTEGRATION_REQUEST
- requester: T09A
- target owner: T10
- target file: `src/renderer/ui/PropertiesTab.tsx`
- exported symbol / callback: `DesignTokensEditor`、`courseSession.history.present.designTokens`
- required behavior: V9 `documentControl` 路径也要挂可写 `DesignTokensEditor`，绑定当前工程 `designTokens` 与一次 history 提交。顺手把「运行时代码由 AI 或生成脚本写入工程」改成非 AI 说明；T09A 未改 PropertiesTab。
- focused test that proves the lane side: `tests/unit/designTokens.test.tsx`（token 编辑器无 AI 文案且添加按钮可用）
- risk if omitted: V9 属性页看不到/改不了设计 token；V8 属性页仍出现 AI 文案。

INTEGRATION_REQUEST
- requester: T09A
- target owner: T09B
- target file: `src/renderer/project/**`（package sidecar 事务）
- exported symbol / callback: `replaceCourseComponentPackage`（名称可按 T09B 现有命令）
- required behavior: 替换同一 ID 的包，更新 sidecar 与实例 `version`/`props`，一次 history；失败原因可见且不破坏现有实例。T09A UI 只发出 `onReplaceComponent(packageId)`。
- focused test that proves the lane side: `tests/unit/componentPackageManagement.test.tsx`（替换入口可达）
- risk if omitted: T10 即使接线也没有 V9 替换命令可调。

INTEGRATION_REQUEST
- requester: T09A
- target owner: T05 / T10
- target file: `src/renderer/store/editorStore.ts` / `src/renderer/course/v9SlideVerticalSlice.ts`
- exported symbol / callback: `addCourseRuntimeLayer` 或等价创建命令
- required behavior: 若产品仍允许「当前作用域创建 Runtime API 2 模板」，提供一次 history 的创建命令。当前 V9 Developer 空态只提示同场景限制，不再展示会失败的「创建运行时模板」。
- focused test that proves the lane side: `tests/unit/developerMode.test.tsx`（V9 无假创建按钮、同场景限制可见、试运行切 `canvasMode=run`）
- risk if omitted: V9 只能编辑已有 Runtime，不能从开发工作台新建。

INTEGRATION_REQUEST
- requester: T09A
- target owner: T07 / T08
- target file: Flow / Spatial 插入入口（各 lane 独占 UI）
- exported symbol / callback: `application/x-courseware-element`（`component:` / `component-preset:`）
- required behavior: 从同一 `courseSession.componentPackages` 消费拖放/插入，不复制包。`ComponentsTab` 在 flow-block / spatial-camera 会说明「共用同一组件目录，请从当前页入口插入」。
- focused test that proves the lane side: `tests/unit/componentPackageManagement.test.tsx`（surface 不能插入时管理入口仍启用）
- risk if omitted: Flow/Spatial 教师无法把已加入工程的组件放到当前页，或会复制出第二份包。

- visual/manual evidence: 未启动编辑器；证明来自定向单测（可发现/可编辑/可保存合同）。
- remaining risks: App 对 V9 替换仍短路；V9 PropertiesTab 未挂 token；无 `addCourseRuntimeLayer`；无 `replaceCourseComponentPackage`。锁定拒绝覆盖规则 trigger/action 的 `nodeId`，不含仅条件引用。Schema 仍在保存时拒绝失效引用，编辑态另给诊断。不宣称 Focusky 完成。
- status: engineering candidate
