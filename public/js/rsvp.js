/**
 * RSVP (Rapid Serial Visual Presentation) Core Logic
 * Handles word rendering with optimal recognition point.
 * Optimized for client-side usage.
 */
class RSVPReader {
  constructor() {
    this.words = [];
    this.currentIndex = 0;
    this.wpm = 300;
    this.isPaused = true;
    this.timeoutId = null;
    this.chunkSize = 1; // Number of words to display at once
    
    // Callbacks
    this.onWordChange = null;
    this.onProgressChange = null;
    this.onComplete = null;

    // Track metrics for achievements
    this.maxWpmReached = 0;
    this.totalWordsRead = 0;
    this.maxIndexReached = 0; // Furthest word actually reached (for true completion %)

    // Time-based scheduling to prevent rubberbanding
    this.nextTickTime = 0;

    // Warm-up: ramp from a lower speed up to the target WPM at the start of each
    // play session so the eye can lock onto the focal point before full speed.
    this.warmup = true;
    this.rampStartTime = 0;
    this.RAMP_MS = 2500;            // Duration of the ramp
    this.RAMP_START_FRACTION = 0.5; // Begin at this fraction of target WPM
    this.RAMP_MIN_WPM = 100;        // ...but never start below this
  }

  /**
   * Initialize the reader with words
   * @param {string[]} words - Array of words to read
   * @param {number} startIndex - Starting position
   * @param {number} wpm - Words per minute
   */
  init(words, startIndex = 0, wpm = 300) {
    this.words = words;
    this.currentIndex = startIndex;
    this.wpm = wpm;
    this.isPaused = true;
    this.totalWordsRead = 0;
    this.maxWpmReached = wpm;
    this.maxIndexReached = startIndex;
    this.render();
  }

  /**
   * Calculate the middle letter position for a word or chunk (Optimal Recognition Point)
   * @param {string} word - Single word or space-separated chunk of words
   * @returns {{ left: string, center: string, right: string }}
   */
  getORP(word) {
    if (!word) {
      return { left: '', center: '', right: '' };
    }

    // For multi-word chunks, anchor on the middle word so the highlighted
    // character is never a space between words.
    const words = word.split(' ');
    const mid = Math.floor((words.length - 1) / 2);
    const midWord = words[mid];
    let offset = 0;
    for (let i = 0; i < mid; i++) offset += words[i].length + 1; // +1 per joining space

    // Middle of the anchor word: exact middle for odd lengths (5 -> index 2),
    // left-of-center for even lengths (4 -> index 1).
    const middleIndex = offset + Math.floor((midWord.length - 1) / 2);

    return {
      left: word.substring(0, middleIndex),
      center: word.charAt(middleIndex),
      right: word.substring(middleIndex + 1)
    };
  }

  /**
   * Get the current chunk of words to display
   * @returns {string} Space-separated chunk of words
   */
  getCurrentChunk() {
    const endIndex = Math.min(this.currentIndex + this.chunkSize, this.words.length);
    const chunk = [];
    
    for (let i = this.currentIndex; i < endIndex; i++) {
      chunk.push(this.words[i]);
    }
    
    return chunk.join(' ');
  }

  /**
   * Render the current word or chunk
   */
  render() {
    if (this.currentIndex >= this.words.length) {
      if (this.onComplete) {
        this.onComplete();
      }
      return;
    }

    if (this.currentIndex > this.maxIndexReached) {
      this.maxIndexReached = this.currentIndex;
    }

    const chunk = this.getCurrentChunk();
    const parts = this.getORP(chunk);

    if (this.onWordChange) {
      this.onWordChange(parts, this.currentIndex, this.words.length);
    }

    if (this.onProgressChange) {
      this.onProgressChange(this.currentIndex, this.words.length);
    }
  }

  /**
   * Effective WPM for the current tick, applying the warm-up ramp.
   * While warming up, speed rises from a fraction of the target up to the full
   * target over RAMP_MS; after that (or when disabled/paused) it is the target.
   * @returns {number}
   */
  getEffectiveWPM() {
    if (!this.warmup || this.isPaused) return this.wpm;

    const startWpm = Math.max(this.RAMP_MIN_WPM, this.wpm * this.RAMP_START_FRACTION);
    if (startWpm >= this.wpm) return this.wpm; // Target already at/below the floor

    const elapsed = performance.now() - this.rampStartTime;
    if (elapsed >= this.RAMP_MS) return this.wpm;

    const t = elapsed / this.RAMP_MS;
    return startWpm + (this.wpm - startWpm) * t;
  }

  /**
   * Length of the longest word in the given index range (for pacing).
   */
  longestWordLength(start, end) {
    let max = 0;
    for (let i = start; i < end; i++) {
      const len = (this.words[i] || '').length;
      if (len > max) max = len;
    }
    return max;
  }

