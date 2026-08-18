# R3 — Global/Surface、媒体声音、教师控制器与 V9 原子切换

> 状态：`engineering candidate for this stage`；默认工程真相已是 Course Project V9；R4-A / R5-A 已解锁
> 高风险 Gate：R3-G 必须获得教师明确确认，R3-CUT 才可执行
> 本阶段选择：补齐全局控制器图层能力，不靠隐藏规避

## 1. 阶段可见结果

同一 V8 UI 的 V9 candidate 完整支持 global/surface/scene/state owner、MediaTab 与声音库、教师控制器作者/运行几何。全局控制器在统一有效图层中以 global 来源可见，支持 owner 内排序与逐 location 显隐；scene-only 列表不伪装场景行。

R3-G 通过后，R3-CUT 才把默认工程真相一次性切换为 V9，并把 V8 降为显式导入来源。

## 2. 任务与依赖

| ID | 任务 | 独占写入 | 可并行 | 依赖 |
|---|---|---|---|---|
| R3-A | global/surface owner、可见性与排序命令 | global/effective layer commands 与测试 | R3-B/C/D | R2-Z |
| R3-B | MediaTab 数据、资源与声音命令 | V9 media/audio command、asset adapter 与测试 | R3-A/C/D | R2-Z |
| R3-C | 控制器统一几何与运行会话 | teacher controller shared/player/authoring 窄模块 | R3-A/B/D | R2-Z |
| R3-D | 统一有效图层与 authoring scope 投影 | effective layer view/scope adapter 与测试 | R3-A/B/C | R2-Z |
| R3-Z | 中央接线与切换前候选 | App/store/Workspace/Nodes/Properties/MediaTab 等热点 | 否 | R3-A/B/C/D |
| R3-G | 高风险真实 UI Gate 与教师决定 | 只写 Gate 记录 | 否 | R3-Z |
| R3-CUT | 原子切换默认 V9 backend | App/store/persistence/唯一入口热点 | 否 | R3-G 明确确认 |

## 3. R3-A — Ownership、可见性与排序

### 3.1 独占路径

- `src/renderer/course/globalLayerCommands.ts`
- `src/renderer/course/effectiveLayerCommands.ts`
- 必要的 owner/visibility 纯 helper
- 对应最多两个测试

### 3.2 必须闭合

- global、surface、scene、state 四种 owner 使用稳定地址；
- 统一有效图层显示来源，排序只在合法 owner 内进行；
- lock/hide/duplicate/delete/reorder 的影响范围清楚且 history 原子；
- global 项支持 `all/include/exclude + locationIds`；
- 当前 location 显隐编辑不改变 active location 或课程顺序；
- 控制器是 global item，不可搬成 scene item；
- 不返回“暂不能调整顺序”作为完成态。

### 3.3 最轻量验证

```powershell
npx vitest run tests/unit/effectiveLayerCommands.test.ts tests/unit/globalLayerVisibility.test.ts
git diff --check -- src/renderer/course/globalLayerCommands.ts src/renderer/course/effectiveLayerCommands.ts tests/unit/effectiveLayerCommands.test.ts tests/unit/globalLayerVisibility.test.ts
```

## 4. R3-B — 媒体、资源与声音

### 4.1 独占路径

- `src/renderer/course/v9MediaAudioCommands.ts`
- 新建/迁入的 V9 asset adapter
- `src/renderer/project/assetManager.ts`、`mediaBatch.ts` 的 V9 窄扩展
- `src/player/AudioManager.ts` 仅为 V9 引用兼容所需部分
- 对应最多两个测试

不得修改 `MediaTab.tsx`，由 R3-Z 接线。

### 4.2 必须闭合

- MediaTab 所需图片、视频、声音库数据可由 V9 backend 完整读写；
- 图片/视频导入、批量导入、加入画布、替换、裁剪/适配、删除保护；
- 声音导入、试听、改名、删除保护、音量/静音/声道/ducking 与互动引用；
- asset sidecar、稳定 ID、引用清理和发布资源清单一致；
- 不用元素页底部一行“导入声音”替代完整 MediaTab。

### 4.3 最轻量验证

```powershell
npx vitest run tests/unit/v9MediaAudioCommands.test.ts tests/unit/audioManager.test.ts
git diff --check -- src/renderer/project src/renderer/course src/player/AudioManager.ts tests/unit/v9MediaAudioCommands.test.ts tests/unit/audioManager.test.ts
```

测试必须注明若尚未接真实 MediaTab，只证明 command/adapter；UI 由 R3-Z 证明。

## 5. R3-C — 教师控制器统一几何与运行会话

### 5.1 独占路径

- `src/shared/teacherControllerLayout.ts`、`teacherControllerConsistency.ts`
- `src/player/teacherControllerDom.ts`、`teacherControllerRuntimeSession.ts`
- `src/player/renderTeacherController.ts`
- 新的作者态 controller bridge，不修改 Workspace/Properties/Nodes
- 对应最多两个测试

### 5.2 必须闭合

- 作者内容、选择框、八向手柄、属性预览、试运行和 Published Player 共用规范 geometry；
- pointer delta 相对真实 stage/viewport 换算；
- pointermove 实时预览、pointerup 单次 history；
- 慢速、快速、斜向拖动跟手，不出现选框分离或快速漂移；
- 八方向均可 resize，方向与手柄一致；
- 动作保留上一项、下一项、目录、重播、声音、全屏、收起；
- 编辑态 inert，试运行/Player 只改会话；折叠状态和主题一致。

