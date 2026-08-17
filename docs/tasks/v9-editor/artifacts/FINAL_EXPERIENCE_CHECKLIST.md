# 最终体验检查清单（T11 冻结，供 T12 填写）

> 冻结日期：2026-08-17
> 工作树：`output/worktrees/v9-parity-reconstruction`
> 恢复基线：`e2e34aa29ddb72abb2c691e414a4d8f461f35b2c`
> 产品入口：`ProductApp.tsx` → `App.tsx`（`CourseStudioApp` 不是正式前端）
> 当前工程状态：T12 已填；机器 Gate 支持 `engineering candidate`；未达 `art candidate` / `accepted`

对照根总纲 §10.3 / §10.4 / §11。每项由 T12 在真实 Electron/浏览器中执行并留下截图或录像。自动化最多证明 `engineering candidate`。

**不得把下列内容勾成现有能力：** Focusky 级镜头化演示、可见 AI（复制引用 / 应用 Patch / 聊天 / 模型 / Provider）、自动结构编辑、持久化 `projectMode`。

## 0. 源码事实与已知缺口（T12 不得当意外）

下列以当前源码为准，不是美化后的完成态。

| 事实 | 源码依据 | T12 期望 |
|---|---|---|
| 默认新建/打开/保存只走 Course Project V9 | `TopToolbar` 三类空白；`saveCourseProjectAsync`；`openCourseProjectArchiveAsync` | 必须成立 |
| V8 只走「导入旧版工程」，并展示 report | `App.handleImportLegacy` → `importProjectV8ArchiveAsCourseProjectAsync` | 必须成立 |
| 恢复拒绝把 schemaVersion=8 当默认打开 | `App` 恢复分支抛「请使用导入旧版工程」 | 必须成立 |
| 四态左栏固定「共享内容 → 全局层（全课）」 | `ScenePanel.SharedContentSection` + `courseEditorLayout`；不写 `projectMode` | 必须成立 |
| 顶栏/左栏均可直接建 Slide / Flow / Spatial | `onNewBlank` + `AddContentMenu` | 必须成立 |
| 右键/键盘走同一 T02 路由 | `App` 挂 `EditorContextMenu`；`routeEditorAction` | 必须成立 |
| Slide 多选 Delete / 剪贴板有命令 | `executeSlideEditorAction` | 必须成立 |
| Flow **copy/duplicate/delete/cut/paste** 有命令 | `executeFlowEditorAction` 有 `cut`/`paste` case；`editorStore` 传入并回写 `flowActionClipboard` | 必须实机验证剪切/粘贴；不得凭源码勾通过 |
| 全局层 **paste 已接线**；非拖放层级移动仍拒绝 | store global adapter 调 `pasteGlobalLayerItems`；`move-forward` / `move-backward` / `bring-front` / `send-back` 仍返回「全局层层级请在图层列表中拖放调整」 | paste 待 T12 实机；非拖放仍 **记失败，owner T06** |
| `replaceCourseComponentPackage` **已接线** | V9 `courseSession !== null` 时 `App.tsx` 调 store `replaceCourseComponentPackage`；`editorStore` 转发 `courseComponentPackage` 命令 | 必须实机验证替换/更新；不得凭源码勾通过；不要造第二套替换 |
| `addCourseRuntimeLayer` **不存在**；V9 开发页不造假创建按钮 | `V9DeveloperTab` 空态只有同场景限制说明，无「创建运行时模板」 | **记缺口，owner T05/T09A**；V8 路径仍有创建按钮，不是默认 V9 |
| 正式 App **无**「复制 AI 稳定引用 / 应用 AI Patch」 | `App.tsx` 无这些入口；本工作树无 `courseAiHandoff.ts` / `courseAiPatch.ts` | 必须保持未挂载 |
| Workspace 残留「AI 引用」仅在 `!slideAuthoring`（旧 V8 画布） | `Workspace.tsx` `copyAiReferenceFor` | V9 Slide 注入路径应看不到；若看到则记回归 |
| `CourseStudioApp` 仍有可见 AI 按钮 | 非正式入口，T12 不得当产品表面 | 不得验收为现有能力 |
| 磁盘 CLI `current:course-selection` / `patch:course-project` 存在 | `package.json`；正式 App 未 `publishCurrentCourseSelection` | 不是教师可见工作流 |
| V9 公式双击仍可能落到 `FormulaEditDialog` + `updateNode` | `Workspace.tsx`；T10 风险 | 对照 T05 文字会话；分叉则 owner T05/T10 |
| 关闭脏工程 IPC 有保存 / 不保存 / 取消 | `createWindow.ts` `confirmClose` 三按钮；`App` `onRequestSaveAndClose` 调 `handleSave`。不存在 `resolveCloseDirtyState` 符号 | 必须实机验证关窗三选；不得凭源码勾通过 |
| Slide 命令层仍保留 `全局层暂不能调整顺序` 抛错 | `v9SlideVerticalSlice.ts`；排序应走 T06 `applyEffectiveLayerReorder` | 若教师仍看到此句，owner T05/T10 |
| 三视口空白四态已截图并对照五张 `V9_EDITOR_UI_*` 图 | `artifacts/experience/*-{1280,1366,1920}*.png`；Slide preservation 0 mismatch | EX-11 记受阻：Slide 紧凑栏缺「共享内容 / 全课」；非像素合同 |

