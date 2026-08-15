# M3：Slide 作者闭环

> PARENT: [`COURSEWARE_DEVELOPMENT_PLAN.md`](../../COURSEWARE_DEVELOPMENT_PLAN.md)
> BASELINE: product `b6d1787875339fff8ba03d80cfbf80187c009caa`
> STATUS: active
> OUTCOME: 原壳内完成可编辑、可运行、可保存重开的 Slide 作者链

本文件只细化 M3。若与根计划、源码或 Schema 冲突，以根计划规定的事实优先级为准。

## 1. 当前起点

已经成立：

- 默认入口使用 Course Project V9，V9 session/history/archive 由原 `editorStore` 单一持有。
- 原 ScenePanel、状态条、Elements、Nodes、Properties 和 Workspace 已接入场景 Native。
- global 与 surface Native 已进入原 Workspace、Nodes、Properties，支持稳定选择、变换、Undo/Redo 和保存重开。
- 编辑态教师控制器是工程内作者对象，按钮不会执行播放动作。
- 工程检查、整课预览、HTML、网页包和基础 PPTX 已接到 V9 producer。

尚未成立：

- 新增元素后偶发 App 壳上弹并露出底部黑区。
- Published Slide 尚未完整执行 `scene.interactions`。
- “当前位置试运行”尚未使用独立 Published snapshot 会话。
- image/video、背景、富文本/IME、Runtime/Component 作者目标和互动编辑尚未形成完整 Slide 闭环。

## 2. 实施顺序

### M3-B0：修复壳层上弹与底部黑区

目标：先恢复稳定编辑视口，再继续扩功能。

最短诊断：

1. 在一个可复现视口记录添加元素前后的 `innerHeight`。
2. 同时记录 html、body、root、app-shell、app-main、workspace、state strip、status bar 的 rect 与 scrollHeight。
3. 判断是根节点高度、grid min-content、容器滚动还是新增内容触发的重排。
4. 只修改负责该几何事实的现有 CSS/组件，不引入新壳或第二布局系统。

验收：添加 text/formula/shape 前后无页面级黑区和页面滚动；画布、状态条、缩放控件、底部状态栏保持原位置；工程状态不变。

最小证据：一个布局回归单测或几何断言，加一个真实 Electron 视口。三尺寸视觉留到 M3 Gate。

### M3-B1：Published Slide 基础互动执行

目标：让课例中的 Native 点击规则真实运行，不再依赖 Runtime 热点绕行。

范围：

- producer 与 consumer 对同一 `scene.interactions` 契约达成一致。
- 在 Published Slide 绑定稳定 layer item 激活事件。
- 复用协议中性的互动执行能力，先闭合 `node.click`、`presentation.in`、`presentation.set`。
- 切 scene/location 时销毁旧订阅；重启和 destroy 不残留会话状态。
- 编辑态 Authoring host 保持 inert，不能因为接入执行器而执行按钮或规则。

主要入口：

- `src/renderer/export/course/buildPublishedCourse.ts`
- `src/player/PublishedCourseApp.ts`
- `src/player/surfaces/slide/SlideSurfaceHost.ts`
- `src/player/InteractionEngine.ts`
- `src/player/CourseEventBus.ts`

最小证据：一个纯互动顺序/条件测试，一个 Slide Host 激活测试，一个 Published V2 点击切状态测试。

### M3-B2：独立“当前位置试运行”

目标：在原 Workspace 中启动当前 V9 snapshot 的真实课程会话。

合同：

- 作者 iframe 常驻且 inert；试运行使用独立 overlay/iframe 和 Published Course V2 payload。
- 从当前 location/state 启动；停止即 destroy。
- 试运行不得写 Project/history/revision/selection/viewport。
- 退出后作者画布、选择与缩放恢复原样。
- 不把 authoring host 原地切成 playback。

最小证据：一条 Electron 路径完成进入试运行、点击切状态、退出、继续编辑和 Undo。

### M3-B3：剩余 Native 与画布编辑

依次完成：

1. image/video 的插入、素材引用、稳定选择、通用属性、保存重开。
2. 场景背景颜色与背景素材。
3. text 的正文/富文本/IME 事务；一次编辑只产生一次 history。
4. formula/shape/media 的已有属性与 Workspace 视觉同步。
5. resize、rotate、多选变换、方向键微调在各 scope/state 下保持一次手势一次 history。

不在本阶段重建 MediaTab 或 Properties；只给原组件增加 V9 窄控制边界。

### M3-B4：Runtime/Component 作者目标进入统一图层

目标：Runtime/Component 的作者目标可在原 Workspace/Nodes/Properties 中命中和编辑。

- 文字目标必须稳定；普通可替换图片目标应稳定。
- `authoringAddress` 跨保存重开不变，临时 hitId 不持久化。
- 编辑态 visual host 与 Phaser proxy 使用同一 V9 只读事实。
- Runtime/Component 仍由其各自运行 Host 管理，不投影成假 Native 保存。
- 尚未支持的专属属性局部禁用，不把整个通用属性区隐藏。

### M3-B5：原互动/开发 UI 接线

- 原 InteractionEditor、AutomationTab、DeveloperTab、ComponentsTab 逐项接 V9 command。
- 普通教师只看到教学概念；协议和 manifest 只出现在专业开发区。
- 每个可达按钮必须真实执行、明确禁用或明确说明；不能静默写隐藏 V8。
- 构建脚本不再承担编辑器本应提供的常规互动作者能力。

## 3. M3 Gate

必须同时满足：

- 黑区/上弹 P1 已关闭。
- text、formula、shape、image、video、背景和教师控制器可编辑并保存重开。
- scene/surface/global 的统一顺序、状态覆盖、选择与变换成立。
- 基础 Native 点击/状态互动在 Published Slide 与当前位置试运行中成立。
- Runtime/Component 作者目标进入统一图层。
- 原壳无第二 Workspace、第二 Store 或 donor 前端入口。

阶段证据只运行一次：M3 定向测试、typecheck、受影响 build、一条代表性 Electron、`npm test`、反重写门禁；布局代码发生变化时才运行三尺寸 visual。

## 4. M3 明确不做

- 不在本阶段宣称教师控制器完整收展、目录、静音、全屏或跨表面导航；这些属于 M4。
- 不实现 Flow/Spatial 作者能力。
- 不完成 PDF/DOCX 最终导出。
- 不建立新的 command 框架、Provider、插件系统或知识图谱生成器。

## 5. 移交 M4 的条件

只有一个代表性 Slide 能在原壳中完成“创建内容 → 编辑状态/互动 → 当前位置试运行 → 保存 → 完全关闭重开 → 再编辑”，才进入 M4。
