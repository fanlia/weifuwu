/**
 * Split text into chunks by paragraphs, respecting a max chunk size with overlap.
 * Used by both knowledge base and agent modules.
 */
export function chunkContent(content: string, chunkSize: number, overlap: number): string[] {
  const paragraphs = content.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''
  for (const p of paragraphs) {
    if (current.length + p.length > chunkSize && current.length > 0) {
      chunks.push(current)
      current = current.slice(-overlap)
    }
    current += (current ? '\n\n' : '') + p
  }
  if (current) chunks.push(current)
  return chunks
}
