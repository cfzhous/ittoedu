# T6-tc-tests 修 typecheck 测试与 validate-project

> 状态：**可领取**  
> 并行：可与 [T1-A](T1_A_MOVE.md)、[T1-C](T1_C_AUDIT.md) 分树。不要改 `src/player/**` / Published 类型（T1-A）。不要改 `tests/unit/courseProjectTopLevelFields.test.ts`（T1-C）。  

> 合同变化：否  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

按 T2 / T3 / T1-B 已合入的产品语义，改测试与 `validate-project.ts` 里过时的字面量，让它们能通过 `tsc`。不要改产品 UI。

## 允许修改

```text
scripts/validate-project.ts
tests/unit/courseProjectCoreContract.test.ts
tests/unit/editorStore.test.ts
tests/unit/spatialCanvasBackground.test.ts
tests/unit/v9SlideProductIntegration.test.tsx
docs/tasks/editor-1.0/T6_TC_TESTS_HANDOFF.md
```

## 禁止

- 改 `src/player/**`、`src/renderer/ui/**`、Schema 判别器、`publishedComponentMount.ts`（那是另一张卡）。
- 把 `'v8'` 加回 `CourseProjectArchiveFormatKind`。当前只有 `'v9' | 'corrupted' | 'unsupported'`。
- 把 `'v9-slide-candidate'` 加回 `SlideBackendKind`。当前只有 `'slide-authoring'`。
- 运行全量 `npm test` / e2e / desktop。
- 打 tag、宣称已发布。

## 逐步算法（对照 T6 HANDOFF 报错）

1. `scripts/validate-project.ts` ≈625：`probe.kind === 'v8'` 与 `CourseProjectArchiveFormatKind` 无交集。V8 已归 `'unsupported'`。改成 `probe.kind === 'unsupported'`（或删掉死分支，只留 corrupted / unsupported 已有逻辑）。不要重新引入 v8 kind。
2. `tests/unit/courseProjectCoreContract.test.ts`：`makeRuntimeProject` 的参数类型写成了 `never`（`CourseProjectDocument['surfaces'][0] extends { type: 'slide' } ? any : never`）。改成 `CourseRuntimeDefinition` 或明确的 runtime 对象类型。非法 protocol 用例继续用类型断言喂 `safeParse`，期望失败。
3. `tests/unit/editorStore.test.ts` ≈134：`openDefaultCourseProject` 现在返回 `CourseProjectArchiveData`（只有 `project` / 文件），失败则 **抛错**，没有 `kind: 'v8'`。把「静默打开 V8」用例改成期望抛出 / `detectCourseProjectArchiveFormat(...).kind === 'unsupported'`，与 T2 一致。
4. `tests/unit/v9SlideProductIntegration.test.tsx`：指针结果 `kind` 是 `'slide-authoring'`（见 `workspaceSlideAuthoring.ts`），不是 `'v9-slide-candidate'`。断言改成 `'slide-authoring'`。
5. `tests/unit/spatialCanvasBackground.test.ts`：`omit backgroundColor` 后 `find()` 仍是联合类型，联合上没有该字段。收窄 `type === 'spatial-2d' | 'flow'` 再读字段，或对 omit 后的对象用明确的 Flow/Spatial 类型。不要给 Slide 顶层加 `backgroundColor`。

## 最小验证（红项优先，禁止全量）

当前 T6 红项是 `typecheck`。不要每改一个文件就跑；五个文件改完后 **只跑一次**：

```powershell
npm run typecheck
git diff --check
```

若 typecheck 仍只剩 published/宿主/contracts 文件错误，那是 T1-A 的范围：HANDOFF 列出，不要改那张卡的文件。

本卡改过的测试若还想确认行为，只跑这些文件 **一次**（不要 `npm test`）：

```powershell
npx vitest run tests/unit/courseProjectCoreContract.test.ts tests/unit/editorStore.test.ts tests/unit/spatialCanvasBackground.test.ts tests/unit/v9SlideProductIntegration.test.tsx
```

## 完成判定

- [ ] 本卡允许文件不再出现在 `tsc` 报错里（或剩余全是另一张卡的文件）
- [ ] 已 push `cursor/t6-tc-tests-de5c`
- [ ] 有 `T6_TC_TESTS_HANDOFF.md`
