# T02 — 统一动作路由与稳定 Selection 合同

> Wave：1，可与 T03/T04 并行
> 依赖：T01 基线矩阵
> 目标：给键盘、右键、画布、图层和属性提供同一批窄动作语义

## 1. 问题

当前 Delete 只覆盖部分 Slide 条件，右键没有有效动作路由，多选、Flow、Spatial、global/surface owner 和文字编辑焦点各走不同分支。任务只建立最小共享合同，不建立泛化 command bus 或插件系统。

## 2. 允许修改

优先新增并独占：

- `src/renderer/course/editorActionTypes.ts`
- `src/renderer/course/editorActionRouting.ts`
- `tests/unit/editorActionRouting.test.ts`

如当前仓库已有等价窄模块，可在不扩大职责的前提下修改它及对应单测，并在 HANDOFF 解释。以下只读：各 surface command、App/store、所有 UI 热点。

## 3. 必须产出

### 3.1 稳定 Selection Snapshot

至少表达：

- session / project revision；
- active location 与 surface kind；
- authoring owner：global、surface、scene/location、state、flow block、spatial world/camera/path/relation；
- 一个或多个稳定 `authoringAddress`；
- 打开菜单时的 selection 快照；
- 当前焦点是否是 input、textarea、contenteditable、文字/公式编辑会话或 Runtime/Component 作者会话。

### 3.2 动作集合

最低动作 ID：

- select-all、copy、cut、paste、duplicate；
- delete、rename；
- move-forward、move-backward、bring-front、send-back；
- show/hide、lock/unlock；
- edit-text、edit-formula、replace-media；
- insert-before/after、indent/outdent；
- focus/fit/reset-view。

动作可用性返回 `enabled` 与明确 `reason`；不能显示会静默失败的动作。

### 3.3 路由边界

- 路由只把动作交给注入的 surface/global adapter，不直接读写 store。
- Delete/Backspace 在可编辑文本焦点内不删除元素。
- 多选动作一次调用一个 adapter，后续 surface command 负责一个 history step。
- 右键打开后使用稳定快照；hover 或 React 重渲染不能换目标。
- `Escape` 只关闭菜单并恢复焦点；`Shift+F10` / Menu 键与鼠标右键共享入口语义。

## 4. 不做

- 不实现具体 Slide/Flow/Spatial 删除和复制。
- 不修改 `App.tsx`、store、Workspace、ScenePanel、RightSidebar、NodesTab 或全局 CSS。
- 不新增快捷键库、事件总线、插件层或持久化字段。
- 不接入可见 AI。

## 5. 最小验证

```powershell
npx vitest run tests/unit/editorActionRouting.test.ts tests/unit/authoringAddress.test.ts
git diff --check -- src/renderer/course/editorActionTypes.ts src/renderer/course/editorActionRouting.ts tests/unit/editorActionRouting.test.ts
```

若第二个现有测试与实现无关，可只跑新测试并说明。不得扩大到全量 Vitest/typecheck/build/E2E。

## 6. 验收

- 同一 snapshot 对鼠标、键盘和菜单产生相同动作可用性。
- 锁定、跨 owner、多选和编辑焦点都有明确结果。
- 路由不持有项目真相，不绕过 surface command/history。
- 对热点接线需求提交 `INTEGRATION_REQUEST`。

## 7. 交付记录

尚未执行。

