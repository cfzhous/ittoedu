# T1-D 合同 JSON 快照（不接 CI 哈希门禁）

> 状态：**已合入，禁止重做**  
> 并行：可与 P5-persist、T6-docs、T6-scan、T1-A0 分树  
> 合同变化：否（快照当前 Schema，不改判别器）  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

按 `scripts/generate-ai-capabilities.ts` 的 generate / `--check` 模式，从**现有** Zod schema 写出 `artifacts/contracts/`。本任务不把哈希接到 GitHub Actions。T6 冻结才把门禁接到每个 PR。

## 允许修改

```text
scripts/generate-contracts.ts
artifacts/contracts/**
package.json                          只追加 generate:contracts / check:contracts 两条 script
docs/tasks/editor-1.0/T1_D_HANDOFF.md
```

`check:contracts` 可以是 `tsx scripts/generate-contracts.ts --check`，不必再新建 `scripts/check-contracts.ts`。若新建了，HANDOFF 写明。

## 禁止

- 改 `src/shared/**` Schema / 类型。
- 改 CI、`.github`、`docs/contracts/**`。
- 移动类型到 `src/shared/contracts/`（那是 T1-A0 / T1-A）。
- 删除 `legacy-runtime-v2`。
- 运行 `npm test` / typecheck / e2e / `build:desktop`。

## 逐步算法

1. 只读 `scripts/generate-ai-capabilities.ts` 末尾 `parseCliOptions` / `checkAiCapabilityArtifacts`（约 1239–1220）当模板。
2. `scripts/generate-contracts.ts`：
   - 用 Zod 4：`z.toJSONSchema(schema)`（若 API 名不同，以本仓库 `zod` 4.4 为准，HANDOFF 写明）。
   - 只导出这三个已存在的 schema：
     - `courseProjectDocumentSchema`（`src/shared/courseProjectSchema.ts`）
     - `publishedCourseV2Schema`（`src/shared/publishedCourseSchema.ts`）
     - `componentManifestSchema`（`src/shared/componentSchema.ts`）
   - 写成：
     - `artifacts/contracts/course-project-v9.schema.json`
     - `artifacts/contracts/published-course-v2.schema.json`
     - `artifacts/contracts/component-manifest.schema.json`
     - `artifacts/contracts/contract-manifest.json`（文件名、sha256、schema 名称、生成命令）
   - JSON 稳定：`JSON.stringify(value, null, 2)` + 末尾换行。
   - `--check`：磁盘字节必须与内存生成完全一致，否则 exit 1。
3. `package.json` scripts 只加：
   - `"generate:contracts": "tsx scripts/generate-contracts.ts"`
   - `"check:contracts": "tsx scripts/generate-contracts.ts --check"`
   不要改别的 script，不要改 version。
4. 运行 generate 写出文件，再运行 `--check` 必须通过。

## 最小验证

```powershell
npx tsx scripts/generate-contracts.ts
npx tsx scripts/generate-contracts.ts --check
git diff --check
```

不要跑全量 Vitest。

## 完成判定

- [ ] 三份 schema JSON + manifest 已生成
- [ ] `--check` 通过
- [ ] 未改 Zod 源文件
- [ ] 已 push `cursor/t1-contracts-gen-de5c`
- [ ] 有 `T1_D_HANDOFF.md`

## 下游

T6 冻结把 `npm run check:contracts` 接到 CI。T1-B 改判别器后必须重新 generate。
