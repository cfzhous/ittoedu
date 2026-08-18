# Opus 研判：W2 HTML 互动课件问题与 Skill 重构方案

- 日期：2026-08-13
- 作者：Claude Opus 5（AI 研判，非人类审批，不具备任何批准效力）
- 回应对象：[docs/reviews/W2_HTML_COURSEWARE_PROBLEM_STATEMENT_20260813.md](docs/reviews/W2_HTML_COURSEWARE_PROBLEM_STATEMENT_20260813.md)
- 范围：诊断、根因分层、优先级、最小充分门禁、待决策项。除本文件外未修改任何代码或 Skill 文件
- 调研基础：两份 Skill 全文（SKILL.md、references、scripts、case-templates）、`src/player/`、`src/shared/`、`src/renderer/` 相关源码、两个 W2 课例的 `.h5lesson` 解包内容与 `implementation/` 全部脚本、四个 python 校验器、`package.json` 与 `.github/workflows`

---

## 0. 本文与其他研判的差异

本文的每一条根因都经过独立复核，并**推翻了问题说明中的两条前提**、**修正了三条广为引用的判断**。差异点集中在：

- 问题说明把"控制器不可见"归因于 z 序遮挡。**实测根因是 `playback.controls` 的全局静音语义**，z 序是第二独立故障，只在满幅 runtime 下显形。
- 问题说明称"E2E 直接切状态冒充"。**实测该指控在语文上不成立**（帧由真实按钮点击产生），成立于数学。语文的失真是另一种、更难查的形态。
- 问题说明背景材料称 `presentation.states=[]`。**实测两工程各有 14 个 state**，真正问题是 `nodeOverrides` 全为空对象。按前者写的门禁永不触发。

---

## 一、总体判断

问题说明的事实全部复核为真，五层分配的方向正确，但**分层粒度不足**：它把 3.1（控制器不可见）与 3.2（过度 Runtime 化）当成两个独立问题。实际上教师控制失效是**四条独立故障串联**，每条单独都足以致命，四条全通才有可用的教师控制。两个 W2 课例四条全断。

四条故障：

1. **API 陷阱**。`createProject.ts:176` 的 `controls: includeDefaultController ? 'canvas' : 'none'`。作者要自建控制器必须传 `false`，代价是静默拿到 `controls: 'none'`。这是 API 设计缺陷，不是课例失误。
2. **全局静音开关**。`renderTeacherController.ts:195-201` 的 `controllerVisible()` 在非 capture 分支直接返回 `canvasControlsEnabled`，不看节点是否存在、是否 `visible`。
3. **合成平面上限**。Phaser canvas 固定 DOM `z=2`，scene runtime DOM overlay 固定 `z=3`。`PlayerScene.ts:1119-1130` 的 `globalOverlayRoot` depth 40000 只在画布内部排序，无法跨越 DOM 堆叠上下文。
4. **无障碍镜像自我阉割**。`renderTeacherController.ts:615-642` 为每个按钮建了真实 `<button>` 并挂 `onclick → invokeControllerAction`，却在 `:620` 硬设 `pointerEvents: 'none'`，且在 `:581-582` 同受 `controllerVisible()` 门控。本可以是天然逃生控制平面，能力被关掉。

更深一层的结构性根因是**契约层完全没有"答案"这个概念**。`projectSchema` / `interactionSchema` / `runtimeSchema` 里没有任何字段承载"题目、作答、判据、判定结果"。`INTERACTION_CONDITION_TYPES` 只有两个成员：

```
'presentation.in', 'scene.in'
```

两者都只能读"当前在哪个状态/场景"，无法读 `courseState`、无法比较值。`ctx.emit` 的 payload 在 `InteractionEngine.ts:128-131` 被丢弃，唯一通道是把结论编进事件名。`state:change` 在 `CourseRuntimeKernel.ts:63` 与 `RuntimeHost.ts:213` 两处 emit、**零处订阅**。

