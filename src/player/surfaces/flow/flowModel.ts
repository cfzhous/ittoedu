import { serializeFormulaAst } from '../../../shared/formulaLinear'
import type {
  FlowBlock,
  FlowComponentBlock,
  FlowMediaBlock,
  FlowSectionBlock,
  FlowSurfaceDocument,
} from '../../../shared/courseProjectTypes'

export type {
  FlowBlock,
  FlowComponentBlock,
  FlowMediaBlock,
  FlowSectionBlock,
  FlowSurfaceDocument,
} from '../../../shared/courseProjectTypes'

export interface FlowBlockLocation {
  block: FlowBlock
  parentId: string | null
  index: number
  depth: number
}

export interface FlowOutlineItem {
  blockId: string
  text: string
  level: number
  kind: 'heading' | 'section'
}

export interface FlowSearchMatch {
  blockId: string
  field: string
  excerpt: string
  index: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function blockTextFields(block: FlowBlock): Array<[string, string]> {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return [['text', block.text]]
    case 'quote':
      return [
        ['text', block.text],
        ...(block.citation ? [['citation', block.citation] as [string, string]] : []),
      ]
    case 'list':
      return block.items.map((item, index) => [`items.${index}`, item.text])
    case 'media':
      return [
        ...(block.altText ? [['altText', block.altText] as [string, string]] : []),
        ...(block.caption ? [['caption', block.caption] as [string, string]] : []),
      ]
    case 'table':
      return [
        ...block.columns.map((column, columnIndex): [string, string] => [`columns.${columnIndex}`, column.header]),
        ...block.rows.flatMap((row, rowIndex) =>
          block.columns.map((column): [string, string] => [
            `rows.${rowIndex}.${column.id}`,
            row.cells[column.id] ?? '',
          ]),
        ),
      ]
    case 'formula':
      return [
        ['accessibleText', block.accessibleText],
        ['linear', serializeFormulaAst(block.ast)],
      ]
    case 'code':
      return [['code', block.code]]
    case 'callout':
      return [['body', block.body], ...(block.title ? [['title', block.title] as [string, string]] : [])]
    case 'section':
      return [['title', block.title]]
    case 'component':
      return [
        ['component.packageId', block.component.packageId],
        ['component.version', block.component.version],
      ]
    case 'divider':
      return []
  }
}

export function walkFlowBlocks(
  document: FlowSurfaceDocument,
  visit: (location: FlowBlockLocation) => void,
): void {
  const walk = (blocks: readonly FlowBlock[], parentId: string | null, depth: number) => {
    blocks.forEach((block, index) => {
      visit({ block, parentId, index, depth })
      if (block.type === 'section') walk(block.blocks, block.id, depth + 1)
    })
  }
  walk(document.blocks, null, 0)
}

export function findFlowBlock(
  document: FlowSurfaceDocument,
  blockId: string,
): FlowBlockLocation | undefined {
  let match: FlowBlockLocation | undefined
  walkFlowBlocks(document, (location) => {
    if (!match && location.block.id === blockId) match = location
  })
  return match
}

function assertUniqueBlockIds(document: FlowSurfaceDocument): void {
  const seen = new Set<string>()
  walkFlowBlocks(document, ({ block }) => {
    if (!block.id || seen.has(block.id)) {
      throw new Error(`Flow block id must be non-empty and unique: ${block.id}`)
    }
    seen.add(block.id)
  })
}

function mutableBlockArray(
  document: FlowSurfaceDocument,
  parentId: string | null,
): FlowBlock[] {
  if (parentId === null) return document.blocks
  const parent = findFlowBlock(document, parentId)?.block
  if (!parent) throw new Error(`Unknown Flow parent block: ${parentId}`)
  if (parent.type !== 'section') {
    throw new Error(`Flow parent ${parentId} cannot contain child blocks`)
  }
  return parent.blocks
}

function clampInsertionIndex(index: number, length: number): number {
  if (!Number.isInteger(index) || index < 0 || index > length) {
    throw new Error(`Flow insertion index ${index} is outside 0..${length}`)
  }
  return index
}

export function insertFlowBlock(
  source: FlowSurfaceDocument,
  block: FlowBlock,
  parentId: string | null,
  index: number,
): FlowSurfaceDocument {
  const next = clone(source)
  const target = mutableBlockArray(next, parentId)
  target.splice(clampInsertionIndex(index, target.length), 0, clone(block))
  assertUniqueBlockIds(next)
  return next
}

export function deleteFlowBlock(
  source: FlowSurfaceDocument,
  blockId: string,
): FlowSurfaceDocument {
  const next = clone(source)
  const location = findFlowBlock(next, blockId)
  if (!location) throw new Error(`Unknown Flow block: ${blockId}`)
  mutableBlockArray(next, location.parentId).splice(location.index, 1)
  return next
}

