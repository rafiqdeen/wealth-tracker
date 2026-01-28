/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures when external APIs are down.
 * States:
 *   CLOSED - Normal operation, requests go through
 *   OPEN - Too many failures, requests blocked for recovery period
 *   HALF_OPEN - Testing if service recovered, allows limited requests
 */

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;     // Failures before opening
    this.recoveryTimeout = options.recoveryTimeout || 60000;   // Time before testing again (1 min)
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold || 2; // Successes to close

    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.lastStateChange = Date.now();
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise} - Result of fn or throws if circuit is open
   */
  async execute(fn) {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.recoveryTimeout) {
        this.transitionTo('HALF_OPEN');
      } else {
        const waitTime = Math.round((this.recoveryTimeout - (Date.now() - this.lastFailure)) / 1000);
        throw new Error(`Circuit breaker ${this.name} is OPEN (retry in ${waitTime}s)`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      console.log(`[CircuitBreaker] ${this.name} success in HALF_OPEN (${this.successes}/${this.halfOpenSuccessThreshold})`);

      if (this.successes >= this.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Handle failed execution
   */
  onFailure(error) {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN immediately opens the circuit
      console.log(`[CircuitBreaker] ${this.name} failure in HALF_OPEN - reopening`);
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
      console.log(`[CircuitBreaker] ${this.name} threshold reached (${this.failures} failures) - opening`);
      this.transitionTo('OPEN');
    }
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === 'CLOSED') {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
    }

    console.log(`[CircuitBreaker] ${this.name}: ${oldState} -> ${newState}`);
  }

  /**
   * Check if circuit allows requests
   */
  isAvailable() {
    if (this.state === 'OPEN') {
      // Check if recovery timeout has passed
      if (Date.now() - this.lastFailure > this.recoveryTimeout) {
        this.transitionTo('HALF_OPEN');
        return true;
      }
      return false;
    }
    return true;
  }

  /**
   * Get current state and stats
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure ? new Date(this.lastFailure).toISOString() : null,
      lastStateChange: new Date(this.lastStateChange).toISOString(),
      isAvailable: this.isAvailable()
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.lastStateChange = Date.now();
    console.log(`[CircuitBreaker] ${this.name} manually reset`);
  }
}

export default CircuitBreaker;