结论：凡"判答案 → 改状态 → 决定能否推进"的逻辑，在当前产品里**没有任何声明式落点**，只能整体塞进单个 runtime source。Builder 把全幕做成全屏 Runtime 不是审美失误，是被迫的唯一解。这是本文与"Builder 载体品味有问题"这类判断的根本分歧。

---

## 二、根因分配

### 教学合同

**判定权威冲突（决定性缺陷，已锚定到行）。** `01-courseware-contract.md:46` 写 `FORM-002` 由学生"**口头或书面**补全"；`02-presentation-script.md:109` 把同一项写成"三次检验与 `FORM-002` 全对 → 解释一行后**解锁下一场景**"。同一个 `CNT-002`，合同的判定权威是教师课堂观察，脚本变成机器硬门禁。**数学死锁的源头在这里，不是 Builder 独创。**

**采集通道字段缺失。** 合同/脚本/content 三层模板都没有字段声明某响应单元是 (a) 页面必须采集的结构化答案、(b) 教师口头抽查、(c) 纸笔完成页面只负责揭示、(d) 仅供讨论的开放表达。数学 `CNT-001` 把"重新提交完整四空"与"口头或书面说出"写在同一句里，Builder 只能猜，于是把全部页面项都实现为页面判题。

**"可接受答案与不接受边界"三类语义混装。** 同一个 Markdown 列表里同时有可枚举等价类（"−4 可写 -4"）、自由文本语义判断（"必须提到 Δ 的符号"、"循环论证"）、行为轨迹判断（"只在看图后填写而没有首次预测记录"）。Builder 拿到的是散文，无法区分哪些能做判等表、哪些必须交给教师。

**容量论证是分钟加法。** 合同提到的分钟数为 `15 / 2 / 6 / 4 / 3 / 15 / 15`，用 `2+6+4+3=15` 收口。而 runtime 实测 **28 个输入槽**（`axisY, equation, roots, points, p0..p2, r0..r2, d0..d2, visited, judge1..3, fix2, fix3, parameter, point, reason` 等），对首答时间、一次重试、教师讨论零预算。语文三套时间数字互不对账（合同 STG `2/6/4/3`、脚本 SCN `2/6/4/3`、content CNT `8/4/3`），`CNT-001` 的 8 分钟横跨 STG-001+STG-002 恰好等于 2+6 属巧合。

### 呈现脚本

**6 处 `CP-*` 要求单机产品做不到的班级聚合。** `02-presentation-script.md:65` "显示已提交/未提交/需复查**人数**与常见错误类型"、`:125` "按三行显示预测**分布**、错误类型和未提交数"、`:183`、`:243` 同类。制品没有任何"产品能力前提"字段来声明依赖，也没有降级方案，Builder 只能默默丢弃。

**`CP-*` 无 ID 规范。** 不在 `artifact-contracts.md:99` 的稳定 ID 白名单内，也不被 `validate_case.py` 的 `ids()` 检查。数学用了 9 次并在 line 18 正式定义，语文一次都没用。

**秒级计时与工程不变量直接冲突。** 数学脚本要求四处秒级计时（35/60/75/20 秒，含"75 秒时提示还剩约 45 秒"这种必须由页面计时器实现的行为），而 dev-plan 的工程不变量写的是"无计时器"。没有字段标注这些秒数属教师口头掌控还是页面能力。

**教师控制器与逃生口未进模板。** 两个课例的合同/脚本/content 中"控制器"一词命中 **0 次**。"教师检查点/控制"字段的填写指引只有"没有时明确写『无』"。数学四幕都写了"教师可带着未完成继续"，语文 SCN-003/004 没有——同一 Skill 下两个课例对同一风险处理不一致且都通过校验，是规则缺失而非作者疏忽。

### Builder

三条是主动选择，不能归给上游：

**推进控件以判题结果为渲染条件。** `runtime-source.ts:101,128` 的 `${stable?button('next',c('nextLabel'))...}`。上游脚本从未要求这样，脚本明确写了"教师可暂停、揭示、重置、带未完成继续"。

**批量注册共用全屏 bounds。** 语文 `build.ts:343`：

