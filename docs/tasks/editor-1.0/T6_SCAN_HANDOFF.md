# T6-scan HANDOFF

- 范围：Editor 1.0 禁止项扫描测试（`tests/unit/editor10ForbiddenTokens.test.ts`），建立禁止项白名单棘轮。
- 合同是否变化：否
- 分支 / SHA：`cursor/t6-scan-de5c`
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：
  ```bash
  npx vitest run tests/unit/editor10ForbiddenTokens.test.ts
  ```
  11/11 测试全部通过（覆盖全部 11 个 forbidden tokens，严格执行无未授权命中以及无腐烂白名单双向断言）。
- 未验证（交给 T6）：
  - `npm test`
  - `npm run typecheck`
  - `npm run test:e2e`
  - `npm run build:desktop`
- 停下来的原因（若有）：无
- 下游：T1-B、T3-aliases、T2 等任务清理对应旧名字后，直接从白名单移除对应文件路径，测试将自动保护并不再允许新增。

---

## 扫描白名单详情 (WHITELIST)

1. `v9-slide-candidate`: `[]` (src/ 无命中)
2. `V8SlideBackend`: `[]` (src/ 无命中)
3. `V8_SLIDE_BACKEND`: `[]` (src/ 无命中)
4. `migrateProjectV8ToCourseProjectV9`:
   - `src/renderer/store/editorStore.ts`
   - `src/shared/courseProjectModel.ts`
5. `build-project-v8-courseware`: `[]` (src/ 无命中)
6. `导入旧版工程`: `[]` (src/ 无命中)
7. `legacy-runtime-v2`:
   - `src/renderer/store/editorStore.ts`
   - `src/shared/courseProjectModel.ts`
   - `src/shared/courseProjectSchema.ts`
   - `src/shared/courseProjectTypes.ts`
   - `src/shared/publishedCourseSchema.ts`
   - `src/shared/publishedCourseTypes.ts`
8. `legacy-whole-canvas`:
   - `src/renderer/store/editorStore.ts`
   - `src/shared/courseProjectModel.ts`
   - `src/shared/courseProjectSchema.ts`
   - `src/shared/courseProjectTypes.ts`
9. `isV9SlideCandidateBackend`:
   - `src/renderer/store/editorStore.ts`
   - `src/renderer/store/slideBackendPort.ts`
10. `selectSlideCandidateBackend`:
    - `src/renderer/App.tsx`
    - `src/renderer/authoring/v9TeacherControllerAuthoring.ts`
    - `src/renderer/store/editorStore.ts`
    - `src/renderer/ui/PropertiesTab.tsx`
    - `src/renderer/ui/Workspace.tsx`
11. `executeSlideCandidateCommand`:
    - `src/renderer/store/editorStore.ts`
    - `src/renderer/store/slideBackendPort.ts`
