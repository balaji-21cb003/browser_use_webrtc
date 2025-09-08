/**
 * Human Typing Simulation System
 * Phase 5: Realistic keystroke timing and patterns
 */

import { STEALTH_CONFIG } from "./stealth-config.js";

export class HumanTyping {
  constructor() {
    this.config = STEALTH_CONFIG.TYPING_CONFIG;
    this.typingSpeed = "NORMAL_TYPING"; // Default speed
  }

  /**
   * Set typing speed profile
   */
  setTypingSpeed(speed) {
    if (this.config.CHAR_DELAYS[speed]) {
      this.typingSpeed = speed;
    }
  }

  /**
   * Check if word is in common words list (typed faster)
   */
  isCommonWord(word) {
    return this.config.COMMON_WORDS.includes(word.toLowerCase());
  }

  /**
   * Get delay for character based on context
   */
  getCharacterDelay(char, previousChar, word) {
    const baseDelay = this.config.CHAR_DELAYS[this.typingSpeed];
    let delay = baseDelay.min + Math.random() * (baseDelay.max - baseDelay.min);

    // Fast typing for common words
    if (this.isCommonWord(word)) {
      delay *= 0.7; // 30% faster
    }

    // Special characters take longer
    if (!/[a-zA-Z0-9\s]/.test(char)) {
      delay += Math.random() * this.config.SPECIAL_CHAR_DELAY.max;
    }

    // Typing combinations that are harder (different hands)
    if (previousChar && this.isDifficultCombination(previousChar, char)) {
      delay *= 1.3; // 30% slower
    }

    // Random variation
    delay *= 0.8 + Math.random() * 0.4; // ±20% variation

    return Math.max(10, Math.round(delay));
  }

  /**
   * Check if character combination is difficult to type
   */
  isDifficultCombination(char1, char2) {
    // Simple heuristic: characters typed with different hands
    const leftHand = "qwertasdfgzxcvb";
    const rightHand = "yuiophjklnm";

    const char1IsLeft = leftHand.includes(char1.toLowerCase());
    const char2IsLeft = leftHand.includes(char2.toLowerCase());

    // Same hand combinations can be faster
    return char1IsLeft !== char2IsLeft;
  }

  /**
   * Get pause delay between words
   */
  getWordPauseDelay() {
    const delay = this.config.WORD_PAUSE_DELAY;
    return delay.min + Math.random() * (delay.max - delay.min);
  }

  /**
   * Get pause delay between sentences
   */
  getSentencePauseDelay() {
    const delay = this.config.SENTENCE_PAUSE_DELAY;
    return delay.min + Math.random() * (delay.max - delay.min);
  }

  /**
   * Simulate realistic typing mistakes and corrections
   */
  shouldMakeMistake() {
    return Math.random() < 0.02; // 2% chance of mistake
  }

  /**
   * Generate a realistic typo for a character
   */
  generateTypo(char) {
    // Adjacent keys on QWERTY keyboard
    const adjacentKeys = {
      a: ["s", "q", "w", "z"],
      b: ["v", "g", "h", "n"],
      c: ["x", "d", "f", "v"],
      d: ["s", "e", "r", "f", "c", "x"],
      e: ["w", "r", "d", "s"],
      f: ["d", "r", "t", "g", "v", "c"],
      g: ["f", "t", "y", "h", "b", "v"],
      h: ["g", "y", "u", "j", "n", "b"],
      i: ["u", "o", "k", "j"],
      j: ["h", "u", "i", "k", "m", "n"],
      k: ["j", "i", "o", "l", "m"],
      l: ["k", "o", "p"],
      m: ["n", "j", "k"],
      n: ["b", "h", "j", "m"],
      o: ["i", "p", "l", "k"],
      p: ["o", "l"],
      q: ["w", "a"],
      r: ["e", "t", "f", "d"],
      s: ["a", "w", "e", "d", "z", "x"],
      t: ["r", "y", "g", "f"],
      u: ["y", "i", "j", "h"],
      v: ["c", "f", "g", "b"],
      w: ["q", "e", "s", "a"],
      x: ["z", "s", "d", "c"],
      y: ["t", "u", "h", "g"],
      z: ["a", "s", "x"],
    };

    const adjacent = adjacentKeys[char.toLowerCase()];
    if (adjacent && adjacent.length > 0) {
      return adjacent[Math.floor(Math.random() * adjacent.length)];
    }

    return char;
  }

