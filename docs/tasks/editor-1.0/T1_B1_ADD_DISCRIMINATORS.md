# T1-B1 增加新 Runtime 判别器（不删旧的）

> 状态：**可领取**  
> 并行：可与 T3-aliases、T6-CI、T6-nav 分树（**不要**改 `editorStore.ts`）  
> 合同变化：是（只 **additive**）  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

在现有 `'surface-v1' | 'legacy-runtime-v2'` 上**增加** `'canvas-runtime'`（API 2）与 `'surface-runtime'`（API 3）。旧值仍合法。不要改生产写入，不要改 T0 夹具，不要删除 `legacy-*`。

## 允许修改

```text
src/shared/courseProjectTypes.ts
src/shared/courseProjectSchema.ts
src/shared/publishedCourseTypes.ts
src/shared/publishedCourseSchema.ts
tests/unit/courseProjectCoreContract.test.ts
artifacts/contracts/**
docs/tasks/editor-1.0/T1_B1_HANDOFF.md
```

改完 schema 后必须运行已有 `npm run generate:contracts` 更新 `artifacts/contracts/**`。不要手写那几份巨大 JSON。

## 禁止

- 改 `editorStore.ts`、任何 UI、夹具 `tests/fixtures/**`、`courseProjectRoundTrip.test.ts`。
- 改 `courseProjectModel.ts` 里 `migrateRuntime` 的默认写入（继续写 `legacy-runtime-v2`）。
- 删除 `legacy-runtime-v2` / `legacy-whole-canvas` / `surface-v1`。
- 改 superRefine：继续「只有 `legacy-runtime-v2` 才能用 `legacy-whole-canvas`」。
- 运行全量 test / typecheck / e2e / desktop。

## 规定形状

```ts
protocol: 'surface-v1' | 'legacy-runtime-v2' | 'canvas-runtime' | 'surface-runtime'
```

`courseRuntimeDefinitionSchema` 与 Published 对应 enum **必须同步**。

`superRefine` 合法配对补两行，保留旧两行：

```text
legacy-runtime-v2  + runtimeApiVersion 2
surface-v1         + runtimeApiVersion 3
canvas-runtime     + runtimeApiVersion 2
surface-runtime    + runtimeApiVersion 3
```

`canvas-runtime` 的 `renderMode` 允许现有 `'phaser' | 'dom' | 'hybrid'`。  
`surface-runtime` 与 `surface-v1` 一样：若现有规则要求 `renderMode === 'dom'`，新值同样要求。

新判别器的 frame 用 `mode: 'absolute', x:0, y:0, width:1280, height:720`。不要给新协议配 `legacy-whole-canvas`。

## 逐步算法

1. 改 types + 两份 schema 的 enum 与 superRefine。Published 同步。
2. 在 `courseProjectCoreContract.test.ts` **追加**（不要删旧用例）：
   - 一份最小 Course Project，runtime `protocol: 'canvas-runtime'`、`runtimeApiVersion: 2`、absolute 全画布 frame → `courseProjectDocumentSchema.safeParse` 成功。
   - 一份 `protocol: 'surface-runtime'`、`runtimeApiVersion: 3`、`renderMode: 'dom'` → 成功。
   - 一份 `canvas-runtime` + API 3 → 失败。
   - 旧 `legacy-runtime-v2` + `legacy-whole-canvas` 仍成功（可复用文件里已有构造；没有就从 round-trip 夹具思路抄最小对象）。
3. `npm run generate:contracts` 然后 `npm run generate:contracts -- --check`（或 `npm run check:contracts`）。
4. 若类型报错出现在允许列表外，**停**，HANDOFF 列出文件，不要扩散。

## 最小验证

```powershell
npx vitest run tests/unit/courseProjectCoreContract.test.ts tests/unit/courseProjectRoundTrip.test.ts
npm run check:contracts
git diff --check
```

## 完成判定

- [ ] 新旧判别器都能解析；配对错误被拒
- [ ] 夹具 round-trip 未改且仍通过
- [ ] 合同快照已再生且 `--check` 通过
- [ ] 未改 `editorStore` / 夹具
- [ ] 已 push `cursor/t1-b1-runtime-discriminators-de5c`
- [ ] 有 `T1_B1_HANDOFF.md`

## 下游

T1-B（等 T3-aliases）：生产写入改新判别器、改 T0 `canvas-runtime` 夹具、再删旧判别器。
