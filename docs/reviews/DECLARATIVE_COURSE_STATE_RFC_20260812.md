# 声明式课程状态与导航守卫 RFC

> 日期：2026-08-12
> 状态：**提案，等待人类评审；不得据此修改 Project Schema 或宣称为当前能力**
> 范围：Project 声明式互动、Player 运行语义、作者界面、诊断与导出一致性
> 不在范围：题型专用状态、任意表达式、脚本求值、循环、复杂算法和 Runtime API 2 的替代

## 1. 结果目标

让教师和 AI 能用少量、结构化、可诊断的声明表达三件高频事情：

1. 声明课程级标量状态，例如 `attempts`、`checkpointPassed`；
2. 在互动条件中读取状态，并用原子动作设置、递增或删除状态；
3. 在普通跨场景导航前按状态阻断跳转，并向教师显示同一条可理解原因。

首版必须保持有限、确定、离线和跨导出一致。几何计算、仿真、长流程算法、动态对象和程序化重定向继续由 Runtime API 2 承担。

## 2. 当前事实，不是提案

当前软件已经有一个课程级 `CourseStateStore` 和一条 Runtime 导航守卫链：

- 普通场景切换、上一页、下一页、场景选择器、教师控制器、Presenter 的场景导航以及 Runtime/Component HostActions 会进入 `CourseRuntimeKernel.resolveNavigation()`；
- `courseState` 在普通换页与场景重播时保留，`restartCourse()` 调用 `resetForRestart()` 时清空；
- Runtime 守卫可以允许、阻止或把目标重定向为另一个场景；阻止结果通过 `navigation:blocked` 事件显示给教师；
- authoring host 使用冻结的 `CourseStateStore`；普通 capture host 当前没有统一设置 `freezeCourseState`；
- 初始进入、课程重启后的第一页、场景重播和 authoring 强制切换走明确的强制路径，不等同于普通导航；
- 同一场景内的命名状态切换不是跨场景导航，不进入场景导航守卫；
- 当前声明式条件只有 `presentation.in`、`scene.in`，声明式动作还不能读写 `courseState`。

因此，本 RFC 不新建第二个状态系统，也不以声明式规则替换 Runtime 守卫；它只讨论如何把有限语义接入同一事实源和同一导航入口。

## 3. 推荐的数据模型

### 3.1 必须先声明合法状态

不允许动作遇到未知 key 时静默创建状态。建议在 Project 根级增加声明列表，示意结构如下：

```ts
interface CourseStateDeclaration {
  key: string
  type: 'boolean' | 'number' | 'string' | 'null'
  defaultValue: null | boolean | number | string
  label: string
  description?: string
}
```

约束建议：

- 最多 128 个声明；
- key 使用 `^[a-z][a-zA-Z0-9._-]{0,79}$`；
- `system.`、`runtime.`、`component.` 保留，作者声明不得使用；
- key 在工程内唯一，`defaultValue` 必须与声明类型严格一致；
- number 必须是有限数，不接受 `NaN`、`Infinity` 或字符串到数字的隐式转换；
- 首版只有课程作用域，不引入第二个 scene-local 声明系统；场景局部复杂状态继续使用 Runtime `localState`。

声明的意义是为编辑器、AI、Project Health 和运行时提供同一份 key、类型、默认值和说明，避免拼写错误产生不可见新状态。

### 3.2 条件

建议只增加两个条件分支：

```ts
type CourseStateCondition =
  | {
      type: 'course-state.exists'
      key: string
      exists: boolean
    }
  | {
      type: 'course-state.compare'
      key: string
      operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
      value: null | boolean | number | string
    }
```

语义冻结：

- 条件仍与现有条件一样按 AND 组合；
- `eq`/`ne` 使用同类型严格比较；
- `gt`/`gte`/`lt`/`lte` 只允许 number；
- 未声明 key、比较值与声明类型不一致或运行时出现不合法值时，Schema/Project Health 报错，运行时安全地把条件判为 false；
- `exists` 判断 Store 当前是否有值，不把“声明了默认值”与“当前一定存在”混为一谈；初始化完成后默认声明通常存在，执行 delete 后可以不存在；
- 不提供正则、表达式字符串、JavaScript 或隐式类型转换。

