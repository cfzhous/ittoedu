import { strToU8, zipSync } from 'fflate'
import { serializeFormulaAst } from '../../../shared/formulaLinear'
import type {
  FlowBlock,
  FlowMediaBlock,
  FlowSurfaceDocument,
} from '../../../player/surfaces/flow/flowModel'
import type {
  LayerItem,
  NativeLayerItem,
} from '../../../shared/courseProjectTypes'
import {
  getEffectiveScopedLayerOrder,
  isCourseLayerVisibleAtLocation,
} from '../../../shared/courseProjectModel'
import { compareStableStrings } from '../../../shared/stableOrder'

export interface FlowDocxLayerEntry {
  item: LayerItem
  source: 'global' | 'surface'
}

export interface FlowDocxAsset {
  bytes: Uint8Array
  mimeType: string
  filename?: string
}

export interface FlowDocxOptions {
  resolveAsset?: (assetId: string) => FlowDocxAsset | undefined
  resolveComponentName?: (packageId: string, version: string) => string | undefined
  author?: string
  createdAt?: Date
  pageSize?: 'A4' | 'Letter'
  /** The visible back-to-front Flow surface/global composition for this export. */
  effectiveLayerItems?: readonly FlowDocxLayerEntry[]
  locationId?: string
}

export interface FlowDocxReportItem {
  blockId: string
  disposition: 'preserved' | 'fallback' | 'omitted'
  detail: string
  layerItemId?: string
  sourceScope?: FlowDocxLayerEntry['source']
  order?: number
}

export interface FlowDocxResult {
  bytes: Uint8Array
  warnings: string[]
  report: FlowDocxReportItem[]
}

interface ImagePart {
  relationshipId: string
  path: string
  mimeType: string
  bytes: Uint8Array
}

interface BuildContext {
  warnings: string[]
  report: FlowDocxReportItem[]
  images: ImagePart[]
  nextRelationshipId: number
  numberingInstances: Array<{ id: number; ordered: boolean }>
  nextNumberingId: number
  resolveAsset: (assetId: string) => FlowDocxAsset | undefined
  resolveComponentName: NonNullable<FlowDocxOptions['resolveComponentName']>
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function run(text: string, options: { bold?: boolean; italic?: boolean } = {}): string {
  const preserve = /^\s|\s$|\s{2}/.test(text) ? ' xml:space="preserve"' : ''
  const properties = options.bold || options.italic
    ? `<w:rPr>${options.bold ? '<w:b/>' : ''}${options.italic ? '<w:i/>' : ''}</w:rPr>`
    : ''
  return `<w:r>${properties}<w:t${preserve}>${xml(text)}</w:t></w:r>`
}

function paragraph(
  text: string,
  options: {
    style?: string
    bold?: boolean
    italic?: boolean
    keepNext?: boolean
    numbering?: { id: number; level?: number }
  } = {},
): string {
  const properties = [
    options.style ? `<w:pStyle w:val="${xml(options.style)}"/>` : '',
    options.keepNext ? '<w:keepNext/>' : '',
    options.numbering
      ? `<w:numPr><w:ilvl w:val="${options.numbering.level ?? 0}"/><w:numId w:val="${options.numbering.id}"/></w:numPr>`
      : '',
  ].join('')
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${run(text, options)}</w:p>`
}

function formulaParagraph(expression: string): string {
  return `<m:oMathPara><m:oMath><m:r><m:t>${xml(expression)}</m:t></m:r></m:oMath></m:oMathPara>`
}

function tableCell(text: string, header: boolean): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tcMar></w:tcPr><w:p>${run(text, { bold: header })}</w:p></w:tc>`
}

function tableXml(rows: readonly string[][], headerRows: number): string {
  const width = Math.max(1, ...rows.map((row) => row.length))
  const grid = Array.from({ length: width }, () => '<w:gridCol w:w="2400"/>').join('')
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows.map((row, rowIndex) => `<w:tr>${rowIndex < headerRows ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from({ length: width }, (_, cellIndex) => tableCell(row[cellIndex] ?? '', rowIndex < headerRows)).join('')}</w:tr>`).join('')}</w:tbl>`
}

function flowTableRows(block: Extract<FlowBlock, { type: 'table' }>): string[][] {
  return [
    block.columns.map((column) => column.header),
    ...block.rows.map((row) => block.columns.map((column) => row.cells[column.id] ?? '')),
  ]
}

function imageExtension(mimeType: string): string | null {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/jpeg') return 'jpeg'
  if (mimeType === 'image/gif') return 'gif'
  if (mimeType === 'image/svg+xml') return 'svg'
  return null
}

function imageBlip(image: ImagePart): string {
  if (image.mimeType !== 'image/svg+xml') {
    return `<a:blip r:embed="${image.relationshipId}"/>`
  }
  return `<a:blip r:embed="${image.relationshipId}"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${image.relationshipId}"/></a:ext></a:extLst></a:blip>`
}

