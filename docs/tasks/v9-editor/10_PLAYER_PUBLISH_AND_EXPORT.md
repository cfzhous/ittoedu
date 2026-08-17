# T09 — Player、发布与导出一致性

> Wave：2，可与 T05–T08 并行
> 依赖：T02/T03 的稳定动作与课程结构合同
> Surface ownership：Flow host 由 T07，Spatial host 由 T08

## 1. 可见结果

真实 Published Course Player 按统一 location 顺序播放 Slide、Flow、Spatial；教师控制台、场景目录、进度、声音、重播/重置和全局层投射一致；HTML、网页包、PPTX、PDF/DOCX 与编辑工程使用同一 producer 真相。

## 2. 独占文件

- `src/player/PublishedCourseApp.ts`
- `src/player/ScenePickerOverlay.ts`
- `src/player/surfaces/mixed/**`
- `src/player/surfaces/CoursePlayer.ts`
- `src/player/surfaces/slide/**`
- `src/player/AudioManager.ts`
- `src/player/renderTeacherController.ts`
- `src/player/teacherControllerDom.ts`
- `src/player/teacherControllerRuntimeSession.ts`
- `src/player/TeacherEscapeControls.ts`
- `src/renderer/export/course/**`
- 对应 Player/export 单测

不修改 Flow/Spatial host、App/store/editor UI、Schema 或生成目录。

## 3. 必须闭合

### 3.1 跨 surface 导航

- 场景目录按 `locations` 列举三类内容，不再只过滤 `slide-scene`。
- 上一/下一、目录选择和进度按统一 location 顺序；active location 决定 host。
- Mixed 切换时销毁旧 surface 会话，防止事件、音频、selection 或 camera 泄漏。
- 重播/重置只作用当前 location；课程级声音与进度持续一致。

### 3.2 教师控制台运行态

- 动作集与 UI 规范一致，不出现“定位”或控制台内“试运行”。
- 折叠状态与发布配置一致；运行会话临时开合不污染工程。
- Spatial host 获得真实 audio change 与 course progress source；Flow/Slide 同样监听统一课程会话。
- global controller 对适用 location 投射，同一稳定地址不会产生重复动作。

### 3.3 发布/导出

- `buildPublishedCourse` 是 HTML/网页包/Player 的共享 producer。
- global/surface/page/state/world 内容按 owner/visibility 正确物化。
- HTML/网页包资源寻址、Runtime API 2/3、Component API 4 保持兼容。
- PPTX/PDF/打印对不支持的动态内容使用明确静态占位或 warning，不静默丢失。
- Flow DOCX 导出当前 Flow 页面真实语义结构；文件名避免覆盖。
- V8 只经显式导入迁移，不成为发布输入默认格式。

## 4. 不做

- 不改编辑器 UI 或 store 保存链。
- 不把 Runtime/Component 伪装成 Focusky 完成度。
- 不手工修改 `dist-player`、示例 `course.html` 或 output。
- 不运行 build 来证明单元改动。

## 5. 最小验证

```powershell
npx vitest run tests/unit/scenePickerOverlay.test.ts tests/unit/publishedCourseSpatial.test.ts
npx vitest run tests/unit/teacherControllerRuntimeSession.test.ts tests/unit/audioManager.test.ts
npx vitest run tests/unit/coursePublishPipeline.test.ts tests/unit/multiSurfaceExports.test.ts
npx vitest run tests/unit/exportPreflight.test.ts tests/unit/webPackageExport.test.ts
git diff --check -- src/player/PublishedCourseApp.ts src/player/ScenePickerOverlay.ts src/player/surfaces/mixed src/player/surfaces/CoursePlayer.ts src/player/surfaces/slide src/player/AudioManager.ts src/player/renderTeacherController.ts src/player/teacherControllerDom.ts src/player/teacherControllerRuntimeSession.ts src/player/TeacherEscapeControls.ts src/renderer/export/course
```

只运行触及组。禁止 build、typecheck、全量测试、E2E 和生成 artifact。

## 6. 验收

- Mixed 场景目录真实列出三类 location。
- Spatial/Flow/Slide 的控制器声音和进度不再钉死初值。
- 全局层和控制器投射不重复、不丢失、不改变工程。
- 每种导出对相同项目结构有可解释结果。
- 需要 App/store 试运行接线时提交给 T10。

