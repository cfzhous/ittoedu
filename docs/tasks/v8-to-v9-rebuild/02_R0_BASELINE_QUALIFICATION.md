# R0 — 成熟 V8 基线资格、唯一工作区与能力冻结

> 状态：`R0-G` 教师已确认主干；`R0-A/B/C/D` 均已交付 HANDOFF
> 候选基线：`f27275658c6dfaa12f2ce35cd9368dcdebe99451`
> 阶段性质：资格审计优先；除宿主兼容和格式隔离外不移植 V9 产品代码

## 1. 阶段结果

R0 结束时必须得到：

- 唯一活动产品 worktree 与分支 `codex/v8-to-v9-rebuild`；
- `npm run dev` / `npm run start` 从该 worktree 只打开成熟 V8 `App`；
- 教师确认的 V8 可见能力清单与关键体验证据；
- `f272756`、`79c821f`、`14890bb`、当前 V9 HEAD 的准确供体/参考关系；
- V8/V9 文件、recovery 与共享 AppData 不会互相误开；
- R1 可使用的源码、测试、宿主兼容和回退记录。

R0-G 未获得教师明确确认前，R1 及后续全部保持 `LOCKED`。

## 2. 任务与并行关系

| ID | 任务 | 独占写入 | 可并行 | 依赖 |
|---|---|---|---|---|
| R0-A | 建立唯一产品 worktree、确认启动入口 | Git worktree/branch；不改产品功能 | 否 | 无 |
| R0-B | 真实 V8 产品能力与体验清单 | 只写 HANDOFF/审计文档 | R0-C、R0-D | R0-A |
| R0-C | V8 源码、测试与 donor 矩阵 | 只写 HANDOFF/审计文档 | R0-B、R0-D | R0-A |
| R0-D | 宿主兼容与 V8/V9 格式隔离 | main/preload/project/recovery 的窄文件 | R0-B、R0-C | R0-A；仅发现问题时改代码 |
| R0-G | 汇总资格 Gate 并请求教师确认 | 只写 R0 Gate 记录 | 否 | R0-B/C/D |

## 3. R0-A — 唯一产品 worktree 与真实启动

### 3.1 授权

只负责安全创建/登记工作区和验证候选提交，不移植 V9 源码，不修改 App/Workspace/store/UI。

### 3.2 执行步骤

