# T03 — 三类页面创建、课程结构与自适应布局策略

> Wave：1，可与 T02/T04 并行
> 依赖：T01
> 生产 UI：只读

## 1. 目标

建立不依赖 React/Store 的纯模型：教师可直接新建 Slide、Flow、Spatial 空白工程或页面；Pure/Mixed 由真实 locations/surfaces 推导；左栏能生成正确的页面—子位置树；全局层是固定正交作者入口。

## 2. 独占文件

- `src/renderer/course/courseEditorLayout.ts`
- `src/renderer/course/courseStudioModel.ts`
- 允许新增 `src/renderer/course/courseLocationCommands.ts`
- `tests/unit/courseEditorLayout.test.ts`
- `tests/unit/courseStudioModel.test.ts`
- 允许新增 `tests/unit/courseLocationCommands.test.ts`

开始前若这些文件含无法安全合并的用户修改，停止并报告，不覆盖。

## 3. 必须实现

### 3.1 纯函数推导

- 只统计被 location 引用的 surface。
- `{slide}`、`{flow}`、`{spatial-2d}` 分别得到纯态；两种或三种得到 Mixed。
- 空 locations、缺失 surface、未知类型返回安全不可用结果，不偷偷降级。
- 不读取/写入任何 `projectMode`。
- 全局层和 surface shared 内容不参与类型集合。

### 3.2 左栏 View Model

输出分为两个正交区：

1. 固定 `shared-content` 分区，含 `global-layer`（标签“全局层”、范围“全课”）；
2. 课程页面树。

页面树规则：

- Slide：surface/教学段落下是 scene/location 缩略项；纯 Slide 可简化为紧凑缩略列表。
- Flow：页面是父节点，只有标题/章节锚点是子节点；普通段落、图片、视频、公式不升级为同级页面。
- Spatial：页面是父节点，camera frame 是“本页镜头”子节点；坐标和关系不进入导航。
- Mixed：三类页面按课程顺序共处一棵树，子节点只在自己的父节点内排序。

### 3.3 原子创建/删除/排序

- 创建空白 Slide：surface + 初始 scene + location。
- 创建空白 Flow：surface + 初始标题/段落 + 可用 location。
- 创建空白 Spatial：surface + home camera + location。
- 新增一次完成创建、插入、激活所需结果，供 store 包装为一个 history step。
- 不可删除最后一个 location；删除后重新推导 Pure/Mixed。
- 选择 location 只返回 session 变化，不修改 project revision/history。

## 4. 不做

- 不修改 ScenePanel、App、store 或 CSS。
- 不实现 UI 弹窗、拖拽 DOM、转换预览或导入器。
- 不创建 V10 或四模式字段。
- 不把全局层生成为伪 location。

## 5. 最小验证

```powershell
npx vitest run tests/unit/courseEditorLayout.test.ts tests/unit/courseStudioModel.test.ts tests/unit/courseLocationCommands.test.ts
git diff --check -- src/renderer/course/courseEditorLayout.ts src/renderer/course/courseStudioModel.ts src/renderer/course/courseLocationCommands.ts tests/unit/courseEditorLayout.test.ts tests/unit/courseStudioModel.test.ts tests/unit/courseLocationCommands.test.ts
```

不存在的新测试/文件可从命令中移除。禁止 typecheck、全量测试、build 和 E2E。

## 6. 验收

- 七种 surface 组合推导正确并可保存重算。
- 三类空白创建不依赖外部导入。
- Flow 页面/标题和 Spatial 页面/镜头层级不扁平。
- 全局层固定可发现且不污染课程顺序。
- 向 T10 提交最小 store/UI 接线合同。

## 7. 交付记录