### 3.3 动作

建议只增加三个动作分支：

```ts
type CourseStateAction =
  | {
      type: 'course-state.set'
      key: string
      value: null | boolean | number | string
    }
  | {
      type: 'course-state.increment'
      key: string
      by: number
    }
  | {
      type: 'course-state.delete'
      key: string
    }
```

执行合同：

- `set` 的值必须与声明类型严格一致；
- `increment` 仅允许 number 声明，`by` 和结果均必须是有限数；
- `increment` 是 InteractionEngine 对同一 Store 的单个同步读改写步骤，不拆成可交错的 get/set 作者动作；
- 对不存在的 number 状态执行 increment 时使用声明的 number 默认值；若声明没有合法默认值则阻断该动作并发出诊断事件；
- `delete` 删除当前值，但不删除声明；下一次课程初始化或 restart 会重新应用默认值；
- 动作失败不得部分写入，也不得把字符串自动转换成数字。

## 4. 生命周期合同

推荐生命周期如下：

| 时点/模式 | 声明式状态行为 |
|---|---|
| 首次课程启动 | 清空 Store，再按声明初始化默认值，然后发出 `course:start` |
| 普通场景切换 | 保留 |
| 场景重播 | 保留 |
| `course.restart` | 清空，重新应用默认值，再进入第一页 |
| preview / published playback | 允许声明式互动、Runtime 和组件按权限读写同一 Store |
| authoring | 冻结写入；只提供稳定的默认值快照用于渲染与诊断 |
| capture | **推荐冻结写入**，使用同一默认值快照，确保缩略图、PDF、PPTX 和静态捕获可重现 |

authoring 和 capture 的冻结决定必须成为自动化门禁。捕获不能因为运行时计时或先前截图顺序不同而生成不同结果。若未来需要截取特定课程状态，应通过显式 capture fixture/输入快照实现，而不是允许捕获过程任意修改 Store。

## 5. 声明式导航守卫

### 5.1 建议形态

导航守卫是跨场景控制，不应伪装成某个场景的点击互动。建议在 Project playback 配置下增加独立规则列表：

```ts
interface DeclarativeNavigationGuard {
  id: string
  name?: string
  enabled: boolean
  fromSceneIds?: string[]
  toSceneIds?: string[]
  conditions: CourseStateCondition[]
  effect: 'block-when-false'
  reason: string
}
```

首版只支持“条件不满足时阻断”，不支持声明式重定向。这样可以避免循环、隐式分支和教师无法解释的跳页行为；复杂重定向继续由 Runtime API 2 处理。

`reason` 是教师可见、可本地化的作者文案；为空、过长或只含空白时 Schema 拒绝。阻断统一发出 `navigation:blocked`，Presenter、教师控制器和普通播放器显示同一原因。

### 5.2 入口矩阵

| 入口 | 是否应用声明式守卫 | 说明 |
|---|---:|---|
| 下一页、上一页 | 是 | 普通跨场景请求 |
| 场景选择器 | 是 | 不能用目录绕过课程门禁 |
| 教师控制器翻页/选页 | 是 | 与普通控制一致 |
| Presenter 场景导航策略 | 是 | 调用普通 `goToScene` |
| `scene.go` / `scene.next` / `scene.previous` | 是 | 声明式互动的终端导航动作 |
| Runtime/Component HostActions | 是 | 进入同一普通导航入口 |
| `presenter.command` authored-command | 间接是 | 命令先触发互动；其终端场景动作再进入守卫，不提供隐式后备翻页 |
| 初始课程进入 | 否 | 无“离开当前场景”的普通请求；必须确定性进入起始页 |
| `scene.replay` | 否 | 重建当前场景，不是跨场景跳转，状态保留 |
| `course.restart` | 否 | 显式重置课程，状态恢复默认值并强制进入起始页 |
| authoring 强制切换 | 否 | 作者必须能检查所有场景；Store 冻结 |
| capture 强制切换 | 否 | 导出必须能捕获全部场景；Store 冻结 |
| 同场景 `presentation.set` | 否 | 这是命名状态切换，不是场景导航 |