1. 在当前计划/供体目录记录 `git status --short`、当前分支、HEAD 和 `git worktree list --porcelain`。
2. 解析候选提交必须等于完整 SHA `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。
3. 选择明确的、非现有仓库内部生成目录的绝对 worktree 路径；创建前确认目标不存在或为空，不删除任何现有目录。
4. 若 `codex/v8-to-v9-rebuild` 不存在，从候选 SHA 新建分支/worktree；若已存在，只登记并验证，不强行重建。
5. 在产品 worktree 复核：
   - `src/renderer/main.tsx` 直接渲染 `App`；
   - 不存在默认 `CourseStudioApp`/controlled editor 路由；
   - `tests/e2e/editor.spec.ts`、`MediaTab.tsx`、`SimpleEntranceAnimationEditor.tsx` 等 V8 关键入口存在。
6. 使用仓库既有锁文件准备依赖，不升级包、不增加依赖、不改 lockfile。
7. 只运行一次真实 `npm run dev`；若只能用 `npm run start`，记录原因。确认打开的确是成熟 V8 UI，而不是当前 V9 供体产品。
8. 登记 `planning pack path`、`product worktree path`、branch、baseline 和启动命令，供所有后续任务复用。

### 3.3 最轻量验证

不跑 Vitest。只记录 SHA/入口文件事实和一次真实启动结果；运行：

```powershell
git diff --check
```

### 3.4 停止条件

- 候选提交无法解析；
- 目标路径与现有工作区冲突；
- `main.tsx` 不是成熟 V8 入口；
- App 无法启动且原因需要大规模工具链升级。

## 4. R0-B — V8 可见能力与体验冻结

### 4.1 授权

只读操作真实 App，建立能力清单和少量体验证据；不改代码、不重捕全套视觉 baseline。

### 4.2 必查清单

逐项实际打开或操作，记录 `通过 / 回归 / 未找到 / 受阻`：

- 工程：新建、打开、保存、另存、恢复、最近工程、试运行、发布；
- scene/state：新增、复制、重命名、排序、删除、命名状态与 override；
- 画布：单选、多选、框选、拖动、八向缩放、旋转、方向键、zoom/pan；
- 文字/公式：双击、IME、选区局部格式、竖排、自适应宽度、公式；
- 媒体/声音：在 `f272756` 中入口位于 Elements 内嵌的完整 MediaTab，而非独立顶级页签；核验媒体库、声音库、图片/视频入画布、命中、属性、试听与引用。保护的是完整功能与直接可达性，不把顶级页签位置误写成基线事实；
- 图层：紧凑行、拖排、上/下移、置顶/置底、锁定、隐藏、复制、删除；
- 动画/互动：简单出现动画、专业自动化、InteractionEditor；
- Runtime/Component：导入、插入、替换、props/variant/nested content；
- 教师控制器：真实外观、选择框、八向缩放、主题、折叠、运行态动作；
- 快捷键/右键/剪贴板/焦点保护；
- Player 与导出入口。

至少保留以下少量证据：完整主界面、MediaTab、动画/互动入口、图层/属性、控制器各一张截图；控制器拖缩可用一段短录像。证据只用于资格审查，不定义新的像素 baseline。

### 4.3 最轻量验证

不跑自动化。实际 UI 操作就是本任务验证。HANDOFF 必须列出未执行项，不能用源码存在代替 UI 可达。

## 5. R0-C — 源码、测试与供体矩阵

### 5.1 授权

只读 Git 与源码，给后续任务提供准确路径；不修改产品文件。

### 5.2 执行步骤

1. 列出 `f272756` 的 App、store、Workspace、sidebars、project、player、export、Runtime/Component 与测试入口。
2. 证明 `14890bb` 位于 `3e41ec0` 之后且默认 `ProductApp` 走 V9；把它登记为行为地图而非代码基线。
3. 对 V9 能力建立供体矩阵：Schema/model、archive、Published producer、Slide commands、Flow、Spatial、Mixed、export、tests。
4. 每个供体记录：提交、文件/函数、为什么可复用、禁止带回的 UI/adapter、建议定向测试。
5. 标出中央热点和每个阶段可独占的新模块，避免后续 lane 猜路径。

### 5.3 最轻量验证

不跑测试。只执行只读 Git/`rg` 命令和审计文档的 `git diff --check`。

## 6. R0-D — 宿主兼容与格式隔离

### 6.1 独占路径

仅在确有问题时允许修改：

- `src/main/index.ts`、`src/main/createWindow.ts`
- `src/preload/index.ts`
- `src/renderer/project/openProject.ts`、`projectArchive.ts`、`recoveryWriteCoordinator.ts`
- 对应至多两个窄测试

不得修改 App、store、Workspace、sidebars 或 V8 产品功能。

### 6.2 必须闭合

- 当前 Electron/Node 环境能运行 V8；只窄幅前移必要 host/preload/启动兼容，不带回 V9 UI。
- V8 路径能识别 V9 `.h5lesson`/archive/recovery，不把它按 V8 结构恢复或覆盖。
- V9 导入尚未启用时给出明确、可行动错误；不能 silent fail 或假成功。
- 共享 AppData 中旧 V9 recovery 不得污染 V8 启动。

### 6.3 最轻量验证

若改了格式/恢复逻辑，只运行一条：

```powershell
npx vitest run tests/unit/projectArchive.test.ts tests/unit/recoveryWriteCoordinator.test.ts
git diff --check -- src/main src/preload src/renderer/project tests/unit/projectArchive.test.ts tests/unit/recoveryWriteCoordinator.test.ts
```

若测试名在活动基线不存在，先用 `rg --files tests` 选择最多两个真实相关文件，或新增一个窄测试；HANDOFF 记录替代原因。

## 7. R0-G — 基线资格 Gate

协调者汇总 R0-A/B/C/D，检查：

- 唯一产品 worktree 与入口无歧义；
- V8 核心能力可用，回归已明确而非被忽略；
- 格式/recovery 隔离成立；
- 供体矩阵和中央热点清楚；
- 没有把 `14890bb` 或当前 V9 HEAD 当成熟 V8 基线；
- 没有运行全量测试或移植 V9 UI。

然后向教师提供 5 张关键截图、短录像和缺口摘要，请求明确回答 `确认 f272756 可作为产品主干 / 不确认并说明阻断项`。

只有明确确认后：

- 标记 R0 `DONE`；
- 记录冻结 baseline SHA 与回退点；
- 将 R1-A 设为 `READY`。

## 8. R0 HANDOFF 附加字段

除共享模板外必须包含：

```md
- canonical product worktree:
- exact baseline SHA:
- launch command/result:
- V8 capability inventory summary:
- baseline screenshots/video locations:
- format/recovery isolation result:
- teacher decision:
```