```js
Object.keys(ctx.content.all()).forEach(function(key){
  ctx.authoring&&ctx.authoring.register({kind:'text',key:key,...,
    getBounds:function(){return{x:42,y:16,width:1196,height:688}}})})
```

全课只有 4 个 `getBounds` 调用点、4 个不同矩形，却申报 54 个 `visible`。这不是判断分歧，是循环产生的系统性误报。

**capture 模式预填范文。** 语文 `build.ts:366`：

```js
prepareCapture:function(){if(ctx.mode==='capture'&&ctx.presentation.current()==='state_014_stable'&&!draft)draft=t('modelAnswer');render()}
```

满足 `requiredFrames` 的 `stable-result` 证据帧是机器预填出来的。配合 `:341` 硬编码写 `'冯虚御风'` 进 `courseState`、`:365` 的 `good` 按钮一键填范文——**证据链是结构性伪造，不是覆盖不足**。

**可静态判定的退化指标。** 数学 4 幕 runtime source 的 **sha256 完全相同**（`5c315872f59f`，26547 字节），靠 `runtimeSceneId` 分支。工程退化成"4 个空容器 + 1 份多分支大 JS"。这比统计 Runtime 比例更准且零成本。

**第二个独立失败点。** 数学控制器 `defaultCollapsed: true`，即便修好 `controls` 也以收起态启动，首屏只剩一个"展"小圆钮。

### Editor / Player

**`playback.controls` 是全局静音开关，且否决极彻底。** `controllerVisible()=false` 触发三重关停：容器 `setVisible(false)`（`:217`）、全部热区 `input.enabled=false`（`:556, :692-698, :750`）、无障碍 DOM 整组 `hidden`（`:581-582`）。`beginGesture` 在 `:323-328` 直接 return。工程数据自相矛盾时 Player **静默服从，不报错、不降级、不留痕**。

**场景目录在交付态是死代码。** `ScenePickerOverlay` 全仓唯一打开来源是控制器的 `scene.open-picker`（`renderTeacherController.ts:134` 是唯一 emit 点）。控制器一关停，教师失去跨场景跳转——最关键的逃生能力。

**遮挡是纯视觉遮挡，不是指针吞噬。** runtime DOM 层三级 `pointer-events: none`（`PlayerApp.ts:81`、`RuntimeHost.ts:150,155,162`）。语文靠 `.actions button{pointer-events:auto}` 单点开启。这一区分决定了门禁写法：视觉与功能不可互推，必须双测。

**键盘兜底事实上是活的，但完全不可发现。** `PlayerPresenterInput` 全文**零处**引用 `controls`，构造条件只看 `options.controls !== false` 与 `keyboardNavigation || presenter.enabled`。两个课例二者皆真，且两个交付导出器都不传 `controls`，所以方向键/PageUp/PageDown 在 `controls:'none'` 下仍能翻场景。两个课例都未注册导航守卫，跨场景不会被 block——**死锁只存在于 runtime 幕内 state 机**。但画面上没有任何入口告知教师，体验上等价于没有。

补充一条：`PlayerPresenterInput.ts:66-86,186` 的 `isKeyboardOwnedTarget` 在焦点落在 INPUT/TEXTAREA/SELECT 时吞掉方向键，而这些幕正是把焦点放在答题框里。唯一活路是点空白失焦再按方向键。

**编辑器自愈逻辑保留坏状态。** `editorStore.ts:3008-3021` 的 `ensureTeacherController()` 命中既有控制器时只做选中定位，只有新增分支（`:3022-3030`）才写 `controls='canvas'`。用户"添加教师控制器"的动作对数学工程无效，坏状态永续。`PropertiesTab.tsx:1732-1735` 选 `'none'` 时也只写 `controls`、不提示已存在控制器将被静默停用。

### 校验与评级

**`engineering candidate` 语义漂移。** 当前只需 `pipelineStatus=passed` + 8 种 artifact kind 齐全 + 帧角色齐全 + 字节变化的 `editRoundTrip`。四项全是结构真实性，与"教师可用"无因果关系。评级体系把"产物是真的"和"产品能用"合并成同一等级。

