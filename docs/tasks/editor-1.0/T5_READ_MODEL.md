# T5 隔离内部 Read Model

> 状态：**已合入，禁止重做**
> 并行：可与 P5-persist 分树（文件不重叠）  
> 合同变化：无  
> 教师手感：必须不变  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

新代码不要再直接从 UI 文件 import archive/migration。V8-shaped `SceneNode` 只允许待在明确适配层。**不要求删光 SceneNode，不拆 editorStore，不重写 Workspace。**

## 基线（T3 合入后才开工）

- P7 已把教师控制器排除在「场景 / 本页 / 世界」外，只出现在「全局」。函数：`groupedVisualRows`（`NodesTab.tsx` 约 244）。**禁止改过滤条件。**
- T3 会把 `v9SlideUiProjection.ts` 重命名为 `slideEditorProjection.ts`。本任务跟 T3 后的文件名。
- `Workspace.tsx` 继续消费成熟节点结构。本阶段允许。

## 允许修改

```text
src/renderer/course/read-model/**           新建；只做 re-export / 薄适配
src/renderer/ui/NodesTab.tsx               只改 import 路径，不改分组交互 / groupedVisualRows 逻辑
src/renderer/store/slideEditorProjection.ts 或 T3 后的等价文件  仅当需要从这里 re-export
tests/unit/v9GlobalLayerUiAdapter.test.tsx  不得削弱 P7 断言
tests/unit/readModelBoundary.test.ts        新建（必须）
docs/tasks/editor-1.0/T5_HANDOFF.md
```

## 禁止

- 重写 `Workspace.tsx`、拆 `editorStore.ts`、改 Schema。
- 把 `SceneNode` 存进 project.json / session 当第二份工程。
- 把控制器重新放进「场景 / 本页 / 世界」。
- 删除 `courseLayerItemToSceneNode`；可以把它移到 read-model 并 re-export。

## 逐步算法

1. 建 `src/renderer/course/read-model/index.ts`。
2. 把 NodesTab 当前直接依赖的投影函数改成从 read-model import（例如 `courseLayerItemToSceneNode`、effective layer 行类型）。**函数行为不变。**
3. `tests/unit/readModelBoundary.test.ts` 用读源码字符串或 ESLint-style 断言（选简单的）：

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ui = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/renderer/ui/NodesTab.tsx'), 'utf8')
expect(ui).not.toMatch(/courseProjectArchive/)
expect(ui).not.toMatch(/courseProjectMigration/)
expect(ui).not.toMatch(/from ['"]@\/renderer\/project\/courseProjectArchive['"]/)
```

路径按真实相对位置调整。不要对整个 `src/renderer/ui` 做一次误伤扫描（Workspace 仍可暂时投影）。

4. `v9GlobalLayerUiAdapter.test.tsx` 必须仍然通过：控制器不在场景/本页/世界组。

## 最小验证

```powershell
npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx tests/unit/readModelBoundary.test.ts
```

然后 `git diff --check`。

## 完成判定

- [x] NodesTab 不直接 import archive/migration
- [x] `groupedVisualRows` 行为与 P7 相同
- [x] 未拆 Store / 未重写 Workspace
- [x] 已 push `cursor/t5-read-model-de5c`
- [x] 有 `T5_HANDOFF.md`

## 下游

T6。1.0 之后才删光 SceneNode。
