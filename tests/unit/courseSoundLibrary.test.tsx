import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseSoundLibrary } from '@/renderer/course/CourseSoundLibrary'
import type { ProjectAudioSettings } from '@/shared/projectTypes'

const AUDIO: ProjectAudioSettings = {
  defaultMuted: false,
  masterVolume: 1,
  channelVolumes: { music: 1, narration: 1, sfx: 1, ui: 1, video: 1 },
  sounds: {
    bell: {
      id: 'bell',
      name: '上课铃声',
      assetId: 'asset-secret-id',
      channel: 'sfx',
      defaultVolume: 0.8,
      defaultLoop: false,
    },
  },
  narrationDucking: { enabled: false, musicVolume: 0.35, fadeMs: 200 },
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CourseSoundLibrary', () => {
  it('offers teacher-facing sound settings and never displays asset ids', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    const onImport = vi.fn()
    const onUpdate = vi.fn()
    render(
      <CourseSoundLibrary
        audio={AUDIO}
        resolveAsset={() => 'blob:bell'}
        references={() => []}
        onImport={onImport}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('声音名称：上课铃声')).toHaveDisplayValue('上课铃声')
    expect(screen.queryByText('asset-secret-id')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '导入声音' }))
    expect(onImport).toHaveBeenCalledOnce()

    fireEvent.change(screen.getByLabelText('声音名称：上课铃声'), { target: { value: '答对提示音' } })
    fireEvent.blur(screen.getByLabelText('声音名称：上课铃声'))
    expect(onUpdate).toHaveBeenCalledWith('bell', { name: '答对提示音' })

    fireEvent.change(screen.getByLabelText('上课铃声 声音用途'), { target: { value: 'narration' } })
    expect(onUpdate).toHaveBeenCalledWith('bell', { channel: 'narration' })
    fireEvent.change(screen.getByLabelText('上课铃声 默认音量百分比'), { target: { value: '45' } })
    fireEvent.blur(screen.getByLabelText('上课铃声 默认音量百分比'))
    expect(onUpdate).toHaveBeenCalledWith('bell', { defaultVolume: 0.45 })
    fireEvent.click(screen.getByLabelText('默认循环播放'))
    expect(onUpdate).toHaveBeenCalledWith('bell', { defaultLoop: true })

    fireEvent.click(screen.getByRole('button', { name: '试听' }))
    await waitFor(() => expect(play).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    expect(pause).toHaveBeenCalled()
  })

  it('explains and blocks deletion while a sound is referenced', () => {
    render(
      <CourseSoundLibrary
        audio={AUDIO}
        resolveAsset={() => 'blob:bell'}
        references={() => [{ scope: 'scene', ruleId: 'rule', label: '场景“导入 · 练习”中的互动“答对提示”' }]}
        onImport={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('被 1 条互动使用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '删除' })).toHaveAttribute('title', expect.stringMatching(/答对提示/u))
  })
})
