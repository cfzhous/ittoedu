# T6-docs 合同说明（不含全量验证）

> 状态：**可领取**  
> 并行：可与 P5-persist、T6-scan、T1-D、T1-A0 分树（文件不重叠）  
> 合同变化：否（只写文档，不改 Schema / 不冻哈希）  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

把**当前源码里已经成立**的 V9 / Published V2 / Runtime 2·3 / Component 4 写成三份教师与代理都能读的合同说明。不要宣称 Editor 1.0 已发布。不要跑全量验证。

## 允许修改

```text
docs/contracts/COURSE_PROJECT_V9.md
docs/contracts/V9_COMPATIBILITY_POLICY.md
docs/contracts/EDITOR_1_0_ARCHITECTURE_BOUNDARY.md
docs/tasks/editor-1.0/T6_DOCS_HANDOFF.md
```

## 禁止

- 改 `src/**`、`tests/**`、`package.json`、CI、`artifacts/**`。
- 改 `README.md` / `USER_GUIDE.md` / `AGENTS.md`（那是 T6 冻结切片）。
- 发明 `projectMode`、四模式、Hash/审批/Evidence、可见 AI。
- 把 `legacy-runtime-v2` 写成「已经删除」。它仍在 Schema 与 T0 `canvas-runtime` 夹具里，直到 T1-B。
- 写 `accepted` / `art candidate`。
- 运行 `npm test` / typecheck / e2e / `build:desktop`。

## 逐步算法

1. 只读这些事实源（不要再扫全仓库）：
   - `COURSEWARE_DEVELOPMENT_PLAN.md` 第 1、3、4、6 节
   - `docs/tasks/editor-1.0/01_SHARED.md`
   - `src/shared/courseProjectTypes.ts` 里 `COURSE_PROJECT_SCHEMA_VERSION`
   - `src/shared/publishedCourseTypes.ts` 里 Published V2 常量
2. 新建 `docs/contracts/` 三份 Markdown，每份用短句，对照源码：
   - **COURSE_PROJECT_V9.md**：`schemaVersion: 9` 是唯一可打开工程；三种 surface；没有持久化 `projectMode`；教师控制器一份全局图层；Spatial/Flow 可选 `backgroundColor?` 缺省白；点名 T0 夹具仍含 `legacy-runtime-v2` / `legacy-whole-canvas`。
   - **V9_COMPATIBILITY_POLICY.md**：1.0 之后只 additive；破坏性进 V10；不打开 V8 `.h5lesson`；`PROJECT_SCHEMA_VERSION = 8` 是历史 V8 形状常量，不是当前工程版本。
   - **EDITOR_1_0_ARCHITECTURE_BOUNDARY.md**：试运行/整课预览 = CoursePlayer + Published V2 宿主；Phaser 只服务 Slide 编辑命中；Native / Runtime / Component 进统一图层；编辑器内无可见 AI。
3. 文中引用类型名必须与源码一致。拿不准就写「以源码为准」并停，不要编字段。

## 最小验证

```powershell
git diff --check
```

确认三份文件非空，且不含「Editor 1.0 已发布」。

## 完成判定

- [ ] 三份合同文档已写入 `docs/contracts/`
- [ ] 未改源码 / 未跑全量
- [ ] 已 push `cursor/t6-docs-de5c`
- [ ] 有 `T6_DOCS_HANDOFF.md`

## 下游

T6 冻结切片接 CI 与哈希。T1-B 之后再改文档里对 `legacy-*` 的「仍存在」表述。