---

## 记录模板

每项都用同一组字段。T12 填写「截图/录像」「结果」；不要删字段。

```md
### EX-xx 标题
- 工程/样例：
- 步骤：
- 预期：
- 自动化证据：
- 截图/录像：
- 结果：未执行
- 问题 owner：
```

结果只允许：`通过` / `失败` / `受阻（已知缺口）` / `未执行`。已知缺口打「受阻」并引用 §0，不要改预期来换绿灯。

---

## 1. 总纲 §10.3 十个交互场景

### EX-01 Slide 多选 → 右键复制 → 粘贴 → Delete → Undo/Redo → 保存重开

- 工程/样例：顶栏「新建 → 空白演示」；或 `examples/course-project-v9` 的 `parabola-lab`（二次函数参数实验）打开后另存副本
- 步骤：
  1. 新建空白演示，插入至少两个可多选 Native 元素。
  2. 框选或 Shift 多选 → 右键「复制」→ 点击空白 → 右键「粘贴」。
  3. 保持多选按 Delete；再 Undo、Redo。
  4. 保存、关闭、重开，确认粘贴项仍在且 ID 未与原项冲突。
- 预期：一次多选一次 history；粘贴生成新稳定 `layerItemId` / `authoringAddress`；Delete 后可撤销；保存重开一致。文字焦点内 Delete 不得删元素。
- 自动化证据：`tests/unit/v9SlideVerticalSlice.test.ts`（多选一次 revision、paste 新 ID）；`tests/unit/editorActionRouting.test.ts`；`tests/unit/editorContextMenu.test.tsx`。E2E 覆盖移动/Undo/Redo/保存重开与键盘 Duplicate/Delete，**未**跑多选右键复制粘贴。
- 截图/录像：无该完整路径录像；Slide 壳层见 `artifacts/experience/slide-1366x768.png`
- 结果：未执行
- 问题 owner：失败归 T05（命令）/ T10（入口）；清单本身归 T12

### EX-02 画布双击文字 → IME 输入 → 点击空白 → 保存重开 → Player 对比

- 工程/样例：空白演示；或 `parabola-lab` 标题页
- 步骤：
  1. 双击画布文字，用中文 IME 输入，不要在 composing 时按 Enter。
  2. 点击画布空白提交；再选中同一文字，确认内容仍在。
  3. 保存关闭重开；顶栏试运行 / 发布 Player 对照同一字符串。
- 预期：提交键为 `authoringAddress + revision + generation`；IME composing 不误提交；切 scene/state/scope 后陈旧回调失败。Player 与编辑态一致。不得出现「双击后点空白内容丢失」。
- 自动化证据：`tests/unit/v9SlideVerticalSlice.test.ts`；`tests/unit/workspaceSlideAuthoring.test.ts`。无实机 IME。
- 截图/录像：无 IME 录像
- 结果：未执行
- 问题 owner：T05 / T10；Player 不一致归 T09