## 7. 交付记录

HANDOFF
- task: T09 Player、发布与导出一致性
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `C:\Users\74755\Documents\HTML课件编辑器\output\worktrees\v9-parity-reconstruction`
- outcome: Published Player 按可导航 `locations` 播放 Slide/Flow/Spatial；目录、上一/下一、进度共用同一顺序；Mixed 切走只释放 surface 会话（suspend，不 destroy host）；教师控制台去掉「定位」与控制台内「试运行」；`audio:change` 与 course progress source 已交给 Slide/Spatial；`buildPublishedCourseV2Payload` 只接受 V9，PPTX/PDF 动态内容有占位/warning，Flow DOCX 用语义结构且文件名去重。App/store 试运行接线留给 T10。
- files changed:
  - `src/player/PublishedCourseApp.ts` — 可导航 location 过滤；目录走 locations；跨 surface 先 `scene:leave` 再 activate；给 Slide/Flow/Spatial 接统一执行器、audio/progress；教师动作排队串行
  - `src/player/ScenePickerOverlay.ts` — locations 模式；Slide 按钮同时带 `data-location-id` 与 `data-scene-id`
  - `src/player/surfaces/CoursePlayer.ts` — `releaseSurfaceSession`（实质 suspend）
  - `src/player/surfaces/mixed/MixedCourseNavigator.ts` — 切 surface 先 release 再 activate
  - `src/player/surfaces/slide/SlideSurfaceHost.ts` — `courseProgressSource`；inactive 不绑 InteractionEngine；suspend 先 `scene:exit` 再拆引擎
  - `src/player/teacherControllerRuntimeSession.ts` / `teacherControllerDom.ts` / `renderTeacherController.ts` — 运行态过滤「定位」「试运行」；折叠仍是内存 session
  - `src/renderer/export/course/flowDocx.ts` — `uniqueFlowDocxFilename`
  - 对应单测：`scenePickerOverlay`、`publishedCourseSpatial`、`teacherControllerRuntimeSession`、`teacherControllerDom`、`coursePublishPipeline`、`multiSurfaceExports`
  - 未改：`AudioManager.ts`、`TeacherEscapeControls.ts`、Flow/Spatial host、App/store、Schema、`dist-player`、示例 `course.html`
- focused validation commands:
  ```
  npx vitest run tests/unit/scenePickerOverlay.test.ts tests/unit/publishedCourseSpatial.test.ts
  npx vitest run tests/unit/teacherControllerRuntimeSession.test.ts tests/unit/audioManager.test.ts
  npx vitest run tests/unit/coursePublishPipeline.test.ts tests/unit/multiSurfaceExports.test.ts
  npx vitest run tests/unit/exportPreflight.test.ts tests/unit/webPackageExport.test.ts
  git diff --check -- src/player/PublishedCourseApp.ts src/player/ScenePickerOverlay.ts src/player/surfaces/mixed src/player/surfaces/CoursePlayer.ts src/player/surfaces/slide src/player/AudioManager.ts src/player/renderTeacherController.ts src/player/teacherControllerDom.ts src/player/teacherControllerRuntimeSession.ts src/player/TeacherEscapeControls.ts src/renderer/export/course
  ```
- results:
  - scenePicker + Spatial：9 passed（后因 T07 正在写 Flow host 复跑 Spatial 曾瞬时 parse fail，文件恢复后 Spatial 5 passed）
  - teacherControllerRuntimeSession + audioManager：22 passed
  - coursePublishPipeline + multiSurfaceExports：32 passed（守卫测试初红：教师动作锁丢掉第二次 next；已改为排队串行）
  - exportPreflight + webPackageExport：14 passed
  - `git diff --check`：clean
- INTEGRATION_REQUESTS:

INTEGRATION_REQUEST
- requester: T09
- target owner: T07
- target file: `src/player/surfaces/flow/FlowSurfaceHost.ts`
- exported symbol / callback: `FlowSurfaceHostOptions.courseProgressSource`（透传 overlay `SlideSurfaceHost`）
- required behavior: Flow overlay 教师控制台进度读课程 location，而不是 `flow-overlay-*` 假 scene。T09 已把 `interactions`/`executeTeacherControllerAction`/`initialMuted` 传入；不能改 host，故 overlay 仍无 progress source。
- focused test that proves the lane side: Mixed 目录跳到 Flow 后，控制台进度为课程 location 序号/名称，不是「1 / 1 · 语义长文覆盖图层」
- risk if omitted: Flow 页进度与 Slide/Spatial 不一致

