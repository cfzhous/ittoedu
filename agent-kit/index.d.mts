export type SurfaceKind = 'slide' | 'flow' | 'spatial-2d'
export type Carrier = 'native' | 'runtime' | 'component'
export type AuthoringKind = 'text' | 'asset' | 'property'

export interface AuthoringBinding {
  field: string
  pointer: `/data/${string}`
  kind?: AuthoringKind
}

export interface SemanticItem {
  id: string
  kind: 'text' | 'image' | 'formula' | 'shape' | 'video' | 'dynamic-module'
  carrier: Carrier
  data: Record<string, unknown>
  authoring: AuthoringBinding[]
  geometry?: Record<string, unknown>
  layer?: Record<string, unknown>
  module?: string
  exportName?: string
}

export interface CourseSceneInput {
  id: string
  name: string
  items: SemanticItem[]
  data?: Record<string, unknown>
}

export interface CourseSurfaceInput {
  id: string
  kind: SurfaceKind
  scenes: CourseSceneInput[]
  data?: Record<string, unknown>
}

export interface CourseProjectInput {
  contract: 'courseware.agent-kit/course-project-input@1'
  version: 1
  target: { kind: 'course-project'; schemaVersion: 9 }
  id: string
  title: string
  surfaces: CourseSurfaceInput[]
  assets: Record<string, unknown>
  theme: Record<string, unknown>
  data: Record<string, unknown>
}

export interface ProjectState<TDocument = CourseProjectInput> {
  contract: 'courseware.agent-kit/project-state@1'
  version: 1
  projectId: string
  revision: number
  document: TDocument
  authoringIndex: Record<string, string | { jsonPointer: string; [key: string]: unknown }>
}

export interface ProductPatchEnvelope<TDocument = Record<string, unknown>> {
  document: TDocument & { id: string; revision: number }
  inventory: {
    projectId: string
    revision: number
    entries: Record<string, { jsonPointer: string; [key: string]: unknown }>
  }
}

export interface AuthoringPatch {
  op: 'replace'
  expectedRevision: number
  authoringAddress: string
  value: unknown
  expectedValue?: unknown
}

export interface BuildTask {
  id: string
  kind: 'course-input' | 'copy-file' | 'emit-json' | string
  dependsOn?: string[]
  input?: Record<string, unknown>
  outputs?: string[]
}

export interface BuildGraph {
  contract: 'courseware.agent-kit/build-graph@1'
  version: 1
  projectId: string
  tasks: BuildTask[]
}

export const CONTRACT_ID: 'courseware.agent-kit/course-project-input@1'
export const TARGET_COURSE_PROJECT_SCHEMA_VERSION: 9
export const author: {
  text(input: { id: string; text: string; data?: Record<string, unknown>; geometry?: Record<string, unknown>; layer?: Record<string, unknown>; authoring?: AuthoringBinding[] }): SemanticItem
  image(input: { id: string; assetId: string; data?: Record<string, unknown>; geometry?: Record<string, unknown>; layer?: Record<string, unknown>; authoring?: AuthoringBinding[] }): SemanticItem
  formula(input: { id: string; latex: string; data?: Record<string, unknown>; geometry?: Record<string, unknown>; layer?: Record<string, unknown>; authoring?: AuthoringBinding[] }): SemanticItem
  shape(input: { id: string; data: Record<string, unknown>; geometry?: Record<string, unknown>; layer?: Record<string, unknown>; authoring?: AuthoringBinding[] }): SemanticItem
  video(input: { id: string; assetId: string; data?: Record<string, unknown>; geometry?: Record<string, unknown>; layer?: Record<string, unknown>; authoring?: AuthoringBinding[] }): SemanticItem
  dynamic(input: { id: string; module: string; exportName?: string; carrier?: 'runtime' | 'component'; data?: Record<string, unknown>; geometry?: Record<string, unknown>; layer?: Record<string, unknown>; authoring?: AuthoringBinding[] }): SemanticItem
}

