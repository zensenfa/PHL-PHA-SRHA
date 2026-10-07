// Dependency-free DOCX writer (store-only ZIP + minimal WordprocessingML).
// Written for the Railway Hazard Analysis Suite: the single-file/offline rule
// forbids CDN libraries, and none of the vendored libraries (SheetJS, mammoth,
// pdf.js) expose a general-purpose ZIP writer. A DOCX is a ZIP of XML parts,
// and "stored" (uncompressed) entries are valid ZIP — Word opens them fine.
//
// Document model: a flat list of blocks (heading / paragraph / bullets /
// table / pageBreak / toc / sectionBreak) rendered into word/document.xml with
// a small styles.xml. Sections can switch page orientation (wide hazard
// tables go landscape). Header carries the document title, footer carries
// "Seite X von Y" via PAGE / NUMPAGES fields. The TOC is a field Word
// refreshes on open (F9); it renders as "Inhaltsverzeichnis aktualisieren"
// until then, which is the standard behaviour of generated Word files.
//
// Pure: no DOM. Works under Node (tests) and in the browser (export).
(function () {
// ---------------------------------------------------------------- ZIP ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function utf8(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  return Uint8Array.from(Buffer.from(str, 'utf8'));
}

function dosDateTime(d) {
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  return { date, time };
}

/** entries: [{ name: 'word/document.xml', data: string|Uint8Array }] -> Uint8Array (ZIP, method 0 = stored). */
function zipStore(entries, now = new Date()) {
  const { date, time } = dosDateTime(now);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = utf8(e.name);
    const data = typeof e.data === 'string' ? utf8(e.data) : e.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of locals) { out.set(part, p); p += part.length; }
  for (const part of centrals) { out.set(part, p); p += part.length; }
  out.set(end, p);
  return out;
}

// --------------------------------------------------------------- OOXML ----
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // strip control characters Word rejects
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

const TWIP = 20; // 1 pt = 20 twips; 1 cm = 567 twips
const PAGE = {
  portrait: { w: 11906, h: 16838 }, // A4
  landscape: { w: 16838, h: 11906 },
  margin: { top: 1418, right: 1134, bottom: 1418, left: 1134, header: 709, footer: 709 },
};

function contentWidth(landscape) {
  const p = landscape ? PAGE.landscape : PAGE.portrait;
  return p.w - PAGE.margin.left - PAGE.margin.right;
}

/** Inline runs: text with optional bold/italic/color/size; "\n" becomes a line break. */
function runXml(text, opts = {}) {
  const props = [];
  if (opts.bold) props.push('<w:b/>');
  if (opts.italic) props.push('<w:i/>');
  if (opts.color) props.push(`<w:color w:val="${opts.color}"/>`);
  if (opts.size) props.push(`<w:sz w:val="${opts.size * 2}"/><w:szCs w:val="${opts.size * 2}"/>`);
  if (opts.mono) props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>');
  if (opts.shade) props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>`);
  const rpr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  const parts = String(text == null ? '' : text).split('\n');
  return parts.map((part, i) => `<w:r>${rpr}${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEscape(part)}</w:t></w:r>`).join('');
}

/** A paragraph from either a string or an array of {text, ...runOpts}. */
function paragraphXml(content, opts = {}) {
  const ppr = [];
  if (opts.style) ppr.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.keepNext) ppr.push('<w:keepNext/>');
  if (opts.align) ppr.push(`<w:jc w:val="${opts.align}"/>`);
  if (opts.numId != null) ppr.push(`<w:numPr><w:ilvl w:val="${opts.level || 0}"/><w:numId w:val="${opts.numId}"/></w:numPr>`);
  if (opts.spacingAfter != null || opts.spacingBefore != null) {
    ppr.push(`<w:spacing${opts.spacingBefore != null ? ` w:before="${opts.spacingBefore}"` : ''}${opts.spacingAfter != null ? ` w:after="${opts.spacingAfter}"` : ''}/>`);
  }
  if (opts.pageBreakBefore) ppr.push('<w:pageBreakBefore/>');
  if (opts.shade) ppr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>`);
  if (opts.sectPr) ppr.push(opts.sectPr);
  const runs = Array.isArray(content)
    ? content.map((r) => (typeof r === 'string' ? runXml(r, opts.run || {}) : runXml(r.text, { ...(opts.run || {}), ...r }))).join('')
    : runXml(content, opts.run || {});
  return `<w:p>${ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : ''}${runs}</w:p>`;
}

