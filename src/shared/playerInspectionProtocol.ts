import { z } from 'zod'
import type { AssetMeta } from './projectTypes'

export const PLAYER_INSPECTION_PROTOCOL_VERSION = 1 as const

export const PLAYER_INSPECTION_MESSAGE_TYPES = Object.freeze({
  set: 'courseware-editor:set-inspection-mode',
  changed: 'courseware-player:inspection-mode',
  installAsset: 'courseware-editor:install-authoring-asset',
  assetInstalled: 'courseware-player:authoring-asset-installed',
} as const)

export interface PlayerInspectionModeCommand {
  type: typeof PLAYER_INSPECTION_MESSAGE_TYPES.set
  protocolVersion: typeof PLAYER_INSPECTION_PROTOCOL_VERSION
  sessionId: string
  enabled: boolean
}

export interface PlayerInspectionModeMessage {
  type: typeof PLAYER_INSPECTION_MESSAGE_TYPES.changed
  protocolVersion: typeof PLAYER_INSPECTION_PROTOCOL_VERSION
  sessionId: string
  enabled: boolean
  accepted: boolean
  sceneId: string | null
  stateId: string | null
}

export interface PlayerInstallAuthoringAssetCommand {
  type: typeof PLAYER_INSPECTION_MESSAGE_TYPES.installAsset
  protocolVersion: typeof PLAYER_INSPECTION_PROTOCOL_VERSION
  sessionId: string
  asset: AssetMeta
  bytes: ArrayBuffer
}

const commandSchema = z.object({
  type: z.literal(PLAYER_INSPECTION_MESSAGE_TYPES.set),
  protocolVersion: z.literal(PLAYER_INSPECTION_PROTOCOL_VERSION),
  sessionId: z.string().trim().min(1).max(256),
  enabled: z.boolean(),
}).strict()

const assetMetaSchema = z.object({
  id: z.string().trim().min(1).max(256),
  filename: z.string().trim().min(1).max(1_000),
  mimeType: z.string().trim().min(1).max(256),
  kind: z.enum(['image', 'audio', 'video']),
  path: z.string().trim().min(1).max(2_000),
  byteLength: z.number().int().nonnegative().max(1024 * 1024 * 1024),
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional(),
  duration: z.number().finite().nonnegative().optional(),
}).strict()

const installAssetSchema = z.object({
  type: z.literal(PLAYER_INSPECTION_MESSAGE_TYPES.installAsset),
  protocolVersion: z.literal(PLAYER_INSPECTION_PROTOCOL_VERSION),
  sessionId: z.string().trim().min(1).max(256),
  asset: assetMetaSchema,
  bytes: z.instanceof(ArrayBuffer),
}).strict()

export function parsePlayerInspectionModeCommand(
  value: unknown,
): PlayerInspectionModeCommand | null {
  const result = commandSchema.safeParse(value)
  return result.success ? result.data : null
}

export function parsePlayerInstallAuthoringAssetCommand(
  value: unknown,
): PlayerInstallAuthoringAssetCommand | null {
  const result = installAssetSchema.safeParse(value)
  return result.success
    ? result.data as PlayerInstallAuthoringAssetCommand
    : null
}
