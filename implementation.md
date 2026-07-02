# Spreader Implementation Plan

## 1. Project Overview
**Spreader** is a lightweight, high-performance web application designed for speed reading using Rapid Serial Visual Presentation (RSVP). It supports concurrent users, real-time control, and seamless deployment via Docker.

## 2. Technical Architecture

### Backend
*   **Runtime**: Node.js (v20+ recommended) for non-blocking I/O and scalability.
*   **Framework**: Express.js for handling HTTP requests and static files.
*   **Real-Time Communication**: Socket.io for managing reading state (WPM updates, pause/resume, navigation) efficiently between client and server.
*   **File Processing**:
    *   `pdf-parse`: For extracting text from PDF files.
    *   `mammoth`: For extracting text from DOCX files.
    *   Native filesystem (fs): For TXT files and temporary storage.
*   **Session Management**: 
    *   `express-session` for managing user identity.
    *   In-memory storage (or Redis for multi-instance scaling) to track reading progress and settings.

### Frontend
*   **Core**: Semantic HTML5, CSS3, and Vanilla JavaScript (ES6+). No heavy frameworks (React/Vue/Angular) to minimize bundle size.
*   **Styling**: Custom CSS for the "Charcoal" theme and minimal UI. CSS transitions for animations.
*   **Logic**: Client-side logic handles the RSVP rendering loop to ensure visual smoothness, utilizing `requestAnimationFrame`.

### Deployment
*   **Containerization**: Docker (Alpine Linux base) for a small footprint.
*   **Port**: Exposed on port 3000 by default.

## 3. Directory Structure

```text
spreader/
├── Dockerfile
├── package.json
├── .dockerignore
├── src/
│   ├── server.js           # Main entry point, Express & Socket.io setup
│   ├── parsers.js          # Logic to extract text from PDF/DOCX/TXT
│   └── sessionStore.js     # Manages user session state (WPM, position)
├── public/
│   ├── index.html          # Single page application structure
│   ├── css/
│   │   └── style.css       # Styles, animations, and responsive design
│   └── js/
│       ├── main.js         # UI interactions and WebSocket client
│       └── rsvp.js         # Core speed reading logic (center alignment, coloring)
└── uploads/                # Temporary directory for uploaded files
```

## 4. Implementation Steps

### Step 1: Project Setup & Dependencies
1.  Initialize Node.js project (`npm init`).
2.  Install dependencies: `express`, `socket.io`, `multer` (file upload), `pdf-parse`, `mammoth`, `uuid` (session IDs).
3.  Setup `.gitignore` and `.dockerignore` to exclude `node_modules` and `uploads`.

### Step 2: Backend Development
1.  **Server Initialization**: Create an Express server with an HTTP server instance wrapped by Socket.io.
2.  **Static Files**: Serve the `public` directory.
3.  **File Upload Endpoint**:
    *   Create `POST /upload` using `multer`.
    *   Validate file types (PDF, DOCX, TXT).
    *   Save to temporary `uploads/` directory.
4.  **Text Parsing**:
    *   Implement `parsers.js` to read the uploaded file.
    *   Extract clean text (remove excessive whitespace).
    *   Split text into an array of words.
    *   Delete the temporary file after extraction to save space.
5.  **Session Logic**:
    *   Store the extracted word array, current index, and WPM in the session object (memory or database).
    *   Generate a unique Session ID for the client.

### Step 3: Frontend - Landing & Upload
1.  **Landing Page**:
    *   Create the "SpReaDer" logo with the red accent on the middle letter.
    *   Apply fade-in animation using CSS `@keyframes`.
2.  **Upload Interface**:
    *   Create a drag-and-drop zone and a standard `<input type="file">`.
    *   On file selection, use `fetch` to POST the file to the backend.
    *   Show a loading spinner during parsing.

### Step 4: Frontend - Reading Interface (RSVP)
1.  **Word Rendering**:
    *   Implement the algorithm to find the "Optimal Recognition Point" (ORP) of a word (usually center or slightly left).
    *   HTML structure: `<span>LeftPart</span><span class="red">CenterChar</span><span>RightPart</span>`.
    *   CSS: Use Flexbox/Grid to center the word perfectly.
2.  **Timing Loop**:
    *   Calculate delay based on WPM: `Delay (ms) = 60000 / WPM`.
    *   Use `setTimeout` or `requestAnimationFrame` for the render loop.
3.  **Sidebar Controls**:
    *   Create a semi-transparent overlay.
    *   WPM Slider: Updates a local variable immediately; emits event to server to save preference.
    *   Navigation: Buttons for Pause/Play, Prev/Next Sentence.
    *   Progress Bar: Range input linked to the word index.

### Step 5: WebSocket Integration
1.  **Connection**: Establish Socket.io connection on page load.
2.  **Sync**:
    *   Send `update_progress` events from client to server periodically or on pause.
    *   On reconnect, request `get_session_state` to resume from the last saved position.
    *   Real-time WPM adjustments sync across devices if the same session is joined (optional but scalable).

### Step 6: Gamification (Achievements)
1.  **Tracking**: Monitor metrics (max WPM reached, total words read).
2.  **Notification UI**: Create a bubble container fixed at the bottom center.
3.  **Triggers**:
    *   "Speed Demon": If WPM > 500.
    *   "Bookworm": If completion > 90%.
4.  **Animation**: CSS slide-up and fade-out.

### Step 7: Dockerization
1.  **Dockerfile**:
    *   Base Image: `node:20-alpine`.
    *   Workdir: `/app`.
    *   Copy `package.json` -> `npm install --production`.
    *   Copy source code.
    *   Expose port 3000.
    *   CMD: `["node", "src/server.js"]`.
2.  **Build Command**: `docker build -t spreader .`
3.  **Run Command**: `docker run -p 3000:3000 spreader`

## 5. Security & Performance Considerations
*   **Sanitization**: Ensure uploaded filenames are sanitized.
*   **Cleanup**: Use a scheduled task (e.g., `node-cron` or `setInterval`) to clean up the `uploads/` folder and expire old sessions to prevent memory leaks.
*   **Payload Limit**: Restrict file size (e.g., max 10MB) in `multer` configuration.
*   **Minification**: For production, minify CSS and JS files.

## 6. Execution Guide

### Local Development
1.  Ensure Docker is installed.
2.  Run `docker build -t spreader .`
3.  Run `docker run -p 3000:3000 spreader`
4.  Access `http://localhost:3000`.

### Production with HTTPS (Let's Encrypt)
The project includes nginx reverse proxy with automatic SSL certificate management.

**Prerequisites:**
- A domain name pointing to your server
- Docker and Docker Compose installed
- Ports 80 and 443 open

**Initial Setup:**
```bash
# 1. Make the init script executable
chmod +x init-letsencrypt.sh

# 2. Run the initialization script with your domain and email
./init-letsencrypt.sh yourdomain.com your@email.com

# 3. Start the full stack
export DOMAIN=yourdomain.com
docker compose up -d
```

**What happens:**
1. Creates a temporary self-signed certificate so nginx can start
2. Obtains a real certificate from Let's Encrypt via HTTP-01 challenge
3. Nginx handles HTTPS termination and proxies to the Node.js app
4. Certbot automatically renews certificates every 12 hours (if needed)

**Files:**
- `docker-compose.yml` - Orchestrates app, nginx, and certbot containers
- `nginx/nginx.conf` - Nginx configuration with SSL and WebSocket support
- `init-letsencrypt.sh` - Initial certificate setup script

**Renewal:**
Certificates auto-renew. Nginx reloads every 6 hours to pick up new certs.
