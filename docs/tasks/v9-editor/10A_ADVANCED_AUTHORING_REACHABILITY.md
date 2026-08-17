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

尚未执行。