### 5.3 最轻量验证

```powershell
npx vitest run tests/unit/teacherControllerLayout.test.ts tests/unit/teacherControllerRuntimeSession.test.ts
git diff --check -- src/shared/teacherControllerLayout.ts src/shared/teacherControllerConsistency.ts src/player/teacherControllerDom.ts src/player/teacherControllerRuntimeSession.ts src/player/renderTeacherController.ts tests/unit/teacherControllerLayout.test.ts tests/unit/teacherControllerRuntimeSession.test.ts
```

## 6. R3-D — 统一图层与作者范围投影

### 6.1 独占路径

- `src/renderer/course/effectiveLayerProjection.ts`
- `src/renderer/authoring/courseAuthoringScope.ts`
- 与上述 adapter 直接对应的测试

不得修改 NodesTab、ScenePanel、Workspace、PropertiesTab。

### 6.2 必须闭合

- 有效图层合并 global/surface/scene/state，行上显示来源和影响范围；
- scene-only 视图不把 global controller 伪装成 scene row；
- 选择全局层真实切换到 global authoring scope，Flow/Spatial 后续可复用；
- 画布、图层、属性指向同一 owner/item；
- owner-aware reorder/lock/hide/duplicate/delete 的 UI 输入合同完整；
- 普通 Flow block 不被通用图层 adapter 吞入。

### 6.3 最轻量验证

```powershell
npx vitest run tests/unit/effectiveLayerProjection.test.ts
git diff --check -- src/renderer/course/effectiveLayerProjection.ts src/renderer/authoring/courseAuthoringScope.ts tests/unit/effectiveLayerProjection.test.ts
```

## 7. R3-Z — 中央接线与切换前候选

### 7.1 独占热点

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `ScenePanel.tsx`、`NodesTab.tsx`、`PropertiesTab.tsx`、`MediaTab.tsx`、`RightSidebar.tsx`
- `src/renderer/styles/globals.css`（必要时）

### 7.2 接线步骤

1. 逐项关闭 R3-A/B/C/D blocking 请求；不能以 `returned/known limitation/documented` 关闭。
2. 四种 owner 进入同一 selection/action/history；图层行显示来源和有效范围。
3. 全局控制器可从统一有效图层进入 global scope，支持排序与当前 location 显隐。
4. MediaTab 在 V9 candidate 下恢复完整图片/视频/声音工作流。
5. Workspace 与 Properties 使用 R3-C 统一控制器几何；真实 Player 使用同一布局。
6. candidate 保存重开和 Player 使用 V9；默认产品此时仍保持 V8。

### 7.3 最轻量验证

```powershell
npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx tests/unit/v9MediaTabAdapter.test.tsx
git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui src/renderer/styles/globals.css
```

随后做一个串联 UI 冒烟：在三个 location 间设置 global controller 显隐 → 调整 owner 内顺序 → 导入图片与声音 → 八向 resize/快速拖动控制器 → 保存重开 → 试运行。只记录这一条纵切，不跑全套 E2E。

## 8. R3-G — 原子切换前教师 Gate

协调者以 V9 candidate 对照 R0 能力账本，至少实操根计划 §0.4 六点中的 Slide/global/media/controller 部分：

- 连续新增错开；双击和选区级格式；动画可达；
- 图片入画布可选中改属性；声音管理可用；
- global/surface owner 顺序与逐 location 显隐；
- 控制器选框、八向、慢/快/斜向拖动和 Player；
- scene/state、图层、右键、Delete、剪贴板、Undo/Redo、保存重开。

这是一次高风险验收走查，不运行全量自动化或三视口视觉套件。任何 `未执行/受阻/以后补` 的 V8 保护项都阻止切换。

向教师提交差异摘要和短录像，必须得到明确“允许将默认工程真相切换为 V9”。否则保持 V8 默认并回派窄修复。

## 9. R3-CUT — 原子切换默认 V9

### 9.1 独占热点

- `src/renderer/main.tsx` 及唯一产品入口
- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/project/**` 中默认 open/save/recovery/recent 的必要文件
- 必要 main/preload IPC

### 9.2 执行步骤

1. 记录可回退 checkpoint 与当前 V8 默认行为。
2. 一次性把新建、打开、保存、另存、恢复、试运行、Player producer 默认真相切为 V9。
3. 删除内部 backend 对照的用户可见可能性；保留测试注入但不显示“旧版/新版”菜单。
4. V8 只进入显式导入；普通打开 V8 文件给出迁移引导，不静默转换。
5. 任何会话只写 V9，不保留双写 shadow state。

### 9.3 最轻量验证

```powershell
npx vitest run tests/unit/editorStore.test.ts tests/unit/projectPersistence.test.ts
git diff --check -- src/renderer/main.tsx src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/project src/main src/preload
```

再做一次窄 UI 冒烟：新建 V9 Slide → 编辑文字 → 保存 → 关闭 → 重开 → Player。确认 UI 仍是成熟 V8 表面。

## 10. R3 完成条件

- 教师已明确批准切换；
- V9 是唯一默认写入真相，V8 只有显式导入；
- 无用户可见双 UI/backend 路由；
- R0 V8 账本没有被隐藏、禁用或 no-op；
- global/media/audio/controller 高风险纵切已实操；
- 未运行全量 typecheck/build/E2E/visual。

完成后 R4 与 R5 的设计任务可以同时 `READY`。
