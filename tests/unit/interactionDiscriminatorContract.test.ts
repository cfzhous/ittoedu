import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  interactionActionSchema,
  interactionConditionSchema,
  interactionTriggerSchema,
} from '@/shared/interactionSchema'
import {
  INTERACTION_ACTION_TYPES,
  INTERACTION_CONDITION_TYPES,
  INTERACTION_TRIGGER_TYPES,
} from '@/shared/interactionTypes'

function collectSchemaDiscriminatorValues(schema: z.ZodType): Set<string> {
  const document = z.toJSONSchema(schema) as Record<string, unknown>
  const values = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    const properties = record.properties
    if (typeof properties === 'object' && properties !== null) {
      const typeSchema = (properties as Record<string, unknown>).type
      if (typeof typeSchema === 'object' && typeSchema !== null) {
        const literal = (typeSchema as Record<string, unknown>).const
        if (typeof literal === 'string') values.add(literal)
      }
    }
    Object.values(record).forEach(visit)
  }
  visit(document)
  return values
}

describe('interaction discriminator contract', () => {
  it.each([
    ['trigger', interactionTriggerSchema, INTERACTION_TRIGGER_TYPES],
    ['condition', interactionConditionSchema, INTERACTION_CONDITION_TYPES],
    ['action', interactionActionSchema, INTERACTION_ACTION_TYPES],
  ] as const)('%s registry exactly matches the public Zod schema', (_label, schema, expected) => {
    expect([...collectSchemaDiscriminatorValues(schema)].sort())
      .toEqual([...expected].sort())
  })
})
