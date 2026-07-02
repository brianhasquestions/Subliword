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

    // Time-based scheduling to prevent rubberbanding
    this.nextTickTime = 0;
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

    const len = word.length;
    // Calculate the true middle index
    // For odd length: exact middle (e.g., length 5 -> index 2)
    // For even length: left-of-center (e.g., length 4 -> index 1)
    const middleIndex = Math.floor((len - 1) / 2);

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
   * Calculate delay between chunks based on WPM
   * Adds extra delay for punctuation for better comprehension
   * For chunks, multiply base delay by chunk size and check last word for punctuation
   * @returns {number} Delay in milliseconds
   */
  getDelay() {
    // 60000 ms / WPM = ms per word
    const baseDelay = 60000 / this.wpm;
    
    // For chunks, get the last word in the chunk to check for punctuation
    const endIndex = Math.min(this.currentIndex + this.chunkSize, this.words.length);
    const lastWord = this.words[endIndex - 1] || '';
    
    // Base delay multiplied by chunk size
    let delay = baseDelay * this.chunkSize;
    
    // Add extra delay for words ending with punctuation
    const punctuation = /[.!?;:]$/;
    const comma = /[,]$/;
    
    if (punctuation.test(lastWord)) {
      delay += baseDelay * 1.5; // Extra pause for sentence end
    } else if (comma.test(lastWord)) {
      delay += baseDelay * 0.5; // Extra pause for comma
    }
    
    return delay;
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
    this.wpm = Math.max(50, Math.min(1000, wpm));
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
   * Get completion percentage based on total words read in session
   * @returns {number}
   */
  getCompletionPercentage() {
    if (this.words.length === 0) return 0;
    return (this.totalWordsRead / this.words.length) * 100;
  }
}

// Export for use in main.js
window.RSVPReader = RSVPReader;
