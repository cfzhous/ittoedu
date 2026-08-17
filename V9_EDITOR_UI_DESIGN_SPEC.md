# V9 编辑器四态 UI 与切换规范

> 状态：Slide、Flow、Spatial、Mixed 与切换逻辑稿已完成；四张编辑态参考图已按最新结论恢复“共享内容 → 全局层（全课）”固定入口。教师控制台以本文第 3 节的统一动作集为准。
>
> 本文是 UI 与交互规范，不新增 Course Project 字段。若与 `UIUX_ASSESSMENT_AND_FOUR_MODE_DESIGN.md` 中“显式模式字段、手工模式开关”等旧设想冲突，以本文、`COURSEWARE_DEVELOPMENT_PLAN.md` 和当前 V9 Schema 为准。

## 1. 视觉基准

| 状态 | 参考图 | 核心目的 |
| --- | --- | --- |
| 纯幻灯片 | [`V9_EDITOR_UI_SLIDE_REFERENCE.png`](V9_EDITOR_UI_SLIDE_REFERENCE.png) | 保留 V8 缩略图、画布、场景状态和教师控制台 |
| 纯流式文本 | [`V9_EDITOR_UI_FLOW_REFERENCE.png`](V9_EDITOR_UI_FLOW_REFERENCE.png) | 页面是父节点，目录标题是子节点；运行态目录可贴边收放 |
| 纯无限画布 | [`V9_EDITOR_UI_SPATIAL_REFERENCE.png`](V9_EDITOR_UI_SPATIAL_REFERENCE.png) | 页面、镜头、世界图层分层；世界坐标与屏幕 UI 分离 |
| 混合态 | [`V9_EDITOR_UI_MIXED_REFERENCE.png`](V9_EDITOR_UI_MIXED_REFERENCE.png) | 一棵稳定课程结构树承载三类页面，切页时壳层不跳动 |
| 切换逻辑 | [`V9_EDITOR_UI_SWITCHING_LOGIC.png`](V9_EDITOR_UI_SWITCHING_LOGIC.png) | 明确主动入口、数据推导、自适应切换和保护规则 |

这些图片是布局、层级、密度和交互位置的实现基准，不是像素素材；真实 UI 必须使用现有组件、图标库和设计 token 实现。

## 2. 不变的产品原则

1. Course Project V9 是唯一工程真相；V8 只提供已经验证的编辑器表面和交互基线。
2. 不新增、读取或写回 `projectMode`、`courseMode`、`editorMode` 或“四模式”字段。
3. “主动切换”是教师新建、添加、选择、删除或创建转换副本；“自适应切换”是编辑器根据实际 `locations / surfaces` 自动选择壳层和当前工作区。
4. 纯 Slide、纯 Flow、纯 Spatial 与 Mixed 是推导结果，不是需要保存的业务状态。
5. 轻量不等于删功能。低频功能可以渐进披露，但选择、拖缩、就地编辑、右键、Delete、图层排序/锁定/隐藏、声音、教师控制台、试运行和发布都必须可达。
6. `globalLayerItems`、`surfaceLayerItems` 和页面/世界内容继续存在。全局层是必要的课程级作者范围，四态左栏均保留可发现的“共享内容 → 全局层（全课）”入口；当前页面的“有效图层”同时显示合成结果和真实来源。
7. 全局层与页面形态正交：选择全局层只切换作者范围，不创建 location、不改变 active location、不参与纯 Slide / Flow / Spatial / Mixed 推导，也不把全局层伪装成课程顺序中的一页。

## 3. 共同壳层

- 顶栏沿用 V8：新建、打开、保存、撤销、重做、试运行、导出、工程标题和保存状态。
- 左栏宽度和折叠按钮稳定；切换页面类型时不卸载整块壳层、不改变主列宽度。
- 左栏页面树上方固定显示“共享内容”分区；其中“全局层”是课程级作者入口，与 Slide 缩略图、Flow 页面/标题、Spatial 页面/镜头和 Mixed 课程顺序之间有明确分隔。
- 中央工作区只由当前 active location 对应的 surface 决定。
- 右栏保持稳定页签：元素、图层、属性；专业界面继续提供互动和开发入口。页签壳不变，内容按当前 surface 适配。
- 教师控制台统一使用：上一场景、下一场景、场景目录、重播、声音・开、全屏、收。控制台内不得出现“试运行”。
- 底部状态栏始终显示当前页面、当前子位置/状态、选区、缩放和保存状态。
- 1366×768 下中央有效编辑区不得被重复导航或长表单挤压；所有侧栏列表使用紧凑单行、截断、滚动和可折叠分组。

## 4. 左侧信息架构

### 4.1 分组规则

UI 将被 location 引用的 surface 作为强父节点，将 surface 内部可导航位置作为缩进子节点：