**`playback.controls` 全仓无校验点。** grep 命中仅 6 处：`PlayerApp.ts:243`、`renderTeacherController.ts:199`、`editorStore.ts:3024`、`PropertiesTab.tsx:1727`、`scripts/verify-release.ts:134`。唯一断言 `controls==='canvas'` 的 `verify-release.ts:130-142` 只跑发布样例工程，不覆盖用户课例。`projectSchema.ts:841-850` 的 `superRefine` 只查 `globalInteractions` 的 ID 重复；`projectHealth.ts:264-309` 的 `checkController` 只查按钮 ID 与 `scene.go` 目标。

**遮挡启发式必然静默。** `exportPreflight.ts:576-615` 的 `controller-interactive-obstruction` 只把控制器 AABB 与"节点"AABB 求交，且交互节点集限定为 `external-component` / 带控件的 video / 被 `node.click` 等规则引用的节点。语文 4 幕 `nodes=[]` 所以集合为空；数学每幕只有 1 个 formula 且 `interactions=0`，formula 不属交互节点集。恰恰在 runtime 化最彻底的工程里启发式永不触发。

**三帧协议只验形式。** `requiredFrames` 只校验 role 枚举、artifact 是 screenshot、字节互不相同。对"这三帧怎么产生"零约束：click 驱动与 `page.evaluate(setPresentationState(...))` 驱动在 manifest 里完全等价。数学 `capture-risk.ts:25,35,44` 正是后者（`goToSceneById` / `setPresentationState`）。

**`editRoundTrips.binding` 不受解析。** 数学两条 binding 用 inventory 的 `BINDING_PATTERNS` 实测**均不匹配**却通过。"编辑闭环覆盖了哪类载体"这个信息在门禁层面等于零。

**`artifact kind` 是开放字符串。** 8 种自定义 kind（`static-project`、`edit-project`、`patched-project`、`edit-html`、`edit-web-package`、`editor-screenshot`、`player-screenshot`、`review-screenshot`）完全绕过格式校验。防伪造门禁可用新造 kind 名绕开。

**`commands[]` 不被解析或复跑。** 数学 manifest 里两条 command 实际是带 SHA-256 说明和"temporary core copy removed after migration"的叙述散文。数学的 e2e spec 以"临时复制进编辑器 `tests/e2e` 执行后删除"的方式运行，不可重跑、不进 CI。

**python 校验器全部未接线。** `npm verify` 与 `.github/workflows` 里没有任何 python 校验器。`validate_formula_markup.py` 在 `.agents/` 下零引用，是"写了但从未接线"的现成失效先例。

**`nodeOverrides` 全空使 Project 状态机成为空壳。** 两课 14/14 全空，状态差异 100% 在 runtime JS 内。编辑器无法逐状态编辑，但没有任何门禁要求 interactive 场景的状态必须有 Project 层差异。`informationRelease.ts:52-67` 的可达性分析只在 `scene.interactions` 上推演（两例均为 0 条），且显式把 runtime 事件当无条件可达，因此 `analyzeInformationRelease` 结构上无法承担逃生口职责。

---

## 三、判题失真的可复现实例

已静态证明的假阳性与假阴性：

| 输入 | 实际结果 | 应有结果 | 成因 |
| --- | --- | --- | --- |
| `roots="20"` | 通过 | 拒绝 | `/0/.test() && /2/.test()` 无锚点 |
| `point="(11,0)"` | 通过 | 拒绝 | `/\(?1,0\)?/` 无锚点 |
| `point="(-1,0)"` | 通过 | 拒绝 | 同上 |
| `reason="判别式"` | 通过 | 拒绝 | 单关键词命中 |
| `"须臾不变清风"`（6 字） | 通过 | 拒绝 | 三组关键词沙拉，无最小长度 |
| `（0，0）` 全角 | 拒绝 | 通过 | 无 NFKC 归一化 |
| `d2="－4"`（U+FF0D） | 拒绝 | 通过 | 只接受 U+2212 与 ASCII |
| `p="2.00"` | 拒绝 | 通过 | 字符串比较无数值规范化 |
| `point="x=1, y=0"` | 拒绝 | 通过 | 只认有序对写法 |
| 39 字同义优秀结论 | 拒绝 | 通过 | 词表外表达 |