function imageDrawing(
  media: FlowMediaBlock,
  image: ImagePart,
  drawingId: number,
): string {
  const width = media.layout === 'full-width' ? 720 : media.layout === 'wide' ? 640 : 560
  const height = Math.round(width * 0.5625)
  const cx = Math.round(width * 9_525)
  const cy = Math.round(height * 9_525)
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawingId}" name="${xml((media.caption ?? media.altText) || `图片 ${drawingId}`)}" descr="${xml(media.altText ?? media.caption ?? '')}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${xml(image.path)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill>${imageBlip(image)}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

function renderBlock(block: FlowBlock, context: BuildContext, depth = 0): string {
  switch (block.type) {
    case 'heading':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: `保留为 ${block.level} 级标题` })
      return paragraph(block.text, { style: `Heading${block.level}`, keepNext: true })
    case 'paragraph':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: '保留为正文段落' })
      return paragraph(block.text)
    case 'quote':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: '保留为引用段落' })
      return `${paragraph(block.text, { style: 'Quote', italic: true })}${block.citation ? paragraph(`— ${block.citation}`, { style: 'Quote' }) : ''}`
    case 'list':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: block.ordered ? '保留为编号列表' : '保留为项目符号列表' })
      const numberingId = context.nextNumberingId++
      context.numberingInstances.push({ id: numberingId, ordered: block.ordered })
      return block.items.map((item) => paragraph(item.text, {
        numbering: { id: numberingId, level: item.level },
      })).join('')
    case 'divider':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: '保留为分隔线' })
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="AAB4C3"/></w:pBdr></w:pPr></w:p>'
    case 'media': {
      if (block.mediaKind !== 'image') {
        const mediaLabel = block.mediaKind === 'video' ? '视频' : '音频'
        const name = block.caption ?? block.altText ?? mediaLabel
        const reason = `${mediaLabel}不能在 Word 中保留播放互动，已用说明文字代替`
        context.warnings.push(`“${name}”${reason}。`)
        context.report.push({ blockId: block.id, disposition: 'fallback', detail: reason })
        return paragraph(`[媒体说明：${block.altText ?? block.caption ?? '未命名媒体'}]`, { italic: true })
      }
      const asset = context.resolveAsset(block.assetId)
      const extension = asset ? imageExtension(asset.mimeType) : null
      if (!asset || !extension) {
        const reason = !asset
          ? '图片素材不可用，已用说明文字代替'
          : '图片格式暂不支持，已用说明文字代替'
        context.warnings.push(`图片“${block.caption ?? block.altText ?? '未命名图片'}”${reason}。`)
        context.report.push({ blockId: block.id, disposition: 'fallback', detail: reason })
        return paragraph(`[图片说明：${block.altText ?? block.caption ?? '未命名图片'}${block.caption && block.altText ? `；${block.caption}` : ''}]`, { italic: true })
      }
      const relationshipId = `rId${context.nextRelationshipId++}`
      const path = `media/image${context.images.length + 1}.${extension}`
      const image: ImagePart = { relationshipId, path, mimeType: asset.mimeType, bytes: asset.bytes }
      context.images.push(image)
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: '图片已嵌入 Word 文档' })
      return `${imageDrawing(block, image, context.images.length)}${block.caption ? paragraph(block.caption, { style: 'Caption' }) : ''}`
    }
    case 'table':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: '保留为可编辑的 Word 表格' })
      return `${block.caption ? paragraph(block.caption, { style: 'Caption', keepNext: true }) : ''}${tableXml(flowTableRows(block), 1)}`
    case 'formula':
      context.warnings.push(`公式“${block.accessibleText}”已用 Word 公式文本与说明保留，请在导出后复核排版。`)
      context.report.push({ blockId: block.id, disposition: 'fallback', detail: '使用 Word 公式文本并保留无障碍说明' })
      return `${formulaParagraph(serializeFormulaAst(block.ast))}${paragraph(`公式说明：${block.accessibleText}`, { style: 'FormulaFallback' })}`
    case 'code':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: '保留为等宽代码段落' })
      return paragraph(block.code, { style: 'Code' })
    case 'callout':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: '保留为提示内容' })
      return `${block.title ? paragraph(block.title, { style: 'CalloutTitle', bold: true, keepNext: true }) : ''}${paragraph(block.body, { style: 'CalloutText' })}`
    case 'section':
      context.report.push({ blockId: block.id, disposition: 'preserved', detail: '已展开并保留该小节' })
      return `${paragraph(block.title, { style: `Heading${Math.min(6, depth + 2)}`, keepNext: true })}${block.blocks.map((child) => renderBlock(child, context, depth + 1)).join('')}`
    case 'component': {
      const asset = context.resolveAsset(block.staticFallbackAssetId)
      const extension = asset ? imageExtension(asset.mimeType) : null
      const componentName = context.resolveComponentName(
        block.component.packageId,
        block.component.version,
      ) ?? '互动组件'
      if (asset && extension) {
        context.warnings.push(`“${componentName}”已用静态预览导出；Word 中不保留互动。`)
        const relationshipId = `rId${context.nextRelationshipId++}`
        const path = `media/image${context.images.length + 1}.${extension}`
        const image: ImagePart = { relationshipId, path, mimeType: asset.mimeType, bytes: asset.bytes }
        context.images.push(image)
        const media: FlowMediaBlock = {
          id: block.id,
          type: 'media',
          assetId: block.staticFallbackAssetId,
          mediaKind: 'image',
          altText: `${componentName}的静态预览`,
          caption: componentName,
          layout: 'content-width',
        }
        context.report.push({ blockId: block.id, disposition: 'fallback', detail: '已嵌入组件的静态预览' })
        return `${paragraph(componentName, { style: 'CalloutTitle', bold: true, keepNext: true })}${imageDrawing(media, image, context.images.length)}`
      }
      context.warnings.push(`“${componentName}”没有可用的静态预览，Word 中已用说明文字代替。`)
      context.report.push({ blockId: block.id, disposition: 'fallback', detail: '静态预览不可用，已使用说明文字' })
      return `${paragraph(componentName, { style: 'CalloutTitle', bold: true, keepNext: true })}${paragraph('静态预览不可用，请回到编辑器重新选择图片。', { style: 'CalloutText' })}`
    }
  }
}

