# Course Project V9

本文只说明当前公开边界。字段真值见 [`courseProjectTypes.ts`](../src/shared/courseProjectTypes.ts) 与 [`courseProjectSchema.ts`](../src/shared/courseProjectSchema.ts)。

## 顶层事实

`CourseProjectDocument` 保存项目身份与 revision、设计 token、媒体、素材、组件包、课程状态、导航守卫、location、全局互动、全局图层和多个 surface。Authoring Inventory 由项目派生，不是第二份内容模型；会话 Layout Snapshot 只描述当前运行画面，不写回项目。

V8 归档通过显式迁移函数转换到 V9。迁移保留可恢复内容并把旧整画布 runtime 标记为 `legacy-whole-canvas`；新作者内容使用正常绝对 frame。V1-V7 不进入当前迁移入口。

## Surface

`slide` 使用 1280×720 画布和 scene。每个 scene 可以有命名 presentation state、互动和图层项。

`flow` 使用语义块树。块 ID 跨重排、保存、导出和 Patch 保持稳定；section 可以嵌套块，组件以块形式嵌入。

`spatial-2d` 使用有限或无限二维 world、layer item、home camera、camera frame 与 semantic zoom rule。

`location` 把 Mixed 目录项映射到 surface，并可进一步指向 slide scene、flow block 或 spatial camera frame。共享状态与导航守卫不因 surface 切换而重置。

## 统一图层

`LayerItem` 是 `native | runtime | component` 判别联合。每项拥有稳定 `layerItemId`、frame、order、visible、locked、rotation、opacity、hitPolicy 和播放初始可见性。

全局、surface 与 scene/world 作用域在当前 location 上合成为一个有效顺序。`order` 是显式稀疏值；列表内严格递增，同一有效画面不允许 ID 或 order 冲突。新增、复制和重排可以移动其它项的 order，但不能按数组索引重新编号破坏跨作用域关系。Flow 的语义块仍是文档流；surface/global `LayerItem` 只在文档上方的统一覆盖层内共享该顺序，不与段落逐项交错。

教师控制器也是 Native layer item，不拥有不可穿越的特殊 overlay。Runtime/Component 的宿主根元素必须受自身 layer item 约束。

## 作者地址

画布命中返回临时 `hitId` 和稳定 `authoringAddress`。地址包含项目、作用域、surface/scene、载体、layer item 和字段；文字、素材与属性都使用同一地址协议。

AI Patch 使用 `expectedRevision + authoringAddress + value`。地址解析后只替换 Authoring Inventory 指向的字段，成功时 revision 增加；revision 或预期旧值不匹配即拒绝。

## 交互态检查

编辑器托管 Player 原地切换 playback 与 inspection。切换时冻结课程状态、Runtime/Component 副作用与媒体，同时保留当前 DOM/Canvas 可见画面和作者目标。检查结束可恢复同一会话。

当前画面属于会话 checkpoint。保存项目不会自动写入学生尝试、答案、随机结果或动画中间态。教师只能在 Slide 检查态中显式保存可结构化的背景、图层顺序、几何、透明度与显隐为命名复核态；该状态可切换、重命名、设为初始或删除。无法结构化表达的 Runtime/Component 内部状态不得伪装成已保存状态。

## 课程状态与导航

课程状态是有限声明，动作与条件是严格判别联合。普通导航入口统一检查 guard；作者检查和静态捕获使用明确旁路。重启恢复声明的初值和开始 location。

Runtime/Component 可以通过同一状态执行器读取或触发受支持动作，不能维护与项目并行的影子状态源。

## 归档与发布

V9 `.h5lesson` 归档包含项目、素材和嵌入组件包，拒绝路径穿越与损坏输入。保存重开后稳定 ID、revision 和作者地址继续有效。

发布将 V9 单向编译为 `PublishedCourseV2Payload`，再生成自包含 HTML 或网页包。发布数据仅包含 Player 需要的结构和执行资源，不包含编辑历史或完整作者工作区。

Flow DOCX、Flow/Spatial/Mixed 分页输出和 Slide 静态兼容输出应报告互动的 preserved/static/fallback/omitted 差异，不用长截图伪装语义文档，也不宣称静态格式保留互动。Flow capture/PDF 保留统一覆盖图层顺序；DOCX 以独立“画布图层”章节写入 Native 和动态后备说明，不得静默丢弃。

V8 只能显式迁移。单一 underlay 或 overlay Runtime 保留在对应一侧；同一 Runtime 若同时使用两个旧平面，迁移必须拒绝并给出保留 V8 或先收敛运行时的建议，不得把双平面静默折叠成一个 V9 图层项。