这类判据训练的是猜关键词，不是学科思维。

---

## 四、P0（继续创作前必须解决）

按锋利程度与成本排序。

| # | 动作 | 位置 | 成本 |
| --- | --- | --- | --- |
| 1 | schema `superRefine` 加互斥：`globalLayer` 存在 `visible` 的 `teacher-controller` ⇒ `controls` 不得为 `'none'` | `projectSchema.ts:841-850` | 薄 |
| 2 | `projectHealth` 加 error 码 `controller-disabled-by-playback-controls`，给可定位 path 与修复建议 | `projectHealth.ts:264-309` | 薄 |
| 3 | 解耦 `createProject.ts:176`，`controls` 提为独立入参默认 `'canvas'` | `createProject.ts` | 薄 |
| 4 | `ensureTeacherController` 命中既有控制器时也修 `controls`；`PropertiesTab` 选 `'none'` 时若已有可见控制器则警示 | `editorStore.ts:3008-3021`、`PropertiesTab.tsx:1732-1735` | 薄 |
| 5 | Player 兜底逃生控制平面：交付态无条件提供最小教师控制（角落按钮 + 打开场景目录），独立最高 z DOM 层（复用 `presenterStatus` 的 z=40 量级），`pointerEvents:'auto'`，并成为 `SCENE_PICKER_OPEN_EVENT` 的第二发射源 | `PlayerApp.ts:197-236` | 中 |
| 6 | `exportPreflight` 遮挡启发式从"节点 AABB"扩到"该幕存在 `renderMode:'dom'` 的 runtime"这一结构事实 | `exportPreflight.ts:596-615` | 薄 |
| 7 | 禁止 capture 模式写 content / courseState / 输入草稿 | Skill + 校验器 | 中 |
| 8 | 推进控件不得以判题结果为渲染条件（静态扫 `runtime.source` 三元表达式互斥渲染模式） | 校验器 | 中 |
| 9 | 冻结判定权威三档并禁止第四档 | 上游模板 + 校验器 | 中 |

第 1 条是最小最锋利的一刀：直接让两个 W2 工程无法通过加载/保存/导出，从数据层根除自相矛盾态。

第 5 条是**唯一能同时兜住"控制器被关停"与"runtime 满幅遮挡"两种失败**的修法，并顺带解开场景目录只能由控制器打开的死结。

第 6 条的做法要点：**不要对 `runtime.source` 做 CSS 静态分析**。面对内联字符串拼接的 CSS 极易被绕过，这正是 W2 已验证的绕过手法。只用工程结构事实（该幕有没有 DOM runtime），无法被内联样式绕过，且能覆盖 `nodes=[]` 的纯 runtime 工程。

第 9 条的三档定义：

- **A `auto-choice`** —— 有限选项（单选/多选/下拉/排序/配对）。机器判，唯一无争议档。数学 SCN-002 的 `r`/`p` 下拉（`runtime-source.ts:106`）已是正确先例。
- **B `auto-normalized-short`** —— 规范化后短答案（数值、有序对、区间、单个符号表达式）。机器判但必须走统一归一化器且必须声明 tolerance。
- **C `human`** —— 自由文本、修正句、结论写作、理由陈述。机器一律不判对错，只做可提交性检查（非空、字数区间）。**C 档不得作为任何导航条件。**

---

## 五、P1（可并行改进）