function sectPrXml({ landscape = false, titlePage = false } = {}) {
  const p = landscape ? PAGE.landscape : PAGE.portrait;
  const m = PAGE.margin;
  return `<w:sectPr>` +
    `<w:headerReference w:type="default" r:id="rIdHeader"/>` +
    `<w:footerReference w:type="default" r:id="rIdFooter"/>` +
    `<w:pgSz w:w="${p.w}" w:h="${p.h}"${landscape ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${m.top}" w:right="${m.right}" w:bottom="${m.bottom}" w:left="${m.left}" w:header="${m.header}" w:footer="${m.footer}" w:gutter="0"/>` +
    (titlePage ? '<w:titlePg/>' : '') +
    `</w:sectPr>`;
}

/**
 * Table. columns: [{ header, width }] widths as fractions summing to ~1 (or
 * absolute twips when > 1). rows: array of arrays; a cell is a string, or
 * { text, bold, shade, color, italic, mono } or an array of such runs, or
 * { paragraphs: [ ...cell contents ] } for multi-paragraph cells.
 */
function tableXml({ columns, rows, landscape = false, headerShade = 'D9E2EC', fontSize = 9, zebra = true, firstColBold = false, cellPadding = 60 }) {
  const total = contentWidth(landscape);
  const fracSum = columns.reduce((n, c) => n + (c.width || 1), 0);
  const widths = columns.map((c) => (c.width > 1 ? Math.round(c.width) : Math.round((total * (c.width || 1)) / fracSum)));
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const borders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="9AA5B1"/>`).join('') + '</w:tblBorders>';
  const tblPr = `<w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>${borders}` +
    `<w:tblCellMar><w:top w:w="${cellPadding}" w:type="dxa"/><w:left w:w="${cellPadding + 20}" w:type="dxa"/><w:bottom w:w="${cellPadding}" w:type="dxa"/><w:right w:w="${cellPadding + 20}" w:type="dxa"/></w:tblCellMar></w:tblPr>`;

  const cellXml = (cell, colIdx, { header = false, rowShade = null } = {}) => {
    const w = widths[colIdx];
    let paragraphs;
    let shade = header ? headerShade : rowShade;
    let baseRun = { size: fontSize, bold: header || (firstColBold && colIdx === 0) };
    if (cell != null && typeof cell === 'object' && !Array.isArray(cell)) {
      if (cell.shade) shade = cell.shade;
      const { paragraphs: paras, shade: _s, ...runOpts } = cell;
      baseRun = { ...baseRun, ...runOpts };
      paragraphs = paras || [cell.text];
    } else {
      paragraphs = [cell];
    }
    const body = paragraphs.map((p) => paragraphXml(p == null ? '' : (typeof p === 'object' && !Array.isArray(p) ? [p] : p), { run: baseRun, spacingAfter: 0, spacingBefore: 0 })).join(''); // PATCH-1
    const tcPr = `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>` : ''}<w:vAlign w:val="top"/></w:tcPr>`;
    return `<w:tc>${tcPr}${body}</w:tc>`;
  };

  const headerRow = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${columns.map((c, i) => cellXml(c.header, i, { header: true })).join('')}</w:tr>`;
  const bodyRows = rows.map((r, ri) => {
    const rowShade = zebra && ri % 2 === 1 ? 'F5F7FA' : null;
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${columns.map((_, i) => cellXml(r[i], i, { rowShade })).join('')}</w:tr>`;
  }).join('');
  // Trailing empty paragraph: Word requires a paragraph between a table and a following table/section end.
  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${headerRow}${bodyRows}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;
}

function tocXml() {
  return `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>${runXml('Inhaltsverzeichnis')}</w:p>` +
    `<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>Inhaltsverzeichnis wird beim Öffnen in Word aktualisiert (F9).</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/><w:color w:val="17212B"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="360"/></w:pPr><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="55606C"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="480" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="0B5C55"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="17212B"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="37424E"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Heading1"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="55606C"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Hint"><w:name w:val="Hint"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="6B7580"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="9AA5B1"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="55606C"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="55606C"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="40"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr><w:spacing w:after="40"/></w:pPr></w:style>
</w:styles>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:lvl>
<w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="–"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="240"/></w:pPr></w:lvl>
</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="300"/></w:pPr></w:lvl>
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

function headerXml(text) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr>${runXml(text)}</w:p></w:hdr>`;
}

