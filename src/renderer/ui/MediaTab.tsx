import {
  ImageIcon,
  Music2,
  Plus,
  Trash2,
  Upload,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  AudioChannel,
  AssetMeta,
  ProjectAudioSettings,
  SoundDefinition,
} from '../../shared/projectTypes'
import type { InteractionRule } from '../../shared/interactionTypes'
import {
  useEditorStore,
  type ProjectAudioSettingsPatch,
} from '../store/editorStore'

export interface MediaTabProps {
  onImportImage?(): void
  onImportAudio(): void
  onImportVideo(): void
  embedded?: boolean
  showAdvancedAudioSettings?: boolean
  filterQuery?: string
}

const SOUND_CHANNELS: Array<{
  value: SoundDefinition['channel']
  label: string
}> = [
  { value: 'music', label: '背景音乐' },
  { value: 'narration', label: '旁白' },
  { value: 'sfx', label: '音效' },
  { value: 'ui', label: '界面提示音' },
]

const AUDIO_CHANNELS: Array<{
  value: AudioChannel
  label: string
}> = [
  ...SOUND_CHANNELS,
  { value: 'video', label: '视频' },
]

function volumePercent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100)
}

export function formatMediaDuration(duration: number | undefined): string {
  if (duration === undefined || !Number.isFinite(duration) || duration < 0) {
    return '时长未知'
  }
  const totalSeconds = Math.round(duration)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const minuteSecond = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${minuteSecond}` : minuteSecond
}

export function formatMediaSize(byteLength: number): string {
  const bytes = Math.max(0, byteLength)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export interface SoundUsageReference {
  readonly label: string
}

function ruleUsesSound(rule: InteractionRule, soundId: string): boolean {
  if (rule.trigger.type === 'audio.ended' && rule.trigger.soundId === soundId) return true
  return rule.actions.some(({ action }) => {
    if (action.type === 'audio.play') return action.soundId === soundId
    if (
      action.type === 'audio.pause' ||
      action.type === 'audio.resume' ||
      action.type === 'audio.stop' ||
      action.type === 'audio.toggle-mute'
    ) {
      return action.target.kind === 'sound' && action.target.soundId === soundId
    }
    return false
  })
}

export function listSoundReferencesFromRules(
  rules: readonly InteractionRule[],
  soundId: string,
  scopeLabel: string,
): SoundUsageReference[] {
  return rules
    .filter((rule) => ruleUsesSound(rule, soundId))
    .map((rule) => ({
      label: `${scopeLabel} · 规则「${rule.name ?? rule.id}」`,
    }))
}

export function listProjectSoundReferences(
  project: {
    readonly scenes?: ReadonlyArray<{
      readonly name: string
      readonly interactions: readonly InteractionRule[]
    }>
    readonly globalInteractions?: readonly InteractionRule[]
    readonly surfaces?: ReadonlyArray<{
      readonly type: string
      readonly title: string
      readonly scenes?: ReadonlyArray<{
        readonly name: string
        readonly interactions: readonly InteractionRule[]
      }>
    }>
  },
  soundId: string,
): SoundUsageReference[] {
  const refs: SoundUsageReference[] = []
  refs.push(...listSoundReferencesFromRules(
    project.globalInteractions ?? [],
    soundId,
    '全局互动',
  ))
  for (const scene of project.scenes ?? []) {
    refs.push(...listSoundReferencesFromRules(scene.interactions, soundId, scene.name))
  }
  for (const surface of project.surfaces ?? []) {
    for (const scene of surface.scenes ?? []) {
      refs.push(...listSoundReferencesFromRules(
        scene.interactions,
        soundId,
        `${surface.title} · ${scene.name}`,
      ))
    }
  }
  return refs
}

function useAudioPreviewUrl(
  asset: AssetMeta | undefined,
  bytes: Uint8Array | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    setUrl(null)
    if (
      !asset ||
      !bytes ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return
    }
    const copy = Uint8Array.from(bytes)
    const nextUrl = URL.createObjectURL(
      new Blob([copy.buffer], { type: asset.mimeType }),
    )
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [asset, bytes])

  return url
}

interface SoundEntryProps {
  sound: SoundDefinition
  asset: AssetMeta | undefined
  bytes: Uint8Array | undefined
  showAdvancedSettings: boolean
  deleteBlocked?: readonly SoundUsageReference[]
  onUpdate(patch: Partial<Omit<SoundDefinition, 'id'>>): void
  onDelete(): void
}

function SoundEntry({
  sound,
  asset,
  bytes,
  onUpdate,
  onDelete,
  showAdvancedSettings,
  deleteBlocked,
}: SoundEntryProps) {
  const [draftName, setDraftName] = useState(sound.name)
  const previewUrl = useAudioPreviewUrl(asset, bytes)

  useEffect(() => setDraftName(sound.name), [sound.name])

  const commitName = () => {
    const nextName = draftName.trim()
    if (nextName && nextName !== sound.name) onUpdate({ name: nextName })
    else setDraftName(sound.name)
  }

  return (
    <article className="media-entry media-entry--sound" data-testid={`sound-entry-${sound.id}`}>
      <div className="media-entry__heading">
        <Music2 size={16} aria-hidden="true" />
        <input
          className="media-sound-name"
          value={draftName}
          maxLength={80}
          aria-label={`重命名声音“${sound.name}”`}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraftName(sound.name)
              event.currentTarget.blur()
            }
          }}
        />
        <button
          type="button"
          className="media-icon-button media-icon-button--danger"
          aria-label={`删除声音“${sound.name}”`}
          title="删除声音"
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {deleteBlocked && deleteBlocked.length > 0 && (
        <div
          className="media-preview-unavailable"
          role="alert"
          data-testid={`sound-delete-blocked-${sound.id}`}
        >
          该声音仍被引用，不能删除：
          <ul>
            {deleteBlocked.map((reference) => (
              <li key={reference.label}>{reference.label}</li>
            ))}
          </ul>
          请先删除或改写这些互动动作。
        </div>
      )}

      <div className="media-entry__meta">
        {asset
          ? `${asset.filename} · ${formatMediaDuration(asset.duration)} · ${formatMediaSize(asset.byteLength)}`
          : '声音素材记录缺失'}
      </div>

      {previewUrl ? (
        <audio
          className="media-audio-preview"
          src={previewUrl}
          controls
          preload="metadata"
          aria-label={`试听“${sound.name}”`}
        />
      ) : (
        <div className="media-preview-unavailable" role="status">
          无法试听：工程中缺少声音数据
        </div>
      )}

      {showAdvancedSettings && <div className="media-sound-settings">
        <label className="media-field">
          <span>声道</span>
          <select
            value={sound.channel}
            aria-label={`“${sound.name}”的声道`}
            onChange={(event) => onUpdate({
              channel: event.target.value as SoundDefinition['channel'],
            })}
          >
            {SOUND_CHANNELS.map((channel) => (
              <option key={channel.value} value={channel.value}>
                {channel.label}
              </option>
            ))}
          </select>
        </label>

        <label className="media-field media-field--volume">
          <span>默认音量</span>
          <span className="media-range-row">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(sound.defaultVolume * 100)}
              aria-label={`“${sound.name}”的默认音量`}
              onChange={(event) => onUpdate({
                defaultVolume: Number(event.target.value) / 100,
              })}
            />
            <output>{Math.round(sound.defaultVolume * 100)}%</output>
          </span>
        </label>

        <label className="media-check-field">
          <input
            type="checkbox"
            checked={sound.defaultLoop}
            aria-label={`“${sound.name}”默认循环`}
            onChange={(event) => onUpdate({ defaultLoop: event.target.checked })}
          />
          默认循环播放
        </label>
      </div>}
    </article>
  )
}

interface AssetEntryProps {
  asset: AssetMeta
  bytes: Uint8Array | undefined
  onDelete(): void
  onAddToCanvas?(): void
}

function AssetEntry({ asset, bytes, onDelete, onAddToCanvas }: AssetEntryProps) {
  const isVideo = asset.kind === 'video'
  const isAudio = asset.kind === 'audio'
  const canPlaceOnCanvas = isVideo || asset.kind === 'image'
  const Icon = isVideo ? Video : isAudio ? Music2 : ImageIcon
  const dimensions = asset.width && asset.height
    ? ` · ${asset.width} × ${asset.height}`
    : ''

  return (
    <article className={`media-entry media-entry--${asset.kind}`} data-testid={`asset-entry-${asset.id}`}>
      <div className="media-entry__heading">
        <Icon size={16} aria-hidden="true" />
        <span className="media-entry__filename" title={asset.filename}>
          {asset.filename}
        </span>
        <button
          type="button"
          className="media-icon-button media-icon-button--danger"
          aria-label={`删除${isVideo ? '视频' : isAudio ? '声音素材' : '图片'}“${asset.filename}”`}
          title="删除未使用素材"
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="media-entry__meta">
        {isVideo ? `${formatMediaDuration(asset.duration)} · ` : ''}
        {formatMediaSize(asset.byteLength)}
        {dimensions}
      </div>
      {canPlaceOnCanvas && onAddToCanvas ? (
        <button
          type="button"
          className="media-add-to-canvas"
          disabled={!bytes}
          aria-label={`将${isVideo ? '视频' : '图片'}“${asset.filename}”添加到画布`}
          title={bytes
            ? `在当前场景中创建可编辑${isVideo ? '视频' : '图片'}元素`
            : `工程缺少${isVideo ? '视频' : '图片'}数据`}
          onClick={onAddToCanvas}
        >
          <Plus size={15} />
          添加到画布
        </button>
      ) : null}
    </article>
  )
}

interface VolumeFieldProps {
  label: string
  value: number
  disabled?: boolean
  onChange(value: number): void
}

function VolumeField({ label, value, disabled, onChange }: VolumeFieldProps) {
  const percent = volumePercent(value)
  return (
    <label className="media-field media-field--volume">
      <span>{label}</span>
      <span className="media-range-row">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value) / 100)}
        />
        <output>{percent}%</output>
      </span>
    </label>
  )
}

interface GlobalAudioSettingsProps {
  settings: ProjectAudioSettings
  onUpdate(patch: ProjectAudioSettingsPatch): void
}

function GlobalAudioSettings({ settings, onUpdate }: GlobalAudioSettingsProps) {
  return (
    <section className="media-section" aria-labelledby="media-global-audio-heading">
      <div className="section-heading" id="media-global-audio-heading">
        <span>全局声音设置</span>
      </div>
      <div className="media-entry media-global-audio-settings">
        <label className="media-check-field">
          <input
            type="checkbox"
            checked={settings.defaultMuted}
            aria-label="成品默认静音"
            onChange={(event) => onUpdate({ defaultMuted: event.target.checked })}
          />
          成品默认静音
        </label>

        <VolumeField
          label="主音量"
          value={settings.masterVolume}
          onChange={(masterVolume) => onUpdate({ masterVolume })}
        />

        <div className="media-channel-volume-list" aria-label="声道音量">
          {AUDIO_CHANNELS.map((channel) => (
            <VolumeField
              key={channel.value}
              label={`${channel.label}声道音量`}
              value={settings.channelVolumes[channel.value]}
              onChange={(value) => onUpdate({
                channelVolumes: { [channel.value]: value },
              })}
            />
          ))}
        </div>

        <label className="media-check-field">
          <input
            type="checkbox"
            checked={settings.narrationDucking.enabled}
            aria-label="旁白播放时压低背景音乐"
            onChange={(event) => onUpdate({
              narrationDucking: { enabled: event.target.checked },
            })}
          />
          旁白播放时压低背景音乐
        </label>
        <VolumeField
          label="压低后的背景音乐音量"
          value={settings.narrationDucking.musicVolume}
          disabled={!settings.narrationDucking.enabled}
          onChange={(musicVolume) => onUpdate({
            narrationDucking: { musicVolume },
          })}
        />
      </div>
    </section>
  )
}

export function MediaTab({
  onImportImage,
  onImportAudio,
  onImportVideo,
  embedded = false,
  showAdvancedAudioSettings = true,
  filterQuery = '',
}: MediaTabProps) {
  const project = useEditorStore((state) => state.project)
  const assets = project.assets
  const assetFiles = useEditorStore((state) => state.assetFiles)
  const audioSettings = project.media.audio
  const sounds = audioSettings.sounds
  const updateAudioSettings = useEditorStore((state) => state.updateAudioSettings)
  const updateSound = useEditorStore((state) => state.updateSound)
  const deleteSound = useEditorStore((state) => state.deleteSound)
  const deleteAsset = useEditorStore((state) => state.deleteAsset)
  const addImageNode = useEditorStore((state) => state.addImageNode)
  const addVideoNode = useEditorStore((state) => state.addVideoNode)
  const [blockedDeletes, setBlockedDeletes] = useState<Record<string, SoundUsageReference[]>>({})

  const normalizedFilter = filterQuery.trim().toLocaleLowerCase()
  const matchesFilter = (value: string): boolean =>
    !normalizedFilter || value.toLocaleLowerCase().includes(normalizedFilter)
  const soundEntries = useMemo(
    () => Object.values(sounds).filter((sound) => {
      const asset = assets[sound.assetId]
      return matchesFilter(`${sound.name} ${asset?.filename ?? ''} 音频 声音`)
    }),
    [assets, normalizedFilter, sounds],
  )
  const videoAssets = useMemo(
    () => Object.values(assets).filter((asset) =>
      asset.kind === 'video' && matchesFilter(`${asset.filename} 视频 ${asset.mimeType}`),
    ),
    [assets, normalizedFilter],
  )
  const imageAssets = useMemo(
    () => Object.values(assets).filter((asset) =>
      asset.kind === 'image' && matchesFilter(`${asset.filename} 图片 图像 ${asset.mimeType}`),
    ),
    [assets, normalizedFilter],
  )
  const unusedAudioAssets = useMemo(() => {
    const mapped = new Set(Object.values(sounds).map((sound) => sound.assetId))
    return Object.values(assets).filter(
      (asset) => (
        asset.kind === 'audio' &&
        !mapped.has(asset.id) &&
        matchesFilter(`${asset.filename} 音频 声音 ${asset.mimeType}`)
      ),
    )
  }, [assets, normalizedFilter, sounds])

  return (
    <div
      className={`media-tab${embedded ? ' media-tab--embedded' : ''}`}
      data-testid="media-tab"
    >
      <div className="media-toolbar" aria-label="导入媒体">
          {onImportImage && (
            <button type="button" className="media-import-button" onClick={onImportImage}>
              <Upload size={15} />
              导入图片
            </button>
          )}
          <button type="button" className="media-import-button" onClick={onImportAudio}>
            <Upload size={15} />
            导入声音
          </button>
          <button type="button" className="media-import-button" onClick={onImportVideo}>
            <Upload size={15} />
            导入视频
          </button>
      </div>

      {showAdvancedAudioSettings && (
        <GlobalAudioSettings
          settings={audioSettings}
          onUpdate={updateAudioSettings}
        />
      )}

      <section className="media-section" aria-labelledby="media-sounds-heading">
        <div className="section-heading" id="media-sounds-heading">
          <span>声音库</span>
          <span>{soundEntries.length}</span>
        </div>
        {soundEntries.length === 0 ? (
          <div className="empty-state">尚未导入声音</div>
        ) : (
          <div className="media-list media-list--sounds">
            {soundEntries.map((sound) => (
              <SoundEntry
                key={sound.id}
                sound={sound}
                asset={assets[sound.assetId]}
                bytes={assetFiles[sound.assetId]}
                showAdvancedSettings={showAdvancedAudioSettings}
                deleteBlocked={blockedDeletes[sound.id]}
                onUpdate={(patch) => updateSound(sound.id, patch)}
                onDelete={() => {
                  const references = listProjectSoundReferences(project, sound.id)
                  if (references.length > 0) {
                    setBlockedDeletes((current) => ({
                      ...current,
                      [sound.id]: references,
                    }))
                    return
                  }
                  setBlockedDeletes((current) => {
                    const next = { ...current }
                    delete next[sound.id]
                    return next
                  })
                  deleteSound(sound.id)
                }}
              />
            ))}
          </div>
        )}
      </section>

      {unusedAudioAssets.length > 0 && (
        <section className="media-section" aria-labelledby="media-unused-audio-heading">
          <div className="section-heading" id="media-unused-audio-heading">
            <span>未映射声音素材</span>
            <span>{unusedAudioAssets.length}</span>
          </div>
          <div className="media-list">
            {unusedAudioAssets.map((asset) => (
              <AssetEntry
                key={asset.id}
                asset={asset}
                bytes={assetFiles[asset.id]}
                onDelete={() => deleteAsset(asset.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="media-section" aria-labelledby="media-videos-heading">
        <div className="section-heading" id="media-videos-heading">
          <span>视频素材</span>
          <span>{videoAssets.length}</span>
        </div>
        {videoAssets.length === 0 ? (
          <div className="empty-state">尚未导入视频</div>
        ) : (
          <div className="media-list">
            {videoAssets.map((asset) => {
              const bytes = assetFiles[asset.id]
              return (
                <AssetEntry
                  key={asset.id}
                  asset={asset}
                  bytes={bytes}
                  onAddToCanvas={() => {
                    if (bytes) addVideoNode(asset, bytes)
                  }}
                  onDelete={() => deleteAsset(asset.id)}
                />
              )
            })}
          </div>
        )}
      </section>

      <section className="media-section" aria-labelledby="media-images-heading">
        <div className="section-heading" id="media-images-heading">
          <span>图片素材</span>
          <span>{imageAssets.length}</span>
        </div>
        {imageAssets.length === 0 ? (
          <div className="empty-state">点击上方“图片”导入后，会自动保存在这里</div>
        ) : (
          <div className="media-list">
            {imageAssets.map((asset) => {
              const bytes = assetFiles[asset.id]
              return (
                <AssetEntry
                  key={asset.id}
                  asset={asset}
                  bytes={bytes}
                  onAddToCanvas={() => {
                    if (bytes) addImageNode(asset, bytes)
                  }}
                  onDelete={() => deleteAsset(asset.id)}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
