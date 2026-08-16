# M5–M6：Flow 与 Spatial

> PARENT: [`COURSEWARE_DEVELOPMENT_PLAN.md`](../../COURSEWARE_DEVELOPMENT_PLAN.md)
> PREREQUISITE: M4 Gate
> STATUS: engineering-candidate（M5/M6 任务与 P1/P2 收口任务均 integrated；P3 收尾批次进行中，Gate 未判定）
> OUTCOME: 在原产品壳内完成 Flow 与 Spatial 的作者、Player、保存重开和导出

M5 与 M6 默认由两个执行者并行派发：两者表面语义与 owns 不重叠，共享 Store、App、Player 与导出边界只走窄接口增量，并按根计划 §4.3 串行集成。每个表面内部保持纵切顺序；不得为了并行先建抽象框架。

## 1. 共用原则

- 继续使用原 App、顶栏、左栏、右栏、状态栏和文件生命周期。
- Flow/Spatial 可以有符合自身语义的中央内容工作区，但不能成为新 Shell 或第二产品入口。
- 两类表面都读写同一个 V9 session/history/archive。
- Native、Runtime、Component 和教师控制器参加统一 order、visibility、selection 与 authoringAddress。
- 先完成单表面纵切，再抽取两者真实重复的纯模型或适配边界。

## 2. M5：Flow

### M5-A：语义与只读投影

- Flow location、block、层级、顺序和稳定 ID 的只读 view。
- 原 ScenePanel/导航区域显示教师可理解的位置名称，不暴露 Surface/Location。
- 表格、公式、媒体和共享内容按 V9 Schema 物化。

### M5-B：作者命令

- 添加、删除、复制、重排和层级移动。
- 真实指针拖动与键盘操作一次手势一次 history/revision。
- 通用属性、文本、公式、表格和媒体属性进入原右栏。
- 状态、互动、Runtime/Component 作者目标与统一图层成立。
- 陈旧 target、跨 location 同 ID 和保存期间操作安全拒绝。

### M5-C：Player 与导出

- FlowSurfaceHost 消费同一 Published V2 payload。
- 教师控制器复用 M4 的运行合同，不建立 Flow 专用控制器语义。
- 保存、完全关闭重开、继续编辑成立。
- HTML/网页包、PDF 与 DOCX 的 Flow 路径输出真实结构；不可只截图伪装语义文档。

### M5 Gate

一个代表性 Flow 完成“结构编辑 → 互动/状态 → 试运行 → 保存重开 → HTML/PDF/DOCX”。只跑一条 Electron 主路径。

## 3. M6：Spatial

### M6-A：坐标与视图模型

- world 坐标、viewport、pan、zoom、镜头、路径、关系和小地图有明确单一真相。
- 选择/命中使用逻辑坐标，不把 CSS transform 或 DPR 偶然值写入工程。
- authoringAddress 跨保存重开稳定。

### M6-B：作者命令

- 节点添加、选择、移动、resize、rotate、关系与路径编辑。
- 镜头创建、重命名、排序、切换和持久化。
- Runtime/Component/Native 统一图层和原右栏属性。
- pan/zoom 是 session 状态；内容变换才进入 history。

### M6-C：屏幕空间与世界空间

必须结构性分离：

- world 内容接受 camera translate/scale、culling 和 minimap。
- 全局教师控制器与其他 viewport/session 控件不进入 world camera transform。
- 在 0.5x、1x、2x 以及平移后，控制器的屏幕尺寸和会话 offset 保持一致，world 内容的屏幕 rect 随 camera 改变。
- 不用 inverse-scale CSS 补偿错误层级。

### M6-D：Player 与导出

- SpatialSurfaceHost 复用 Published 课程状态和教师控制器合同。
- 状态、互动、镜头、路径、关系和 Runtime/Component 运行成立。
- 保存重开后 viewport 默认、稳定 ID、关系与路径一致。
- HTML/网页包和需要的打印/演示导出有真实结果。

### M6 Gate

一个代表性 Spatial 完成“缩放/平移 → 内容变换 → 镜头/关系 → 试运行 → 保存重开 → 导出”，并机械验证教师控制器不随 world camera 缩放。

## 4. 明确不做

- 不为 Flow 和 Spatial 各建一套 Store、历史或文件生命周期。
- 不先发明统一画布框架再迁移两个表面。
- 不复制 donor 的 FlowBlockEditor、SpatialAuthoringPanels 或 CourseStudio 壳。
- 不用截图型导出来冒充 Flow 语义 DOCX/PDF。

