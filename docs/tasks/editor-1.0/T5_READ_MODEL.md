# T5 隔离内部 Read Model

> 依赖：T3  
> 并行：否  
> 合同变化：无  
> 教师手感：必须不变

## 目标

允许 1.0 继续用成熟 UI，禁止 V8-shaped 类型继续扩散到新代码。不要求删光 `SceneNode`。

## 允许修改

```text
src/renderer/course/read-model/**          （新建）
src/renderer/ui/NodesTab.tsx               （只改 import 边界，不改分组交互）
src/renderer/store/v9SlideUiProjection.ts  （若尚未在 T3 改名）
tests/unit/v9GlobalLayerUiAdapter.test.tsx
新建一个窄架构测试（可选，计入本任务最小验证）
```

不要重写 `Workspace.tsx`、不要拆 `editorStore.ts`、不要改 Schema。

## 工作项

暂时允许：

- LayerItem → Editor `SceneNode` View
- Presentation override → 属性 View
- Workspace 消费成熟节点结构
- Player Authoring 暂用完整 Native 快照

必须形成的边界：

```text
Course Project V9
      → Editor Read Model / Projection Adapter
      → Workspace / Properties / Layer Panel
```

架构约束（用测试钉住，不要靠口头）：

- UI 不直接导入 archive/migration
- UI 不写 Project JSON
- 写操作走 Course Commands
- `SceneNode` 投影不得存成第二份工程

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx
```

若新增了架构测试文件，只再跑那一个文件。

## Gate

- V8-shaped View 只在明确适配层。
- Store 唯一持久化文档是 V9。
- 本阶段不要求删光 `SceneNode`。

## 下游

T6。1.0 之后的渐进解耦不在本任务。
