/**
 * Rate Limiter for TTS API calls
 * Ensures we don't exceed 10 calls per minute (Gemini quota limit)
 */

export class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private callTimestamps: number[] = [];
  private readonly maxCallsPerMinute: number;
  private readonly minDelayMs: number;

  constructor(maxCallsPerMinute: number = 10) {
    this.maxCallsPerMinute = maxCallsPerMinute;
    // Spread calls evenly: 10 calls/60s = 1 call every 6s
    this.minDelayMs = (60 * 1000) / maxCallsPerMinute;
  }

  /**
   * Add a task to the rate-limited queue
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process the queue with rate limiting
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      // Clean up old timestamps (older than 1 minute)
      const now = Date.now();
      this.callTimestamps = this.callTimestamps.filter(
        (timestamp) => now - timestamp < 60000
      );

      // Check if we need to wait
      if (this.callTimestamps.length >= this.maxCallsPerMinute) {
        // Wait until the oldest call is more than 1 minute old
        const oldestCall = this.callTimestamps[0];
        const waitTime = 60000 - (now - oldestCall);
        console.log(`Rate limit reached. Waiting ${(waitTime / 1000).toFixed(1)}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      // Calculate delay to maintain even spacing
      const timeSinceLastCall = this.callTimestamps.length > 0
        ? now - this.callTimestamps[this.callTimestamps.length - 1]
        : this.minDelayMs;

      if (timeSinceLastCall < this.minDelayMs) {
        const delayNeeded = this.minDelayMs - timeSinceLastCall;
        await new Promise((resolve) => setTimeout(resolve, delayNeeded));
      }

      // Execute next task
      const task = this.queue.shift();
      if (task) {
        this.callTimestamps.push(Date.now());
        await task();
      }
    }

    this.processing = false;
  }

  /**
   * Get number of remaining calls in current window
   */
  getRemainingCalls(): number {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter(
      (timestamp) => now - timestamp < 60000
    );
    return this.maxCallsPerMinute - this.callTimestamps.length;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}