### EX-03 图层拖拽排序、上/下移、锁定、隐藏、重命名、长名称和长列表

- 工程/样例：空白演示，手动造 20+ 图层，其中至少 3 个名称超过 40 字
- 步骤：
  1. 右栏有效图层：拖拽排序、上/下移、锁定、隐藏、F2 重命名。
  2. 1366 宽窗口看长名称是否单行 ellipsis，是否被挤成竖排。
  3. 跨 owner（全课 ↔ 本页）拖拽：应拒绝并说明，列表不得本地假排序。
  4. 锁定项可点选查看；除解锁外写操作给出原因。
- 预期：紧凑单行（约 32px）；来源标签为全课/当前内容/本页/当前状态等；owner 内排序一次 history。不得再出现「声音暂不能管理」式的图层完成态。
- 自动化证据：`tests/unit/effectiveLayerList.test.tsx`；`tests/unit/effectiveLayerCommands.test.ts`。E2E `authors V9 scenes and presentation states` 覆盖锁定/隐藏/重命名/状态隐藏。无 20+ 长列表实机。全局非拖放上/下移仍拒绝。
- 截图/录像：`artifacts/experience/slide-1366x768.png`（图层行含锁定/隐藏/删除）
- 结果：受阻（已知缺口）
- 问题 owner：T04 / T06 / T10。全局 scope 非拖放上/下移见 §0，仍记「受阻」

### EX-04 global / surface / scene / state 四种来源的选择、属性、删除/隐藏和跨页影响

- 工程/样例：空白演示 + 左栏「新增内容」再加一页 Slide；或含全局控制器的已有 V9 工程
- 步骤：
  1. 左栏进入「共享内容 → 全局层（全课）」，选择全局项，改属性、隐藏/删除（看影响提示）。
  2. 退出全局层，确认 active location 与 history 未因「进入/退出」改变。
  3. 在本页 scene 层与命名 state override 上分别选择、隐藏；切到另一 location 看全局项是否仍在、本页项是否不串页。
  4. surface 共享项只影响对应 surface。
- 预期：四种 ownership 语义可区分；删除全局项前有影响说明；默认教师控制器删除后右栏有「恢复教师控制器」（不是「定位控制器」）。选择全局层不 dirty、不升 revision。
- 自动化证据：`tests/e2e/v9GlobalControllerAndHealth.spec.ts`（进入全局层、选择控制器不 dirty）；`tests/e2e/v9SurfaceScope.spec.ts`；`tests/e2e/v9SlideVerticalSlice.spec.ts`（scene/state 隐藏）。单元：`globalLayerCommands` / `effectiveLayerCommands` / `editorStoreV9Ownership`。
- 截图/录像：`artifacts/experience/slide-1366x768.png`（全局层入口 + 全课教师控制器）
- 结果：未执行
- 问题 owner：T06 / T10。E2E 只覆盖分片纵切，未按本项做四源删除/影响提示/跨页矩阵；全局 paste 未实机；非拖放层级移动见 §0

### EX-05 控制器八方向 resize、zoom/pan 后选择框、属性折叠与真实 Player 折叠

- 工程/样例：空白演示（默认全局教师控制器）；再各建空白流式、空白无限画布各测一次投射
- 步骤：
  1. 选中控制器，用 n/ne/e/se/s/sw/w/nw 八向手柄拖缩；确认边缘与手柄同向。
  2. 画布 zoom/pan 后选择框仍套住内容框。
  3. 属性栏折叠；顶栏试运行折叠；发布 Player 折叠。三者读同一 V9 配置。
  4. Spatial：控制器在 viewport 层，不随 world 缩放。
  5. 控制台动作只有：上一场景、下一场景、场景目录、重播、声音、全屏；收起是 chrome。无「定位」「试运行」按钮。
- 预期：pointermove 预览、pointerup 一次 history。T10 仍可能用 Phaser 本地 overlay 做 move 预览，但 pointerup 应走 `commitGlobalControllerTransform`。
- 自动化证据：E2E 覆盖控制器选择、缩放后拖移、Undo/Redo、保存重开；单元覆盖布局/一致性。无八向手柄拖缩录像。
- 截图/录像：`artifacts/experience/slide-1366x768.png`（画布内教师控制台）
- 结果：未执行
- 问题 owner：T06 / T09 / T10

