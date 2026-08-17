# LAYOUT Lane：P3 课型推导与壳层纯策略

> TASK_ID: `A1-A3-LAYOUT-POLICY`
> STATUS: `DONE`
> OWNER: 未领取（Wave 1 LAYOUT 执行者已完成，见 §10 交付记录）
> DEPENDS_ON: `P2-G = DONE`
> PARALLEL_WAVE: `Wave 1`
> PIPELINE_TARGET: `engineering candidate`
> FULL_TEST: 禁止；全量验证统一留给 `Z1`

本文件是一份可直接领取的执行合同。执行 AI 必须先读
[并行执行索引](AI_NATIVE_PARALLEL_00_INDEX.md)与
[共享合同](AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md)，然后只在本 lane 的新文件中实现 P3 的纯推导与纯策略。这里不接 UI，不修改 Store，也不保存任何“模式”字段。

## 1. 目标与边界

目标是把“这是纯 Slide / 纯 Flow / 纯 Spatial / Mixed”以及对应的教师壳层策略做成无副作用、可直接消费的纯函数。SHELL lane 只负责把结果接到现有壳层。

必须保持：

1. 只从 `project.locations` 实际引用到的 surface 推导；孤立 surface 不影响结果。
2. 多个同类型 surface 仍是纯课；两个或更多不同类型才是 `mixed`。
3. 推导结果不进入 Course Project、不进 history/revision/dirty、不新增 migration。
4. 缺失的 location → surface 引用必须显式失败，交给现有 Schema/health 路径处理；不得猜测、补建或静默降级。
5. 本 lane 不决定 JSX、CSS、折叠状态或具体按钮摆放。

## 2. 文件所有权

### 独占新文件（允许新建并修改）

- `src/renderer/course/courseEditorLayout.ts`
- `tests/unit/courseEditorLayout.test.ts`
- 本 lane 文档，仅可更新 `STATUS` 和末尾交付记录

这两个代码文件是本 lane 的 **new-file ownership**。其他 lane 在本任务交付前不得创建同名文件。

### 只读输入

- `src/shared/courseProjectTypes.ts`
- `src/shared/courseProjectSchema.ts`
- `src/renderer/App.tsx`
- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `tests/unit/scenePanelSurfaceNav.test.tsx`
- `tests/unit/editorShellMultiSurface.test.tsx`

### 禁止修改

- 所有既有生产文件，包括 `src/renderer/App.tsx`、Store、Schema、IPC 和所有 UI 组件
- 所有既有测试文件
- `package.json`、锁文件、构建配置、迁移与 fixture
- FLOW、AI-BOUNDARY、RELEASE、DOCS lane 的独占文件

如实现必须修改上述任一文件，按“停止条件”交回协调者，不得扩 scope。

## 3. 固定输入/输出合同

`courseEditorLayout.ts` 对外导出以下等价合同；命名和字面量不得自行扩展：

```ts
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'

export type CourseEditorLayout = 'slide' | 'flow' | 'spatial' | 'mixed'

export type CourseEditorPrimaryNavigation =
  | 'slide-thumbnails'
  | 'flow-outline'
  | 'spatial-camera-list'
  | 'course-locations'

export interface CourseEditorShellPolicy {
  readonly layout: CourseEditorLayout
  readonly primaryNavigation: CourseEditorPrimaryNavigation
  readonly leftPanelLabel: '幻灯片' | '讲义大纲' | '镜头列表' | '课程流程'
  readonly showCourseLocationNav: boolean
  readonly simpleSidebarTabs: readonly ['elements', 'layers', 'properties']
}

export function deriveCourseEditorLayout(
  project: Pick<CourseProjectDocument, 'locations' | 'surfaces'>,
): CourseEditorLayout

export function deriveCourseEditorShellPolicy(
  project: Pick<CourseProjectDocument, 'locations' | 'surfaces'>,
): CourseEditorShellPolicy
```

Surface type 的唯一映射为：

| V9 surface type | `CourseEditorLayout` |
|---|---|
| `slide` | `slide` |
| `flow` | `flow` |
| `spatial-2d` | `spatial` |

壳层策略的唯一映射为：

| layout | primaryNavigation | leftPanelLabel | showCourseLocationNav |
|---|---|---|---:|
| `slide` | `slide-thumbnails` | `幻灯片` | `false` |
| `flow` | `flow-outline` | `讲义大纲` | `false` |
| `spatial` | `spatial-camera-list` | `镜头列表` | `false` |
| `mixed` | `course-locations` | `课程流程` | `true` |

`simpleSidebarTabs` 永远返回 `['elements', 'layers', 'properties']`，且调用方不得修改该数组。可以使用冻结常量复用返回值，但不得引入状态或缓存框架。

## 4. A1 — 课型推导

### 实施步骤

1. 先在新测试文件写最小 fixture builder，只构造推导所需的 `locations` 与 `surfaces` 字段；不要复制完整示例工程。
2. 在新策略文件内以 `surface.id` 建立只读 lookup。
3. 按 location 顺序解析被引用 surface 的 `type`，映射后去重。
4. 一个唯一类型返回对应纯课；两个及以上唯一类型返回 `mixed`。
5. location 引用不存在的 surface、没有任何可解析 location 或运行时未知 type 时抛出可读 `Error`。不要 catch，不要写回输入。

### 必须覆盖的断言

