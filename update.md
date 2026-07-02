# Update Plan: Static Web Application Conversion

## Objective
Rewrite the Subliword application to run solely on HTML, CSS, and Vanilla JavaScript, removing the dependency on the Node.js backend and Socket.io.

## Checkpoints

### 1. Preparation
- [ ] Verify `public/js/clientParser.js` exists and handles PDF/DOCX parsing.
- [ ] Verify `public/js/rsvp.js` contains the standalone `RSVPReader` class.

### 2. Frontend Modification
- [ ] **`public/index.html`**:
    - Remove `<script src="/socket.io/socket.io.js"></script>`.
    - Ensure PDF.js and Mammoth.js CDNs are present.
- [ ] **`public/js/main.js`**:
    - Remove Socket.io initialization and event listeners.
    - Remove server-side upload functions (`uploadFileProgressive`, `syncWithServer`).
    - Implement `handleFile` to use `ClientParser.parse()` directly.
    - Instantiate `RSVPReader` directly in `startReadingSession`.
    - Connect UI controls (Play, Pause, WPM, Progress) directly to the `RSVPReader` instance.

### 3. Cleanup
- [ ] Remove unused server files (optional, or move to a separate folder) if keeping the repo clean.
- [ ] Update `package.json` if we want to remove backend dependencies (optional).

### 4. Verification
- [ ] Open `public/index.html` in a browser.
- [ ] Test file upload (PDF, DOCX, TXT).
- [ ] Test RSVP reading functionality (WPM, Progress, Controls).
