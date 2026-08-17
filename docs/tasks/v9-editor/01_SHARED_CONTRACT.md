# 并发执行共享合同

> 适用：`docs/tasks/v9-editor/` 下所有任务
> 目的：并行时保护产品决策、文件所有权、脏工作树和验证预算

## 1. 产品不变量

1. Course Project V9 是唯一生产工程真相；V8 只作显式导入、表面基线和 Git 供体。
2. 不新增持久化 `projectMode`。Pure/Mixed 从 locations 引用的 surfaces 推导。
3. 全局层保留为可见作者能力。四态左栏固定提供“共享内容 → 全局层（全课）”；它不属于页面树、不参与模式推导。
4. Flow 页面是父节点，可导航标题是子节点；普通 block 不与页面同级。运行态目录采用贴边三角按钮。
5. Spatial 是真实无限画布，world 与 viewport 坐标分离。
6. 轻量只指默认信息密度；右键、Delete、剪贴板、文字就地编辑、图层排序/锁定/隐藏、声音、媒体和教师控制台不能被删除或长期禁用。
7. 当前不新增可见 AI、网络、Provider、聊天、Clipboard 或 Patch 调用点；Focusky 级能力是远期开放项。
8. 不启动 V10，不删除 `globalLayerItems` / `surfaceLayerItems`，不建立第二 App/Shell/Store。

## 2. 工作树与 Git

- 开始时运行 `git status --short`，把已有修改视为用户或其他任务所有。
- 不使用 `git reset --hard`、批量 checkout、递归删除或自动清理。
- 不覆盖不在本任务授权列表中的修改；遇到重叠立即停止并报告。
- 可读取 Git 历史和 donor diff，但不得整串 cherry-pick 未审查提交。
- 除非协调者明确要求，不创建提交、不 push、不开 PR。

## 3. 文件所有权

- “独占”表示同一波次内只有该任务可修改；其他任务只读。
- “允许新增”仅限文档列出的目录和命名范围，不能借新文件建立通用框架。
- `App.tsx`、`editorStore.ts`、`Workspace.tsx`、`ScenePanel.tsx`、`RightSidebar.tsx`、`TopToolbar.tsx`、`globals.css` 由 `T10` 独占。
- 如需跨 lane 接线，提交下面格式，不修改热点：

```md
INTEGRATION_REQUEST
- requester: Txx
- target owner: T10 或其他任务
- target file:
- exported symbol / callback:
- required behavior:
- focused test that proves the lane side:
- risk if omitted:
```

## 4. 实施纪律

- 先确认当前源码和测试，不按文件名或历史计划猜实现。
- 选择最短充分路径；不新增框架、插件系统、服务层或泛化命令总线。
- 一次用户动作只产生一次 command/history/revision。
- selection 与异步提交使用稳定 session/location/state/scope/item 地址；临时 `hitId` 不能持久化。
- 锁定项可选择、可查看；写操作必须统一拒绝，解锁是例外。
- 失败必须返回可理解原因，不得吞掉命令结果。
- 不修改生成目录 `dist-*`、`output/`、`test-results/` 或示例生成 HTML，除非任务明确授权。

## 5. 最小验证

中间任务只能运行：

- 文档列出的 1–4 个最相关 Vitest 文件；
- 必要的单个纯脚本 `--check`；
- `git diff --check -- <owned files>`；
- 不需重新构建的最小人工检查。

中间任务禁止全量 typecheck、全量 Vitest、build、Electron E2E、Playwright 全目录、preservation visual 和截图重捕。只有 `T12` 可以执行全量验证。

测试若因其他 lane 未接线失败，记录为 `INTEGRATION_REQUEST`；不得越权修热点或放宽断言。

## 6. 停止条件

出现以下任一情况立即停止实施并报告：

- 目标需要 Schema V10、重大依赖、架构重写或删除 V8 能力；
- 当前文件存在无法安全合并的用户/其他 lane 改动；
- 任务需要修改未授权热点文件才能证明基本合同；
- UI 图、根总纲、Schema 与源码对同一产品语义给出无法消解的冲突；
- 需要付费工具、外部凭据、发布或破坏性操作。

## 7. HANDOFF 格式

```md
HANDOFF
- task:
- baseline SHA / worktree:
- outcome:
- files changed:
- focused validation commands:
- results:
- INTEGRATION_REQUESTS:
- visual/manual evidence:
- remaining risks:
- status: engineering candidate | blocked
```

中间任务不得使用 `art candidate` 或 `accepted`。`accepted` 只能由教师明确给出。

