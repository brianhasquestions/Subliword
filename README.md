# Subliword

A speed-reading web app using RSVP (Rapid Serial Visual Presentation). Upload a book or document and read it one word at a time at your own pace.

**Live site:** [subliword.com](https://subliword.com)

## Features

- **RSVP reading** — words flash at a fixed focal point with adjustable WPM
- **PDF, DOCX, and TXT support** — parsed entirely in your browser
- **Scanned PDF support** — image-based pages are read with OCR (Tesseract.js), automatically and per-page
- **Chapter detection** — documents are split into chapters/sections for easy navigation
- **100% client-side** — no server, no uploads; your documents never leave your device

## Tech

Plain HTML/CSS/vanilla JS, no build step. External libraries (loaded from CDN):

- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF text extraction and page rendering
- [Mammoth.js](https://github.com/mwilliamson/mammoth.js) — DOCX text extraction
- [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR for scanned/image-based PDF pages

## Development

No tooling required — serve the `public/` directory with any static file server:

```sh
cd public
python -m http.server 8000
# or: npx serve
```

## Deployment

Deployed to GitHub Pages via GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Every push to `main` publishes the `public/` directory.
