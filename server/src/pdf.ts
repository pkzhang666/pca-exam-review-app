import { PDFDocument } from "pdf-lib";

export interface PdfChunk {
  index: number;
  startPage: number; // 1-based, inclusive
  endPage: number; // 1-based, inclusive
  base64: string;
}

/** Page count without splitting — used for validation before we accept an upload. */
export async function countPages(pdfBytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  return doc.getPageCount();
}

/**
 * Split a PDF into chunks of at most `pagesPerChunk` pages. Each chunk is a
 * self-contained PDF (base64) small enough to send to Claude as one document
 * block. A 900-page source at 50 pages/chunk yields 18 chunks.
 */
export async function splitPdf(
  pdfBytes: Uint8Array,
  pagesPerChunk: number,
): Promise<PdfChunk[]> {
  const src = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const total = src.getPageCount();
  const chunks: PdfChunk[] = [];

  for (let start = 0; start < total; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, total);
    const out = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await out.copyPages(src, indices);
    for (const p of pages) out.addPage(p);
    const bytes = await out.save();
    chunks.push({
      index: chunks.length,
      startPage: start + 1,
      endPage: end,
      base64: Buffer.from(bytes).toString("base64"),
    });
  }
  return chunks;
}

/** Bounded-concurrency map — avoids pulling in an ESM-only pool dependency. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