function layerReport(
  entry: FlowDocxLayerEntry,
  disposition: FlowDocxReportItem['disposition'],
  detail: string,
): FlowDocxReportItem {
  return {
    blockId: entry.item.layerItemId,
    layerItemId: entry.item.layerItemId,
    sourceScope: entry.source,
    order: entry.item.order,
    disposition,
    detail,
  }
}

function layerImage(
  entry: FlowDocxLayerEntry,
  assetId: string,
  altText: string,
  context: BuildContext,
): string | null {
  const asset = context.resolveAsset(assetId)
  const extension = asset ? imageExtension(asset.mimeType) : null
  if (!asset || !extension) return null
  const relationshipId = `rId${context.nextRelationshipId++}`
  const path = `media/image${context.images.length + 1}.${extension}`
  const image: ImagePart = { relationshipId, path, mimeType: asset.mimeType, bytes: asset.bytes }
  context.images.push(image)
  const media: FlowMediaBlock = {
    id: entry.item.layerItemId,
    type: 'media',
    assetId,
    mediaKind: 'image',
    altText,
    layout: 'content-width',
  }
  return imageDrawing(media, image, context.images.length)
}

function nativeLayerContent(
  entry: FlowDocxLayerEntry & { item: NativeLayerItem },
  context: BuildContext,
): { xml: string; disposition: FlowDocxReportItem['disposition']; detail: string } {
  const { content } = entry.item
  if (content.nativeType === 'text') {
    return { xml: paragraph(content.data.text), disposition: 'preserved', detail: '保留为可编辑文字' }
  }
  if (content.nativeType === 'formula') {
    return {
      xml: `${formulaParagraph(serializeFormulaAst(content.data.ast))}${paragraph(`公式说明：${content.data.accessibleText}`, { style: 'FormulaFallback' })}`,
      disposition: 'fallback',
      detail: '使用 Word 公式文本并保留说明',
    }
  }
  if (content.nativeType === 'image') {
    const image = layerImage(entry, content.data.assetId, entry.item.label, context)
    return image
      ? { xml: image, disposition: 'preserved', detail: '图片已嵌入 Word 文档' }
      : {
          xml: paragraph(`[图片说明：${entry.item.label}；图片素材不可用]`, { italic: true }),
          disposition: 'fallback',
          detail: '图片素材不可用，已用说明文字代替',
        }
  }
  if (content.nativeType === 'video') {
    const posterId = content.data.poster.mode === 'image' ? content.data.poster.assetId : undefined
    const image = posterId ? layerImage(entry, posterId, `${entry.item.label}的视频封面`, context) : null
    return image
      ? { xml: image, disposition: 'fallback', detail: '已使用教师设置的视频封面' }
      : {
          xml: paragraph(`[视频说明：${entry.item.label}]`, { italic: true }),
          disposition: 'fallback',
          detail: '视频已用说明文字代替',
        }
  }
  if (content.nativeType === 'shape') {
    return {
      xml: paragraph(`[图形：${entry.item.label}]`, { italic: true }),
      disposition: 'fallback',
      detail: '图形已用说明文字代替',
    }
  }
  if (!content.data.includeInStaticExports) {
    return {
      xml: paragraph(`[教师控制器“${entry.item.label}”已按静态导出设置省略]`, { italic: true }),
      disposition: 'omitted',
      detail: '教师控制器已按静态导出设置省略',
    }
  }
  const labels = content.data.buttons.filter((button) => button.visible).map((button) => button.label).join('、')
  return {
    xml: `${paragraph(content.data.title, { bold: true, keepNext: true })}${paragraph(labels || '无可见按钮')}`,
    disposition: 'fallback',
    detail: '教师控制器已保留为可编辑文字',
  }
}

