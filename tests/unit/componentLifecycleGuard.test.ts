import { describe, expect, it, vi } from 'vitest'
import {
  guardComponentLifecycle,
  tryCreateComponentLifecycle,
} from '../../src/shared/componentLifecycleGuard'

describe('组件生命周期错误隔离', () => {
  it('捕获 create 异常和无效返回值，不向宿主抛出', () => {
    const onError = vi.fn()
    const thrown = tryCreateComponentLifecycle(
      () => { throw new Error('create boom') },
      { componentId: 'widget', instanceId: 'one', onError },
    )
    expect(thrown).toMatchObject({
      ok: false,
      failure: {
        phase: 'create',
        message: 'create boom',
        componentId: 'widget',
        instanceId: 'one',
      },
    })
    expect(() => tryCreateComponentLifecycle(() => ({}), { onError }))
      .not.toThrow()
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('更新阶段首次失败后隔离实例，但仍尝试且仅尝试一次销毁', () => {
    const resize = vi.fn(() => { throw new Error('resize boom') })
    const updateProps = vi.fn()
    const destroy = vi.fn(() => { throw new Error('destroy boom') })
    const onError = vi.fn()
    const lifecycle = guardComponentLifecycle(
      { resize, updateProps, destroy },
      { componentId: 'widget', instanceId: 'instance', onError },
    )

    expect(() => lifecycle.resize?.(100, 100)).not.toThrow()
    lifecycle.resize?.(200, 200)
    lifecycle.updateProps?.({ title: 'ignored after quarantine' })
    expect(resize).toHaveBeenCalledTimes(1)
    expect(updateProps).not.toHaveBeenCalled()
    expect(lifecycle.isFailed()).toBe(true)
    expect(lifecycle.getFailure()).toMatchObject({
      phase: 'resize',
      message: 'resize boom',
    })

    expect(() => lifecycle.destroy()).not.toThrow()
    lifecycle.destroy()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'destroy' }))
  })

  it('保留原生命周期 this 绑定', () => {
    const raw = {
      value: 0,
      resize(width: number) {
        this.value = width
      },
      destroy() {
        this.value = -1
      },
    }
    const lifecycle = guardComponentLifecycle(raw)
    lifecycle.resize?.(42, 10)
    expect(raw.value).toBe(42)
    lifecycle.destroy()
    expect(raw.value).toBe(-1)
  })

  it('代理可见性、暂停和恢复生命周期', () => {
    const setVisible = vi.fn()
    const suspend = vi.fn()
    const resume = vi.fn()
    const lifecycle = guardComponentLifecycle({
      setVisible,
      suspend,
      resume,
      destroy() {},
    })

    lifecycle.setVisible?.(false)
    lifecycle.suspend?.()
    lifecycle.resume?.()

    expect(setVisible).toHaveBeenCalledWith(false)
    expect(suspend).toHaveBeenCalledOnce()
    expect(resume).toHaveBeenCalledOnce()
  })

  it('等待 prepareCapture，并向导出链路传播异步失败', async () => {
    const onError = vi.fn()
    let resolvePreparation: (() => void) | undefined
    const lifecycle = guardComponentLifecycle({
      prepareCapture: () => new Promise<void>((resolve) => {
        resolvePreparation = resolve
      }),
      destroy() {},
    }, { onError })

    const preparation = lifecycle.prepareCapture?.()
    expect(resolvePreparation).toBeTypeOf('function')
    resolvePreparation?.()
    await expect(preparation).resolves.toBeUndefined()
    expect(lifecycle.isFailed()).toBe(false)

    const failed = guardComponentLifecycle({
      prepareCapture: async () => { throw new Error('capture boom') },
      destroy() {},
    }, { onError })
    await expect(failed.prepareCapture?.()).rejects.toThrow('capture boom')
    expect(failed.getFailure()).toMatchObject({
      phase: 'prepareCapture',
      message: 'capture boom',
    })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'prepareCapture',
    }))
  })

  it('已在其他阶段失败时，即使未实现捕获钩子也拒绝宣告捕获就绪', async () => {
    const lifecycle = guardComponentLifecycle({
      resize() { throw new Error('resize already failed') },
      destroy() {},
    })

    lifecycle.resize?.(320, 180)

    expect(lifecycle.prepareCapture).toBeTypeOf('function')
    await expect(lifecycle.prepareCapture?.()).rejects.toThrow(
      'resize already failed',
    )
  })
})