“守卫覆盖所有导航”是不准确的。准确合同是：所有普通跨场景入口受守卫约束；重播、重启、初始进入、authoring 和 capture 是有意豁免的强制路径。

### 5.3 与现有 Runtime 守卫的组合

既有 Runtime 守卫支持重定向，声明式首版不支持。推荐统一解析顺序：

1. 验证原始目标存在；
2. 对当前目标执行声明式守卫；若阻断则停止；
3. 依注册顺序执行 Runtime 守卫；
4. Runtime 返回重定向目标时，先验证目标存在，再重新执行声明式守卫，防止通过重定向绕过声明式门禁；
5. Runtime 守卫链继续处理最终目标；同一解析最多允许 8 次重定向，重复目标或超限按阻断处理；
6. 首次阻断即发出一条 `navigation:blocked`，包含 `guardId`、来源、目标、原因和来源域 `declarative | runtime`。

正式实现前必须确认 Runtime 守卫当前“一次 for 循环内修改目标”的兼容语义是否允许改成上述闭环。若会改变既有 Runtime 行为，应在版本治理中单独处理，不能借声明式功能静默改变。

## 6. 作者界面与 AI 接口

建议作者界面分两层：

- “课程变量”：表格编辑 key、类型、默认值、名称和说明；所有条件/动作只能从声明中选择；
- “翻页条件”：选择来源/目标场景、组合条件和教师提示；不暴露 JSON 或表达式编辑器。

InteractionEditor 在条件和动作选择器中展示课程变量的 label，同时保留 key 作为稳定身份。删除或改名被引用的声明必须阻断并列出引用位置，不能自动改写成新 key。

AI 能力清单只暴露声明式分支、上限和文档锚点；每个工程自己的变量声明仍从 Project 读取，不进入全局能力清单。AI 写入后必须经过 Schema 和 Project Health，不能直接操作 Runtime Store。

## 7. 诊断与导出

若方案获批，至少需要以下 Project Health 诊断码：

- `course-state-declaration-duplicate`
- `course-state-key-unknown`
- `course-state-type-mismatch`
- `course-state-non-finite-number`
- `course-state-condition-always-false`
- `navigation-guard-scene-missing`
- `navigation-guard-self-lock`
- `navigation-guard-unreachable-scene`

其中“恒真/恒假”“自锁”“不可达”属于保守静态分析：无法证明时不报 error。未知 key、类型不匹配、无效场景和非有限数属于确定性 error。

HTML、网页包和 `.h5lesson` 保留同一 Project 语义；Player 在浏览器内执行。PDF/PPTX 不执行互动，使用冻结默认状态捕获，并在导出预检中提示“课程变量和导航守卫已静态化，不可在 PDF/PPTX 中交互”，而不是伪装为可运行。

## 8. 版本治理决策

本 RFC 会给 Project 根结构、Interaction condition/action union 和 playback 导航配置增加新语法。旧编辑器可能把带新分支的同版本工程判为无效，因此不能默认继续叫作相同的 Project V8。

推荐决策：

- 如果 Project V8 已对外冻结，采用 **Project V9**；
- 只有项目负责人明确签署“V8 尚未冻结，现有 V8 文件与编辑器不构成兼容承诺”，才允许在 V8 内扩张；
- 不采用只有 UI 知道、Schema 不知道的隐藏 capability 字段；
- Runtime API 2 和 Component API 4 本身无需因声明式 Project 语法扩张而升版，除非其公开宿主合同也发生不兼容改变。

在版本决策签署前，任何原型都必须停留在内存或测试夹具，不能保存到正式工程。

## 9. 三个评审夹具

### 9.1 尝试次数