### EX-06 声音导入、试听、改名、互动引用、被引用删除保护、发布播放

- 工程/样例：空白演示；准备本地短 wav/mp3
- 步骤：
  1. 元素/媒体面板导入声音（`onImportAudio` → `importCourseSounds`）。
  2. 试听、重命名、改全局音量/静音/声道。
  3. 做一条引用该声音的互动；再尝试删除声音，应列出引用并阻止。
  4. 保存重开后库非空；试运行与发布 HTML 能播放。
- 预期：写入 Course Project `media.audio.sounds` 与同一 asset 字节。入口不得显示「声音与媒体素材库暂不能从此面板管理」。
- 自动化证据：`tests/unit/mediaTab.test.tsx`；`tests/unit/assetTransactions.test.ts`。无真实扬声器验收，无导入 E2E。
- 截图/录像：无
- 结果：未执行
- 问题 owner：T06 / T09B / T09

### EX-07 从空白分别创建纯 Flow 和纯 Spatial，不使用导入完成编辑与发布

- 工程/样例：顶栏「新建 → 空白流式」「新建 → 空白无限画布」；不要用 V8 导入，不要用课例包当唯一路径
- 步骤：
  1. 空白流式：加标题/段落，就地编辑，左栏只见页面父 + 标题/章节子；普通段落不进课程树。
  2. 试运行看贴边三角目录；导出 HTML / 需要时 DOCX。
  3. 空白无限画布：放世界元素，加镜头/路径/关系，适配视图，试运行。
  4. 两份工程分别保存重开后再发布。
- 预期：不依赖外部导入即可得到可发布课件。Flow 粘贴/剪切源码已闭合，待 T12 实机；duplicate/delete/缩进应可用。
- 自动化证据：顶栏 `new-blank-flow` / `new-blank-spatial` 实机创建了空白壳层；E2E 打开的是预制归档。未从这两份空白完成就地编辑、试运行与导出。
- 截图/录像：`artifacts/experience/flow-*.png`、`artifacts/experience/spatial-*.png`（仅空白创建，非发布）
- 结果：未执行
- 问题 owner：T03 / T07 / T08 / T10

### EX-08 Mixed 中连续切换三类 location，确认 selection、快捷键和属性不串页

- 工程/样例：任一纯工程上用「新增内容」连续加入另外两类页面；或自建 Slide+Flow+Spatial
- 步骤：
  1. 在 Slide 多选元素，切到 Flow，确认选择/右键/Delete 变成 Flow 语义。
  2. 再切 Spatial，确认不残留上页 hover/draft；快捷键不误删上一 surface。
  3. 课程目录、上一/下一、进度按可导航 locations 顺序（Flow 普通段落 location 不进目录）。
  4. Mixed 切走 Spatial 后，document 拖动不得继续改已挂起相机。
- 预期：无持久化 mode；layout 由 locations/surfaces 重算。切 location 前提交/取消当前事务。
- 自动化证据：实机「新增内容」连续加入 Flow/Spatial 后课程树同时出现三类父节点。单元覆盖 layout / 导航 / Spatial suspend。未连续点选三类并验证快捷键不串页。
- 截图/录像：`artifacts/experience/mixed-1366x768.png`（场景 1 / 流式讲义 2 / 空间探索 3）
- 结果：未执行
- 问题 owner：T03 / T10 / T09

### EX-09 Spatial 相机帧、路径、关系删除后的引用与 Player

- 工程/样例：EX-07 的空白无限画布，补至少 2 个镜头、1 条路径、1 条关系
- 步骤：
  1. 删除被路径/关系引用的世界元素或镜头，确认引用被级联清理或给出原因。
  2. 选择全局层不得因此新建 camera / world item。
  3. 保存重开；Player 镜头/路径/关系与作者数据一致。
- 预期：无限画布 world/viewport 坐标分离；手柄尺寸不随 zoom 缩小。不是 Focusky 级时间线。
- 自动化证据：E2E `authors one Spatial world text` 覆盖镜头缩放/平移/保存。单元覆盖 path/relation。无删除引用的实机路径。
- 截图/录像：`artifacts/experience/spatial-1366x768.png`
- 结果：未执行
- 问题 owner：T08 / T09