  /**
   * Calculate delay between chunks based on WPM.
   * Applies the warm-up ramp, extra time for longer words, and pauses after
   * punctuation — all of which improve comprehension.
   * @returns {number} Delay in milliseconds
   */
  getDelay() {
    // 60000 ms / WPM = ms per word (using the warmed-up effective speed)
    const baseDelay = 60000 / this.getEffectiveWPM();

    // For chunks, get the last word in the chunk to check for punctuation
    const endIndex = Math.min(this.currentIndex + this.chunkSize, this.words.length);
    const lastWord = this.words[endIndex - 1] || '';

    // Base delay multiplied by chunk size
    let delay = baseDelay * this.chunkSize;

    // Longer words take longer to recognise — add up to ~1 extra word of time
    // for the longest word in the chunk, scaling past an 8-character threshold.
    const longest = this.longestWordLength(this.currentIndex, endIndex);
    if (longest > 8) {
      delay += baseDelay * Math.min(1, (longest - 8) * 0.1);
    }

    // Add extra delay for words ending with punctuation
    const punctuation = /[.!?;:]["')\]]?$/;
    const comma = /[,]["')\]]?$/;

    if (punctuation.test(lastWord)) {
      delay += baseDelay * 1.5; // Extra pause for sentence end
    } else if (comma.test(lastWord)) {
      delay += baseDelay * 0.5; // Extra pause for comma
    }

    return delay;
  }

  /**
   * Enable or disable the warm-up ramp.
   * @param {boolean} enabled
   */
  setWarmup(enabled) {
    this.warmup = !!enabled;
  }

  /**
   * Start or resume reading
   */
  play() {
    if (this.currentIndex >= this.words.length) {
      this.currentIndex = 0;
    }
    
    this.isPaused = false;
    // Initialize the schedule based on current time
    this.nextTickTime = performance.now();
    this.rampStartTime = this.nextTickTime; // Restart the warm-up ramp
    this.tick();
  }

  /**
   * Pause reading
   */
  pause() {
    this.isPaused = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Toggle play/pause state
   * @returns {boolean} New pause state
   */
  toggle() {
    if (this.isPaused) {
      this.play();
    } else {
      this.pause();
    }
    return this.isPaused;
  }

  /**
   * Main reading loop tick with drift compensation
   * Uses time-based scheduling to prevent rubberbanding (drift)
   * Advances by chunk size for multi-word reading
   */
  tick() {
    if (this.isPaused) return;

    this.render();

    if (this.currentIndex < this.words.length - 1) {
      const delay = this.getDelay();
      
      // Advance by chunk size, but track all words read
      const wordsInCurrentChunk = Math.min(this.chunkSize, this.words.length - this.currentIndex);
      this.currentIndex += this.chunkSize;
      this.totalWordsRead += wordsInCurrentChunk;
      
      // Calculate when the next tick should occur based on the schedule
      this.nextTickTime += delay;
      
      // Calculate adjusted delay to compensate for any drift
      const now = performance.now();
      const adjustedDelay = Math.max(0, this.nextTickTime - now);
      
      this.timeoutId = setTimeout(() => this.tick(), adjustedDelay);
    } else {
      // Reached the end
      this.isPaused = true;
      this.render();
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  /**
   * Go to previous sentence (search backwards for period/end punctuation)
   */
  prevSentence() {
    const sentenceEnd = /[.!?]$/;
    // Start searching from 2 words back (to skip current word and potential punctuation of previous sentence end)
    let index = this.currentIndex - 2;
    
    // Skip backwards through current sentence
    while (index > 0 && !sentenceEnd.test(this.words[index])) {
      index--;
    }
    
    // Find start of previous sentence (skip backwards through previous sentence until punctuation)
    index--;
    while (index > 0 && !sentenceEnd.test(this.words[index])) {
      index--;
    }
    
    this.currentIndex = Math.max(0, index + 1);
    this.render();
  }

  /**
   * Go to next sentence (search forwards for next period/end punctuation)
   */
  nextSentence() {
    const sentenceEnd = /[.!?]$/;
    let index = this.currentIndex;
    
    while (index < this.words.length - 1 && !sentenceEnd.test(this.words[index])) {
      index++;
    }
    
    this.currentIndex = Math.min(this.words.length - 1, index + 1);
    this.render();
  }

  /**
   * Jump to a specific word index
   * @param {number} index 
   */
  goTo(index) {
    this.currentIndex = Math.max(0, Math.min(index, this.words.length - 1));
    this.render();
  }

  /**
   * Set Words Per Minute
   * @param {number} wpm 
   */
  setWPM(wpm) {
    this.wpm = Math.max(50, Math.min(1500, wpm));
    if (this.wpm > this.maxWpmReached) {
      this.maxWpmReached = this.wpm;
    }
  }

  /**
   * Set Chunk Size (number of words to display at once)
   * @param {number} chunkSize - Number between 1 and 10
   */
  setChunkSize(chunkSize) {
    this.chunkSize = Math.max(1, Math.min(10, chunkSize));
    this.render(); // Re-render with new chunk size
  }

  /**
   * Get current progress percentage
   * @returns {number}
   */
  getProgress() {
    if (this.words.length === 0) return 0;
    return (this.currentIndex / (this.words.length - 1)) * 100;
  }

  /**
   * Get completion percentage based on the furthest point actually reached.
   * (Unlike totalWordsRead, this does not inflate when seeking back and forth.)
   * @returns {number}
   */
  getCompletionPercentage() {
    if (this.words.length === 0) return 0;
    return ((this.maxIndexReached + 1) / this.words.length) * 100;
  }
}

// Export for use in main.js
window.RSVPReader = RSVPReader;
