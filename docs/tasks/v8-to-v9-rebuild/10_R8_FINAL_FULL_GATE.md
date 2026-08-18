# R8-FINAL — 唯一全量自动化、真实体验与教师验收

> 状态：Wave 8a 机器 C/D/E 已绿；**R8-F 通过**（RECHECK-13 全量前 23 绿 + LAST4 定向后 4 绿）。范围不减；禁止任何子任务跑完整 `npm run verify`。G/H/Z 未领。
> 授权：仅 R8-* 子任务可运行各自写出的全量命令。禁止任何子任务跑完整 `npm run verify`。
> 加速手册：[`artifacts/R6_R8_EXECUTION_PLAYBOOK.md`](artifacts/R6_R8_EXECUTION_PLAYBOOK.md)
> 计划版本：根计划 11.4

## 0. 加速而不减范围

- R8 **不写新功能**。不为 checklist 每一行新建 Playwright spec；优先跑仓库**已有** e2e。缺的产品路径才补一条。
- 机器侧：有可信 `verify:full` 就只跑一次（方式 A）。**不要并行 Electron。** R8-C 与 R8-D 可以并行（无窗口）。不要在 R6/R7 预演本文件 §4–§7。
- R3/R4/R5/R6/R7 的窗口证据只作**定位索引**（哪张图、哪个 `output/*-smoke/`）。不能代替本任务在冻结 HEAD 上的操作，也不得反过来要求那些阶段先做 17 项或三视口。
- 失败回派：owner 只跑原任务卡 1–2 个测试。不要借一次失败跑全量。blocker 清零后按 §8 最多再全量一次。

## 1. 目标

对冻结的 V9 candidate 做一次完整机器 Gate 和真实教师级体验复核。R8 不承接新功能；失败必须归因并回派给原 owner，修复者仍只跑窄测试，之后回到 R8 复验。

机器全绿最多是 `engineering candidate`；真实视觉/互动全部通过后是 `art candidate`；只有教师明确确认才是 `accepted`。

## 2. 进入条件

开始前必须同时满足（**Wave 8a 例外**：教师 2026-08-17 要求 R8-A/B 产品补丁与 R8-C/D 机器命令同时开工；`PRE-R8-01/02` 允许在 C/D 期间仍为 implemented）：

- R0–R7 阶段 Gate 均真实完成；
- R0 与 R3 教师决定已有记录；
- 除 `PRE-R8-01` / `PRE-R8-02` / `R7E-R7Z-01`（non-blocking）外，blocking `INTEGRATION_REQUEST` 为 `integrated + verified`；
- 所有阻断性 `DECISION_REQUEST` 已关闭；
- 根计划 §0.4 六点与 V8 能力账本无 `未执行/受阻/以后补`（体验项由 R8-H 执行，不要求 Wave 8a 已做完）；
- 工作树不存在未解释的跨 lane 冲突；
- Wave 8a 不冻结 HEAD；R8-Z 汇总前再记一次 SHA；
- 核心视觉 baseline 未被为适配回归而重捕或放宽。

R8-F/G/H/Z 在 A–E 未交卷前不得领取。不得先跑完整 `npm run verify`“看看再说”。

## 3. 预检记录

