/**
 * Client-side Parser - Extract text from PDF/DOCX/TXT files directly in the browser
 * No server upload required - optimized for large files with non-blocking processing.
 */

const ClientParser = (function() {
  'use strict';

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
  async function parseFile(file, onProgress = () => {}) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    let text = '';

    onProgress(5, 'Reading file...');
    await yieldToMain();

    switch (ext) {
      case '.pdf':
        text = await parsePDF(file, onProgress);
        break;
      case '.docx':
        text = await parseDOCX(file, onProgress);
        break;
      case '.txt':
        text = await parseTXT(file, onProgress);
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    onProgress(80, 'Processing text...');
    await yieldToMain();

    // Process text in chunks to avoid freezing
    const chunks = await splitIntoChunksAsync(text);
    
    onProgress(95, 'Finalizing...');
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

    onProgress(100, 'Complete!');

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
  async function parsePDF(file, onProgress) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library not loaded');
    }

    onProgress(10, 'Loading PDF...');

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    let fullText = '';
    let ocrWorker = null;
    let ocrError = null; // First OCR failure; further OCR attempts are skipped

    // Process pages in batches to allow UI updates
    const BATCH_SIZE = 5;

    try {
      for (let i = 1; i <= numPages; i++) {
        const percent = 10 + Math.round((i / numPages) * 60);

        if (i % BATCH_SIZE === 0) {
          onProgress(percent, `Extracting page ${i} of ${numPages}...`);
          await yieldToMain();
        }

        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let pageText = textContent.items.map(item => item.str).join(' ');

        // A page with almost no text layer that DOES contain an image is likely
        // a scan. Pages that are just sparse text (title pages, "Part One") are
        // left alone. After a hard OCR failure we stop trying (otherwise a CDN
        // outage would stall for the full load timeout on every scanned page).
        if (countRealChars(pageText) < OCR_MIN_CHARS && !ocrError && await pageHasImage(page)) {
          try {
            if (!ocrWorker) {
              // First OCR page downloads the engine + language data (a few MB)
              onProgress(percent, 'Loading OCR engine for scanned pages...');
              await yieldToMain();
              ocrWorker = await createOCRWorker();
            }

            onProgress(percent, `Reading scanned page ${i} of ${numPages} (OCR)...`);
            await yieldToMain();

            const ocrText = await ocrPage(page, ocrWorker);
            // Keep whichever result actually has content
            if (countRealChars(ocrText) > countRealChars(pageText)) {
              pageText = ocrText;
            }
          } catch (err) {
            // Don't fail the whole document over one page — keep the (possibly
            // empty) text layer and continue without OCR.
            console.warn(`OCR failed on page ${i}:`, err);
            ocrError = err;
          }
        }

        fullText += pageText + '\n';
      }
    } finally {
      if (ocrWorker) {
        await ocrWorker.terminate();
      }
    }

    // If OCR failed AND the document is essentially unreadable without it,
    // surface the real cause instead of a generic "no words found".
    if (ocrError && countRealChars(fullText) < OCR_MIN_CHARS) {
      throw new Error(`This PDF appears to be scanned (image-based) and OCR failed: ${ocrError.message}`);
    }

    return fullText;
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
   * Create (and wait for) a Tesseract.js OCR worker.
   */
  async function createOCRWorker() {
    await waitForTesseract();
    // Tesseract v5: createWorker(lang) loads and initializes the language.
    return Tesseract.createWorker(OCR_LANG);
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

    onProgress(20, 'Extracting DOCX content...');
    await yieldToMain();
    
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    
    onProgress(70, 'Processing text...');
    return result.value;
  }

  /**
   * Parse TXT file
   */
  async function parseTXT(file, onProgress) {
    onProgress(20, 'Reading text file...');
    await yieldToMain();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        onProgress(70, 'Processing text...');
        resolve(e.target.result);
      };
      reader.onerror = () => reject(new Error('Failed to read text file'));
      reader.readAsText(file);
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
      } else if (words.length < MIN_CHUNK_WORDS && result.length > 0) {
        // Merge small chunks with previous
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

  function checkLibraries() {
    const missing = [];
    if (typeof pdfjsLib === 'undefined') missing.push('PDF.js');
    if (typeof mammoth === 'undefined') missing.push('Mammoth.js');
    return missing;
  }

  return {
    parseFile,
    checkLibraries
  };
})();