### EX-10 Flow block 层级、排序、Delete、右键和打印/PDF

- 工程/样例：EX-07 空白流式，造多级标题 + 列表 + 一段长文
- 步骤：
  1. 右键/键盘：前方/后方插入、上/下移、缩进/取消缩进、删除、重复。
  2. 多选删除后检查 locations / 导航守卫 / 互动引用。
  3. 导出打印/PDF 或语义分页 HTML；DOCX 按语义块而不是长截图。多份同名 Flow DOCX 文件名去重。
  4. 尝试 Ctrl+X / Ctrl+V：源码已有 `cut`/`paste` case 且 store 传入 `flowActionClipboard`；源码已闭合，待 T12 实机。不要凭源码勾通过。
- 预期：结构动作一次 history。运行态 TOC 不写入工程。粘贴/剪切源码已闭合，待 T12 实机。
- 自动化证据：单元 `flowEditorCommands` 含 cut/paste；导出单元覆盖 DOCX/打印。实机只见到块工具条（删除/复制/上移/下移/层级），未跑 Ctrl+X/V 与 PDF。
- 截图/录像：`artifacts/experience/flow-1366x768.png`
- 结果：未执行
- 问题 owner：结构 T07；导出 T09

---

## 2. 补充场景（总纲要求 + T11 必补）

### EX-11 四态 × 三视口对照参考图

- 工程/样例：同一 Mixed 工程（三类 location 都有）分别切到纯观感不够时，再用三个空白工程补纯态
- 步骤：在 **1280×720、1366×768、1920×1080** 下分别打开纯 Slide、纯 Flow、纯 Spatial、Mixed。对照根目录 `V9_EDITOR_UI_SLIDE_REFERENCE.png`、`V9_EDITOR_UI_FLOW_REFERENCE.png`、`V9_EDITOR_UI_SPATIAL_REFERENCE.png`、`V9_EDITOR_UI_MIXED_REFERENCE.png`、`V9_EDITOR_UI_SWITCHING_LOGIC.png` 与 `V9_EDITOR_UI_DESIGN_SPEC.md`。
- 预期：每视口检查壳层几何、右侧三标签、长图层列表、控制器选择框、Flow 长文、Spatial zoom chrome、浮层菜单不越界。左栏均先「共享内容 → 全局层（全课）」再页面树。纯 Slide 紧凑缩略；Flow 页面—标题；Spatial 页面—镜头；Mixed 统一课程树。
- 自动化证据：Slide 三视口 preservation 0 mismatch（V8-family 壳层，不是参考图像素合同）。T12 已截四态×三视口。对照五张参考图：**partial**——分区骨架在，但纯 Slide 紧凑左栏可见文案是「场景 / 全局层 / N 个元素」，没有「共享内容」标题和「全课」徽章（`ScenePanelContent` 绕过 `SharedContentSection`）；右栏专业页签为「互动与动画」且多「组件」；Flow/Spatial/Mixed 非像素对齐（填课内容、镜头工具、运行态 TOC）。
- 截图/录像：`artifacts/experience/{slide,flow,spatial,mixed}-{1280x720,1366x768,1920x1080}.png`；`V9_EDITOR_UI_*_REFERENCE.png`
- 结果：受阻（已知缺口）
- 问题 owner：壳层 T10；几何回归 T12 回派文件 owner

### EX-12 全局层进入/退出不改变 active location / history

- 工程/样例：任意含 ≥2 个 location 的 V9 工程
- 步骤：记下当前 location 与 Undo 栈深度 → 点「全局层」→ 再点回原页面（或不点，只退出全局 scope）→ 比较 locationId、revision、dirty。
- 预期：只切 authoring owner；不创建伪 location；不写 history；不改变课程顺序或 Pure/Mixed 推导。
- 自动化证据：E2E 点击全局层再回场景、点选控制器不 dirty。未记录 locationId / revision / Undo 栈深度的前后对比。
- 截图/录像：无进出对照录像
- 结果：未执行
- 问题 owner：T03 / T06 / T10

