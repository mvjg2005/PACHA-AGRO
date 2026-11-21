/** Convierte el Markdown simple que devuelve la IA (negritas, listas, párrafos) en bloques seguros
 *  para mostrar con React, sin usar HTML crudo. */
export type Inline = { text: string; bold?: boolean; italic?: boolean }
export type Block = { type: 'p'; parts: Inline[] } | { type: 'ul' | 'ol'; items: Inline[][] }

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    if (m[1] ?? m[2]) out.push({ text: m[1] ?? m[2], bold: true })
    else out.push({ text: m[3], italic: true })
    last = re.lastIndex
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  // Asteriscos sueltos que quedaron sin pareja: se quitan.
  return out.map(p => ({ ...p, text: p.text.replace(/\*\*/g, '').replace(/^#+\s*/, '') })).filter(p => p.text)
}

export function parseRich(text: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => { if (para.length) { blocks.push({ type: 'p', parts: parseInline(para.join(' ')) }); para = [] } }
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    const ul = line.match(/^(?:[-•*])\s+(.*)$/)
    const ol = line.match(/^\d+[.)]\s+(.*)$/)
    if (!line) { flush(); continue }
    if (ul || ol) {
      flush()
      const type = ul ? 'ul' : 'ol'
      const prev = blocks[blocks.length - 1]
      const item = parseInline((ul ?? ol)![1])
      if (prev && prev.type === type) prev.items.push(item)
      else blocks.push({ type, items: [item] })
      continue
    }
    para.push(line.replace(/^#+\s*/, ''))
  }
  flush()
  return blocks
}