## 5. 收口缺口登记（2026-08-15 审计）

2026-08-15 由协调者对集成主线做四路代码审查 + 真实应用复核（Electron 实机截图与交互）。测试全绿但下列缺口被真实证据证实；全部经由总纲 §4.5 收口任务板派发修复，修复前 M5/M6 Gate 不得判定。

### P1（阻断 Gate）

1. **Spatial 路径/关系"能存不能见"**：编辑画布与 Player 均零渲染；Published payload 静默丢弃（`publishedCourseSchema.ts` world 为 strict 且无 paths/relations；`buildPublishedCourse.ts` spatial 分支不拷贝；`SpatialSurfaceHost` 只渲染 world.layerItems）。保存重开成立但试运行/预览/导出全丢，差异报告还过度声称 preserved。对应 M6-B"关系与路径编辑"、M6-D"路径、关系运行成立"。
2. **Spatial 镜头会话相机未接线**：`App.tsx` 把 `sessionCamera` 硬编码为 `surface.camera.home`，`SpatialWorkspace` 的真实 pan/zoom 仅存组件内 state、无回传出口——"从当前画面添加"永远复刻 home 位姿，"设为首页镜头"被相等守卫拦截恒为 no-op；镜头切换也不移动画布视口。对应 M6-B"镜头创建/切换"。

### P2（功能缺口）

3. **Flow 结构命令零 UI 入口**：删除/复制/重排/层级移动命令有实现有测试，但大纲与画布无按钮、键盘 Delete/Ctrl+D 只回"暂不支持"。
4. **Flow 结构编辑未接线**：`onStructuralCommand` 未传入 App 侧 properties，列表/表格结构编辑在生产全部静默禁用且无原因说明。
5. **Flow 媒体/互动组件插入必败且泄漏原始 Zod JSON**：无素材/组件包时应禁用并给教师可读原因，或由命令层先校验再以中文消息拒绝。
6. **Flow 统一图层不进生产画布**：view 已物化 global/surface 图层但无消费者；layers 页被门控；图层叠加只存在于 donor 组件 `FlowCourseCanvas`（禁止回到正式 import graph）。
7. **SpatialLayerInspector 每击键一条 history**（违反一操作一历史）且受控 number input 无法键入负坐标（世界坐标合法负值普遍存在）。
8. **Spatial 控制器三件套不全**：静音标签不订阅 `audio:change` 永不刷新；progress 硬编码空 scenes 显示"场景 — / 0 · 等待开始"（真实复核截图证实）；拖动/收起后 replay 使 DOM 与 canonical session 去同步（getSession seed 钉死）。
9. **场景目录只列 slide-scene**：Flow/Spatial 位置缺席 picker（混合课程目录不完整）。
10. **混合工程无表面导航入口**（真实复核证实）：混合课程打开后停留在起始表面，Flow/Spatial 表面在编辑器内不可达。
11. **Flow/Spatial 路由缺"当前位置试运行"动线**：Workspace 早返回绕过 WorkspaceEditor 的试运行按钮；仅"整课预览"可用。Gate 口径含试运行。

### P3（一致性与风格）

12. 术语泄漏："FLOW 讲义"/"SPATIAL 空间"进入面板标题、状态栏出现"表面"字样（§2.4 要求普通教师只见教学概念）。
13. DOCX 只导出当前选中 Flow 表面且建议文件名恒为工程名；PDF 导出的 E2E 只断言菜单可用未真出 PDF。
14. schemaVersion 未随 strict 新字段 bump：含 paths/relations 的档案在旧 V9 构建上只报泛化"校验失败"。
15. 世界图层删除不修 paths/relations/semanticZoom 引用（当前删除入口不可达；暴露删除入口前必须补级联修复，参照 `deleteSpatialCameraFrame` 模式）。
16. 重复实现：`flowSurfaceIn`/`findFlowBlockRecursive`/`flowBlockLabel`（规则不一致）/`spatialSurfaceIn`/`valuesEqual`/`screenControlRect`（生产零调用）等。
17. Spatial 旋转元素的选择 chrome 轴对齐不贴合；`capture` 不经队列；`includeInStaticExports` 被忽略；Published App 未给 Flow 宿主传 `interactions`；`teacherControllerContext().canvas` 快照与硬编码 1120×760 viewport 刚性隐患。

### 测试盲区（与上述缺陷一一对应）