function renderLayerItem(
  entry: FlowDocxLayerEntry,
  index: number,
  context: BuildContext,
): string {
  const { item } = entry
  const label = `第 ${index + 1} 层（由后到前）· ${item.label}`
  if (!item.visible) {
    const detail = '该内容在当前画面中不可见，文档仅保留省略说明'
    context.warnings.push(`“${item.label}”在当前画面中不可见，Word 中仅保留省略说明。`)
    context.report.push(layerReport(entry, 'omitted', detail))
    return `${paragraph(label, { style: 'CalloutTitle', bold: true, keepNext: true })}${paragraph('[该图层在当前静态帧中不可见]', { italic: true })}`
  }
  if (item.kind === 'native') {
    const rendered = nativeLayerContent(entry as FlowDocxLayerEntry & { item: NativeLayerItem }, context)
    if (rendered.disposition !== 'preserved') context.warnings.push(`“${item.label}”：${rendered.detail}。`)
    context.report.push(layerReport(entry, rendered.disposition, rendered.detail))
    return `${paragraph(label, { style: 'CalloutTitle', bold: true, keepNext: true })}${rendered.xml}`
  }
  const assetId = item.kind === 'component'
    ? item.staticFallbackAssetId
    : item.runtime.staticFallback?.assetId
  const image = assetId ? layerImage(entry, assetId, `${item.label}的静态后备`, context) : null
  const kindLabel = item.kind === 'component' ? '互动组件' : '互动内容'
  const detail = image
    ? `${kindLabel}已使用教师设置的静态预览`
    : `${kindLabel}没有可用的静态预览，已用说明文字代替`
  context.warnings.push(`“${item.label}”：${detail}；Word 中不保留互动。`)
  context.report.push(layerReport(entry, 'fallback', detail))
  return `${paragraph(label, { style: 'CalloutTitle', bold: true, keepNext: true })}${image ?? paragraph(`[互动内容说明：${item.label}；未找到可用的静态预览]`, { italic: true })}`
}