记录到 `docs/tasks/v8-to-v9-rebuild/artifacts/FINAL_GATE_REPORT.md`：

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
node --version
npm --version
Get-Content -LiteralPath package.json -Raw
```

根据最终 `package.json` 展开实际脚本。`f272756` **没有** `verify:full`，但已有 `verify` = `check:ai-capabilities` + `typecheck` + `test` + `test:e2e` + `build:desktop`。R8 开始时若仍是这条，把它当方式 A 的聚合脚本，**不要现在**为了任务卡去新增 `verify:full`。不得在 R6/R7 预跑 `verify`。

## 4. 全量自动化顺序

协调者先选择下面两种方式之一，避免重复跑整套：

### 方式 A：最终仓库已有可信 `verify:full`

先展开并确认它确实覆盖 §4.2 全集合，然后运行一次：

```powershell
npm run verify:full
```

若缺少某一集合，只补跑缺少的精确命令。

### 方式 B：没有可信聚合脚本

按最终真实脚本依次运行等价命令，通常包括：

```powershell
npm run check:ai-capabilities
npm run typecheck
npm test
npm run build:desktop
npm run test:e2e
```

仅运行 `package.json` 中实际存在且必要的命令；若 `test:e2e` 的 pre-hook 已构建 Player/Renderer/Electron，不重复构建。

### 4.2 必须覆盖的集合

- Agent Kit/capability index check；
- renderer、electron、e2e TypeScript；
- 全部 unit/integration/component Vitest 与 Agent Kit tests；
- player、renderer、electron build；
- 全部 V9 产品路径 Electron/Playwright specs；
- V8→V9 显式迁移、V9 保存重开、recovery/format isolation；
- Published V2、HTML/包、PPTX、打印/PDF/DOCX、Runtime/Component；
- V8 能力/视觉 preservation，且验证的是当前 V9 backend 下的成熟 V8 表面，不是隐藏 legacy store；
- 课程样例和真实资源完整性。

不得并行启动会争抢端口、Electron 窗口、AppData 或生成目录的全量命令。

## 5. 全量 E2E 最低场景

完整 E2E 必须覆盖：

1. V9 新建/保存/重开/recovery，V8 显式导入与格式拒绝；
2. Slide 新增 scene 不丢旧内容，scene/state/history；
3. 多选、框选、八向 resize、旋转、右键、剪贴板、Delete、Undo/Redo；
4. 文字双击、IME、选区级局部格式、公式；
5. 媒体库/声音库、图片/视频、组件、Runtime、动画与互动；
6. global/surface/scene/state owner、排序、锁定、隐藏和逐 location 可见性；
7. 教师控制器作者态、快速拖动、Player 会话；
8. Flow 强文本、paragraph 层级、媒体/组件/global、运行目录和文档导出；
9. Spatial 共享元素内核、camera/path/relation、viewport controller；
10. Pure/Mixed 七组合、统一新增菜单和跨 surface 导航；
11. Player、HTML/包与文档导出的关键一致性。

不得用只打 V8 legacy route、纯 helper 或被蒙版画布的测试替代默认产品路径。不要为这 11 条各新建一个 spec 文件；一条现有 spec 覆盖多条即可。

## 6. 三视口视觉 Gate

视口：

- 1280×720
- 1366×768
- 1920×1080

每个视口检查：

- V8 壳层几何、主按钮/下拉避让、长课程树和 20+ 图层；
- Slide 文字、选择框、控制器与媒体；
- Flow 长文、上下文工具和目录展开/收起；
- Spatial world、缩放条、选择框、镜头控件和 viewport controller；
- Mixed 切页后的壳层稳定性。

核心画布、控制器、新增菜单、Flow 编辑区、Spatial 画布禁止 mask。动态时间/光标可做最小稳定化，但必须记录且不能覆盖产品内容。

## 7. 完整真实体验清单

逐项实际操作并记录截图/录像：

1. 连续新增多个元素，自动错开且全部可选。
2. Slide 多选 → 右键复制 → 粘贴 → Delete → Undo/Redo → 保存重开。
3. 双击文字 → IME → 选区级富文本 → 点击空白 → 保存重开 → Player 对比。
4. 图层拖排、上/下移、置顶/置底、锁定、隐藏、重命名和 20+ 长列表。
5. 分别在 Slide、Flow、Spatial 点击全局层，验证四种 owner、排序与逐 location 显隐。
6. 控制器八向 resize、慢速/快速/斜向拖动、zoom/pan、折叠、试运行与 Player。
7. 声音导入、试听、改名、互动引用、删除保护、音量/静音和发布播放。
8. 图片/视频导入、媒体管理、加入画布、命中选择、属性、替换、裁剪、保存和发布。
9. 简单动画、专业动画/互动的创建、修改、预览、保存重开和 Player。
10. Component package 导入、插入、属性、替换、保存和发布；Runtime API 2/3 各一个样例。
11. 从空白完成 Flow 长文：直接点选、双击、IME、局部格式、页面—标题树、paragraph 不进图层、媒体/组件、目录、打印/PDF/DOCX。
12. 从空白完成 Spatial：多元素、双击、属性、媒体/组件、Slide 同款缩放/选择/控制器、镜头、路径和关系。
13. 纯 Slide/Flow/Spatial 分别用主按钮新增本态、下拉新增另外两类；旧内容始终可返回。
14. Flow/Spatial 的 global item 和控制器逐页隐藏/显示，保存重开并对比 Player。
15. Mixed 连续切换三类 location，selection、属性、快捷键、声音、上一/下一、进度和 Player 不串页。
16. V8 显式导入产生清晰报告，原文件不被覆盖；V9 普通打开/恢复不误读 V8 recovery。
17. HTML/包/PPTX/PDF/DOCX 真实写出并用对应应用/浏览器打开抽查。

任何项为“未执行”或“受阻”，R8 不得标完成。

## 8. 失败处理循环

每个失败记录：命令/步骤、首个错误、复现条件、owner、影响需求、是否跨 lane。然后：

1. 回派给原任务 owner；
2. owner 只运行其任务卡的一条定向测试和 diff check；
3. 阶段中央热点只由原 `*-Z` owner修复；
4. R8 先复跑失败的精确 Gate；
5. 所有 blocker 清零后，最多再完整运行一次全量自动化，形成最终机器证据；
6. 再完成受影响真实体验与视觉项。

禁止删除测试、放宽行为合同、重捕 baseline、mask 核心画布或隐藏功能来解决失败。

## 9. 最终报告格式

```md
# FINAL_GATE_REPORT