### EX-13 Flow 运行态目录展开/收起的贴边三角

- 工程/样例：EX-07 空白流式，至少两个 heading/section
- 步骤：试运行或发布 Player 打开 Flow 页；点视口贴边三角展开目录；再收起；滚动长文时三角保持 `position: fixed`。
- 预期：`tocOpen` 只在运行会话；不写工程/导出。capture HTML 不含 TOC DOM。目录项只有 heading/section。不要第二套大纲。
- 自动化证据：`tests/unit/flowRuntimeToc.test.ts`；`tests/unit/flowSurfaceHost.test.ts`。未做 Flow 试运行贴边三角实机。
- 截图/录像：无运行态 TOC 截图；编辑态见 `artifacts/experience/flow-1366x768.png` 与 `V9_EDITOR_UI_FLOW_REFERENCE.png`
- 结果：未执行
- 问题 owner：T07 / T09

### EX-14 长图层名称 / 长列表

- 工程/样例：与 EX-03 同一工程，专拍 1366 右栏
- 步骤：名称超长、列表超一屏；键盘 F2、方向键、Shift+F10。
- 预期：`writing-mode: horizontal-tb`；nowrap + ellipsis；操作列不被挤没。
- 自动化证据：`tests/unit/effectiveLayerList.test.tsx`；`tests/unit/nodesTabDocumentControl.test.tsx`。无 20+ 超长名称实机。
- 截图/录像：无长列表专拍
- 结果：未执行
- 问题 owner：T04 / T06

### EX-15 控制器八向、属性折叠、Player 折叠（独立复核）

- 工程/样例：同 EX-05；必须含一次真实 Published HTML，不只是编辑器内试运行
- 步骤：作者态八向 + 属性折叠；另存发布包后在独立窗口折叠/展开。
- 预期：与 EX-05 同一配置。折叠是运行会话，不写工程。
- 自动化证据：同 EX-05。E2E 有独立窗口整课预览与导出 HTML，无发布包内折叠录像。
- 截图/录像：无
- 结果：未执行
- 问题 owner：T06 / T09

### EX-16 声音导入、引用保护、发布播放（独立复核）

- 工程/样例：同 EX-06，必须走保存重开后再发布
- 步骤：导入 → 引用 → 删被拒 → 保存重开 → 发布播放。
- 预期：同 EX-06。
- 自动化证据：同 EX-06。无导入→引用→删被拒→发布播放实机。
- 截图/录像：无
- 结果：未执行
- 问题 owner：T06 / T09B / T09

### EX-17 保存关闭重开后继续编辑

- 工程/样例：EX-08 Mixed 工程；另测一次空白三类新建各保存一轮
- 步骤：改文字/图层/Flow 块/Spatial 元素 → 保存 → 关窗口 → 打开同一 `.h5lesson` → 继续编辑并 Undo 到保存点之后的新操作。
- 预期：只写 V9 archive。选择/切页/切全局层不得单独 dirty。保存失败必须保持 dirty。另存后资源 sidecar 仍可解析。
- 自动化证据：`tests/e2e/v9SlideVerticalSlice.spec.ts` 保存、重开、继续拖移、脏关窗 mock 取消（return 2）、恢复副本再保存。`v9DefaultBoundary` 关窗选择不保存（return 1）并丢弃恢复。单元：`projectArchive` / `asyncArchive` / `projectPersistence`。
- 截图/录像：无人工三按钮录像；行为由 Electron dialog mock 覆盖
- 结果：通过
- 问题 owner：T09B / T10

### EX-18 V8 导入报告与 V9 新建隔离

- 工程/样例：任意历史 V8 `.h5lesson` / 旧归档（若本机没有，用兼容测试夹具，不要把 V8 另存成默认新文件）
- 步骤：
  1. 顶栏「导入旧版工程」，阅读 status/error 中的 notes/warnings。
  2. 导入后 path 为空、工程 dirty、不写入最近工程；另存为新 V9 文件。
  3. 再「新建 → 空白演示」，确认不是 V8 backend。
  4. 普通打开/最近工程不得静默吃 V8。恢复副本若是 V8，必须拒绝并指向导入入口。