function footerXml(text) {
  const fld = (instr) => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>${runXml(text)}<w:r><w:tab/></w:r>${runXml('Seite ')}${fld('PAGE')}${runXml(' von ')}${fld('NUMPAGES')}</w:p></w:ftr>`;
}

function corePropsXml({ title, author, subject, created }) {
  const iso = (created || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${xmlEscape(title)}</dc:title><dc:subject>${xmlEscape(subject || '')}</dc:subject><dc:creator>${xmlEscape(author || '')}</dc:creator><cp:lastModifiedBy>${xmlEscape(author || '')}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
  `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
  `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
  `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
  `<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>` +
  `<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
  `<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;

// updateFields=true makes Word refresh the TOC / NUMPAGES fields on open (after one prompt).
const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="709"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Railway Hazard Analysis Suite</Application></Properties>`;

// ------------------------------------------------------------- Builder ----
/**
 * const doc = createDocument({ title, subtitle, author, headerText, footerText });
 * doc.title(...); doc.heading('…', 1); doc.paragraph('…'); doc.bullets([...]);
 * doc.numbered([...]); doc.table({ columns, rows }); doc.caption('Tabelle 1 …');
 * doc.pageBreak(); doc.toc(); doc.section({ landscape: true });
 * doc.build() -> Uint8Array
 */
function createDocument({ title = '', subtitle = '', author = '', subject = '', headerText = null, footerText = '' } = {}) {
  const blocks = [];
  let landscape = false; // orientation of the section currently being written
  const api = {
    title(text, sub) {
      blocks.push(paragraphXml(text, { style: 'Title' }));
      if (sub || subtitle) blocks.push(paragraphXml(sub || subtitle, { style: 'Subtitle' }));
      return api;
    },
    heading(text, level = 1) {
      blocks.push(paragraphXml(text, { style: `Heading${Math.min(3, Math.max(1, level))}` }));
      return api;
    },
    paragraph(content, opts = {}) {
      blocks.push(paragraphXml(content, opts));
      return api;
    },
    hint(text) {
      blocks.push(paragraphXml(text, { style: 'Hint' }));
      return api;
    },
    caption(text) {
      blocks.push(paragraphXml(text, { style: 'Caption', keepNext: true }));
      return api;
    },
    bullets(items, level = 0) {
      for (const it of items) blocks.push(paragraphXml(it, { style: 'ListBullet', numId: 1, level }));
      return api;
    },
    numbered(items) {
      for (const it of items) blocks.push(paragraphXml(it, { style: 'ListNumber', numId: 2 }));
      return api;
    },
    keyValue(pairs, { keyWidth = 0.28 } = {}) {
      blocks.push(tableXml({
        columns: [{ header: 'Feld', width: keyWidth }, { header: 'Wert', width: 1 - keyWidth }],
        rows: pairs.map(([k, v]) => [{ text: k, bold: true }, v == null ? '' : v]),
        landscape, zebra: false, fontSize: 9,
      }).replace(/<w:tr><w:trPr><w:tblHeader\/><w:cantSplit\/><\/w:trPr>.*?<\/w:tr>/, '')); // key/value tables have no header row
      return api;
    },
    table(spec) {
      blocks.push(tableXml({ landscape, ...spec }));
      return api;
    },
    pageBreak() {
      blocks.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      return api;
    },
    toc() {
      blocks.push(tocXml());
      return api;
    },
    /** Ends the current section (with ITS orientation) and starts a new one. */
    section({ landscape: next = false } = {}) {
      blocks.push(paragraphXml('', { sectPr: sectPrXml({ landscape }), spacingAfter: 0 }));
      landscape = next;
      return api;
    },
    build({ now = new Date() } = {}) {
      const body = blocks.join('') + sectPrXml({ landscape });
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`;
      return zipStore([
        { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
        { name: '_rels/.rels', data: ROOT_RELS_XML },
        { name: 'docProps/core.xml', data: corePropsXml({ title, author, subject, created: now }) },
        { name: 'docProps/app.xml', data: APP_XML },
        { name: 'word/_rels/document.xml.rels', data: DOC_RELS_XML },
        { name: 'word/document.xml', data: documentXml },
        { name: 'word/styles.xml', data: STYLES_XML },
        { name: 'word/numbering.xml', data: NUMBERING_XML },
        { name: 'word/settings.xml', data: SETTINGS_XML },
        { name: 'word/header1.xml', data: headerXml(headerText == null ? title : headerText) },
        { name: 'word/footer1.xml', data: footerXml(footerText) },
      ], now);
    },
  };
  return api;
}

const exported = { createDocument, zipStore, crc32, xmlEscape, contentWidth };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  window.RHAS_DOCX = exported;
}
})();