- baseline / final HEAD / worktree:
- full command expansion:
- command results and durations:
- typecheck/unit/build results:
- V9 E2E coverage:
- V8 preservation results:
- three-viewport visual evidence:
- experience checklist results:
- migration/recovery evidence:
- export artifact paths and open checks:
- unresolved issues:
- machine status: failed | engineering candidate
- experience status: unverified | art candidate
- teacher decision: pending | accepted | rejected
```

## 10. 完成定义

只有以下全部成立，整个任务包才能 `DONE`：

- 全量机器 Gate 全绿；
- 三视口与 17 项真实体验全部执行并通过；
- 根计划 §0.4 六点无回归；
- V8 能力账本所有硬项在 V9 backend 可达；
- 无 blocking 请求和未解释风险；
- 教师明确验收。

教师未确认时，即使机器和体验均通过，也只能停在 `art candidate`。

## 11. 子任务拆分（11.4）

产品 worktree：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild`  
计划包：`C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`  
基线 SHA：`f27275658c6dfaa12f2ce35cd9368dcdebe99451`（未 commit 的 R6–R8 改动必须保留）

### 11.1 并行与互斥

| 槽 | 任务 | 可并行 |
|---|---|---|
| Electron（最多 1） | R8-A，然后 F，然后 G，然后 H | 彼此互斥。Vite 用空闲端口：A=`5176`；F/G/H 另选且 `--strictPort`。`--user-data-dir=output/<task>-smoke/electron-profile`。无 `VITE_V9_CANDIDATE_SMOKE`。5174 可能仍被 R6-Z Vite 占用，不要抢。 |
| 产品源码 | R8-B：`ScenePanel.tsx` + editorStore 仅新增薄 `reorderCourseSurfaces` | 不得改 `Workspace.tsx` / `App.tsx` / `globals.css`（除非 B 必须给拖柄加已有 class） |
| 机器 CPU | R8-C typecheck、R8-D `npm test` | 互不写源码，可并行 |
| dist | R8-E `build:desktop` | 与 F 的 pretest 构建互斥；等 C/D |

