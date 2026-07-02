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
      sidebar: document.getElementById('sidebar'),
      sidebarToggle: document.getElementById('sidebar-toggle')
    },
    achievements: document.getElementById('achievement-container')
  };

  // ===== State =====
  let reader = null;
  let progressIndicator = null;
  let librariesLoaded = false;
  
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
    setupEventListeners();
    createProgressIndicator();
    checkLibrariesLoaded();
  }

  // ===== Check External Libraries =====
  function checkLibrariesLoaded() {
    // Check if libraries are loaded
    const checkInterval = setInterval(() => {
      if (typeof pdfjsLib !== 'undefined' && typeof mammoth !== 'undefined') {
        librariesLoaded = true;
        clearInterval(checkInterval);
        console.log('External libraries loaded successfully');
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!librariesLoaded) {
        console.error('Failed to load external libraries');
        showError('Failed to load required libraries. Please refresh the page or check your internet connection.');
      }
    }, 10000);
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
  }

  function setupPlaybackControls() {
    const { playPause, prevSentence, nextSentence, wpmSlider, chunkSlider } = UI.controls;
    const { bar } = UI.reading.progress;

    playPause.addEventListener('click', togglePlayPause);
    prevSentence.addEventListener('click', () => reader.prevSentence());
    nextSentence.addEventListener('click', () => reader.nextSentence());
    wpmSlider.addEventListener('input', handleWPMChange);
    chunkSlider.addEventListener('input', handleChunkSizeChange);
    bar.addEventListener('input', handleProgressChange);
  }

  function setupNavigation() {
    const { newDoc, sidebarToggle } = UI.controls;
    
    newDoc.addEventListener('click', goToLanding);
    
    // Sidebar toggle with touch/click handling
    let lastToggleTime = 0;
    let touchHandled = false;
    
    const handleSidebarToggle = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (e.type === 'touchend') {
        touchHandled = true;
        toggleSidebar();
        setTimeout(() => { touchHandled = false; }, 100);
        return;
      }
      
      if (e.type === 'click' && touchHandled) return;
      
      const now = Date.now();
      if (now - lastToggleTime < 100) return;
      lastToggleTime = now;
      
      toggleSidebar();
    };
    
    sidebarToggle.addEventListener('touchend', handleSidebarToggle, { capture: true });
    sidebarToggle.addEventListener('click', handleSidebarToggle, { capture: true });
  }

  function setupMobileTouch() {
    if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;

    const wordDisplay = document.getElementById('word-display');
    const { sidebar, sidebarToggle } = UI.controls;
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

    // Vertical swipe for sidebar
    let sidebarTouchY = 0;
    let sidebarTouchX = 0;

    sidebar.addEventListener('touchstart', (e) => {
      if (e.target.closest('#sidebar-toggle')) return;
      sidebarTouchY = e.changedTouches[0].screenY;
      sidebarTouchX = e.changedTouches[0].screenX;
    }, { passive: true });

    sidebar.addEventListener('touchend', (e) => {
      if (e.target.closest('#sidebar-toggle')) return;
      
      const touchY = e.changedTouches[0].screenY;
      const touchX = e.changedTouches[0].screenX;
      const dy = sidebarTouchY - touchY;
      const dx = Math.abs(sidebarTouchX - touchX);
      
      if (dx > Math.abs(dy)) return; // Horizontal swipe
      
      if (dy > minSwipeDistance) sidebar.classList.add('open');
      else if (dy < -minSwipeDistance) sidebar.classList.remove('open');
    }, { passive: true });
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
          wpmSlider.value = Math.min(1000, parseInt(wpmSlider.value) + 25);
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

  // ===== File Handling =====
  async function handleFile(file) {
    const validTypes = ['.pdf', '.docx', '.txt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(ext)) {
      showError('Invalid file type. Please upload a PDF, DOCX, or TXT file.');
      return;
    }

    // Check if libraries are loaded
    if (!librariesLoaded) {
      // Wait for libraries to load (max 5 seconds)
      showProgressIndicator('Loading libraries...', 'Please wait...', 0);
      let waited = 0;
      while (!librariesLoaded && waited < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waited += 100;
      }
      
      if (!librariesLoaded) {
        showError('Required libraries are not loaded. Please refresh the page and try again.');
        return;
      }
    }

    resetUIForUpload();
    showProgressIndicator('Parsing document...', 'Please wait...', 0);
    
    try {
      // Parse the file locally (client-side only, no server upload needed)
      const startTime = performance.now();
      
      // Parse using ClientParser module
      const result = await ClientParser.parseFile(file, (percent, message) => {
        showProgressIndicator('Parsing locally...', message, percent);
      });

      const parseTime = ((performance.now() - startTime) / 1000).toFixed(2);
      
      // Flatten chunks into a single word array
      const words = [];
      for (const chunk of result.chunks) {
        for (let i = 0; i < chunk.words.length; i++) {
          words.push(chunk.words[i]);
        }
      }

      hideProgressIndicator();
      startReading(words);
      showAchievement('quickStart', '🚀', 'Quick Start', `Parsed in ${parseTime}s!`);
      
    } catch (error) {
      console.error('Processing failed:', error);
      showError(`Failed to process file: ${error.message}`);
      resetUIForError();
      hideProgressIndicator();
    }
  }

  function startReading(words) {
    if (!words || words.length === 0) {
      showError('No words found in document.');
      resetUIForError();
      return;
    }
    
    const wpm = parseInt(UI.controls.wpmSlider.value);
    reader.init(words, 0, wpm);
    
    // Update UI state
    UI.reading.progress.total.textContent = words.length;
    UI.reading.progress.bar.max = Math.max(0, words.length - 1);
    
    UI.pages.landing.classList.remove('active');
    UI.pages.reading.classList.add('active');
    UI.upload.spinner.classList.add('hidden');
  }

  // ===== UI Updates =====
  function updateWordDisplay(parts) {
    const { wordLeft, wordCenter, wordRight } = UI.reading;
    wordLeft.textContent = parts.left;
    wordCenter.textContent = parts.center;
    wordRight.textContent = parts.right;
  }

  function updateProgress(index) {
    const { current, bar } = UI.reading.progress;
    current.textContent = index + 1;
    bar.value = index;
    checkAchievements();
  }

  function togglePlayPause() {
    reader.toggle();
    updatePlayPauseIcon();
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

    if (wpm > SPEED_DEMON_WPM && !achievements.speedDemon) {
      showAchievement('speedDemon', '⚡', 'Speed Demon', `Reached over ${SPEED_DEMON_WPM} WPM!`);
    }
  }

  function handleChunkSizeChange(e) {
    const chunkSize = parseInt(e.target.value);
    reader.setChunkSize(chunkSize);
    UI.controls.chunkDisplay.textContent = chunkSize;
  }

  function handleProgressChange(e) {
    const index = parseInt(e.target.value);
    reader.goTo(index);
  }

  function toggleSidebar() {
    UI.controls.sidebar.classList.toggle('open');
  }

  function handleComplete() {
    updatePlayPauseIcon();
    
    const completion = reader.getCompletionPercentage();
    if (completion >= BOOKWORM_PERCENT && !achievements.bookworm) {
      showAchievement('bookworm', '📚', 'Bookworm', `Completed over ${BOOKWORM_PERCENT}% of the document!`);
    }
  }

  // ===== Navigation & State Management =====
  function goToLanding() {
    reader.pause();
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
      showAchievement('marathon', '🏃', 'Marathon Reader', `Read over ${MARATHON_WORDS} words!`);
    }
  }

  // ===== Start Application =====
  document.addEventListener('DOMContentLoaded', init);
})();