1. **共享归一化层** `src/shared/answerNormalization.ts`：NFKC 折叠（一次性解决全角等号、全角减号全部实测假阴性）；统一 Unicode 减号 U+2212/U+FF0D/U+2013 → ASCII `-`；剔除空白；数值走十进制字符串比较 + 显式 tolerance；有序对解析为 `[x,y]` 逐分量比较（同时消掉 `(11,0)` 与 `(-1,0)` 两个假阳性，因为不再用无锚点子串匹配）；集合型答案解析为排序后数值集合比较。
2. **尝试次数兜底**：约定 `courseState` 键 `attempts:<sceneId>:<taskId>`，达到 N 次（建议 3）后无条件呈现示范答案并开放前进。当前两课重试循环无任何计数：数学 `retry` 只做状态回退（`runtime-source.ts:164`），语文出口幕唯一可靠出路是点 `good` 让系统替学生填官方答案——用"抄答案"当逃生门，比死锁更糟。
3. **容量预算行**：合同增加必填一行"页面必答项 N 个（自由文本 F 个）／总时长 D 分钟／每分钟 N/D"，校验器在 `N/D > 1.5` 或 `F > 3` 时报 error。数学 30/15=2.0、F=6 与语文 15/15=1.0、F≥3 都会被拦。
4. **`artifact kind` 收成闭集**，每个登记 kind 指定复用现有格式校验函数。
5. **把 python 校验器接进 `npm verify` 与 CI**，并同步改 `SKILL.md` 脚本清单与 `validate_v8_case.py` 的 `--target implementation` 分支，避免重复 `validate_formula_markup.py` 的失效模式。
6. **`CP-*` 与 `RESP-*` 加入稳定 ID 白名单**并纳入交叉检查。
7. **课例 e2e spec 常驻**：`commands` 从自由文本升级为结构化 `{command, exitCode, specPath?}`，校验 `specPath` 指向文件当前存在且可重跑。

---

## 六、最小充分硬门禁

标注执行层：`static-json` 纯读工程/清单，`e2e` 需真实 Player 交互，`human` 不可自动化。

### 零成本静态（建议扩 `validate_authoring_inventory.py`，不新增脚本）

| # | 门禁 | 立即红 |
| --- | --- | --- |
| 1 | 有 `visible` 的 `teacher-controller` ⇒ `controls==='canvas'` | 数学 |
| 2 | 交付工程控制器 `defaultCollapsed` 必须 false | 数学 |
| 3 | runtime source 跨场景 sha256 去重 | 数学 |
| 4 | `nodeOverrides` 全空率 | 两课 14/14 |
| 5 | 同 scene 内 `visible` 实体 `getBounds` 互不相同 | 语文 |
| 6 | `editRoundTrips.binding` 用 `BINDING_PATTERNS` fullmatch，且至少覆盖一条 `native:*` 与一条 `runtime:*` | 数学 |
| 7 | `artifact kind` 在闭集内 | — |
| 8 | 每个 presentation state 存在不依赖判题结果的前进通道 | 两课 |
| 9 | 有 DOM runtime 的幕 + 画布内可见控制器 ⇒ warning | 语文 |
| 10 | 合同判定权威 ⇔ 脚本导航门禁一致 | 数学 |
| 11 | 脚本要求的能力不超出已声明产品能力（班级聚合需降级方案） | 两课 |

### 必须 e2e（视觉与功能因 `pointer-events` 不可互推，须双测）

| # | 门禁 |
| --- | --- |
| 12 | 逐幕 × 逐状态：控制器 DOM `hidden===false` 且 `boundingBox` 非空 |
| 13 | `document.elementFromPoint(按钮中心)` 返回该按钮或其后代 |
| 14 | 点击后收到预期切幕/切状态事件 |
| 15 | 焦点在输入框内，教师逃生键仍生效 |
| 16 | 交付态无论 `controls` 取值，逃生控制存在且能打开场景目录 |
| 17 | `evidenceMethod: 'real-control' \| 'state-injection'` + `witnessedEvents`：interactive 幕的 feedback 与 stable-result 必须 `real-control` 且 `witnessedEvents` 非空；`pre-interaction` 允许 `state-injection` 作定位 |
| 18 | 动作类型映射：脚本写"圈画"就必须存在可圈画对象 |
| 19 | 答案容错矩阵：每条 auto 档判据 ≥2 个"错但应被拒" + ≥2 个"对但写法不同" |

### human