- 无 App 壳层 sessionCamera 接线测试、无"激活镜头移动画布"测试、无 Inspector 击键-history 测试、无任何路径/关系渲染断言、无混合工程表面导航断言。
- 收口任务必须各补一条真实断言或代表性 Electron 路径。

## 6. 收口轮审计结论（2026-08-16，真实复核）

收口任务板（§4.5 T-FIX-*）集成后，协调者做了第二轮 diff 审查 + 真实体验复核（真实 Electron 应用 + 手动测试工程 `output/manual-test/`）：

### 复核确认真实修复且行为成立
- Flow 结构命令全入口（画布/大纲工具条六键 + Delete/Ctrl+D 键盘）、媒体/互动组件插入禁用带原因、统一图层叠加与图层页、Inspector blur/Enter 提交与负坐标、一次编辑一次撤销（实测撤销后精确回退）、保存→完全关闭→重开→继续编辑、四种导出（单 HTML/网页包/PDF/DOCX）全真，DOCX 为真实 OOXML 语义文档（含 `w:tbl`，零图片伪装）。
- Spatial 0.5x/1x/2x 缩放、平移、小地图、屏幕空间控件不随世界缩放（控件尺寸在 100%/195% 下逐位一致）、点选/拖动/画布手势、"从当前画面添加镜头"捕获真实会话位姿（实测 125% · x-256 y-144）。
- Spatial 路径/关系全链：编辑画布连线/折线、Published payload 保留、Player 试运行渲染（实测 polyline/line 节点存在）、打印/PDF 包含、差异报告不再过度声称。
- Flow/Spatial 试运行按钮真实存在，启动/退出干净，工程不变；混合工程左栏"课程内容"跨 Slide/Flow/Spatial 导航真实可用（教师术语"幻灯片/讲义/空间"正确）。
- 机器证据：typecheck 绿、全量 Vitest 205 文件/1325 测试、构建通过、禁区（contracts/preservation）未被收口轮触碰、无 donor 重引入。

### 复核发现的未闭合缺口
- **P1（生产 Player 未接线）**：Spatial 控制器 `audioChangeSource`/`courseProgressSource` 已实现且有单测，但 `PublishedCourseApp` 构造 SpatialSurfaceHost 时未传入——交付课件中静音标签仍钉初始值、progress 仍显示"场景 — / 0 · 等待开始"（真实复核试运行截图证实）。
- **P1（生产 Player 未接线）**：`ScenePickerOverlay` locations 模式已实现且有单测，但 `PublishedCourseApp.#pickerScenes()` 仍只列 slide-scene——混合工程场景目录只列 2 个幻灯片场景（真实复核截图证实）。
- **P2**：App 壳会话相机 effect 时序——镜头切换后 `spatialSessionCamera` 被重置为 null 回退 home，此时"从当前画面添加/设为首页镜头"捕获错误位姿；且无 App 级接线测试。
- **P2**：relation `label` / path `name` 仍零渲染（数据保留但无 `<text>` 消费方）。
- **P2**：`workspaceFlowSpatialTrial.test.tsx` 的 fallback 用例是假测试（从不点击按钮、store mock 成抛错、无"退出后工程不变"断言）。

### UI/UX 结构性问题（用户真实观察"UI 设计完全不对"证实，阻塞 art candidate）
- Flow 编辑画布把文档渲染为暗色舞台上的漂浮块 + 突兀六键工具条，不是文档式阅读栏；试运行视图呈现正确——编辑态与运行态呈现严重不一致；Flow 画布不支持直接编辑文字（只能属性栏编辑）。
- 左面板层级混乱：纯 slide 工程也挂与场景列表重复的"课程内容"导航；导航头与表面区各有一套"添加讲义/添加空间"重复入口；大纲与课程内容混排。
- Spatial 左面板是密排工程表单（镜头/首页镜头/语义缩放/世界图层），非教师向布局。
- 术语残留：右栏"FLOW 内容块"/"SPATIAL 内容"、状态栏"Flow 讲义 · N 个内容块"/"Spatial 空间·总览"、错误"无法新建 Flow 讲义"（与按钮"添加讲义"自相矛盾）；Flow/Spatial 路由底部状态条显示"场景画面/基础场景"（Slide 语义）。
- 决策：**暂停 M7/M8 流水线，先做 UI/UX 收口批次**（见总纲 §4.5 收口任务板 T-FIX-UI-*），这些问题不会随后续开发自愈，M7 的 Mixed 与 M8 的教师验收都建立在其上。
