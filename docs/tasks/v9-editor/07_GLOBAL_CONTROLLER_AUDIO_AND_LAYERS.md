# T06 — 全局层、教师控制台、声音与统一图层

> Wave：2，可与 T05/T07–T09 并行
> 核心决策：全局层保留为四态可见作者入口，与页面形态正交
> 中央壳接线：T10；Player 控制器接线：T09

## 1. 可见结果

- 左栏可进入“共享内容 → 全局层（全课）”；它不是 location，也不改变 Pure/Mixed。
- 右侧有效图层紧凑展示 global/surface/page/state/world 等真实来源，并能进行 owner 允许的排序、锁定、隐藏、复制、删除/状态隐藏。
- 教师控制台的选择框、拖动、八向 resize、属性折叠与预览一致；移除无意义的“定位控制器”。
- 声音可导入、试听、重命名、删除、引用检查并在发布中工作。

## 2. 独占文件

允许修改：

- `src/renderer/ui/NodesTab.tsx`
- `src/renderer/ui/PropertiesTab.tsx`
- `src/renderer/ui/MediaTab.tsx`
- `src/shared/teacherControllerLayout.ts`
- `src/shared/teacherControllerConsistency.ts`
- 允许新增 `src/renderer/course/globalLayerCommands.ts`
- 允许新增 `src/renderer/course/effectiveLayerCommands.ts`
- 直接对应的 global/controller/media/layer 单测

以下只读：App/store/Workspace/ScenePanel/RightSidebar/globals.css、T05 Slide 文件、Player 文件，以及 T09B 独占的 `src/renderer/project/**` 资源事务。若声音/媒体导入需要底层资产改动，向 T09B 提交请求；其他接线提交给对应 owner。

## 3. 全局与共享层合同

- global 入口固定存在于四态壳层，选择它只切 authoring owner，active location 继续提供预览上下文。
- `globalLayerItems` / `surfaceLayerItems` 继续保存与发布；不迁移到 V10，不物化为每页副本。
- 统一有效图层保留真实 owner 和稳定 `authoringAddress`。
- owner 内可排序；跨 owner 拖动必须执行明确 scope move 或拒绝并说明，不能假排序。
- global 删除提示影响范围；默认教师控制器删除后提供显式恢复命令。
- 锁定项可选择/查看，除 unlock 外所有写操作统一拒绝。

## 4. 教师控制台合同

- 作者态动作集固定为：上一场景、下一场景、场景目录、重播、声音、全屏、收起；控制台内不出现“试运行”或“定位”。
- 控制器内容框与 selection chrome 共享规范坐标和 viewport transform。
- pointermove 实时更新预览，pointerup 只提交一次 history。
- 属性面板折叠值、画布预览、当前位置试运行和真实 Player 读取同一 V9 配置。
- global controller 在不同 surface 上保持同一稳定 authoring address；Spatial 中它属于 viewport 层，不随 world 缩放。

本任务实现共享布局/一致性纯合同与面板命令；Workspace/Phaser 接线交给 T10/T05，Player 会话交给 T09。

## 5. 声音与媒体

- 元素/媒体面板恢复声音导入入口和声音库管理。
- 支持试听、重命名、删除、全局音量/静音/声道/ducking。
- 删除被互动动作引用的声音前给出引用清单并阻止或执行明确修复。
- 图片/视频/声音共用 asset 真相；Flow/Spatial 不复制二进制资产。
- 不保留“声音暂不能从此面板管理”作为完成状态。

## 6. 最小验证

```powershell
npx vitest run tests/unit/globalLayerUi.test.tsx tests/unit/nodesTabDocumentControl.test.tsx
npx vitest run tests/unit/propertiesTabDocumentControl.test.tsx tests/unit/mediaTab.test.tsx
npx vitest run tests/unit/teacherControllerLayout.test.ts tests/unit/teacherControllerConsistency.test.ts
npx vitest run tests/unit/assetTransactions.test.ts tests/unit/batchMediaAndInsertion.test.ts
git diff --check -- src/renderer/ui/NodesTab.tsx src/renderer/ui/PropertiesTab.tsx src/renderer/ui/MediaTab.tsx src/shared/teacherControllerLayout.ts src/shared/teacherControllerConsistency.ts src/renderer/course/globalLayerCommands.ts src/renderer/course/effectiveLayerCommands.ts
```

只运行与实际修改对应的组。禁止 typecheck、build、全量 test/E2E/visual。

## 7. 验收

- 全局层入口不会被统一有效图层替代或隐藏。
- 长名称不竖排，图层锁定/隐藏/排序有真实命令结果。
- 控制器不存在选择框错位、反向 resize 或只在试运行折叠的模型原因。
- 声音管理功能不再是禁用占位。
- 所有热点/Player 接线请求完整交付。

## 8. 交付记录

尚未执行。
