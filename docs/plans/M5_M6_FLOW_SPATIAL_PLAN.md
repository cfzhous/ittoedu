# M5–M6：Flow 与 Spatial

> PARENT: [`COURSEWARE_DEVELOPMENT_PLAN.md`](../../COURSEWARE_DEVELOPMENT_PLAN.md)
> PREREQUISITE: M4 Gate
> STATUS: pending
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
