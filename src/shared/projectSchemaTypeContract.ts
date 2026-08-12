import { z } from 'zod'
import { projectDocumentSchema } from './projectSchema'
import type { ProjectDocument } from './projectTypes'

type SchemaProjectDocument = z.output<typeof projectDocumentSchema>

type Assert<T extends true> = T
type IsAssignable<Source, Target> = [Source] extends [Target] ? true : false

/**
 * Compile-time-only Project V8 contract gate. Both assertions are required:
 * either the handwritten authoring type or the Zod output drifting alone must
 * make the normal TypeScript build fail.
 */
export type ProjectDocumentSchemaTypeContract = [
  Assert<IsAssignable<SchemaProjectDocument, ProjectDocument>>,
  Assert<IsAssignable<ProjectDocument, SchemaProjectDocument>>,
]
