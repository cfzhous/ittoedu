# Q8 · T6 图层树：默认真场景不再断言控制器行

> 状态：**可领取**  
> 症状：Q1 之后默认真场景图层树不渲染教师控制器，部分 e2e 仍期望 count=1  
> 车道：Q 接线  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、本卡。禁止重做 Q1。

## 一句话

只改过时 e2e 断言。点过「全局」的用例 **仍然** `teacherControllerLayerRows` = 1。未点全局的默认图层 tab：控制器 0，`.node-item` 总数减 1。

## Git

1. 不要在 `/workspace` 或别人的 worktree 上改。
2. `git fetch origin cursor/editor-q-stability-489b`
3. 从 **`origin/cursor/editor-q-stability-489b`** 建 `cursor/q8-e2e-controller-list-489b`
4. commit + push。**禁止开 PR。**
5. 写 `docs/tasks/editor-1.0/Q8_HANDOFF.md`

## 允许修改

```text
tests/e2e/editor.spec.ts
tests/e2e/componentCatalogMatrix.spec.ts
docs/tasks/editor-1.0/Q8_HANDOFF.md
```

只改下列断言与紧邻注释。禁止重构 describe、禁止改选择器辅助函数。

## 禁止

- 任何 `src/**`
- 其它测试文件、Playwright 配置、`package.json`
- **禁止** `npm run test:e2e` / `npx playwright`（Cloud Linux 没有 T6 桌面）

最低验证只有：

```bash
git diff --check
```

HANDOFF 写明：桌面 T6 应再跑改过的两个 spec。

## 产品语义（只读，不要改 NodesTab）

`NodesTab`：`editingScope !== 'global'` 时过滤 `isTeacherController`。  
判定某断言该不该改：看它 **前面 30 行内** 是否 `getByTestId('global-layer-entry').click()`。有 click → 保持 1；没有 → 改为 0，且若同时数了 `.node-item` 则减 1。

`teacherControllerLayerRows` 定义在 `editor.spec.ts` 约 173，不要改这个 helper。

## 逐步算法 — `editor.spec.ts`

用 `rg -n "teacherControllerLayerRows"` 列出全部调用，不要盲信行号。

### 保持 count = 1（已 click 全局，不要改数字）

| 约行 | 前文 |
|---|---|
| 1797–1800 | `global-layer-entry` click 后图层 tab；`.node-item` 保持 **4**；控制器 **1** |
| 1879–1882 | 同上；`.node-item` 保持 **2**；控制器 **1** |

这两处若被改成 0 = 本卡失败。

### 改为默认真场景（没有 click 全局）

1. 约 2985–2989：新建后打开工程 → 切「图层」tab，**没有** `global-layer-entry`。
   - `.node-item`：`5` → `4`
   - `teacherControllerLayerRows`：`1` → `0`
2. 约 3214–3216：恢复自动保存之后，图层 tab，**没有** click 全局。
   - `.node-item`：`2` → `1`
   - `teacherControllerLayerRows`：`1` → `0`

不要改这两段里其它断言（公式内容、恢复对话框等）。

## 逐步算法 — `componentCatalogMatrix.spec.ts`

约 608–620。当前注释写「V9 有效图层含默认教师控制器」。改为：默认真场景图层树只列场景包行；教师控制器只在全局范围出现。

- `layerRows`：`expectedPackageCount + 1` → `expectedPackageCount`
- `teacherControllerRow`：`toHaveCount(1)` → `toHaveCount(0)`
- `componentLayerRows` 的 `expectedPackageCount` **不要改**
- 后面的删除 / 撤销 / 重做宿主计数 **不要改**

## 停手

- 不要改 `NodesTab.tsx` 或 Q1 行为。
- 不要把「已进全局」的两处 `toHaveCount(1)` 改成 0。
- 不要跑 e2e。若 `git diff --check` 因无关脏文件失败，不要 add 那些文件。

完成后 push `cursor/q8-e2e-controller-list-489b`。**禁止开 PR。**
