import { describe, expect, it } from 'vitest'
import type { TeacherControllerNode } from '../../src/shared/projectTypes'
import { teacherControllerNode } from '../helpers/nativeNodeFixtures'
import {
  createTeacherControllerLayout,
  formatTeacherControllerProgress,
  teacherControllerButtonDisplayLabel,
} from '../../src/shared/teacherControllerLayout'

function controller(
  patch: Partial<TeacherControllerNode> = {},
): TeacherControllerNode {
  return {
    id: 'teacher-controller',
    name: '教师控制器',
    type: 'teacher-controller',
    x: 820,
    y: 18,
    width: 440,
    height: 56,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit',
    title: '教师控制台',
    showSceneProgress: true,
    compact: false,
    collapsible: true,
    defaultCollapsed: false,
    buttons: [
      { id: 'previous', action: { type: 'scene.previous' }, label: '上一页', visible: true },
      { id: 'replay', action: { type: 'scene.replay' }, label: '重播', visible: true },
      { id: 'next', action: { type: 'scene.next' }, label: '下一页', visible: true },
      { id: 'sound', action: { type: 'audio.toggle-mute' }, label: '声音', visible: false },
    ],
    style: {
      backgroundColor: '#0b1720',
      backgroundOpacity: 0.94,
      accentColor: '#d9bf73',
      textColor: '#f3eee0',
      cornerRadius: 14,
    },
    includeInStaticExports: false,
    ...patch,
  }
}

describe('createTeacherControllerLayout', () => {
  it('includes a visible state-free scene directory in the default controller', () => {
    const node = teacherControllerNode()
    const pickerButtons = node.buttons.filter(
      (button) => button.action.type === 'scene.open-picker',
    )

    expect(pickerButtons).toHaveLength(1)
    expect(pickerButtons[0]).toMatchObject({
      label: '场景目录',
      visible: true,
      action: { type: 'scene.open-picker' },
    })
  })

  it('只排列可见按钮并保持在横向控制条范围内', () => {
    const layout = createTeacherControllerLayout(controller(), 440, 56)

    expect(layout.buttons.map((button) => button.action.type)).toEqual([
      'scene.previous',
      'scene.replay',
      'scene.next',
    ])
    expect(layout.progress).not.toBeNull()
    expect(layout.title.x + layout.title.width).toBeLessThan(
      layout.buttons[0]!.x,
    )
    for (const button of layout.buttons) {
      expect(button.x).toBeGreaterThanOrEqual(0)
      expect(button.y).toBeGreaterThanOrEqual(0)
      expect(button.x + button.width).toBeLessThanOrEqual(layout.width)
      expect(button.y + button.height).toBeLessThanOrEqual(layout.height)
    }
  })

  it('紧凑模式隐藏进度占位并为按钮保留更多空间', () => {
    const normal = createTeacherControllerLayout(controller(), 440, 56)
    const compact = createTeacherControllerLayout(
      controller({ compact: true }),
      440,
      56,
    )

    expect(compact.progress).toBeNull()
    expect(compact.buttons[0]!.x).toBeLessThan(normal.buttons[0]!.x)
  })

  it('钳制尺寸、圆角、透明度并为非法颜色提供稳定后备', () => {
    const source = controller({
      style: {
        backgroundColor: 'invalid',
        backgroundOpacity: 3,
        accentColor: '#BADHEX',
        textColor: '',
        cornerRadius: 999,
      },
    })
    const layout = createTeacherControllerLayout(source, 4, 8)

    expect(layout.width).toBe(16)
    expect(layout.height).toBe(16)
    expect(layout.cornerRadius).toBe(8)
    expect(layout.palette).toMatchObject({
      backgroundCss: '#0b1720',
      backgroundAlpha: 1,
      accentCss: '#d9bf73',
      textCss: '#f3eee0',
    })
  })

  it('按当前场景和状态生成播放器进度文字', () => {
    const scenes = [
      { id: 'intro', name: '导入' },
      { id: 'practice', name: '课堂练习' },
    ]

    expect(formatTeacherControllerProgress(scenes, 'practice', '答题中'))
      .toBe('2 / 2 · 课堂练习 · 答题中')
    expect(formatTeacherControllerProgress(scenes, null, null))
      .toBe('场景 — / 2 · 等待开始')
  })

  it('声音和全屏按钮根据播放器状态更新标签', () => {
    const sound = { action: { type: 'audio.toggle-mute' as const }, label: '声音' }
    const fullscreen = {
      action: { type: 'player.fullscreen.toggle' as const },
      label: '全屏',
    }

    expect(teacherControllerButtonDisplayLabel(sound, {
      muted: false,
      fullscreen: false,
    })).toBe('声音 · 开')
    expect(teacherControllerButtonDisplayLabel(sound, {
      muted: true,
      fullscreen: false,
    })).toBe('声音 · 关')
    expect(teacherControllerButtonDisplayLabel(fullscreen, {
      muted: false,
      fullscreen: true,
    })).toBe('退出全屏')
  })
})
