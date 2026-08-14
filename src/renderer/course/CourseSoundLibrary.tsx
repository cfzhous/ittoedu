import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectAudioSettings, SoundDefinition } from '../../shared/projectTypes'
import type { CourseSoundPatch, CourseSoundReference } from './courseSoundModel'

const CHANNEL_OPTIONS: Array<{ value: SoundDefinition['channel']; label: string }> = [
  { value: 'music', label: '背景音乐' },
  { value: 'narration', label: '讲解与旁白' },
  { value: 'sfx', label: '互动音效' },
  { value: 'ui', label: '界面提示' },
]

export interface CourseSoundLibraryProps {
  audio: ProjectAudioSettings
  disabled?: boolean
  resolveAsset(assetId: string): string | undefined
  references(soundId: string): readonly CourseSoundReference[]
  onImport(): void
  onUpdate(soundId: string, patch: CourseSoundPatch): void
  onDelete(soundId: string): void
}

function SoundNameInput({
  sound,
  disabled,
  onCommit,
}: {
  sound: SoundDefinition
  disabled?: boolean
  onCommit(name: string): void
}) {
  const [draft, setDraft] = useState(sound.name)
  useEffect(() => setDraft(sound.name), [sound.name])
  const commit = () => {
    const name = draft.trim()
    if (name && name !== sound.name) onCommit(name)
    else setDraft(sound.name)
  }
  return (
    <input
      type="text"
      aria-label={`声音名称：${sound.name}`}
      value={draft}
      maxLength={80}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(sound.name)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function SoundVolumeInput({
  sound,
  disabled,
  onCommit,
}: {
  sound: SoundDefinition
  disabled?: boolean
  onCommit(volume: number): void
}) {
  const value = Math.round(sound.defaultVolume * 100)
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const parsed = Number(draft)
    const percentage = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : value
    setDraft(String(percentage))
    if (percentage !== value) onCommit(percentage / 100)
  }
  return (
    <label>
      <span>默认音量</span>
      <span className="course-sound-volume">
        <input
          type="number"
          aria-label={`${sound.name} 默认音量百分比`}
          min={0}
          max={100}
          step={5}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(String(value))
              event.currentTarget.blur()
            }
          }}
        />
        <span>%</span>
      </span>
    </label>
  )
}

export function CourseSoundLibrary({
  audio,
  disabled,
  resolveAsset,
  references,
  onImport,
  onUpdate,
  onDelete,
}: CourseSoundLibraryProps) {
  const sounds = useMemo(
    () => Object.values(audio.sounds).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [audio.sounds],
  )
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const previewing = sounds.find((sound) => sound.id === previewingId)

  useEffect(() => {
    if (disabled) setPreviewingId(null)
  }, [disabled])

  useEffect(() => {
    const element = audioRef.current
    if (!element) return
    if (!previewing) {
      if (element.hasAttribute('src')) {
        element.pause()
        element.currentTime = 0
        element.removeAttribute('src')
      }
      return
    }
    element.pause()
    element.currentTime = 0
    const source = resolveAsset(previewing.assetId)
    if (!source) {
      setPreviewError(`无法读取“${previewing.name}”的声音文件。`)
      setPreviewingId(null)
      return
    }
    setPreviewError(null)
    element.src = source
    element.volume = previewing.defaultVolume
    element.loop = previewing.defaultLoop
    let disposed = false
    try {
      const started = element.play()
      if (started && typeof started.catch === 'function') {
        void started.catch(() => {
          if (disposed) return
          setPreviewError('浏览器阻止了试听，请再次点击试听。')
          setPreviewingId(null)
        })
      }
    } catch {
      setPreviewError('浏览器阻止了试听，请再次点击试听。')
      setPreviewingId(null)
    }
    return () => {
      disposed = true
      element.pause()
      element.currentTime = 0
    }
  }, [previewing, resolveAsset])

  return (
    <section className="course-sound-library course-properties" aria-label="课程声音">
      <div className="course-sound-library__heading">
        <div>
          <h3>课程声音</h3>
          <p>供互动规则播放或监听结束；不会作为画布图层插入。</p>
        </div>
        <button type="button" disabled={disabled} onClick={onImport}>导入声音</button>
      </div>
      <audio
        ref={audioRef}
        hidden
        aria-hidden="true"
        onEnded={() => setPreviewingId(null)}
      />
      {previewError && <p className="course-sound-library__error" role="status">{previewError}</p>}
      {sounds.length === 0 ? (
        <p className="course-empty">尚未导入课程声音。导入后即可在互动动作中选择。</p>
      ) : (
        <div className="course-sound-list">
          {sounds.map((sound) => {
            const usedBy = references(sound.id)
            const isPreviewing = sound.id === previewingId
            return (
              <article className="course-sound-item" key={sound.id} aria-label={`课程声音：${sound.name}`}>
                <div className="course-sound-item__name">
                  <SoundNameInput
                    sound={sound}
                    disabled={disabled}
                    onCommit={(name) => onUpdate(sound.id, { name })}
                  />
                  {usedBy.length > 0 && (
                    <span title={usedBy.map(({ label }) => label).join('\n')}>
                      被 {usedBy.length} 条互动使用
                    </span>
                  )}
                </div>
                <div className="course-sound-item__settings">
                  <label>
                    <span>用途</span>
                    <select
                      aria-label={`${sound.name} 声音用途`}
                      value={sound.channel}
                      disabled={disabled}
                      onChange={(event) => onUpdate(sound.id, {
                        channel: event.currentTarget.value as SoundDefinition['channel'],
                      })}
                    >
                      {CHANNEL_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <SoundVolumeInput
                    sound={sound}
                    disabled={disabled}
                    onCommit={(defaultVolume) => onUpdate(sound.id, { defaultVolume })}
                  />
                  <label className="course-sound-loop">
                    <input
                      type="checkbox"
                      checked={sound.defaultLoop}
                      disabled={disabled}
                      onChange={(event) => onUpdate(sound.id, { defaultLoop: event.currentTarget.checked })}
                    />
                    <span>默认循环播放</span>
                  </label>
                </div>
                <div className="course-sound-item__actions">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setPreviewingId(isPreviewing ? null : sound.id)}
                  >{isPreviewing ? '停止' : '试听'}</button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={disabled || usedBy.length > 0}
                    title={usedBy.length > 0 ? `请先修改：${usedBy.map(({ label }) => label).join('；')}` : undefined}
                    onClick={() => onDelete(sound.id)}
                  >删除</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