| # | 门禁 |
| --- | --- |
| 20 | 载体降级必须回上游取明确取舍，不得只在 `differences` 披露后放行 |
| 21 | `accepted` 须具名人类 + 时间 + 证据 + 明确意见 |

第 13 条要用 `document.elementFromPoint`，**不要用 Phaser `hitTestPointer`**：后者验证的是 Phaser 内部输入分发，而遮挡来自 DOM 层，`elementFromPoint` 是唯一能同时看见 canvas 与 DOM overlay 的裁判。全仓库 `elementFromPoint` / `hitTestPointer` 当前零命中。

第 17 条是抓语文失真最便宜的门禁。两个课例已自发在用语义事件（`opening-evidence-complete`、`rebuttal-complete`、`exit-complete`，都带 `sceneId`，经 `RuntimeHost` 统一包装为 `runtime:event`），现成抓手被浪费了。

第 18 条抓的是第 17 条抓不到的形态：语文全课只有 **1 个 `<textarea>`**，脚本 4 幕反复要求实际圈画。点击是真的，但控件本身是预设答案开关。

`vitest` 用 jsdom 无布局引擎（`getBoundingClientRect` 恒 0、`elementFromPoint` 不可用），所以 12–19 无法下沉到 unit 层，必须走 Playwright。现有 e2e 只有 3 个 spec、`workers=1`、`pretest` 需全量构建，是重资产路径——这是接受这批门禁的真实代价。

---

## 七、不建议采用的方案及原因

**扩大正则表 / 加同义词词典。** 假阳性与假阴性同源：`reason="判别式"` 通过靠的就是关键词包含，扩表只会让假阳性更多。

**给开放回答上自动语义判定。** 当前无可靠能力。开放回答只能自检、提示或教师判定，不能成为导航条件。这是产品定位选择，不是技术债。

**不做符号等价 / 不引 CAS。** 三条理由：`formulaLinear.ts` 只有 `parse`/`serialize`，无求值能力（grep 无 `evaluate`/`compute`），做等价等于从零造代数引擎；本次全部判据失败的原因**都是字符串比较缺陷，没有一条真正需要符号等价**；引入后判据对教师不可解释，与"教师可逐对象修改"的产品方向相悖。止步于"规范形等价"。

**硬性 Runtime / 原生比例配额。** 数学名义 hybrid、实际每幕只有一个原生公式，配额只会催生凑数原生节点。应按**内容类别**门禁：稳定题面、正文、标签、教师提示、反馈文案必须原生可定位；复杂动态图象与连续交互允许 Runtime 整体拥有。

**用 Phaser `hitTestPointer` 做遮挡裁判。** 理由见门禁第 13 条。

**对 `runtime.source` 做 CSS 静态分析来判满幅遮挡。** 内联字符串拼接的 CSS 极易绕过，是 W2 已验证的绕过手法。改用工程结构事实。

**写"`presentation.states` 为空"式门禁。** 实测两工程各有 14 个带 `id`/`name`/`description` 的 state，真正问题是 `nodeOverrides` 全为空对象。按前者写的门禁永不触发。

**把控制器迁到独立 DOM 平面与本次根因修复捆绑。** 迁移代价是重写 `renderTeacherController` 整个绘制层（Phaser graphics/text/zone → DOM，共 901 行），并牵动 capture 路径（`includeInStaticExports`、`playerCapture` 对 `.lesson-runtime-layer` 的选择器假设）。正确顺序是先用 P0 第 5 条的薄兜底解除产品阻断，再单独排期评估迁移。不要让一个重构阻塞四条一行改动。

**只在 Skill 里加规则条文。** 上文 21 条门禁中 11 条是纯静态可执行校验，不是散文。

---

## 八、对问题说明第 8 节八问的直接回答

