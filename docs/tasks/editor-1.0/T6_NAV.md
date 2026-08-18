# T6-nav 文档入口接到合同说明

> 状态：**已合入，禁止重做**  
> 并行：已结束  

> 合同变化：否  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

在现有文档导航和命令表里**加上**已合入的 `docs/contracts/` 与 `generate:contracts` / `check:contracts`。不改产品故事，不宣称 Editor 1.0 已发布。

## 允许修改

```text
README.md
docs/README.md
docs/USER_GUIDE.md
AGENTS.md
docs/tasks/editor-1.0/T6_NAV_HANDOFF.md
```

每份只做**必要的一两处**插入。不要重写章节。

## 禁止

- 改 `src/**`、CI、Schema、`artifacts/**`。
- 把 `PROJECT_SCHEMA_VERSION = 8` 写成当前工程版本。
- 写「Editor 1.0 已发布」或删掉「须教师 accepted」。
- 运行 `npm test` / typecheck / e2e / `build:desktop`。

## 逐步算法

1. `docs/README.md`「当前使用」表增加一行：合同说明 → `docs/contracts/COURSE_PROJECT_V9.md`（可同时链到兼容政策与架构边界）。把计划版本口误 12.4 改成 12.5（若仍写 12.4）。
2. 根目录 `README.md`：
   - 计划版本若仍写 12.4，改为 12.5。
   - 「常用命令」表追加：
     - `npm run generate:contracts` — 从 Zod 生成 `artifacts/contracts/`
     - `npm run check:contracts` — 检查快照与源码一致
   - `validate:project` 那一行若仍写「T4 会切到 Course Project V9」，改成「当前入口即 Course Project V9」（T4 已合入）。
   - `protocolVersions.project` 仍显示 8 的过时句，改成指向能力索引 `protocols.project` 为 9（T4 已合入）；**不要**编造索引里没有的字段。
3. `docs/USER_GUIDE.md` 只在开头「当前工程格式」附近加一句：详细合同见 `docs/contracts/`。不要改操作步骤。
4. `AGENTS.md` 只加一句：V9 合同说明在 `docs/contracts/`。不要改创作路由。

## 最小验证

```powershell
git diff --check
```

人工确认：四份文件都没有「Editor 1.0 已发布」。

## 完成判定

- [ ] 导航能点到三份合同文档
- [ ] 命令表有 generate/check:contracts
- [ ] 已 push `cursor/t6-nav-de5c`
- [ ] 有 `T6_NAV_HANDOFF.md`

## 下游

T6 冻结切片可以再补 CI 全量命令，不必再重写产品故事。