| Surface | 父节点 | 子节点 |
| --- | --- | --- |
| `slide` | 一组幻灯片/教学段落 | Scene 缩略图或场景行 |
| `flow` | 一篇流式页面 | `本页目录` 下的标题/章节锚点；普通段落和媒体不升级为课程级同层节点 |
| `spatial-2d` | 一块无限画布 | `本页镜头` 下的 camera frame |

- 同一 surface 的 location 必须在课程顺序中保持连续；拖动父节点时整体移动，拖动子节点时只在该父节点内部排序。
- 页面父节点使用教学名称；类型只用图标或低干扰标签提示，不用“Flow 表面 1”“Spatial 表面 1”之类工程术语。
- 页面与文本块、镜头或场景永远不能显示成扁平同级列表。
- “全局层”不属于上述页面树。它固定在独立的“共享内容”分区；进入后仍以当前 active location 作为预览上下文，只把 selection、图层操作和属性提交目标切到 global owner。

### 4.2 四态导航

- 纯 Slide：先显示固定“共享内容 → 全局层”，分隔后显示紧凑缩略图；不重复显示类型标签或跨类型导航。
- 纯 Flow：先显示固定“共享内容 → 全局层”，分隔后显示“课程结构”树；流式页面是父节点，标题目录在其下。不得再在下方追加第二套同级“讲义大纲”。
- 纯 Spatial：先显示固定“共享内容 → 全局层”，分隔后显示页面与`本页镜头`子树。坐标、缩放、语义缩放和路径属性不放进导航栏。
- Mixed：先显示固定“共享内容 → 全局层”，分隔后按教学顺序显示 Slide、Flow、Spatial 父节点及其子树。切到任一类型时，左栏 DOM、宽度和滚动位置保持稳定。

## 5. 各工作区合同

### 5.1 Slide

- 中央是固定 1280×720 规范画布，外部工作区负责缩放、适配和抓手平移。
- 选择框、八向 resize、旋转点和对象渲染共享同一 viewport transform。
- 画布下保留“场景状态”条：基础状态、命名状态、新增、复制、重命名、删除和缩略图设置。
- 双击文字/公式就地编辑；画布和属性栏写入同一个 V9 字段。
- 教师控制台是可选择的统一图层项，但画布选择框必须与可见控制器完全对齐。
- 选择左栏“全局层”后，画布仍以当前 Slide location 为预览上下文，只显示并编辑 global owner 的适用项；退出后恢复当前页面作者范围。

### 5.2 Flow

- 中央是连续稿纸/长文，不是按 1280×720 裁切的 Slide。
- 左侧目录只显示可导航标题/章节，不把每个普通文本块提升为页面同级入口。
- block 支持插入、选择、多选、复制、Delete、排序、缩进/取消缩进和右键菜单。
- 运行态左侧目录抽屉：展开时三角按钮贴在抽屉右边缘并指向左；收起后抽屉完全离场，只保留贴视口最左边、指向右的窄三角按钮。
- 编辑态选择“全局层”不改变 Flow 页面—目录父子树；中央长文只作为当前 location 的预览上下文，全局项通过统一图层与属性入口编辑。

### 5.3 Spatial

- 中央是真正无限画布，不显示固定白色页面边界；内容可延伸到当前视口之外。
- world item、关系线和 camera frame 使用世界坐标；工具条、选择柄、minimap、缩放控件和教师控制台使用屏幕坐标。
- 左栏只导航页面与镜头；镜头坐标、首页镜头、路径、关系和 semantic zoom 在中央工具条或右侧检查器编辑。
- 右侧图层采用紧凑单行，显示来源、拖动柄、名称、眼睛、锁和菜单；owner 内可排序。
- 编辑态选择“全局层”不创建镜头；Spatial world 坐标仍由当前 location 提供预览上下文，全局屏幕层与世界元素使用不同坐标空间。

### 5.4 Mixed

- 左栏是唯一课程顺序真相，三类 surface 在一棵树中混排。
- 当前 active location 决定中央工作区、右栏内容、快捷键路由和当前页面试运行目标。
- 切换类型前先结束/提交当前就地编辑事务，再清空上一 surface 的临时选区、hover、检查器草稿和 viewport-only 缓存。
- 教师控制台的上一场景/下一场景/目录按统一 location 顺序跨 surface 导航；重播/重置只作用于当前 location。
- 左栏“全局层”固定在 Mixed 课程树之外；进入和退出不会移动课程顺序，也不会改变当前 location 的类型。

## 6. 主动入口

### 6.1 新建工程

新建菜单直接提供：

- 空白演示课件：创建一个 `slide` surface、初始 scene 和 `slide-scene` location。
- 空白流式课件：创建一个 `flow` surface、初始标题/段落和可用的 `flow-block` location。
- 空白无限画布：创建一个 `spatial-2d` surface、首页镜头和 `spatial-camera` location。

创建后直接选中新 location；不需要先导入文件，也不弹出永久模式选择。

### 6.2 新增内容

左侧“新增内容”在四态都可发现，并始终提供：幻灯片页面、流式文本页面、无限画布页面。

