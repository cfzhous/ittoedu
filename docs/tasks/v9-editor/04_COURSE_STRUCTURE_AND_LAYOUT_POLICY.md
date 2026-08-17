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

尚未执行。

