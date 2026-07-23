import type { ExportPayload } from '../shared/componentTypes'
import type { RuntimeDocument } from '../shared/runtimeTypes'
import type {
  RuntimeEventDisposer,
  RuntimeExecutionMode,
  RuntimeHostActions,
  RuntimeNavigationGuard,
} from '../shared/runtimeTypes'
import type { SceneDocument } from '../shared/projectTypes'
import { CourseEventBus } from './CourseEventBus'
import { CourseStateStore } from './CourseStateStore'
import { RuntimeHost, type RuntimeMountEnvironment } from './RuntimeHost'
import { RuntimeRegistry } from './RuntimeRegistry'
import type { CaptureSurfaceSnapshotter } from './PreparedCanvasSnapshots'

export interface CourseRuntimeKernelOptions {
  mode?: RuntimeExecutionMode
}

export class CourseRuntimeKernel {
  readonly events = new CourseEventBus()
  readonly courseState: CourseStateStore

  private readonly runtimeRegistry = new RuntimeRegistry()
  private readonly navigationGuards = new Set<RuntimeNavigationGuard>()
  private readonly mode: RuntimeExecutionMode
  private globalHost: RuntimeHost | null = null
  private sceneHost: RuntimeHost | null = null
  private currentSceneId: string | undefined
  private width: number
  private height: number
  private visible = true
  private suspended = false
  private destroyed = false

  constructor(
    private readonly payload: ExportPayload,
    private readonly actions: Readonly<RuntimeHostActions>,
    options: CourseRuntimeKernelOptions = {},
  ) {
    this.mode = options.mode ?? 'preview'
    this.width = payload.project.canvas.width
    this.height = payload.project.canvas.height
    this.courseState = new CourseStateStore((change) => {
      this.events.emit('state:change', { scope: 'course', ...change })
    })
  }

  mountGlobal(environment: RuntimeMountEnvironment): void {
    this.globalHost?.destroy()
    this.globalHost = this.mountRuntime(
      this.payload.project.globalRuntime,
      '全局运行时',
      'global',
      environment,
    )
  }

  leaveCurrentScene(toSceneId?: string): void {
    if (!this.currentSceneId) return
    const detail = { sceneId: this.currentSceneId, toSceneId }
    this.events.emit('scene:before-leave', detail)
    this.sceneHost?.destroy()
    this.sceneHost = null
    this.events.emit('scene:leave', detail)
    this.currentSceneId = undefined
  }

  enterScene(
    scene: SceneDocument,
    environment: RuntimeMountEnvironment,
  ): void {
    this.events.emit('scene:before-enter', { sceneId: scene.id })
    this.currentSceneId = scene.id
    this.sceneHost = this.mountRuntime(
      scene.runtime,
      `场景运行时：${scene.name}`,
      'scene',
      environment,
      scene.id,
    )
    this.events.emit('scene:enter', { sceneId: scene.id })
  }

  resolveNavigation(targetSceneId: string): string | null {
    if (!this.payload.project.scenes.some((scene) => scene.id === targetSceneId)) {
      this.blockNavigation(targetSceneId, '目标场景不存在')
      return null
    }

    let resolvedTarget = targetSceneId
    for (const guard of [...this.navigationGuards]) {
      try {
        const result = guard({
          fromSceneId: this.currentSceneId,
          toSceneId: resolvedTarget,
        })
        if (result === false) {
          this.blockNavigation(resolvedTarget, '导航守卫阻止了跳转')
          return null
        }
        if (typeof result === 'string') {
          if (!this.payload.project.scenes.some((scene) => scene.id === result)) {
            this.blockNavigation(result, '导航守卫重定向到了不存在的场景')
            return null
          }
          resolvedTarget = result
        }
      } catch (error) {
        console.error('课程导航守卫执行失败', error)
        this.blockNavigation(resolvedTarget, '导航守卫执行失败')
        return null
      }
    }
    return resolvedTarget
  }

  emitCourseStart(): void {
    this.events.emit('course:start', { sceneCount: this.payload.project.scenes.length })
  }

  resetForRestart(): void {
    this.leaveCurrentScene(this.payload.project.scenes[0]?.id)
    this.globalHost?.destroy()
    this.globalHost = null
    this.navigationGuards.clear()
    this.courseState.clear()
  }

  emitCourseRestart(): void {
    this.events.emit('course:restart', undefined)
  }

  async waitForCaptureReady(
    snapshotSurfaces?: CaptureSurfaceSnapshotter,
  ): Promise<void> {
    // Prepare and preserve each WebGL/Canvas surface immediately. Running both
    // hosts as one Promise.all barrier can let a slower host outlive an earlier
    // preserveDrawingBuffer=false frame.
    await this.globalHost?.waitForCaptureReady(snapshotSurfaces)
    await this.sceneHost?.waitForCaptureReady(snapshotSurfaces)
  }

  resize(width: number, height: number): void {
    if (this.destroyed) return
    this.width = width
    this.height = height
    this.globalHost?.resize(width, height)
    this.sceneHost?.resize(width, height)
  }

  setVisible(visible: boolean): void {
    if (this.destroyed || this.visible === visible) return
    this.visible = visible
    this.globalHost?.setVisible(visible)
    this.sceneHost?.setVisible(visible)
  }

  suspend(): void {
    if (this.destroyed || this.suspended) return
    this.suspended = true
    this.globalHost?.suspend()
    this.sceneHost?.suspend()
  }

  resume(): void {
    if (this.destroyed || !this.suspended) return
    this.suspended = false
    this.globalHost?.resume()
    this.sceneHost?.resume()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.events.emit('course:destroy', undefined)
    this.sceneHost?.destroy()
    this.globalHost?.destroy()
    this.sceneHost = null
    this.globalHost = null
    this.navigationGuards.clear()
    this.courseState.clear()
    this.runtimeRegistry.dispose()
    this.events.dispose()
    this.currentSceneId = undefined
  }

  private mountRuntime(
    runtime: RuntimeDocument | undefined,
    label: string,
    scope: 'global' | 'scene',
    environment: RuntimeMountEnvironment,
    sceneId?: string,
  ): RuntimeHost | null {
    if (!runtime?.enabled) return null
    const host = new RuntimeHost({
      registry: this.runtimeRegistry,
      runtime,
      label,
      scope,
      mode: this.mode,
      sceneId,
      width: this.width,
      height: this.height,
      environment,
      actions: this.actions,
      events: this.events,
      courseState: this.courseState,
      assetUrl: (assetId) => {
        const asset = this.payload.assets[assetId]
        if (!asset) throw new Error(`工程素材“${assetId}”不存在`)
        return asset.dataUrl
      },
      registerNavigationGuard: (guard) => this.registerNavigationGuard(guard),
    })
    if (!this.visible) host.setVisible(false)
    if (this.suspended) host.suspend()
    return host
  }

  registerNavigationGuard(
    guard: RuntimeNavigationGuard,
  ): RuntimeEventDisposer {
    this.navigationGuards.add(guard)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.navigationGuards.delete(guard)
    }
  }

  private blockNavigation(targetSceneId: string, reason: string): void {
    this.events.emit('navigation:blocked', {
      fromSceneId: this.currentSceneId,
      toSceneId: targetSceneId,
      reason,
    })
  }
}