  /**
   * Main typing method with human-like behavior
   */
  async typeHuman(page, text, options = {}) {
    const { selector = null, clearFirst = false, typingSpeed = null } = options;

    if (typingSpeed) {
      this.setTypingSpeed(typingSpeed);
    }

    // Clear field if requested
    if (clearFirst && selector) {
      await page.click(selector);
      await page.keyboard.down("Control");
      await page.keyboard.press("a");
      await page.keyboard.up("Control");
      await this.delay(100);
    }

    // Split text into words for realistic pauses
    const words = text.split(" ");

    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
      const word = words[wordIndex];
      const isLastWord = wordIndex === words.length - 1;

      // Type each character in the word
      for (let charIndex = 0; charIndex < word.length; charIndex++) {
        const char = word[charIndex];
        const previousChar = charIndex > 0 ? word[charIndex - 1] : null;

        // Simulate typing mistake occasionally
        if (this.shouldMakeMistake() && char !== " ") {
          const typo = this.generateTypo(char);
          await page.keyboard.type(typo);
          await this.delay(this.getCharacterDelay(typo, previousChar, word));

          // Realize mistake and correct it
          await this.delay(200 + Math.random() * 300); // Pause to "notice" mistake
          await page.keyboard.press("Backspace");
          await this.delay(100 + Math.random() * 100);
        }

        // Type the actual character
        await page.keyboard.type(char);

        // Get delay for this character
        const delay = this.getCharacterDelay(char, previousChar, word);
        await this.delay(delay);
      }

      // Add space between words (except for last word)
      if (!isLastWord) {
        await page.keyboard.type(" ");

        // Pause between words
        const wordPause = this.getWordPauseDelay();
        await this.delay(wordPause);

        // Longer pause after sentence-ending punctuation
        if (word.match(/[.!?]$/)) {
          const sentencePause = this.getSentencePauseDelay();
          await this.delay(sentencePause);
        }
      }
    }

    // Final pause after typing
    await this.delay(300 + Math.random() * 500);
  }

  /**
   * Type text into a specific input field
   */
  async typeIntoField(page, selector, text, options = {}) {
    // Click on the field first
    await page.click(selector);
    await this.delay(200 + Math.random() * 300);

    // Type with human behavior
    await this.typeHuman(page, text, { ...options, selector });
  }

  /**
   * Simulate form filling with realistic behavior
   */
  async fillForm(page, formData) {
    const fields = Object.entries(formData);

    for (let i = 0; i < fields.length; i++) {
      const [selector, value] = fields[i];

      // Wait between fields (user reading/thinking)
      if (i > 0) {
        const pauseDelay = STEALTH_CONFIG.ACTION_DELAYS.FORM_FIELD_PAUSE;
        const delay =
          pauseDelay.min + Math.random() * (pauseDelay.max - pauseDelay.min);
        await this.delay(delay);
      }

      // Fill the field
      await this.typeIntoField(page, selector, value, { clearFirst: true });
    }
  }

  /**
   * Simulate search behavior
   */
  async performSearch(page, searchSelector, query, submitSelector = null) {
    // Click search field
    await page.click(searchSelector);
    await this.delay(300 + Math.random() * 200);

    // Type search query
    await this.typeHuman(page, query);

    // Press Enter or click submit button
    if (submitSelector) {
      await this.delay(500 + Math.random() * 500); // Pause before clicking submit
      await page.click(submitSelector);
    } else {
      await this.delay(200 + Math.random() * 300);
      await page.keyboard.press("Enter");
    }
  }

  /**
   * Utility delay function
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default HumanTyping;