- 单 Slide、多 Slide surface → `slide`
- 单 Flow、多 Flow surface → `flow`
- 单 Spatial、多 Spatial surface → `spatial`
- Slide+Flow、Slide+Spatial、Flow+Spatial → `mixed`
- 三种全有 → `mixed`
- 重复 location 不改变类型结果
- 未被任何 location 引用的异类 surface 不触发 `mixed`
- location 引用缺失 surface 时抛错
- 调用前后输入深度相等，revision 等字段（若 fixture 带入）不变

## 5. A2/A3 — 纯壳层策略

### 实施步骤

1. `deriveCourseEditorShellPolicy` 必须复用 `deriveCourseEditorLayout`，不得复制第二套课型判断。
2. 按 §3 的固定表返回主导航、左栏教师标签和 Mixed 导航显隐。
3. 简洁模式只描述三个稳定入口：元素、图层、属性；不返回开发、组件、互动或 AI 入口。
4. 纯策略只返回协议数据；不导入 React、Store、DOM、CSS 或任何 UI 组件。

### 必须覆盖的断言

- 四种 layout 的策略对象逐项等于 §3 固定表
- Mixed 切换当前 location 不改变策略；只有 locations/surfaces 组成变化才会重算结果
- 返回结果中不存在 `projectMode`、`surfaceMode`、`ai`、`runtime` 等额外字段
- `simpleSidebarTabs` 顺序固定且不可被一次调用污染后续调用

## 6. 最小验证

本 lane 只运行：

```powershell
npx vitest run tests/unit/courseEditorLayout.test.ts
git diff --check -- src/renderer/course/courseEditorLayout.ts tests/unit/courseEditorLayout.test.ts docs/plans/AI_NATIVE_PARALLEL_10_LAYOUT_POLICY_LANE.md
```

明确禁止在本 lane 运行：`npm run typecheck`、任何 build、compat、prepare:e2e、Playwright/Electron E2E、`npm test`、`npm run verify*`。类型联检由最终集成任务 `I1` 一次完成。

## 7. 验收标准

- 只有 §2 两个新代码文件发生代码改动。
- §3 导出合同完整，返回值没有第五种模式。
- 所有测试矩阵通过，输入无变更、无持久化副作用。
- 未新增依赖、Schema、Store、migration、feature flag 或 UI。
- 最小验证通过后只标记本 lane 为 `engineering candidate`，不得宣称 P3 完成。

## 8. Handoff 给 SHELL

交付中必须附上以下机器可读摘要：

```text
LAYOUT_HANDOFF
TASK_ID：A1-A3-LAYOUT-POLICY
状态：DONE / BLOCKED
导出文件：src/renderer/course/courseEditorLayout.ts
导出符号：CourseEditorLayout, CourseEditorShellPolicy, deriveCourseEditorLayout, deriveCourseEditorShellPolicy
行为差异：无 / 精确说明
最小验证：命令 + 通过数
修改文件：逐行列出
已知风险：无 / 精确说明
```

SHELL lane 只有收到 `状态：DONE` 且导出合同与 §3 一致后才可开始。

## 9. 停止条件

出现任一情况立即停止，`STATUS` 改为 `BLOCKED` 并按共享合同回报：

- 两个 new-file ownership 文件已存在且含无法确认归属的修改。
- 需要修改 shared type、Schema、Store、App 或 UI 才能让纯函数成立。
- 合法 V9 输入无法按四值合同表达。
- 最小测试连续三次因同一跨模块问题失败。
- 需要持久化模式、自动修复工程、引入依赖或增加可见 AI。

## 10. 交付记录

### Wave 1 交付（2026-08-16）

- 状态：`DONE`（本 lane 最小验证通过，`engineering candidate`；P3 整体是否完成取决于 SHELL 接入与 `I1`）。
- 新增文件：
  - `src/renderer/course/courseEditorLayout.ts`（导出 `CourseEditorLayout`、`CourseEditorPrimaryNavigation`、`CourseEditorShellPolicy`、`deriveCourseEditorLayout`、`deriveCourseEditorShellPolicy`，形状与映射表严格按 §3）。
  - `tests/unit/courseEditorLayout.test.ts`（§4/§5 全部必须断言，23 条用例全部通过）。
- 行为差异：无（本 lane 不接 UI、不写 Store、不保存任何模式字段）。
- 最小验证：
  - `npx vitest run tests/unit/courseEditorLayout.test.ts` → 23 passed。
  - `git diff --check -- src/renderer/course/courseEditorLayout.ts tests/unit/courseEditorLayout.test.ts docs/plans/AI_NATIVE_PARALLEL_10_LAYOUT_POLICY_LANE.md` → clean。
- 关键实现不变量：
  - 只从 `project.locations` 实际引用到的 surface 推导；孤立 surface 不影响。
  - location 引用缺失 surface、无可解析 location（空数组）、运行时未知 surface type 均抛可读 `Error`，不 catch、不写回输入。
  - `deriveCourseEditorShellPolicy` 复用 `deriveCourseEditorLayout`，无第二套课型判断。
  - `simpleSidebarTabs` 为冻结共享常量，永远 `['elements', 'layers', 'properties']`。
  - 纯策略无 React/Store/DOM/CSS import，无持久化副作用。
- 接线：无。SHELL lane 按 §8 `LAYOUT_HANDOFF` 摘要消费（见执行者最终交付），本 lane 未修改任何既有文件。