const CONTENT_TYPES = (images: readonly ImagePart[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...new Map(images.map((image) => [image.path.split('.').pop()!, image.mimeType])).entries()].map(([extension, mimeType]) => `<Default Extension="${extension}" ContentType="${mimeType}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`

const PACKAGE_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:hAnsi="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>' + Array.from({ length: 6 }, (_, index) => `<w:style w:type="paragraph" w:styleId="Heading${index + 1}"><w:name w:val="heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${320 - index * 20}" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${34 - index * 2}"/></w:rPr></w:style>`).join('') + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="480" w:right="480"/></w:pPr><w:rPr><w:i/><w:color w:val="475569"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="64748B"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CalloutTitle"><w:name w:val="Callout Title"/><w:pPr><w:shd w:fill="EAF3FF"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="CalloutText"><w:name w:val="Callout Text"/><w:pPr><w:ind w:left="240"/><w:shd w:fill="F4F8FF"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="FormulaFallback"><w:name w:val="Formula Fallback"/><w:rPr><w:i/><w:color w:val="7C3AED"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:pPr><w:shd w:fill="F1F5F9"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:eastAsia="Microsoft YaHei" w:hAnsi="Consolas"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C2D1"/><w:left w:val="single" w:sz="4" w:color="B8C2D1"/><w:bottom w:val="single" w:sz="4" w:color="B8C2D1"/><w:right w:val="single" w:sz="4" w:color="B8C2D1"/><w:insideH w:val="single" w:sz="4" w:color="B8C2D1"/><w:insideV w:val="single" w:sz="4" w:color="B8C2D1"/></w:tblBorders></w:tblPr></w:style></w:styles>'

function numberingLevel(level: number, ordered: boolean): string {
  const left = 720 + level * 540
  const text = ordered
    ? Array.from({ length: level + 1 }, (_, index) => `%${index + 1}`).join('.') + '.'
    : ['•', '◦', '▪'][level % 3]!
  return `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${ordered ? 'decimal' : 'bullet'}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${left}"/></w:tabs><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl>`
}

function numberingXml(instances: readonly { id: number; ordered: boolean }[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>${Array.from({ length: 6 }, (_, level) => numberingLevel(level, false)).join('')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>${Array.from({ length: 6 }, (_, level) => numberingLevel(level, true)).join('')}</w:abstractNum>${instances.map((instance) => `<w:num w:numId="${instance.id}"><w:abstractNumId w:val="${instance.ordered ? 1 : 0}"/></w:num>`).join('')}</w:numbering>`
}

function wordRelationships(images: readonly ImagePart[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${images.map((image) => `<Relationship Id="${image.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${image.path}"/>`).join('')}</Relationships>`
}

function isoDate(date: Date): string {
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString()
}

/** Build a deterministic, editable DOCX package directly from Flow blocks. */
export function buildFlowDocx(
  flow: FlowSurfaceDocument,
  options: FlowDocxOptions = {},
): FlowDocxResult {
  const context: BuildContext = {
    warnings: [],
    report: [],
    images: [],
    nextRelationshipId: 3,
    numberingInstances: [],
    nextNumberingId: 1,
    resolveAsset: options.resolveAsset ?? (() => undefined),
    resolveComponentName: options.resolveComponentName ?? (() => undefined),
  }
  const layerItems = (options.effectiveLayerItems
    ? [...options.effectiveLayerItems]
    : getEffectiveScopedLayerOrder(flow.surfaceLayerItems)
      .filter((entry) => options.locationId
        ? isCourseLayerVisibleAtLocation(entry, options.locationId)
        : true)
      .map((entry): FlowDocxLayerEntry => ({ item: entry.item, source: 'surface' })))
    .sort((left, right) =>
      left.item.order - right.item.order ||
      compareStableStrings(left.item.layerItemId, right.item.layerItemId),
    )
  if (!options.locationId && !options.effectiveLayerItems && flow.surfaceLayerItems.some((entry) => entry.visibility.mode !== 'all')) {
    context.warnings.push('未指定讲义的当前课程位置；已保留全部共享图层，请在导出后复核。')
  }
  const layerBody = layerItems.length > 0
    ? `${paragraph('画布图层（按后→前层级）', { style: 'Heading1', keepNext: true })}${layerItems.map((entry, index) => renderLayerItem(entry, index, context)).join('')}`
    : ''
  const body = `${paragraph(flow.title, { style: 'Title', keepNext: true })}${flow.blocks.map((block) => renderBlock(block, context)).join('')}${layerBody}`
  const page = options.pageSize === 'Letter'
    ? { width: 12_240, height: 15_840 }
    : { width: 11_906, height: 16_838 }
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${body}<w:sectPr><w:pgSz w:w="${page.width}" w:h="${page.height}"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
  const createdAt = isoDate(options.createdAt ?? new Date('1980-01-01T00:00:00.000Z'))
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(flow.title)}</dc:title><dc:creator>${xml(options.author ?? 'ittoedu')}</dc:creator><cp:lastModifiedBy>${xml(options.author ?? 'ittoedu')}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified></cp:coreProperties>`
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ittoedu 互动课件编辑器</Application><AppVersion>1.0</AppVersion></Properties>'
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES(context.images)),
    '_rels/.rels': strToU8(PACKAGE_RELS),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(STYLES),
    'word/numbering.xml': strToU8(numberingXml(context.numberingInstances)),
    'word/_rels/document.xml.rels': strToU8(wordRelationships(context.images)),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
  }
  for (const image of context.images) files[`word/${image.path}`] = image.bytes
  return {
    bytes: zipSync(files, { level: 6, mtime: new Date('1980-01-01T00:00:00.000Z') }),
    warnings: context.warnings,
    report: context.report,
  }
}
