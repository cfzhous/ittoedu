# Course Project V9

本文只说明当前公开边界。字段真值见 [`courseProjectTypes.ts`](../src/shared/courseProjectTypes.ts) 与 [`courseProjectSchema.ts`](../src/shared/courseProjectSchema.ts)。

## 顶层事实

`CourseProjectDocument` 保存项目身份与 revision、设计 token、媒体、素材、组件包、课程状态、导航守卫、location、全局互动、全局图层和多个 surface。Authoring Inventory 由项目派生，不是第二份内容模型；会话 Layout Snapshot 只描述当前运行画面，不写回项目。

编辑器只创建、打开和保存 V9 归档。当前没有需要继承的成品旧工程，因此不提供 V8 迁移，也不接受旧整画布 Runtime；所有新作者内容使用正常绝对 frame。

## Surface

`slide` 使用 1280×720 画布和 scene。每个 scene 可以有命名 presentation state、互动和图层项。

`flow` 使用语义块树。块 ID 跨重排、保存、导出和 Patch 保持稳定；section 可以嵌套块，组件以块形式嵌入。列表项以 `level: 0..5` 表达层级，首项必须从 0 开始且相邻项不得跨级；缩进、移动和删除按完整子树处理，Player、HTML 与 DOCX 使用同一层级事实。

`spatial-2d` 使用有限或无限二维 world、layer item、home camera、camera frame、关系与 semantic zoom rule。关系只保存稳定的起点、终点、连线和可选文字图层引用；连线与文字本身仍是可选中、可变换、可改样式的普通统一图层。删除端点时关系及其视觉图层一并清理，剪切关系成员则先要求教师显式删除关系。

Spatial 编辑器、Player 与打印统一使用 `1120×760` 逻辑视口；窗口只做等比缩放。镜头帧保存中心点和缩放，因此同一镜头在编辑、播放和 PDF 中具有相同构图。编辑态支持中键或 `Space + 左键` 平移，并提供“适配全部内容”。

`location` 把 Mixed 目录项映射到 surface，并可进一步指向 slide scene、flow block 或 spatial camera frame。共享状态与导航守卫不因 surface 切换而重置。

## 统一图层

`LayerItem` 是 `native | runtime | component` 判别联合。每项拥有稳定 `layerItemId`、frame、order、visible、locked、rotation、opacity、hitPolicy 和播放初始可见性。

全局、surface 与 scene/world 作用域在当前 location 上合成为一个有效顺序。`order` 是显式稀疏值；列表内严格递增，同一有效画面不允许 ID 或 order 冲突。新增、复制和重排可以移动其它项的 order，但不能按数组索引重新编号破坏跨作用域关系。Flow 的语义块仍是文档流；surface/global `LayerItem` 只在文档上方的统一覆盖层内共享该顺序，不与段落逐项交错。

Flow 列表项用必填的零起始 `level`（0–5）表达语义层级：首项必须为 0，相邻项目不得跳级。编辑器的缩进、Player 的嵌套列表、独立 HTML 与 DOCX 多级编号都消费同一字段。Flow 媒体块的 `mediaKind` 必须与其素材 `kind` 一致，素材的 `kind` 又必须与 MIME 主类型一致；改变图片/音频/视频种类需要重新插入真实素材，不能只改枚举。互动组件的教师界面显示组件名称，包 ID 与版本只作为内部引用；静态预览始终引用图片素材并提供明确查看与替换入口。

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

V9 只有统一图层，不存在 underlay/overlay Runtime。旧双平面或整画布 Runtime 不进入当前产品；作者必须使用 Surface Runtime API 3 或 Component API 4 的当前图层合同。