1. **根因分层是否准确？** 方向准确，粒度不足。遗漏的更底层问题是契约层没有"答案"概念、`INTERACTION_CONDITION_TYPES` 只有两个成员、`state:change` 零订阅——这三条共同决定了判题必然溢出到 runtime JS 黑盒。
2. **`TeacherControllerNode` 该留在 Phaser 还是独立 DOM 平面？** 更薄且稳定的办法是第三条路：留在 Phaser，另加一个独立最高 z 的兜底逃生控制平面（P0 第 5 条）。迁移是正确的长期方向，但不应与本次修复捆绑。
3. **Runtime 与原生的最小编辑性边界？** 不要硬比例，按内容类别门禁。可机检的下限是：`getBounds` 唯一性 + runtime source 跨场景去重 + `nodeOverrides` 非全空。
4. **开放表达的判定模型？** 三档封闭枚举（A/B/C），C 档一律不判对错、不作导航条件。数学等价止步于规范形。
5. **如何发现"脚本要圈画、成品只是按钮"？** 两条并用：`evidenceMethod` + `witnessedEvents`（抓状态注入）、动作类型映射（抓控件类型替换）。单用任一条都有盲区。
6. **如何建立不厚重的容量预算？** 合同一行 `N/D`，校验器计数比对 `page-structured` 通道的 `RESP-*` 行数，阈值 `N/D ≤ 1.5`、`F ≤ 3`。
7. **`engineering candidate` 的最低 HTML 行为证据？** 门禁 1–19 全绿。留给人类的是：教学有效性、视觉品质、课堂节奏真实性、载体降级取舍（门禁 20–21）。
8. **哪些必须先修编辑器产品？** P0 第 1–6 条必须动产品代码（`projectSchema`、`projectHealth`、`createProject`、`editorStore`、`PropertiesTab`、`PlayerApp`、`exportPreflight`）。第 7–9 条与全部 P1 可由 Builder + 校验器解决。

---

## 九、仍需补充的证据或待决策项

### 需人类决策

1. **`INTERACTION_CONDITION_TYPES` 是否扩展。** 最薄方案是加单一条件类型 `state.equals { key, value, normalize? }` 读 `courseState`，需同步四处：`interactionTypes.ts:25-28` 枚举、`:74-82` 联合类型（`AssertExactly` 会强制编译期一致）、`interactionSchema.ts:103-106` union、`InteractionEngine.ts:147-158` `matchesCondition`（需注入 courseState）。这是唯一影响"改产品 vs 只改 skill"范围的决策。不扩也能活，但判题永远留在 runtime 私有 JS，门禁只能事后检测死锁而无法预防。
2. **`03-development-plan.md` 的归属。** 当前既不在 `ARTIFACT_SPECS` 四键内、不参与 review scope hash、也不被任何校验器读取。而数学 dev-plan 第 13 行是**唯一**提到"教师导航由全局原生 TeacherControllerNode 承担"的文档。纳管（进 `ARTIFACT_SPECS` 并参与 hash）或禁止（内容回流脚本）二选一，保留现状等于保留盲区。
3. **两个 W2 课例的处置。** 建议保留为失败样本：上文 11 条静态门禁中有 6 条能让它们立即红，是天然回归素材。

### 仍缺的证据

- 门禁 12–19 的真实 e2e 成本未实测。现有 3 个 spec、`workers=1`、`pretest` 全量构建，新增逐幕逐状态遍历的运行时长需要实测后才能判断是否可进 `verify`。
- 兜底逃生控制平面（P0 第 5 条）与 capture 路径的交互未验证：`includeInStaticExports: false` 的语义是否应扩展到新平面，需要在实现时确认静态导出不被污染。
- 班级聚合能力（6 处 `CP-*`）的产品方向未定。本文只建议加"产品能力前提"字段拦住无根据假设，未评估是否应实现多端聚合。

---

## 十、处置建议

同意问题说明第 10 节。补充三条：

- P0 第 1–4 条互不依赖且都是薄改动，可先落地，不必等 `state.equals` 的决定。
- 新增校验器必须同时改 `SKILL.md` 脚本清单 + `validate_v8_case.py` + `package.json`，否则重复 `validate_formula_markup.py` 的"写了没挂上"。
- 新门禁挂在 `--target implementation` 而非 `evidence` 分支，让问题在出证据前就红。