一次新增命令必须原子完成：

1. 创建目标 surface 及最小可编辑内容；
2. 创建对应 location；
3. 插入课程顺序；
4. 将 active location 切到新页面；
5. 写入一次 history；
6. 重新推导壳层和当前工作区。

### 6.3 选择页面

- 点击课程树节点只改变 editor selection/session，不修改项目 revision、dirty 或 history。
- 先提交当前合法草稿；若存在不能自动提交的模态编辑，则阻止切换并给出明确原因。
- 切换后右栏、快捷键、右键菜单、Delete、粘贴目标和试运行目标必须同时更新，不得串页。

### 6.4 转换

“转换页面类型”不是改字段，而是“复制并转换为…”：

1. 选择目标类型；
2. 显示迁移预览，列出可原样迁移、需要重排和无法等价转换的内容；
3. 创建新的 surface/location 和新稳定 ID；
4. 保留原页面；
5. 在一个原子 history 中插入转换副本并选中它。

如果要把整门课主动整理为纯类型，使用“创建纯类型工程副本”，逐页预览转换并另存新工程；不得在原工程中静默删除异类页面。

## 7. 自适应推导

### 7.1 工程级布局

伪代码：

```ts
const referencedTypes = new Set(
  project.locations.map((location) => surfaceById(location.surfaceId).type),
)

if (referencedTypes.size === 1) {
  return mapSurfaceTypeToPureLayout([...referencedTypes][0])
}
return 'mixed'
```

规则：

- `{ slide }` → 纯 Slide。
- `{ flow }` → 纯 Flow。
- `{ spatial-2d }` → 纯 Spatial。
- 两种或三种 → Mixed。
- 未被 location 引用的孤立 surface 不参与推导。
- location 为空、引用缺失 surface 或出现未知类型时进入安全“当前位置不可用”状态并交给健康检查；不得偷偷降级到错误编辑器。

### 7.2 当前工作区

| Active location | 中央工作区 | 右栏/快捷键 |
| --- | --- | --- |
| `slide-scene` | Slide 画布 + 场景状态 | Slide 元素、状态、互动和画布命令 |
| `flow-block` | Flow 长文 + 本页目录 | block、文本结构、媒体和 Flow 命令 |
| `spatial-camera` | 无限画布 + 镜头工具 | world item、camera、path、relation 和 Spatial 命令 |

工程级 layout 只决定左栏信息架构；active location 只决定当前编辑能力，两者不可混成一个“模式”变量。

global authoring scope 是第三个正交维度：它只改变命令目标和 selection owner，不改变工程级 layout 或 active location。

### 7.3 自动变化

- 纯类型工程新增另一类型页面后，下一次推导立即显示 Mixed 课程树。
- Mixed 删除/转换掉最后一个异类页面后，下一次推导自动回到剩余类型的纯态。
- 不可删除工程最后一个 location。
- Undo、Redo、保存重开和恢复会从项目数据重新推导，结果必须一致。
- selection 切换不入 history；新增、删除、排序和转换各自只写一次原子 history。

## 8. 实现边界

- `deriveCourseEditorLayout` 保持纯函数，不读 React、Store、DOM、CSS，不写回项目。
- Shell policy 只决定导航和可见能力，不负责保存面板折叠、选区或 surface 会话。
- 课程结构树按 surface 分组渲染；不得直接把 `project.locations` 平铺成 UI。
- 全局层入口由壳层固定提供，不从 `locations` 伪造节点；global 内容是否适用于当前 location 由有效图层投影和能力检查决定。
- 路由切换必须有统一事务：结束编辑 → 选择 location → 清理旧 surface session → 构建新 view → 同步右栏和快捷键。
- 图层来源标签必须保留真实 owner；跨 owner 拖动不是普通排序，必须执行明确的 scope 移动命令或禁止并解释。

## 9. 验收矩阵

至少覆盖以下七种工程组合：

1. Slide；
2. Flow；
3. Spatial；
4. Slide + Flow；
5. Slide + Spatial；
6. Flow + Spatial；
7. Slide + Flow + Spatial。

每种组合必须验证：新建、添加、重命名、复制、排序、删除、右键、Delete、Undo/Redo、保存重开、连续切换 location、当前页面试运行、整课 Player 和导出。视觉复核至少覆盖 1280×720、1366×768、1920×1080。

## 10. 图片生成基线

四张编辑态图片使用内置图片生成，以已确认 Flow 稿和 V8 1366×768 壳层为共同参考，并已统一恢复“共享内容 → 全局层（全课）”固定入口。最终提示集分别锁定：纯 Slide 的缩略图/状态条/控制台、Flow 的页面—标题目录层级与运行态贴边目录、纯 Spatial 的页面—镜头树和坐标空间、Mixed 的统一课程结构树，以及无持久化模式字段的主动/自动切换链路。全局层入口属于作者范围，不属于切换逻辑图中的页面类型集合。