function remapBlockIds(block: FlowBlock, idFactory: (sourceId: string) => string): FlowBlock {
  const next = clone(block)
  next.id = idFactory(block.id)
  if (next.type === 'section') {
    next.blocks = next.blocks.map((child) => remapBlockIds(child, idFactory))
  }
  return next
}

export function duplicateFlowBlock(
  source: FlowSurfaceDocument,
  blockId: string,
  idFactory: (sourceId: string) => string,
): FlowSurfaceDocument {
  const location = findFlowBlock(source, blockId)
  if (!location) throw new Error(`Unknown Flow block: ${blockId}`)
  return insertFlowBlock(
    source,
    remapBlockIds(location.block, idFactory),
    location.parentId,
    location.index + 1,
  )
}

export function moveFlowBlock(
  source: FlowSurfaceDocument,
  blockId: string,
  targetParentId: string | null,
  targetIndex: number,
): FlowSurfaceDocument {
  const sourceLocation = findFlowBlock(source, blockId)
  if (!sourceLocation) throw new Error(`Unknown Flow block: ${blockId}`)
  if (targetParentId === blockId) throw new Error('A Flow block cannot contain itself')
  if (targetParentId !== null) {
    let cursor = findFlowBlock(source, targetParentId)
    while (cursor) {
      if (cursor.block.id === blockId) {
        throw new Error('A Flow section cannot move into one of its descendants')
      }
      cursor = cursor.parentId ? findFlowBlock(source, cursor.parentId) : undefined
    }
  }
  const next = clone(source)
  const current = findFlowBlock(next, blockId)!
  const sourceArray = mutableBlockArray(next, current.parentId)
  const [moved] = sourceArray.splice(current.index, 1)
  if (!moved) throw new Error(`Unable to move Flow block: ${blockId}`)
  const target = mutableBlockArray(next, targetParentId)
  // targetIndex is expressed in the destination array after removal. This
  // makes drag/drop and keyboard move commands share one unambiguous contract.
  target.splice(clampInsertionIndex(targetIndex, target.length), 0, moved)
  return next
}

export function replaceFlowBlock(
  source: FlowSurfaceDocument,
  block: FlowBlock,
): FlowSurfaceDocument {
  const next = clone(source)
  const location = findFlowBlock(next, block.id)
  if (!location) throw new Error(`Unknown Flow block: ${block.id}`)
  mutableBlockArray(next, location.parentId)[location.index] = clone(block)
  assertUniqueBlockIds(next)
  return next
}

export function setFlowSectionCollapsed(
  source: FlowSurfaceDocument,
  sectionId: string,
  collapsed: boolean,
): FlowSurfaceDocument {
  const location = findFlowBlock(source, sectionId)
  if (!location || location.block.type !== 'section') {
    throw new Error(`Unknown Flow section: ${sectionId}`)
  }
  return replaceFlowBlock(source, { ...location.block, collapsedByDefault: collapsed })
}

export function expandAllFlowSections(source: FlowSurfaceDocument): FlowSurfaceDocument {
  const next = clone(source)
  walkFlowBlocks(next, ({ block }) => {
    if (block.type === 'section') block.collapsedByDefault = false
  })
  return next
}

export function buildFlowOutline(document: FlowSurfaceDocument): FlowOutlineItem[] {
  const outline: FlowOutlineItem[] = []
  walkFlowBlocks(document, ({ block, depth }) => {
    if (block.type === 'heading') {
      outline.push({ blockId: block.id, text: block.text, level: block.level + depth, kind: 'heading' })
    } else if (block.type === 'section') {
      outline.push({ blockId: block.id, text: block.title, level: depth + 1, kind: 'section' })
    }
  })
  return outline
}

export function searchFlowDocument(
  document: FlowSurfaceDocument,
  query: string,
): FlowSearchMatch[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return []
  const matches: FlowSearchMatch[] = []
  walkFlowBlocks(document, ({ block }) => {
    for (const [field, value] of blockTextFields(block)) {
      const index = value.toLocaleLowerCase().indexOf(normalized)
      if (index < 0) continue
      const start = Math.max(0, index - 30)
      const end = Math.min(value.length, index + normalized.length + 30)
      matches.push({
        blockId: block.id,
        field,
        excerpt: `${start > 0 ? '…' : ''}${value.slice(start, end)}${end < value.length ? '…' : ''}`,
        index,
      })
    }
  })
  return matches
}

export function cloneFlowDocument(document: FlowSurfaceDocument): FlowSurfaceDocument {
  const cloned = clone(document)
  assertUniqueBlockIds(cloned)
  return cloned
}
