// Document ingestion for the Systemkontext input (build plan §1.3: copied
// verbatim from RHL's documents.js). TXT is native (FileReader); DOCX/XLSX/PDF
// go through vendored libraries (vendor/mammoth.browser.min.js,
// vendor/xlsx.full.min.js, vendor/pdf.min.js). PDF extraction falls back to
// the paste-text UI on failure (encrypted/scanned PDFs, or if pdf.js failed
// to load) rather than hard-rejecting every PDF.
(function () {
const MAX_EXTRACT_CHARS = 400000; // RHAS: retrieval is chunk-based, so whole documents are kept; only pathological sizes are capped
const PDF_PAGE_CAP = 200; // RHAS: raised from 50 — excerpts are retrieved per pass, not pasted whole

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function extractDocx(file) {
  if (typeof window === 'undefined' || !window.mammoth) {
    throw new Error('mammoth (vendor/mammoth.browser.min.js) is not loaded.');
  }
  const arrayBuffer = await readAsArrayBuffer(file);
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractXlsx(file) {
  if (typeof window === 'undefined' || !window.XLSX) {
    throw new Error('XLSX (vendor/xlsx.full.min.js) is not loaded.');
  }
  const arrayBuffer = await readAsArrayBuffer(file);
  const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = window.XLSX.utils.sheet_to_csv(sheet);
    return `--- ${sheetName} ---\n${csv}`;
  }).join('\n\n');
}

function extensionOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

// The worker script must run in its own thread; in a single-file build there
// is no separate file to point a `Worker` URL at, so its source is inlined as
// an inert <script type="application/json" id="pdf-worker-source"> data
// block (build.py's existing JSON-inliner handles this with no changes to
// build.py — the block just isn't valid JSON, which browsers don't check for
// non-executable script types) and reconstructed into a Blob URL at runtime.
let pdfWorkerBlobUrlPromise = null;
async function getPdfWorkerSourceText() {
  const tag = document.getElementById('pdf-worker-source');
  if (!tag) throw new Error('pdf-worker-source script tag not found in the page');
  if (tag.textContent && tag.textContent.trim()) {
    return tag.textContent; // build.py inlined it — the shipped single-file path
  }
  // Dev-mode fallback: browsers never fetch `src` on a non-executable
  // <script type="application/json">, so the unbuilt src/ tree (served over
  // http, not opened as file://) fetches the sibling file directly — mirrors
  // taxonomy.js's loadTaxonomy() fallback.
  const resp = await fetch(tag.getAttribute('src'));
  return resp.text();
}

async function getPdfWorkerBlobUrl() {
  if (!pdfWorkerBlobUrlPromise) {
    pdfWorkerBlobUrlPromise = getPdfWorkerSourceText().then((src) => URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
  }
  return pdfWorkerBlobUrlPromise;
}

/**
 * Reconstructs one page's reading order from pdf.js's raw text-item stream,
 * which is content-stream emit order, not necessarily left-to-right (some
 * PDF producers emit fragments out of x-order even within one visual line,
 * and two-column layouts are especially prone to this). Groups items into a
 * line whenever the y-coordinate holds within a 4px tolerance of the
 * previous item, then x-sorts each line's fragments before joining —
 * ported from the MIL-STD PHL Generator's proven text-extraction.js.
 */
function reconstructPdfPageText(items) {
  const Y_TOLERANCE = 4;
  let lastY = null;
  let lineBuf = [];
  const lines = [];
  const flushLine = () => {
    if (!lineBuf.length) return;
    lineBuf.sort((a, b) => a.x - b.x);
    lines.push(lineBuf.map((it) => it.str).join(' '));
    lineBuf = [];
  };
  for (const item of items) {
    if (!item.str) continue;
    const y = item.transform ? item.transform[5] : 0;
    const x = item.transform ? item.transform[4] : 0;
    if (lastY !== null && Math.abs(y - lastY) > Y_TOLERANCE) flushLine();
    lineBuf.push({ x, str: item.str });
    lastY = y;
  }
  flushLine();
  return lines.join('\n');
}

/**
 * Real PDF text extraction. Page-capped (default 50, configurable, not a
 * hard requirement) with per-page memory cleanup — PDFs can hold a lot of
 * decoded content in memory. Throws (never silently returns empty text) on
 * encrypted/scanned PDFs so the caller can route to the paste-text fallback
 * instead of feeding an empty prompt to the LLM.
 */
async function extractPdf(file, onPageProgress) {
  if (typeof window === 'undefined' || !window.pdfjsLib) {
    throw new Error('PDF.js (vendor/pdf.min.js) ist nicht geladen.');
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = await getPdfWorkerBlobUrl();
  const arrayBuffer = await readAsArrayBuffer(file);
  let pdf;
  try {
    pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (err) {
    throw new Error(`PDF konnte nicht gelesen werden (evtl. verschlüsselt oder beschädigt) — bitte Text manuell einfügen: ${err.message}`);
  }
  const pageCount = Math.min(pdf.numPages, PDF_PAGE_CAP);
  const parts = [];
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    // One malformed/corrupt page must not discard every page already
    // extracted before it — the whole point of this extractor (per its own
    // docstring) is graceful degradation, not an all-or-nothing PDF read.
    try {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      parts.push(`--- Seite ${pageNum} ---\n${reconstructPdfPageText(content.items)}`);
      page.cleanup();
    } catch {
      parts.push(`--- Seite ${pageNum} (Extraktion fehlgeschlagen) ---`);
    }
    if (onPageProgress) onPageProgress(pageNum, pageCount);
  }
  await pdf.destroy();
  // A document whose pages ALL failed extraction must still be caught by the
  // "no text extracted" guard below — the failure marker has its own
  // parenthetical suffix that the success-only pattern doesn't match, so a
  // document that never extracted a single real character was previously
  // returned as "content" (a page-count list of failure markers) instead of
  // throwing to the paste-text fallback, per this function's own docstring.
  const strippedForEmptyCheck = parts.join('\n\n').replace(/--- Seite \d+( \(Extraktion fehlgeschlagen\))? ---/g, '').trim();
  if (!strippedForEmptyCheck) {
    throw new Error('Kein Text extrahiert — die PDF ist vermutlich gescannt/nicht durchsuchbar. Bitte Text manuell einfügen.');
  }
  // The page cap silently dropped pages beyond it — the engineer (and the
  // LLM reading this as a document extract) must be told, or a 200-page PDF
  // looks like a complete 50-page document with no indication 150 pages of
  // potentially safety-relevant content were never read.
  if (pdf.numPages > pageCount) {
    parts.push(`--- Hinweis: Dokument hat ${pdf.numPages} Seiten — nur die ersten ${pageCount} wurden extrahiert (Obergrenze ${PDF_PAGE_CAP} Seiten). Restliche Seiten ggf. manuell einfügen. ---`);
  }
  return parts.join('\n\n');
}

/**
 * Ingest one uploaded file into { name, type, text }. `type` is one of
 * txt/csv/docx/xlsx/pdf. `onPageProgress(pageNum, totalPages)` is only
 * invoked for PDFs.
 */
async function ingestFile(file, onPageProgress) {
  const ext = extensionOf(file.name);
  let text;
  let type;
  if (ext === 'txt' || ext === 'csv' || ext === 'md') {
    text = await readAsText(file);
    type = ext;
  } else if (ext === 'docx') {
    text = await extractDocx(file);
    type = 'docx';
  } else if (ext === 'xlsx' || ext === 'xls') {
    text = await extractXlsx(file);
    type = 'xlsx';
  } else if (ext === 'pdf') {
    text = await extractPdf(file, onPageProgress);
    type = 'pdf';
  } else {
    throw new Error(`Nicht unterstütztes Dateiformat: .${ext}`);
  }
  return { name: file.name, type, text: (text || '').slice(0, MAX_EXTRACT_CHARS) };
}

const api = { ingestFile, extensionOf, MAX_EXTRACT_CHARS, reconstructPdfPageText, extractPdf, PDF_PAGE_CAP };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RMG_DOCUMENTS = api;
}
})();