### 11.2 R8-A — 编辑态重挂窗口证明

关闭 `PRE-R8-01`。协调者已去掉 Workspace `locationId:generation` key，且同一 location 不再涨 generation。

**只读**产品源码。只写 `output/r8-a-smoke/` 与 `handoffs/R8-A.md`。

冒烟：默认 V9 Slide → 编辑状态 → 单击当前课树页 → 单击画布空白 → 双击文字。失败 = 出现「隔离页面已连接，正在启动 Player…」或「正在载入隔离 Player…」盖层。通过 = 无该盖层且文字进入编辑。可新建第二场景并单击切页：允许短暂同步，但 Phaser 宿主节点不得因 React remount 销毁重建（用同一 `data-testid=canvas-stage` 节点或截图对比）。

测试：无 Vitest。`git diff --check` 应无产品源码。

### 11.3 R8-B — 课树拖排

关闭 `PRE-R8-02`。V8 `ScenePanel` 用 `@dnd-kit` `reorderScenes`。R6 统一树丢掉拖排。

授权：`src/renderer/ui/ScenePanel.tsx`；editorStore **只**增加 `reorderCourseSurfaces(surfaceIds)`，内部 `persistCourseProjectCommand(reorderCourseSurfaces(...))`。已有 `reorderScenes`、`reorderSpatialCameraFramesInSession` 直接调用。

行为：

- 顶层 `slide-page` / `flow-page` / `spatial-page` 兄弟之间拖排 → `reorderCourseSurfaces`
- 同一 Slide 页下 `slide-scene` 兄弟 → `reorderScenes(sceneIds)`（树节点 id 是 locationId，必须映射 `sceneId`）
- 同一「本页镜头」下 camera → `reorderSpatialCameraFramesInSession`
- **不要**让 flow-heading/section 可拖（那是文纲，不是页面序）
- 跨父级放置拒绝；保留 Grip 手柄；`activationConstraint: { distance: 5 }`
- 不恢复 V8 缩略图列表，不改课程树投影模型

测试最多两个：`tests/unit/courseLocationCommands.test.ts` 可追加 reorder 断言；可新建 `tests/unit/scenePanelReorder.test.tsx`。`git diff --check` 只列改过的文件。

### 11.4 R8-C — capabilities + typecheck

不写产品源码。只运行：

```powershell
npm run check:ai-capabilities
npm run typecheck
```

工作目录必须是产品 worktree。HANDOFF 记录退出码与首个错误。若失败仅因 R8-B 正在改的 ScenePanel 语法不完整，等 3 分钟再跑一次 typecheck，仍失败则记 owner=R8-B。

### 11.5 R8-D — 全量 Vitest

不写产品源码。只运行：

```powershell
npm test
```

即 `vitest run`。不要加 E2E、不要 `npm run build`。HANDOFF 记失败文件列表。与 R8-B 竞态导致的 ScenePanel 测试失败记 owner=R8-B。

### 11.6 R8-E / F / G / H / Z（Wave 8a 不要领）

- **R8-E**：`npm run build:desktop`。等 A–D HANDOFF。
- **R8-F**：`npm run test:e2e`（现有 spec，不为 11 条各新建文件）。等 E，且 Electron 槽空闲。
- **R8-G**：三视口 §6。等 F。证据 `output/r8-g-visual/`。
- **R8-H**：§7 的 17 项。等 G。证据 `output/r8-h-experience/`。任一项未执行/受阻则不得标完成。
- **R8-Z**：填 `artifacts/FINAL_GATE_REPORT.md`。机器全绿才能写项目级 `engineering candidate`。体验全过才能写 `art candidate`。`teacher decision` 保持 `pending`。

### 11.7 各子任务完成态

任何 R8-* HANDOFF 禁止写 `accepted`。R8-A/B 最多 `engineering candidate for this stage`。R8-C/D/E/F 只报命令结果。R8-G/H 只报体验项通过/失败。