- 声明：`attempts: number = 0`；
- 点击动作：`course-state.increment`，`by: 1`；
- 条件：`attempts >= 2` 时切换到“再次反馈”命名状态；
- 要证明：一次触发只增加一次、同组动作按既有顺序执行、重播保留、restart 恢复为 0、authoring/capture 不积累次数。

### 9.2 检查点门禁

- 声明：`checkpointPassed: boolean = false`；
- 守卫：目标为总结页时要求 `checkpointPassed eq true`，失败原因“请先完成本页检查点”；
- 要证明：键盘、场景选择器、教师控制器、Presenter、声明式导航、Runtime 和组件入口得到同一阻断；重播、restart、authoring/capture 按矩阵豁免；Runtime 重定向不能绕过门禁。

### 9.3 重启与导出

- 普通换页和重播后，状态保持；
- `course.restart` 清空后重新应用默认值；
- Editor authoring、缩略图、PDF、PPTX 捕获使用冻结默认快照；
- `.h5lesson`、HTML、网页包保存声明和规则，PDF/PPTX 预检明确静态化差异。

每个夹具在正式实现时都必须同时覆盖 Project JSON、Schema、InteractionEngine 顺序、Presenter、Project Health、保存重开和四种导出面。

评审闭环如下：

| 夹具 | Project / Schema | InteractionEngine | Presenter / 导航 | Project Health | 导出合同 |
|---|---|---|---|---|---|
| 尝试次数 | 声明 `attempts:number=0`，规则只引用已声明 key；保存重开结构不漂移 | 一次点击把 increment 当作一个同步步骤；后续状态条件读取更新后的值 | 不触发跨页；重播保留，restart 初始化 | 未知 key、错误类型、非有限增量为 error；合法声明无诊断 | HTML/Web 可执行；PDF/PPTX 使用默认值静态捕获并给出互动静态化说明 |
| 检查点门禁 | `checkpointPassed:boolean=false` 与 block-only guard 同时通过 Schema | 互动先设置状态，终端导航再进入统一守卫 | 所有普通入口阻断原因一致；强制路径按矩阵豁免；authored-command 无后备翻页 | 缺失场景、未知 key、自锁目标和可证明不可达场景可定位 | `.h5lesson`/HTML/Web 保留守卫；PDF/PPTX 只捕获默认画面并提示守卫不可交互 |
| 重启与导出 | 默认值、规则和守卫保存重开一致 | restart 清空并重新初始化；authoring/capture 写入无效 | restart 强制进入起始页，重播不清状态 | 非法默认值或 capture 合同缺失阻断验收 | HTML/Web 重启可复现；PDF/PPTX、缩略图和编辑画布使用同一冻结默认快照 |

## 10. 最小内存原型边界

评审阶段允许实现一个不写工程、不接 UI 的纯函数原型，只验证：

- 声明初始化和 restart；
- 严格类型比较；
- number 原子递增；
- 声明式 block-only 守卫；
- 普通导航与强制路径矩阵。

原型不得导出为生产 API，不得加入 Project Schema，不得让现有工程保存新字段。原型通过只证明语义可闭合，不代表协议获批。

当前评审原型位于 `tests/prototypes/declarativeCourseStatePrototype.ts`，验证入口为 `tests/unit/declarativeCourseStatePrototype.test.ts`。它已经覆盖 attempts 原子递增、检查点入口矩阵、restart 默认值、authoring/capture 冻结、未知 key、类型不匹配与非有限数拒绝；仍没有被任何生产模块导入，也没有改变 Project V8。

## 11. 待人类批准的决定

只有以下项目得到明确结论后才能进入实现：

1. Project V9，还是签署 V8 未冻结并允许扩张；
2. capture 是否按本 RFC 冻结为默认状态快照；
3. 声明式守卫是否只允许阻断、不允许重定向；
4. Runtime 重定向后的声明式守卫重检是否接受；
5. key 命名、数量和保留命名空间上限；
6. PDF/PPTX 的静态化提示文案；
7. 三个评审夹具是否足以代表首版真实教学需要。

在这些决定完成前，本 RFC 的评审结论是：**方向可行，协议未获批准，停止在设计与内存原型阶段。**
