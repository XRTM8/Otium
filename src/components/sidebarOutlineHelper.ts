import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FlatTocItem } from './SidebarTocAndNotes';

async function flattenOutline(
  doc: PDFDocumentProxy,
  nodes: Awaited<ReturnType<typeof doc.getOutline>>,
  depth: number,
  out: FlatTocItem[]
): Promise<void> {
  if (!nodes || depth > 8) return;
  for (const item of nodes) {
    let pageNum = 1;
    try {
      if (typeof item.dest === 'string') {
        const dest = await doc.getDestination(item.dest);
        if (dest) {
          const ref = dest[0];
          pageNum = (await doc.getPageIndex(ref)) + 1;
        }
      } else if (Array.isArray(item.dest)) {
        pageNum = (await doc.getPageIndex(item.dest[0])) + 1;
      }
    } catch {
      // Resilient fallback for broken outline destinations
    }
    out.push({
      title: item.title,
      pageNumber: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1,
      depth,
    });
    if (Array.isArray(item.items) && item.items.length > 0) {
      await flattenOutline(doc, item.items, depth + 1, out);
    }
  }
}

export async function extractDocumentOutline(doc: PDFDocumentProxy): Promise<FlatTocItem[]> {
  const outline = await doc.getOutline();
  if (!outline || outline.length === 0) return [];
  const items: FlatTocItem[] = [];
  await flattenOutline(doc, outline, 0, items);
  return items;
}
