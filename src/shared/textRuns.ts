import type { TextRun, TextRunStyle } from './projectTypes'

function normalizeStyle(style: TextRunStyle): TextRunStyle {
  return {
    ...(style.color !== undefined ? { color: style.color } : {}),
    ...(style.bold !== undefined ? { bold: style.bold } : {}),
    ...(style.italic !== undefined ? { italic: style.italic } : {}),
    ...(style.underline !== undefined ? { underline: style.underline } : {}),
    ...(style.strike !== undefined ? { strike: style.strike } : {}),
    ...(style.highlightColor !== undefined
      ? { highlightColor: style.highlightColor }
      : {}),
  }
}

function sameStyle(left: TextRunStyle, right: TextRunStyle): boolean {
  return JSON.stringify(normalizeStyle(left)) === JSON.stringify(normalizeStyle(right))
}

function hasStyle(style: TextRunStyle): boolean {
  return Object.keys(normalizeStyle(style)).length > 0
}

/**
 * Keeps rich-text styles attached to unchanged Unicode characters after a
 * plain-text edit. A single replacement region is inferred from the longest
 * common prefix and suffix; inserted text inherits a surrounding style only
 * when that inheritance is unambiguous.
 */
export function remapTextRuns(
  previousText: string,
  nextText: string,
  runs: TextRun[],
): TextRun[] {
  if (previousText === nextText) return structuredClone(runs)

  const previous = Array.from(previousText)
  const next = Array.from(nextText)
  const previousStyles = previous.map<TextRunStyle>(() => ({}))
  for (const run of runs) {
    const start = Math.max(0, Math.min(previous.length, run.start))
    const end = Math.max(start, Math.min(previous.length, run.end))
    for (let index = start; index < end; index += 1) {
      Object.assign(previousStyles[index], run.style)
    }
  }
  previousStyles.forEach((style, index) => {
    previousStyles[index] = normalizeStyle(style)
  })

  let prefix = 0
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix] === next[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const nextStyles = next.map<TextRunStyle>(() => ({}))
  for (let index = 0; index < prefix; index += 1) {
    nextStyles[index] = previousStyles[index]
  }
  for (let offset = 0; offset < suffix; offset += 1) {
    nextStyles[next.length - suffix + offset] =
      previousStyles[previous.length - suffix + offset]
  }

  const changedStart = prefix
  const changedEnd = next.length - suffix
  if (changedEnd > changedStart) {
    const before = prefix > 0 ? previousStyles[prefix - 1] : undefined
    const afterIndex = previous.length - suffix
    const after = afterIndex < previous.length ? previousStyles[afterIndex] : undefined
    const inherited = before && after
      ? (sameStyle(before, after) ? before : undefined)
      : (before ?? after)
    if (inherited && hasStyle(inherited)) {
      for (let index = changedStart; index < changedEnd; index += 1) {
        nextStyles[index] = inherited
      }
    }
  }

  const result: TextRun[] = []
  let start = 0
  while (start < nextStyles.length) {
    const style = normalizeStyle(nextStyles[start])
    let end = start + 1
    while (end < nextStyles.length && sameStyle(style, nextStyles[end])) end += 1
    if (hasStyle(style)) result.push({ start, end, style })
    start = end
  }
  return result
}
