/**
 * Main.js - UI interactions and file upload handling
 * Handles client-side file parsing and RSVP reader interaction.
 */

(function() {
  'use strict';

  // ===== Constants =====
  const ACHIEVEMENT_TIMEOUT = 4000;
  const SPEED_DEMON_WPM = 500;
  const BOOKWORM_PERCENT = 90;
  const MARATHON_WORDS = 1000;
  const BASELINE_WPM = 250;        // Average reading speed, used for "time saved"
  const POSITION_SAVE_MS = 1500;   // Throttle for persisting reading position

  const STORE_KEYS = {
    prefs: 'subliword.prefs',
    theme: 'subliword.theme',
    positions: 'subliword.positions'
  };

  // ===== Persistence helpers (localStorage, best-effort) =====
  const store = {
    load(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    save(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* private mode / quota — ignore */ }
    }
  };

  const prefs = Object.assign(
    { wpm: 300, chunkSize: 1, warmup: true, ocrLang: 'eng' },
    store.load(STORE_KEYS.prefs, {})
  );
  function savePrefs() { store.save(STORE_KEYS.prefs, prefs); }

  // Translation shortcut (i18n.js loads before this script).
  const t = (key, vars) => (window.I18N ? window.I18N.t(key, vars) : key);

  // Characters from right-to-left scripts (Hebrew, Arabic, Syriac, Thaana, …).
  const RTL_CHARS = /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;

  // ===== DOM Elements =====
  const UI = {
    pages: {
      landing: document.getElementById('landing-page'),
      reading: document.getElementById('reading-page')
    },
    upload: {
      dropZone: document.getElementById('drop-zone'),
      fileInput: document.getElementById('file-input'),
      browseBtn: document.getElementById('browse-btn'),
      spinner: document.getElementById('loading-spinner'),
      error: document.getElementById('error-message')
    },
    reading: {
      wordWrapper: document.querySelector('.word-wrapper'),
      wordLeft: document.getElementById('word-left'),
      wordCenter: document.getElementById('word-center'),
      wordRight: document.getElementById('word-right'),
      progress: {
        bar: document.getElementById('progress-bar'),
        current: document.getElementById('current-word-num'),
        total: document.getElementById('total-words')
      }
    },
    controls: {
      playPause: document.getElementById('play-pause'),
      playIcon: document.getElementById('play-icon'),
      pauseIcon: document.getElementById('pause-icon'),
      prevSentence: document.getElementById('prev-sentence'),
      nextSentence: document.getElementById('next-sentence'),
      newDoc: document.getElementById('new-document'),
      wpmSlider: document.getElementById('wpm-slider'),
      wpmDisplay: document.getElementById('wpm-display'),
      chunkSlider: document.getElementById('chunk-slider'),
      chunkDisplay: document.getElementById('chunk-display'),
      warmupToggle: document.getElementById('warmup-toggle'),
      chapterGroup: document.getElementById('chapter-group'),
      chapterSelect: document.getElementById('chapter-select'),
      ocrLang: document.getElementById('ocr-lang'),
      langSelect: document.getElementById('lang-select')
    },
    stats: {
      words: document.getElementById('stat-words'),
      wpm: document.getElementById('stat-wpm'),
      saved: document.getElementById('stat-saved')
    },
    theme: {
      toggle: document.getElementById('theme-toggle'),
      sun: document.getElementById('theme-icon-sun'),
      moon: document.getElementById('theme-icon-moon'),
      meta: document.querySelector('meta[name="theme-color"]')
    },
    achievements: document.getElementById('achievement-container')
  };

  // ===== State =====
  let reader = null;
  let progressIndicator = null;
  let currentChapters = [];   // [{ title, startIndex, wordCount }]
  let currentDocId = null;    // Identity of the loaded doc, for position persistence
  let lastPositionSave = 0;
  
  // Achievement tracking
  const achievements = {
    speedDemon: false,
    bookworm: false,
    quickStart: false,
    marathon: false
  };

  // ===== Initialize =====
  function init() {
    reader = new RSVPReader();
    setupLanguage();
    applyStoredPreferences();
    setupEventListeners();
    setupThemeToggle();
    createProgressIndicator();
  }

  // ===== Language / i18n =====
  function setupLanguage() {
    if (!window.I18N) return;
    const { langSelect } = UI.controls;

    // Populate the switcher from the available languages
    if (langSelect) {
      langSelect.innerHTML = '';
      I18N.languages.forEach((code) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = I18N.languageNames[code] || code;
        langSelect.appendChild(opt);
      });
      langSelect.value = I18N.language;
      langSelect.addEventListener('change', (e) => I18N.setLanguage(e.target.value));
    }

    // Translate the static markup now, and refresh dynamic strings on change.
    I18N.apply();
    document.addEventListener('i18n:changed', () => {
      updateStats();
    });
  }

  // Reflect saved preferences (WPM, chunk size, warm-up, OCR language) into the controls.
  function applyStoredPreferences() {
    const { wpmSlider, wpmDisplay, chunkSlider, chunkDisplay, warmupToggle, ocrLang } = UI.controls;

    wpmSlider.value = prefs.wpm;
    wpmDisplay.textContent = prefs.wpm;
    chunkSlider.value = prefs.chunkSize;
    chunkDisplay.textContent = prefs.chunkSize;
    warmupToggle.checked = prefs.warmup;
    reader.setWarmup(prefs.warmup);
    if (ocrLang) ocrLang.value = prefs.ocrLang;
  }

  // ===== External Libraries =====
  // The parsing library each format depends on. Scripts load deferred from a
  // CDN, so the one a file needs may still be in flight when the user uploads.
  const REQUIRED_LIB = {
    '.pdf': 'pdfjsLib',
    '.docx': 'mammoth',
    '.epub': 'JSZip'
  };

  // Wait for the library a format needs (only that one), up to timeoutMs.
  async function waitForLibrary(ext, timeoutMs = 10000) {
    const lib = REQUIRED_LIB[ext];
    if (!lib) return true; // .txt needs no library

    let waited = 0;
    while (typeof window[lib] === 'undefined' && waited < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waited += 100;
    }
    return typeof window[lib] !== 'undefined';
  }

  // ===== Progress Indicator UI =====
  function createProgressIndicator() {
    progressIndicator = document.createElement('div');
    progressIndicator.id = 'chunk-progress-indicator';
    progressIndicator.className = 'chunk-progress-indicator hidden';
    progressIndicator.innerHTML = `
      <div class="chunk-progress-content">
        <div class="chunk-progress-header">
          <div class="chunk-progress-spinner"></div>
          <div class="chunk-progress-text">
            <span class="chunk-progress-title">Processing document...</span>
            <span class="chunk-progress-detail"></span>
          </div>
        </div>
        <div class="chunk-progress-bar-container">
          <div class="chunk-progress-bar"></div>
        </div>
      </div>
    `;
    document.body.appendChild(progressIndicator);
  }

  function showProgressIndicator(title, detail, percent) {
    if (!progressIndicator) return;
    
    progressIndicator.classList.remove('hidden');
    const titleEl = progressIndicator.querySelector('.chunk-progress-title');
    const detailEl = progressIndicator.querySelector('.chunk-progress-detail');
    const barEl = progressIndicator.querySelector('.chunk-progress-bar');
    
    if (titleEl) titleEl.textContent = title || 'Processing...';
    if (detailEl) detailEl.textContent = detail || '';
    if (barEl) barEl.style.width = `${percent || 0}%`;
  }

  function hideProgressIndicator() {
    if (progressIndicator) {
      progressIndicator.classList.add('hidden');
    }
  }

  // ===== Event Listeners =====
  function setupEventListeners() {
    setupDragDrop();
    setupPlaybackControls();
    setupNavigation();
    setupMobileTouch();
    setupKeyboardShortcuts();
    setupReaderCallbacks();
  }

  function setupDragDrop() {
    const { dropZone, fileInput, browseBtn } = UI.upload;

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });

    if (UI.controls.ocrLang) {
      UI.controls.ocrLang.addEventListener('change', (e) => {
        prefs.ocrLang = e.target.value;
        savePrefs();
      });
    }
  }

  function setupPlaybackControls() {
    const { playPause, prevSentence, nextSentence, wpmSlider, chunkSlider,
            warmupToggle, chapterSelect } = UI.controls;
    const { bar } = UI.reading.progress;

    playPause.addEventListener('click', togglePlayPause);
    prevSentence.addEventListener('click', () => reader.prevSentence());
    nextSentence.addEventListener('click', () => reader.nextSentence());
    wpmSlider.addEventListener('input', handleWPMChange);
    chunkSlider.addEventListener('input', handleChunkSizeChange);
    bar.addEventListener('input', handleProgressChange);

    warmupToggle.addEventListener('change', (e) => {
      prefs.warmup = e.target.checked;
      reader.setWarmup(prefs.warmup);
      savePrefs();
    });

    chapterSelect.addEventListener('change', (e) => {
      const index = parseInt(e.target.value, 10);
      if (!Number.isNaN(index)) reader.goTo(index);
    });

    // Persist reading position when the page is hidden or unloaded
    window.addEventListener('pagehide', saveReadingPosition);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveReadingPosition();
    });
  }

  function setupNavigation() {
    UI.controls.newDoc.addEventListener('click', goToLanding);
  }

  function setupMobileTouch() {
    if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;

    const wordDisplay = document.getElementById('word-display');
    const minSwipeDistance = 50;

    // Tap to play/pause on word display
    if (wordDisplay) {
      wordDisplay.addEventListener('click', (e) => {
        if (!e.target.closest('button, input, a')) {
          togglePlayPause();
        }
      });
      
      // Horizontal swipe for navigation
      let touchStartX = 0;
      let touchStartY = 0;

      wordDisplay.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }, { passive: true });

      wordDisplay.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const dx = touchStartX - touchEndX;
        const dy = Math.abs(touchStartY - touchEndY);
        
        if (dy > Math.abs(dx)) return; // Vertical swipe
        
        if (dx > minSwipeDistance) reader.nextSentence();
        else if (dx < -minSwipeDistance) reader.prevSentence();
      }, { passive: true });
    }

  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;

      const { wpmSlider } = UI.controls;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          reader.prevSentence();
          break;
        case 'ArrowRight':
          e.preventDefault();
          reader.nextSentence();
          break;
        case 'ArrowUp':
          e.preventDefault();
          wpmSlider.value = Math.min(1500, parseInt(wpmSlider.value) + 25);
          handleWPMChange({ target: wpmSlider });
          break;
        case 'ArrowDown':
          e.preventDefault();
          wpmSlider.value = Math.max(50, parseInt(wpmSlider.value) - 25);
          handleWPMChange({ target: wpmSlider });
          break;
      }
    });
  }

  function setupReaderCallbacks() {
    reader.onWordChange = updateWordDisplay;
    reader.onProgressChange = updateProgress;
    reader.onComplete = handleComplete;
  }

  // ===== Theme =====
  function setupThemeToggle() {
    // The <head> script already applied the initial theme; sync the icon to it.
    updateThemeIcon(getCurrentTheme());
    UI.theme.toggle.addEventListener('click', () => {
      const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Store the raw string (not JSON) so the <head> pre-paint script can read it directly.
    try { localStorage.setItem(STORE_KEYS.theme, theme); } catch (e) { /* ignore */ }
    if (UI.theme.meta) UI.theme.meta.setAttribute('content', theme === 'light' ? '#f5f5f5' : '#0d0d0d');
    updateThemeIcon(theme);
  }

  function updateThemeIcon(theme) {
    // Show the icon of the theme you'd switch TO.
    const { sun, moon } = UI.theme;
    if (!sun || !moon) return;
    sun.classList.toggle('hidden', theme !== 'dark');
    moon.classList.toggle('hidden', theme === 'dark');
  }

  // ===== File Handling =====
  async function handleFile(file) {
    const validTypes = ['.pdf', '.docx', '.epub', '.txt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(ext)) {
      showError(t('err_invalid_type'));
      return;
    }

    // Identify this document so we can resume where the reader left off.
    currentDocId = `${file.name}:${file.size}`;

    // Make sure the library this format needs has finished loading
    const lib = REQUIRED_LIB[ext];
    if (lib && typeof window[lib] === 'undefined') {
      showProgressIndicator(t('title_loading_libs'), t('pg_please_wait'), 0);
      const loaded = await waitForLibrary(ext);
      if (!loaded) {
        hideProgressIndicator();
        showError(t('err_libraries_retry'));
        return;
      }
    }

    resetUIForUpload();
    showProgressIndicator(t('title_parsing'), t('pg_please_wait'), 0);
    
    try {
      // Parse the file locally (client-side only, no server upload needed)
      const startTime = performance.now();
      
      // Parse using ClientParser module (OCR language from the user's choice)
      const result = await ClientParser.parseFile(file, (percent, message) => {
        showProgressIndicator(t('title_parsing_local'), message, percent);
      }, { ocrLang: prefs.ocrLang });

      const parseTime = ((performance.now() - startTime) / 1000).toFixed(2);

      // Flatten chunks into a single word array, keeping chapter boundaries
      // (title + start index) for the chapter navigator.
      const words = [];
      currentChapters = result.chunks.map((chunk) => {
        const startIndex = words.length;
        for (let i = 0; i < chunk.words.length; i++) {
          words.push(chunk.words[i]);
        }
        return {
          title: chunk.title || `Section ${startIndex + 1}`,
          startIndex,
          wordCount: chunk.words.length
        };
      });

      hideProgressIndicator();
      startReading(words);
      showAchievement('quickStart', '🚀', t('ach_quickstart_title'), t('ach_quickstart_desc', { time: parseTime }));

    } catch (error) {
      console.error('Processing failed:', error);
      showError(t('err_process', { message: error.message }));
      resetUIForError();
      hideProgressIndicator();
    }
  }

  function startReading(words) {
    if (!words || words.length === 0) {
      showError(t('err_no_words'));
      resetUIForError();
      return;
    }

    const wpm = parseInt(UI.controls.wpmSlider.value);
    const startIndex = restoredStartIndex(words.length);
    reader.init(words, startIndex, wpm);
    reader.setChunkSize(parseInt(UI.controls.chunkSlider.value, 10));
    reader.setWarmup(prefs.warmup);

    // Update UI state
    UI.reading.progress.total.textContent = words.length;
    UI.reading.progress.bar.max = Math.max(0, words.length - 1);
    UI.reading.progress.bar.value = startIndex;
    UI.reading.progress.current.textContent = startIndex + 1;

    buildChapterSelect();
    updateStats();

    UI.pages.landing.classList.remove('active');
    UI.pages.reading.classList.add('active');
    UI.upload.spinner.classList.add('hidden');

    if (startIndex > 0) {
      showAchievement('resume', '🔖', t('ach_resume_title'), t('ach_resume_desc'));
    }
  }

  // Where to start: a saved position for this document, unless it was finished.
  function restoredStartIndex(total) {
    const positions = store.load(STORE_KEYS.positions, {});
    const saved = currentDocId ? positions[currentDocId] : 0;
    if (typeof saved === 'number' && saved > 0 && saved < total - 1) {
      return saved;
    }
    return 0;
  }

  function saveReadingPosition() {
    if (!currentDocId || !reader || reader.words.length === 0) return;
    const positions = store.load(STORE_KEYS.positions, {});
    positions[currentDocId] = reader.currentIndex;
    store.save(STORE_KEYS.positions, positions);
    lastPositionSave = Date.now();
  }

  // ===== Chapter Navigation =====
  function buildChapterSelect() {
    const { chapterGroup, chapterSelect } = UI.controls;
    chapterSelect.innerHTML = '';

    if (currentChapters.length <= 1) {
      chapterGroup.classList.add('hidden');
      return;
    }

    currentChapters.forEach((chapter, i) => {
      const option = document.createElement('option');
      option.value = chapter.startIndex;
      const title = chapter.title.length > 40 ? chapter.title.slice(0, 39) + '…' : chapter.title;
      option.textContent = `${i + 1}. ${title}`;
      chapterSelect.appendChild(option);
    });

    chapterGroup.classList.remove('hidden');
    updateChapterSelection(reader.currentIndex);
  }

  // Highlight the chapter that contains the given word index.
  function updateChapterSelection(index) {
    if (currentChapters.length <= 1) return;
    let active = 0;
    for (let i = 0; i < currentChapters.length; i++) {
      if (index >= currentChapters[i].startIndex) active = i;
      else break;
    }
    const value = String(currentChapters[active].startIndex);
    if (UI.controls.chapterSelect.value !== value) {
      UI.controls.chapterSelect.value = value;
    }
  }

  // ===== UI Updates =====
  function updateWordDisplay(parts) {
    const { wordLeft, wordCenter, wordRight, wordWrapper } = UI.reading;
    wordLeft.textContent = parts.left;
    wordCenter.textContent = parts.center;
    wordRight.textContent = parts.right;

    // Flip the display for right-to-left scripts (Arabic, Hebrew, …). The three
    // ORP spans stay in logical order; direction handles the visual arrangement.
    if (wordWrapper) {
      const isRTL = RTL_CHARS.test(parts.left + parts.center + parts.right);
      const dir = isRTL ? 'rtl' : 'ltr';
      if (wordWrapper.getAttribute('dir') !== dir) wordWrapper.setAttribute('dir', dir);
    }
  }

  function updateProgress(index) {
    const { current, bar } = UI.reading.progress;
    current.textContent = index + 1;
    bar.value = index;
    updateChapterSelection(index);
    updateStats();
    checkAchievements();

    // Persist position periodically while reading
    if (Date.now() - lastPositionSave > POSITION_SAVE_MS) {
      saveReadingPosition();
    }
  }

  // ===== Reading Stats =====
  function updateStats() {
    if (!reader) return;
    const { words, wpm, saved } = UI.stats;
    const wordsRead = reader.totalWordsRead;

    if (words) words.textContent = wordsRead.toLocaleString();
    if (wpm) wpm.textContent = `${reader.maxWpmReached} ${t('wpm_unit')}`;
    if (saved) saved.textContent = formatDuration(timeSavedSeconds(wordsRead, reader.wpm));
  }

  // Approximate time saved versus an average reader, in seconds.
  function timeSavedSeconds(wordsRead, wpm) {
    if (wpm <= BASELINE_WPM) return 0;
    return wordsRead * (60 / BASELINE_WPM - 60 / wpm);
  }

  function formatDuration(seconds) {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }

  function togglePlayPause() {
    reader.toggle();
    updatePlayPauseIcon();
    if (reader.isPaused) saveReadingPosition();
  }

  function updatePlayPauseIcon() {
    const { playIcon, pauseIcon } = UI.controls;
    if (reader.isPaused) {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
    } else {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
    }
  }

  function handleWPMChange(e) {
    const wpm = parseInt(e.target.value);
    reader.setWPM(wpm);
    UI.controls.wpmDisplay.textContent = wpm;
    prefs.wpm = wpm;
    savePrefs();
    updateStats();

    if (wpm > SPEED_DEMON_WPM && !achievements.speedDemon) {
      showAchievement('speedDemon', '⚡', t('ach_speeddemon_title'), t('ach_speeddemon_desc', { wpm: SPEED_DEMON_WPM }));
    }
  }

  function handleChunkSizeChange(e) {
    const chunkSize = parseInt(e.target.value);
    reader.setChunkSize(chunkSize);
    UI.controls.chunkDisplay.textContent = chunkSize;
    prefs.chunkSize = chunkSize;
    savePrefs();
  }

  function handleProgressChange(e) {
    const index = parseInt(e.target.value);
    reader.goTo(index);
  }

  function handleComplete() {
    updatePlayPauseIcon();
    updateStats();
    saveReadingPosition();

    const completion = reader.getCompletionPercentage();
    if (completion >= BOOKWORM_PERCENT && !achievements.bookworm) {
      showAchievement('bookworm', '📚', t('ach_bookworm_title'), t('ach_bookworm_desc', { percent: BOOKWORM_PERCENT }));
    }
  }

  // ===== Navigation & State Management =====
  function goToLanding() {
    reader.pause();
    updatePlayPauseIcon();
    saveReadingPosition(); // Remember where we were in the current document

    currentChapters = [];
    currentDocId = null;
    UI.controls.chapterGroup.classList.add('hidden');

    UI.pages.reading.classList.remove('active');
    UI.pages.landing.classList.add('active');

    resetUIForError(); // Reuses logic to show dropzone
    hideProgressIndicator();
    UI.upload.fileInput.value = '';
    UI.upload.error.classList.add('hidden');
  }

  function resetUIForUpload() {
    UI.upload.dropZone.classList.add('hidden');
    UI.upload.spinner.classList.remove('hidden');
    UI.upload.error.classList.add('hidden');
  }

  function resetUIForError() {
    UI.upload.dropZone.classList.remove('hidden');
    UI.upload.spinner.classList.add('hidden');
  }

  function showError(message) {
    UI.upload.error.textContent = message;
    UI.upload.error.classList.remove('hidden');
    UI.upload.error.focus(); // Accessibility
  }

  // ===== Achievements =====
  function showAchievement(id, icon, title, description) {
    if (achievements[id]) return;
    achievements[id] = true;

    const achievement = document.createElement('div');
    achievement.className = 'achievement';
    achievement.innerHTML = `
      <span class="achievement-icon">${icon}</span>
      <div class="achievement-content">
        <h4>${title}</h4>
        <p>${description}</p>
      </div>
    `;

    UI.achievements.appendChild(achievement);

    setTimeout(() => {
      achievement.remove();
    }, ACHIEVEMENT_TIMEOUT);
  }

  function checkAchievements() {
    if (reader.totalWordsRead > MARATHON_WORDS && !achievements.marathon) {
      showAchievement('marathon', '🏃', t('ach_marathon_title'), t('ach_marathon_desc', { words: MARATHON_WORDS }));
    }
  }

  // ===== Start Application =====
  document.addEventListener('DOMContentLoaded', init);
})();
