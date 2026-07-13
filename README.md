# Subliword

A speed-reading web app using RSVP (Rapid Serial Visual Presentation). Upload a book or document and read it one word at a time at your own pace.

**Live site:** [subliword.com](https://subliword.com)

## Features

- **RSVP reading** — words flash at a fixed focal point with adjustable WPM (50–1500)
- **Warm-up ramp** — each play session eases from a lower speed up to your target so your eyes lock on
- **Word-length & punctuation pacing** — longer words and sentence ends get a touch more time
- **PDF, DOCX, EPUB, and TXT support** — parsed entirely in your browser
- **Scanned PDF support** — image-based pages are read with OCR (Tesseract.js), automatically and per-page, with **selectable OCR language** (English, Spanish, French, German, Arabic, Chinese, Japanese, and more)
- **Header/footer cleanup** — running headers and page numbers are detected and stripped from PDFs so they don't interrupt the reading stream
- **Interface in 14 languages** — English, Spanish, French, German, Italian, Portuguese, Dutch, Russian, Arabic, Hebrew, Chinese (Simplified & Traditional), Japanese, and Korean, matching the OCR language list; auto-detects your browser language
- **Right-to-left interface & text** — Arabic and Hebrew flip the whole layout (RTL), and RTL document text renders correctly at the focal point
- **Chapter navigation** — detected chapters (and EPUB spine sections) are listed for one-click jumping
- **Resume where you left off** — reading position, WPM, chunk size, warm-up, and theme are remembered per device
- **Reading stats** — words read, top speed, and estimated time saved versus an average reader
- **Dark & light themes** — follows your system preference, with a manual toggle
- **Installable PWA / offline** — a service worker caches the app (and libraries after first use) so it works offline
- **100% client-side** — no server, no uploads; your documents never leave your device

## Tech

Plain HTML/CSS/vanilla JS, no build step. External libraries (loaded from CDN, pinned with Subresource Integrity):

- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF text extraction and page rendering
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) — DOCX text extraction
- [JSZip](https://stuk.github.io/jszip/) — unzips EPUB e-books in the browser
- [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR for scanned/image-based PDF pages

> **Offline note:** the first OCR of a scanned PDF needs a connection (Tesseract downloads its engine and language data on demand); once fetched, they're cached for offline reuse.

## Development

No tooling required — serve the `public/` directory with any static file server:

```sh
cd public
python -m http.server 8000
# or: npx serve
```

## Deployment

Deployed to GitHub Pages via GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Every push to `main` publishes the `public/` directory.
