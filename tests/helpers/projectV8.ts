import type { ProjectDocument } from '../../src/shared/projectTypes'

export function createProjectV8Fields(
  controls: ProjectDocument['playback']['controls'] = 'none',
): Pick<
  ProjectDocument,
  'media' | 'playback' | 'globalInteractions' | 'designTokens'
> {
  return {
    globalInteractions: [],
    designTokens: {
      fonts: [{
        id: 'body',
        label: '正文',
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
      }],
      colors: [
        { id: 'background', label: '背景', color: '#ffffff' },
        { id: 'text', label: '正文', color: '#1f2937' },
        { id: 'accent', label: '强调', color: '#2563eb' },
      ],
    },
    media: {
      audio: {
        defaultMuted: false,
        masterVolume: 1,
        channelVolumes: {
          music: 1,
          narration: 1,
          sfx: 1,
          ui: 1,
          video: 1,
        },
        sounds: {},
        narrationDucking: {
          enabled: true,
          musicVolume: 0.3,
          fadeMs: 250,
        },
      },
    },
    playback: {
      controls,
      keyboardNavigation: true,
      presenter: {
        enabled: true,
        strategy: 'scene-navigation',
        additionalBindings: [],
      },
    },
  }
}
