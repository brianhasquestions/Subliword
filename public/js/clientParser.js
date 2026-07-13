/**
 * Client-side Parser - Extract text from PDF/DOCX/TXT files directly in the browser
 * No server upload required - optimized for large files with non-blocking processing.
 */

const ClientParser = (function() {
  'use strict';

  // Translate a progress/user-facing message via the i18n module when present.
  function tr(key, vars) {
    if (window.I18N && typeof window.I18N.t === 'function') return window.I18N.t(key, vars);
    return key;
  }

  // Configure PDF.js worker
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  } else {
    // Wait for DOMContentLoaded to check again if script is loaded async
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    });
  }

  // Chapter detection patterns
  const CHAPTER_PATTERNS = [
    /^(?:chapter|capítulo|chapitre|kapitel)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)/i,
    /^(?:part|parte|partie|teil)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)/i,
    /^(?:book|libro|livre|buch)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)/i,
    /^(?:section|sección|section|abschnitt)\s+(?:\d+|[ivxlcdm]+)/i,
    /^(?:act|acto|acte|akt)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)/i,
    /^(?:\d+\.)\s+[A-Z]/,
    /^[IVXLCDM]+\.\s+/i,
  ];

  const MIN_CHUNK_WORDS = 500;
  const TARGET_CHUNK_WORDS = 2000;
  const MAX_CHUNK_WORDS = 5000;
  // Detected chapters are navigation targets, so only fold away truly tiny
  // sections (e.g. a "PART ONE" divider page) — keep real chapters separate.
  const MIN_CHAPTER_WORDS = 40;

  // OCR settings for image-based (scanned) PDFs
  const OCR_LANG = 'eng';           // Tesseract language(s), e.g. 'eng' or 'eng+spa'
  const OCR_MIN_CHARS = 100;        // A page with fewer real chars than this is a candidate for OCR
  const OCR_RENDER_SCALE = 2.0;     // Higher scale = better OCR accuracy, slower/more memory
  const OCR_MAX_DIMENSION = 4000;   // Cap rendered canvas size (px) to avoid memory blowups

  /**
   * Helper to yield to main thread to keep UI responsive
   */
  const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

  /**
   * Parse a file locally in the browser
   * @param {File} file - The file to parse
   * @param {Function} onProgress - Progress callback (percent, message)
   * @returns {Promise<{chunks: Array, totalWords: number}>}
   */
  async function parseFile(file, onProgress = () => {}, options = {}) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    let text = '';
    // EPUB already carries an explicit chapter structure (its spine), so it
    // produces chapters directly rather than a flat text blob.
    let chapters = null;

    onProgress(5, tr('pg_reading_file'));
    await yieldToMain();

    switch (ext) {
      case '.pdf':
        text = await parsePDF(file, onProgress, options);
        break;
      case '.docx':
        text = await parseDOCX(file, onProgress);
        break;
      case '.txt':
        text = await parseTXT(file, onProgress);
        break;
      case '.epub':
        chapters = await parseEPUB(file, onProgress);
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    onProgress(80, tr('pg_processing_text'));
    await yieldToMain();

    // Process into chunks to avoid freezing (EPUB uses its own chapters).
    const chunks = chapters
      ? chaptersToChunks(chapters)
      : await splitIntoChunksAsync(text);

    onProgress(95, tr('pg_finalizing'));
    await yieldToMain();
    
    let totalWords = 0;
    const processedChunks = chunks.map((chunk, index) => {
      const startIndex = totalWords;
      totalWords += chunk.words.length;
      return {
        ...chunk,
        index,
        startIndex,
        wordCount: chunk.words.length
      };
    });

    onProgress(100, tr('pg_complete'));

    return {
      chunks: processedChunks,
      totalWords
    };
  }

  /**
   * Parse PDF using PDF.js, falling back to OCR (Tesseract.js) for pages that
   * contain little or no extractable text (i.e. scanned / image-based pages).
   * Mixed documents are handled per-page.
   */
  async function parsePDF(file, onProgress, options = {}) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library not loaded');
    }

    const ocrLang = options.ocrLang || OCR_LANG;

    onProgress(10, tr('pg_loading_pdf'));

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const pageLines = []; // Per-page arrays of line strings (top -> bottom)
    let ocrWorker = null;
    let ocrError = null; // First OCR failure; further OCR attempts are skipped

    // Process pages in batches to allow UI updates
    const BATCH_SIZE = 5;

    try {
      for (let i = 1; i <= numPages; i++) {
        const percent = 10 + Math.round((i / numPages) * 60);

        if (i % BATCH_SIZE === 0) {
          onProgress(percent, tr('pg_extracting_page', { i, n: numPages }));
          await yieldToMain();
        }

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let lines = reconstructLines(textContent);

        // A page with almost no text layer that DOES contain an image is likely
        // a scan. Pages that are just sparse text (title pages, "Part One") are
        // left alone. After a hard OCR failure we stop trying (otherwise a CDN
        // outage would stall for the full load timeout on every scanned page).
        if (countRealChars(lines.join(' ')) < OCR_MIN_CHARS && !ocrError && await pageHasImage(page)) {
          try {
            if (!ocrWorker) {
              // First OCR page downloads the engine + language data (a few MB)
              onProgress(percent, tr('pg_ocr_engine'));
              await yieldToMain();
              ocrWorker = await createOCRWorker(ocrLang);
            }

            onProgress(percent, tr('pg_ocr_page', { i, n: numPages }));
            await yieldToMain();

            const ocrText = await ocrPage(page, ocrWorker);
            // Keep whichever result actually has content
            if (countRealChars(ocrText) > countRealChars(lines.join(' '))) {
              lines = ocrText.split(/\n+/).map(s => s.trim()).filter(Boolean);
            }
          } catch (err) {
            // Don't fail the whole document over one page — keep the (possibly
            // empty) text layer and continue without OCR.
            console.warn(`OCR failed on page ${i}:`, err);
            ocrError = err;
          }
        }

        pageLines.push(lines);
      }
    } finally {
      if (ocrWorker) {
        await ocrWorker.terminate();
      }
    }

    // Remove running headers/footers and page numbers before assembling text.
    const fullText = stripRunningHeadersFooters(pageLines);

    // If OCR failed AND the document is essentially unreadable without it,
    // surface the real cause instead of a generic "no words found".
    if (ocrError && countRealChars(fullText) < OCR_MIN_CHARS) {
      throw new Error(`This PDF appears to be scanned (image-based) and OCR failed: ${ocrError.message}`);
    }

    return fullText;
  }

  /**
   * Reconstruct visual lines from a PDF page's text content by grouping text
   * items on the same baseline (y position), ordered top-to-bottom.
   * @returns {string[]} line strings
   */
  function reconstructLines(textContent) {
    const rows = new Map();
    const TOL = 3; // points of vertical tolerance when grouping into a line

    for (const item of textContent.items) {
      if (!item.str) continue;
      const y = item.transform ? item.transform[5] : 0;
      const x = item.transform ? item.transform[4] : 0;
      const key = Math.round(y / TOL);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x, str: item.str });
    }

    // Higher y = higher on the page, so sort keys descending for top -> bottom
    const keys = Array.from(rows.keys()).sort((a, b) => b - a);
    const lines = [];
    for (const k of keys) {
      const text = rows.get(k)
        .sort((a, b) => a.x - b.x)
        .map(p => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length) lines.push(text);
    }
    return lines;
  }

  /**
   * Detect and remove running headers/footers and page-number lines.
   * A line is dropped if it is the top or bottom line of its page AND either
   * looks like a bare page number, or (in a multi-page document) its normalized
   * form recurs on a large fraction of pages.
   */
  function stripRunningHeadersFooters(pageLines) {
    const numPages = pageLines.length;

    // Normalize so "Page 12" and "Page 13" collapse to the same running element.
    const norm = (s) => s.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\d+/g, '#')
      .replace(/^[^\w#]+|[^\w#]+$/g, '');

    const pageNumRe = /^(\d{1,4}|[ivxlcdm]{1,7})$/i;
    const looksLikePageNumber = (s) => pageNumRe.test(s.replace(/\s+/g, '').trim());

    const topCounts = new Map();
    const botCounts = new Map();
    for (const lines of pageLines) {
      if (lines.length === 0) continue;
      const top = norm(lines[0]);
      const bot = norm(lines[lines.length - 1]);
      if (top) topCounts.set(top, (topCounts.get(top) || 0) + 1);
      if (bot) botCounts.set(bot, (botCounts.get(bot) || 0) + 1);
    }

    const repeatThreshold = Math.max(3, Math.ceil(numPages * 0.4));

    const isRunning = (raw, counts) => {
      if (looksLikePageNumber(raw)) return true;
      const n = norm(raw);
      if (!n) return true;
      return numPages >= 3 && (counts.get(n) || 0) >= repeatThreshold && n.length <= 60;
    };

    const out = [];
    for (const lines of pageLines) {
      if (lines.length === 0) continue;
      let start = 0;
      let end = lines.length;
      // Never strip a page's only line.
      if (end - start > 1 && isRunning(lines[start], topCounts)) start++;
      if (end - start > 1 && isRunning(lines[end - 1], botCounts)) end--;
      const kept = lines.slice(start, end);
      if (kept.length) out.push(kept.join('\n'));
    }
    return out.join('\n');
  }

  /**
   * Check whether a page contains any raster image (scanned pages do).
   */
  async function pageHasImage(page) {
    try {
      const ops = await page.getOperatorList();
      const OPS = pdfjsLib.OPS;
      return ops.fnArray.some(fn =>
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageMaskXObject
      );
    } catch (err) {
      // If the page can't be inspected, assume it might be a scan and try OCR
      return true;
    }
  }

  /**
   * Count non-whitespace characters in a string.
   */
  function countRealChars(text) {
    return (text || '').replace(/\s/g, '').length;
  }

  /**
   * Create (and wait for) a Tesseract.js OCR worker for the given language(s).
   * @param {string} lang - Tesseract language code(s), e.g. 'eng' or 'eng+spa'
   */
  async function createOCRWorker(lang = OCR_LANG) {
    await waitForTesseract();
    // Tesseract v5: createWorker(lang) loads and initializes the language.
    return Tesseract.createWorker(lang || OCR_LANG);
  }

  /**
   * Render a PDF page to a canvas and run OCR on it.
   */
  async function ocrPage(page, worker) {
    // Cap the render size so oversized pages don't allocate a huge canvas
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(OCR_RENDER_SCALE, OCR_MAX_DIMENSION / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport }).promise;

    try {
      const { data } = await worker.recognize(canvas);
      const text = data && data.text ? data.text : '';
      // Re-join words hyphenated across line breaks ("exam-\nple" -> "example")
      return text.replace(/([A-Za-zÀ-ÿ])-\n([a-zà-ÿ])/g, '$1$2');
    } finally {
      // Free canvas memory between pages
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  /**
   * Wait for the Tesseract.js library to be available (it loads async/deferred).
   */
  function waitForTesseract(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (typeof Tesseract !== 'undefined') {
        resolve();
        return;
      }
      const start = Date.now();
      const interval = setInterval(() => {
        if (typeof Tesseract !== 'undefined') {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error('OCR library (Tesseract.js) failed to load. This PDF appears to be image-based (scanned) and requires OCR.'));
        }
      }, 100);
    });
  }

  /**
   * Parse DOCX using mammoth.js
   */
  async function parseDOCX(file, onProgress) {
    if (typeof mammoth === 'undefined') {
      throw new Error('Mammoth.js library not loaded');
    }

    onProgress(20, tr('pg_extract_docx'));
    await yieldToMain();

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });

    onProgress(70, tr('pg_processing_text'));
    return result.value;
  }

  /**
   * Parse TXT file
   */
  async function parseTXT(file, onProgress) {
    onProgress(20, tr('pg_reading_txt'));
    await yieldToMain();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        onProgress(70, tr('pg_processing_text'));
        resolve(e.target.result);
      };
      reader.onerror = () => reject(new Error('Failed to read text file'));
      reader.readAsText(file);
    });
  }

  /**
   * Parse an EPUB (a zip of XHTML documents) entirely in the browser.
   * Reads the spine order from the OPF package and treats each spine document
   * as a chapter. Returns an array of { title, content } chapters.
   */
  async function parseEPUB(file, onProgress) {
    await waitForJSZip();

    onProgress(10, tr('pg_opening_epub'));
    await yieldToMain();

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');

    // 1. Locate the OPF package file via META-INF/container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) throw new Error('Invalid EPUB: missing container.xml');
    const rootfile = xml(await containerFile.async('string')).querySelector('rootfile');
    const opfPath = rootfile && rootfile.getAttribute('full-path');
    if (!opfPath) throw new Error('Invalid EPUB: no package file found');

    const opfEntry = zip.file(opfPath);
    if (!opfEntry) throw new Error('Invalid EPUB: package file is missing');
    const opf = xml(await opfEntry.async('string'));

    // Paths inside the OPF are relative to the OPF's own directory
    const baseDir = opfPath.includes('/') ? opfPath.replace(/[^/]+$/, '') : '';

    // 2. Build the manifest (id -> href) and read the spine (reading order)
    const manifest = {};
    opf.querySelectorAll('manifest > item').forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) manifest[id] = href;
    });

    const spineHrefs = Array.from(opf.querySelectorAll('spine > itemref'))
      .map((ref) => manifest[ref.getAttribute('idref')])
      .filter(Boolean);

    if (spineHrefs.length === 0) throw new Error('EPUB has no readable content');

    // 3. Read each spine document, strip markup, keep as a chapter
    const chapters = [];
    for (let i = 0; i < spineHrefs.length; i++) {
      if (i % 5 === 0) {
        onProgress(10 + Math.round((i / spineHrefs.length) * 60),
          tr('pg_reading_section', { i: i + 1, n: spineHrefs.length }));
        await yieldToMain();
      }

      const href = decodeURIComponent(spineHrefs[i].split('#')[0]);
      const entry = zip.file(baseDir + href) || zip.file(href);
      if (!entry) continue;

      const { title, text } = extractEpubDoc(await entry.async('string'));
      if (text.trim().length === 0) continue;

      chapters.push({ title: title || `Section ${chapters.length + 1}`, content: text });
    }

    if (chapters.length === 0) throw new Error('No readable text found in EPUB');
    return chapters;
  }

  /**
   * Extract a title + plain text from one EPUB (X)HTML document.
   */
  function extractEpubDoc(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style').forEach((el) => el.remove());

    const headingEl = doc.querySelector('h1, h2, h3, title');
    const title = headingEl
      ? headingEl.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)
      : '';

    const body = doc.body || doc.documentElement;
    // Preserve block boundaries so words from adjacent blocks don't fuse
    body.querySelectorAll('p, div, br, li, tr, h1, h2, h3, h4, h5, h6')
      .forEach((el) => el.insertAdjacentText('afterend', '\n'));

    return { title, text: (body.textContent || '').replace(/\r/g, '') };
  }

  /**
   * Convert pre-detected chapters (from EPUB) into sized reading chunks,
   * reusing the same sizing logic used for detected text chapters.
   */
  function chaptersToChunks(chapters) {
    if (chapters.length > 1) return processChapters(chapters);
    return splitBySize(chapters[0] ? chapters[0].content : '');
  }

  /**
   * Wait for the JSZip library to be available (loaded async/deferred).
   */
  function waitForJSZip(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (typeof JSZip !== 'undefined') {
        resolve();
        return;
      }
      const start = Date.now();
      const interval = setInterval(() => {
        if (typeof JSZip !== 'undefined') {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error('EPUB library (JSZip) failed to load. Check your connection and try again.'));
        }
      }, 100);
    });
  }

  /**
   * Split text into chapters or meaningful chunks asynchronously
   */
  async function splitIntoChunksAsync(text) {
    // Detect chapters first
    const chapters = detectChapters(text);
    
    if (chapters.length > 1) {
      return processChapters(chapters);
    }
    
    return splitBySize(text);
  }

  /**
   * Detect chapter boundaries in text
   */
  function detectChapters(text) {
    const lines = text.split(/\r?\n/);
    const chapters = [];
    let currentChapter = null;
    let currentContent = [];

    // Simple heuristic: if text is huge, don't check every single line against complex regex
    // unless necessary. But here we assume we want accuracy.
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (isChapterHeading(line)) {
        if (currentChapter !== null) {
          chapters.push({
            title: currentChapter,
            content: currentContent.join('\n')
          });
        }
        
        currentChapter = line;
        currentContent = [];
      } else if (line.length > 0) {
        currentContent.push(line);
      }
    }

    if (currentChapter !== null && currentContent.length > 0) {
      chapters.push({
        title: currentChapter,
        content: currentContent.join('\n')
      });
    }

    if (chapters.length === 0 && text.trim().length > 0) {
      chapters.push({
        title: 'Document',
        content: text
      });
    }

    return chapters;
  }

  function isChapterHeading(line) {
    if (!line || line.length < 3 || line.length > 100) return false;

    // Check specific patterns
    for (const pattern of CHAPTER_PATTERNS) {
      if (pattern.test(line)) return true;
    }

    // Check for ALL CAPS heading
    if (line === line.toUpperCase() && line.length > 3 && line.length < 50 && /^[A-Z\s\d]+$/.test(line)) {
      return true;
    }

    return false;
  }

  function processChapters(chapters) {
    const result = [];

    for (const chapter of chapters) {
      const words = cleanAndSplitText(chapter.content);
      
      if (words.length === 0) continue;

      if (words.length > MAX_CHUNK_WORDS) {
        const subChunks = splitWordsIntoChunks(words, chapter.title);
        result.push(...subChunks);
      } else if (words.length < MIN_CHAPTER_WORDS && result.length > 0) {
        // Fold a tiny section (divider/heading page) into the previous chapter
        const lastChunk = result[result.length - 1];
        lastChunk.words = lastChunk.words.concat(words);
        lastChunk.title = `${lastChunk.title} & ${chapter.title}`;
      } else {
        result.push({
          title: chapter.title,
          words
        });
      }
    }

    return result;
  }

  function splitBySize(text) {
    const allWords = cleanAndSplitText(text);
    
    if (allWords.length === 0) return [];

    if (allWords.length <= TARGET_CHUNK_WORDS) {
      return [{
        title: 'Section 1',
        words: allWords
      }];
    }

    return splitWordsIntoChunks(allWords, 'Section');
  }

  function splitWordsIntoChunks(words, baseTitle) {
    const chunks = [];
    let currentChunk = [];
    let chunkNum = 1;

    for (let i = 0; i < words.length; i++) {
      currentChunk.push(words[i]);

      const atTargetSize = currentChunk.length >= TARGET_CHUNK_WORDS;
      const atSentenceEnd = isSentenceEnd(words[i]);

      if (atTargetSize && (atSentenceEnd || currentChunk.length >= MAX_CHUNK_WORDS)) {
        chunks.push({
          title: `${baseTitle} (Part ${chunkNum})`,
          words: [...currentChunk]
        });
        currentChunk = [];
        chunkNum++;
      }
    }

    if (currentChunk.length > 0) {
      if (currentChunk.length < MIN_CHUNK_WORDS && chunks.length > 0) {
        chunks[chunks.length - 1].words = chunks[chunks.length - 1].words.concat(currentChunk);
      } else {
        chunks.push({
          title: `${baseTitle} (Part ${chunkNum})`,
          words: currentChunk
        });
      }
    }

    return chunks;
  }

  function isSentenceEnd(word) {
    return /[.!?]["']?$/.test(word);
  }

  /**
   * Clean text and split into words with better boundary detection
   */
  function cleanAndSplitText(text) {
    const cleaned = text
      .replace(/\r\n/g, '\n')
      .replace(/[\u2014\u2013]/g, ' ') // Em-dash, en-dash to space
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Split by spaces but filter out empty strings
    return cleaned.split(' ').filter(word => word.length > 0);
  }

  return {
    parseFile
  };
})();
