# T04 — 右键菜单与紧凑有效图层 UI 原语

> Wave：1，可与 T02/T03 并行
> 性质：无 store 的受控展示组件

## 1. 目标

提供可复用但不泛化过度的 UI 原语：一个支持鼠标与键盘的编辑右键菜单，以及一个不会把名称挤成竖排的紧凑有效图层列表。具体命令和 App 接线留给 surface lane 与 T10。

## 2. 独占文件

允许在新目录中新增：

- `src/renderer/ui/editor-actions/EditorContextMenu.tsx`
- `src/renderer/ui/editor-actions/EffectiveLayerList.tsx`
- `src/renderer/ui/editor-actions/editorActions.css`
- `tests/unit/editorContextMenu.test.tsx`
- `tests/unit/effectiveLayerList.test.tsx`

若仓库已有完全等价原语，优先扩展现有窄组件，但不得修改 NodesTab/PropertiesTab/RightSidebar/globals.css。

## 3. 右键菜单合同

- 输入为 T02 的稳定 snapshot、动作列表和 `onInvoke(actionId, snapshot)`。
- 未选中目标上右键时由调用方先更新 selection；组件不自行读画布。
- 禁用项显示原因；不可用动作不能点击或用键盘触发。
- 支持鼠标右键、`Shift+F10`、Menu 键、方向键、Enter/Space、Escape。
- 菜单自动限制在 viewport 内，关闭后恢复触发元素焦点。
- 多选集合内右键保持多选；菜单显示打开瞬间的快照。

## 4. 有效图层合同

每行保持单行紧凑布局，至少包含：

- 拖动柄；
- 来源标签：全课 / 当前内容 / 本页 / 当前状态 / Flow / 世界 / 镜头等；
- 可截断名称与完整 title/aria-label；
- 眼睛、锁和更多菜单；
- selected、locked、hidden、disabled 状态。

列表只发出受控事件：select、rename、reorder、toggleVisibility、toggleLock、openMenu。跨 owner 拖拽由调用方拒绝并说明，组件不伪造排序。

## 5. 不做

- 不读写 store/project/history。
- 不实现具体删除、锁定、排序或复制命令。
- 不修改现有全局 CSS、右栏、画布或 ScenePanel。
- 不新增 UI 库或依赖。

## 6. 最小验证

```powershell
npx vitest run tests/unit/editorContextMenu.test.tsx tests/unit/effectiveLayerList.test.tsx
git diff --check -- src/renderer/ui/editor-actions tests/unit/editorContextMenu.test.tsx tests/unit/effectiveLayerList.test.tsx
```

禁止全量测试、typecheck、build、E2E 和截图基线更新。

## 7. 验收

- 长名称、长列表和 1366 宽度下不会形成竖排文字。
- 菜单与列表均可键盘操作并有清晰焦点。
- 组件不持有业务真相，能被 Slide/Flow/Spatial/global 共用。
- 所有热点接线需求以 `INTEGRATION_REQUEST` 交给 T10。

## 8. 交付记录

尚未执行。