INTEGRATION_REQUEST
- requester: T09
- target owner: T08
- target file: `src/player/surfaces/spatial/SpatialSurfaceHost.ts`
- exported symbol / callback: `suspend()` 卸 `document` `pointermove`/`pointerup`，或在 `#active === false` 时忽略
- required behavior: Mixed 切走 Spatial 后，document 级手势不得继续改 camera。T09 已 `releaseSurfaceSession` + 隐藏容器 `pointer-events: none`，但 mount 挂在 `document` 上的监听在 suspend 后仍在。
- focused test that proves the lane side: 切到 Slide 后 document pointermove 不再改变已挂起 Spatial 的 camera
- risk if omitted: Mixed 切走后 Spatial camera 仍可能被拖动

INTEGRATION_REQUEST
- requester: T09
- target owner: T10
- target file: `src/renderer/App.tsx` / `src/renderer/store/editorStore.ts`
- exported symbol / callback: 顶栏「试运行」挂 `startPublishedCourse`；下载多份 Flow DOCX 时调用 `uniqueFlowDocxFilename`
- required behavior: 试运行只在编辑器顶栏，不进教师控制台，不写工程。发布/网页包继续用 `buildPublishedCourseV2Payload`（`sourceSchemaVersion: 9`）。多 Flow 导出文件名不得互相覆盖。
- focused test that proves the lane side: 顶栏试运行进入当前 location；控制台无「试运行」；两份同名 Flow DOCX 下载为 `标题.docx` / `标题-2.docx`
- risk if omitted: 编辑器内无法试运行；多 Flow DOCX 可能互相覆盖
- visual/manual evidence: 无。按合同只跑触及组单测，未做 Player 截图或导出 artifact。
- remaining risks:
  - Flow 控制台进度仍可能显示 overlay 假 scene，直到 T07 透传 `courseProgressSource`
  - Spatial document 指针监听在 suspend 后仍挂着，直到 T08 卸监听
  - `AudioManager` 仍吃 V8 `ProjectDocument`；Published 静音走 DOM media + `audio:change`，未把 AudioManager 塞进 V9 App
  - 可导航过滤会跳过无 heading/section 的普通 Flow 段落（对齐 T03）；`locations` 里仍可能有这些项，但上一/下一/目录不用它们
  - Mixed 切走是 suspend 不是 destroy，以满足 Flow 组件 `clickCount` 保持；Slide 会拆 InteractionEngine，回来再绑
- status: engineering candidate

HANDOFF (T07 courseProgressSource follow-up)
- task: T09
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `C:\Users\74755\Documents\HTML课件编辑器\output\worktrees\v9-parity-reconstruction`
- outcome: `PublishedCourseApp` 把同一 `#courseProgressSource()` 传给 Flow host，与 Slide/Spatial 对齐。Mixed 跳到 Flow heading 后，教师控制台显示课程 location 进度（`2 / 4 · 函数概念`），不再回退 `flow-overlay` 假 scene。T07 的 Flow `courseProgressSource` INTEGRATION_REQUEST 已在 T09 侧闭合。
- files changed:
  - `src/player/PublishedCourseApp.ts` — Flow host 增加 `courseProgressSource`
  - `tests/unit/publishedCourseSpatial.test.ts` — Mixed Flow 进度断言
- focused validation commands:
  ```
  npx vitest run tests/unit/publishedCourseSpatial.test.ts tests/unit/scenePickerOverlay.test.ts
  git diff --check -- src/player/PublishedCourseApp.ts
  ```
- results: 10 passed；`git diff --check` clean
- INTEGRATION_REQUESTS: T07 Flow progress 接线已闭合。T08 Spatial document 指针、T10 顶栏试运行仍待。
- visual/manual evidence: 无
- remaining risks: Flow 普通段落仍不进导航（T03）；Spatial document 指针仍待 T08
- status: engineering candidate

