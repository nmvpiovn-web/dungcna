// PDF text extraction using pdfjs-dist
// Used by /api/ocr for text-based PDFs

export async function extractPdfText(buffer) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    
    let fullText = '';
    const maxPages = Math.min(doc.numPages, 20); // Giới hạn 20 trang
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    return fullText;
  } catch (err) {
    console.error('[PDF Extract] Error:', err.message);
    throw err;
  }
}