HANDOFF
- task: T03
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 纯函数从 location 引用的 surface 推导 Pure/Mixed；空 locations / 缺失 surface / 未知类型返回 `unavailable`，不降级、不读写 `projectMode`。左栏 view model 固定「共享内容 → 全局层（全课）」并与课程页面树正交。三类空白工程与新增/删除/排序页面命令复用 `addCourseSurface` 等现有模型，供 store 包一次 history。全局层不是 location。
- files changed:
  - `src/renderer/course/courseEditorLayout.ts`（新建）
  - `src/renderer/course/courseStudioModel.ts`（扩展 blank 工厂、Flow 初始段落、`reorderCoursePageGroups`）
  - `src/renderer/course/courseLocationCommands.ts`（新建窄包装）
  - `tests/unit/courseEditorLayout.test.ts`（新建）
  - `tests/unit/courseStudioModel.test.ts`（追加 blank 工厂用例）
  - `tests/unit/courseLocationCommands.test.ts`（新建）
- focused validation commands:
  - `npx vitest run tests/unit/courseEditorLayout.test.ts tests/unit/courseStudioModel.test.ts tests/unit/courseLocationCommands.test.ts`
  - `git diff --check -- src/renderer/course/courseEditorLayout.ts src/renderer/course/courseStudioModel.ts src/renderer/course/courseLocationCommands.ts tests/unit/courseEditorLayout.test.ts tests/unit/courseStudioModel.test.ts tests/unit/courseLocationCommands.test.ts`
- results: 3 files / 20 tests passed；`git diff --check` 无输出。
- INTEGRATION_REQUESTS:
```md
INTEGRATION_REQUEST
- requester: T03
- target owner: T10
- target file: src/renderer/store/editorStore.ts
- exported symbol / callback: createBlankSlideCourse / createBlankFlowCourse / createBlankSpatialCourse；addCoursePage；deleteCourseLocation；reorderCoursePages；selectCourseLocation；selectGlobalLayerScope
- required behavior: 新建菜单分别调用三个 blank command，得到全新 V9 文档（revision 0），不要先建 Slide 再删改。`addCourseSurface` 现仅接受 flow|spatial-2d，应改为走 addCoursePage(project, 'slide'|'flow'|'spatial-2d')，一次 history，激活返回的 activatedLocationId，并用返回的 layout 适配壳层。删除走 deleteCourseLocation（最后一个 location 会抛「不可删除最后一个课程位置」）。页面拖拽走 reorderCoursePages。选择 location / 全局层只改 session：selectCourseLocation / selectGlobalLayerScope 不 commit history、不升 revision、不 dirty；选全局层不得改 active location。
- focused test that proves the lane side: tests/unit/courseLocationCommands.test.ts
- risk if omitted: 教师仍只能新建纯 Slide，或继续把选择写进 history；纯态无法直接加另一类页面。

INTEGRATION_REQUEST
- requester: T03
- target owner: T10
- target file: src/renderer/ui/ScenePanel.tsx
- exported symbol / callback: buildCourseStructureViewModel；deriveCourseEditorLayout
- required behavior: 四态左栏先渲染 view.sharedContent（标签「共享内容」→「全局层」范围「全课」），再渲染 view.pageTree。纯 Slide 用 compact 缩略列表；Flow 页面为父、heading/section 为子；Spatial 页面为父、「本页镜头」下挂 camera；Mixed 按 locations 顺序共处一棵树。禁止把 heading/camera 当顶层页面，禁止把全局层做成伪 location，禁止 hideSharedLayerEntries，禁止按纯态隐藏三类「新增内容」。layout === 'unavailable' 时显示安全不可用，不要偷偷切到某一编辑器。
- focused test that proves the lane side: tests/unit/courseEditorLayout.test.ts
- risk if omitted: 左栏继续扁平 locations，或再次藏掉全局层/跨类型创建。
```
- visual/manual evidence: 无 UI 改动；未跑 E2E / 视觉门禁。
- remaining risks: store 仍只新建 Slide、addCourseSurface 不含 slide；选择 location 的现有 applyCourseCommand 路径需 T10 改成无 history。Flow 的 `addFlowBlock` 仍会给普通段落写 location，view model 已过滤，但课程顺序数组里仍有这些非导航 location。
- status: engineering candidate

