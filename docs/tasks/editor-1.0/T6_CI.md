# T6-CI 只接合同快照检查

> 状态：**可领取**  
> 并行：可与 T3-aliases、T6-nav、T1-B1 分树  
> 合同变化：否  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

给仓库接上 GitHub Actions，**只**跑 `npm run check:contracts`。不要在本任务跑 typecheck / 全量 test / e2e / build:desktop（那是 T6 冻结切片）。

## 允许修改

```text
.github/workflows/check-contracts.yml
docs/tasks/editor-1.0/T6_CI_HANDOFF.md
```

## 禁止

- 改 `src/**`、`tests/**`、`package.json`、`artifacts/**`。
- 在 workflow 里跑 `npm test`、`npm run typecheck`、`npm run test:e2e`、`npm run build:desktop`、`npm run verify`。
- 打 tag、开 `release/1.x`。
- 宣称 Editor 1.0 已发布。

## 逐步算法

1. 新建 `.github/workflows/check-contracts.yml`。
2. 触发：`pull_request` 与 `push`（所有分支即可；不要只绑不存在的 `main` 保护规则）。
3. Job 名 `check-contracts`，`ubuntu-latest`：
   - `actions/checkout@v4`
   - `actions/setup-node@v4`，`node-version: '24'`，`cache: npm`
   - `npm ci`
   - `npm run check:contracts`
4. 不要加矩阵、不要加 Windows、不要上传制品。
5. 本地跑一次 `npm run check:contracts` 确认命令存在且通过，把结果写入 HANDOFF。不要为了绿而重写 schema。

## 最小验证

```powershell
npm run check:contracts
git diff --check
```

## 完成判定

- [ ] workflow 只跑 `check:contracts`
- [ ] 已 push `cursor/t6-ci-de5c`
- [ ] 有 `T6_CI_HANDOFF.md`

## 下游

T6 冻结切片再往同一 workflow（或新文件）加 typecheck / test / e2e / desktop。