- 预期：V8 只作显式迁移。`createProject` V8 工厂仅供导入/兼容测试。不得出现可见的 V8/legacy editor 切换。
- 自动化证据：`tests/e2e/v9DefaultBoundary.spec.ts`：普通打开 V8 被拒并提示导入；显式导入另存 schema 9；V8 恢复副本不出现「恢复课件」。单元：`projectArchive` / `projectV8Schema` / `courseProjectProtocol`。
- 截图/录像：无导入对话框截图；以 E2E 断言为准
- 结果：通过
- 问题 owner：T09B / T10

---

## 3. 完成门槛抽查（§11，穿插在上表，不另开工程也可）

T12 在勾完 EX-01–EX-18 后，用本表做是/否，禁止用「以后有 AI」代替。

| 门槛 | 判定 | 备注 |
|---|---|---|
| 默认生产路径只有 V9 | 是 | E2E `starts on production V9` |
| V8 显式导入可用且不参与日常新建 | 是 | E2E 普通打开拒绝、显式导入另存 schema 9 |
| 右键、Delete、剪贴板、图层、文字、控制器、声音、属性在默认 V9 可达 | 部分 | 图层/文字/控制器/属性有 E2E；Flow cut/paste 与声音无实机；全局非拖放层级移动受阻 |
| Slide / Flow / Spatial 可从空白创建 | 部分 | 顶栏三类新建已截图；未从这些空白走完编辑与发布 |
| Pure/Mixed 自动推导 | 是 | 无 `projectMode`；Mixed 树由新增内容形成 |
| 全局层可见且与页面类型正交 | 部分 | 四态均有 `global-layer-entry`；纯 Slide 紧凑栏缺可见「共享内容 / 全课」 |
| 稳定 `authoringAddress`、Undo/Redo、Player/导出一致 | 部分 | Slide/Spatial E2E 与 course-cases 导出通过；IME/声音播放未做 |
| 未为回归放宽视觉基线 | 是 | 两次重捕均有书面原因；几何矩形未改；阈值未放宽 |
| 正式表面没有可见 AI | 是 | 四态截图与 App 均无可见 AI |
| 未把 Focusky / 自动结构编辑勾成现有能力 | 是 | 本清单未勾 |

---

## 4. Runtime API 2/3 与 Component API 4（可达性，不夸大）

### EX-19 专业模式：互动 / Runtime / Component / 设计令牌

- 工程/样例：`parabola-lab`（含 Runtime）或自建已有 Runtime/Component 的 V9 工程
- 步骤：
  1. 顶栏切「专业」：Components / Automation / Developer 页签可打开。
  2. 已有 Runtime：改源码/内容/素材绑定，一次 history；试运行切 `canvasMode=run`。
  3. 空作用域：确认 **没有** 会失败的「创建运行时模板」假按钮；可见同场景限制。
  4. 组件：导入/加入 catalog 可达；点「替换/更新」走 App/store 已接线的 `replaceCourseComponentPackage`。源码已闭合，待 T12 实机。不得静默改实例。
  5. 属性页下方 `DesignTokensEditor` 可改 token（T10 挂在 RightSidebar，不是 PropertiesTab 的 V9 `documentControl` 字段）。
- 预期：Runtime API 2/3、Component API 4 是协议边界，不是 Focusky 完成声明。锁定目标写操作被拒绝。
- 自动化证据：E2E 可切「专业」并打开工程检查。单元覆盖 developer / component / runtime / tokens。`addCourseRuntimeLayer` 不存在；`replaceCourseComponentPackage` 未做实机替换。
- 截图/录像：无开发页专拍
- 结果：受阻（已知缺口）
- 问题 owner：T09A / T09B / T10

---

## 5. T12 填写规则

1. 先跑 T12 文档中的全量自动化，再按本清单做实机；不要为了截图先改产品代码。
2. 失败写首个可见错误原文、复现窗口尺寸、当时 location/surface。
3. 已知 §0 缺口打「受阻（已知缺口）」，不要回派去「补文档」。
4. 只有教师口头/书面验收后才能把整份清单升为 `accepted`。