export function defineScene(input: { id: string; name?: string; items?: SemanticItem[]; data?: Record<string, unknown> }): CourseSceneInput
export function defineSurface(input: { id: string; kind: SurfaceKind; scenes?: CourseSceneInput[]; data?: Record<string, unknown> }): CourseSurfaceInput
export function defineCourseProject(input: { id: string; title?: string; surfaces?: CourseSurfaceInput[]; assets?: Record<string, unknown>; theme?: Record<string, unknown>; data?: Record<string, unknown> }): CourseProjectInput
export function validateCourseProject(project: unknown): { valid: boolean; errors: string[] }
export function buildAuthoringIndex(project: CourseProjectInput): Record<string, string>
export function makeProjectState<TDocument extends CourseProjectInput>(project: TDocument, revision?: number): ProjectState<TDocument>

export interface ProductRuntimeResolution {
  kind: 'runtime'
  runtime: Record<string, unknown>
}

export interface ProductComponentResolution {
  kind: 'component'
  component: { packageId: string; version: string }
  packageMetadata: Record<string, unknown>
  props?: Record<string, unknown>
  staticFallbackAssetId?: string
}

export interface ProductV9CompilerOptions {
  timestamp?: string
  componentPackages?: Record<string, Record<string, unknown>>
  resolveDynamic?: (
    module: string,
    item: SemanticItem,
  ) => ProductRuntimeResolution | ProductComponentResolution
}

export const PRODUCT_COMPILER_ID: 'courseware.agent-kit/input-to-course-project-v9@1'
export const PRODUCT_COURSE_PROJECT_SCHEMA_VERSION: 9
export function compileCourseProjectV9(
  input: CourseProjectInput,
  options?: ProductV9CompilerOptions,
): Readonly<Record<string, unknown> & { schemaVersion: 9; id: string; revision: 0 }>

export function makeAuthoringAddress(input: { projectId: string; scope: 'global' | 'surface' | 'scene'; surfaceId?: string; sceneId?: string; carrier: Carrier; layerItemId: string; field: string }): string
export function parseAuthoringAddress(value: string): Record<string, string>
export function applyAuthoringPatch<TDocument>(state: ProjectState<TDocument>, patch: AuthoringPatch): ProjectState<TDocument>
export function applyAuthoringPatch<TDocument extends Record<string, unknown>>(state: ProductPatchEnvelope<TDocument>, patch: AuthoringPatch): ProductPatchEnvelope<TDocument>
export class RevisionConflictError extends Error {
  expectedRevision: number
  actualRevision: number
}

export function createBuildGraph(input: { projectId: string; tasks: BuildTask[] }): BuildGraph
export function validateBuildGraph(graph: BuildGraph, options?: { handlerKinds?: string[] }): { valid: boolean; errors: string[] }
export function planBuildGraph(graph: BuildGraph): BuildTask[]
export function assembleBuildGraph(graph: BuildGraph, options: { workspace: string; handlers?: Record<string, Function> }): Promise<Record<string, unknown>>

export interface CapabilityCard {
  id: string
  label: string
  purpose: string
  tags: string[]
  inputs: string[]
  outputs: string[]
  authoringBoundary: string
  limitations: string[]
  status: string
  source: string
  example?: string
}

export function loadCapabilityCards(indexPath: string, options?: { extraCards?: string[] }): Promise<CapabilityCard[]>
export function searchCapabilityCards(cards: CapabilityCard[], query: string, options?: { limit?: number }): CapabilityCard[]
export function scaffoldWorkspace(root: string, input: Record<string, unknown>): Promise<Record<string, unknown>>
export function createMicroRig(root: string, input: Record<string, unknown>): Promise<string>
export function validateMicroRig(rigFile: string): Promise<Record<string, unknown>>
export function validateWorkspace(root: string): Promise<{ valid: boolean; errors: string[]; warnings: string[]; config?: Record<string, unknown> }>
