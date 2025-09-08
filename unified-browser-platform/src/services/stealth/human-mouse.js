/**
 * Mouse Movement Humanization System
 * Phase 4: Human-like mouse movements with Bézier curves
 */

import { STEALTH_CONFIG } from "./stealth-config.js";

export class HumanMouseMovement {
  constructor() {
    this.lastPosition = { x: 0, y: 0 };
    this.config = STEALTH_CONFIG.MOUSE_CONFIG;
  }

  /**
   * Generate Bézier curve points for natural mouse movement
   */
  generateBezierCurve(start, end, steps = 20) {
    const points = [];

    // Create control points for natural curve
    const midpoint = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };

    // Add randomness to control points
    const controlPoint1 = {
      x:
        start.x +
        (midpoint.x - start.x) * this.config.CURVE_STRENGTH +
        (Math.random() - 0.5) * 50,
      y:
        start.y +
        (midpoint.y - start.y) * this.config.CURVE_STRENGTH +
        (Math.random() - 0.5) * 50,
    };

    const controlPoint2 = {
      x:
        end.x +
        (midpoint.x - end.x) * this.config.CURVE_STRENGTH +
        (Math.random() - 0.5) * 50,
      y:
        end.y +
        (midpoint.y - end.y) * this.config.CURVE_STRENGTH +
        (Math.random() - 0.5) * 50,
    };

    // Generate curve points using cubic Bézier formula
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = this.cubicBezier(
        t,
        start,
        controlPoint1,
        controlPoint2,
        end,
      );
      points.push(point);
    }

    return points;
  }

  /**
   * Cubic Bézier curve calculation
   */
  cubicBezier(t, p0, p1, p2, p3) {
    const x =
      Math.pow(1 - t, 3) * p0.x +
      3 * Math.pow(1 - t, 2) * t * p1.x +
      3 * (1 - t) * Math.pow(t, 2) * p2.x +
      Math.pow(t, 3) * p3.x;

    const y =
      Math.pow(1 - t, 3) * p0.y +
      3 * Math.pow(1 - t, 2) * t * p1.y +
      3 * (1 - t) * Math.pow(t, 2) * p2.y +
      Math.pow(t, 3) * p3.y;

    return { x: Math.round(x), y: Math.round(y) };
  }

  /**
   * Calculate dynamic speed based on distance and randomness
   */
  calculateSpeed(distance) {
    let speed;

    if (distance < 100) {
      speed = this.config.FAST_SPEED;
    } else if (distance < 300) {
      speed = this.config.NORMAL_SPEED;
    } else {
      speed = this.config.SLOW_SPEED;
    }

    // Add speed variation
    const variation = 1 + (Math.random() - 0.5) * this.config.SPEED_VARIATION;
    const delay =
      (speed.min + Math.random() * (speed.max - speed.min)) * variation;

    return Math.max(1, Math.round(delay));
  }

  /**
   * Add realistic pauses during movement
   */
  shouldPause() {
    return Math.random() < this.config.PAUSE_PROBABILITY;
  }

  /**
   * Add slight overshoot for realism
   */
  addOvershoot(target) {
    if (Math.random() < this.config.OVERSHOOT_PROBABILITY) {
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.random() * this.config.OVERSHOOT_DISTANCE;

      return {
        x: target.x + Math.cos(angle) * distance,
        y: target.y + Math.sin(angle) * distance,
      };
    }
    return target;
  }

  /**
   * Main method: Move mouse with human-like behavior
   */
  async moveMouseHuman(page, targetX, targetY) {
    const start = this.lastPosition;
    const target = { x: targetX, y: targetY };

    // Calculate distance
    const distance = Math.sqrt(
      Math.pow(target.x - start.x, 2) + Math.pow(target.y - start.y, 2),
    );

    // For very short distances, move directly
    if (distance < 5) {
      await page.mouse.move(targetX, targetY);
      this.lastPosition = target;
      return;
    }

    // Calculate number of steps based on distance
    const steps = Math.max(
      this.config.MIN_STEPS,
      Math.min(this.config.MAX_STEPS, Math.floor(distance / 10)),
    );

    // Generate curved path
    const points = this.generateBezierCurve(start, target, steps);

    // Move along the path
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const speed = this.calculateSpeed(distance / steps);

      // Move to point
      await page.mouse.move(point.x, point.y);

      // Random pause during movement
      if (this.shouldPause() && i < points.length - 1) {
        await this.delay(50 + Math.random() * 100);
      }

      // Delay between steps
      await this.delay(speed);
    }

    // Optional overshoot and correction
    const overshootTarget = this.addOvershoot(target);
    if (overshootTarget.x !== target.x || overshootTarget.y !== target.y) {
      await page.mouse.move(overshootTarget.x, overshootTarget.y);
      await this.delay(30 + Math.random() * 50);
      await page.mouse.move(target.x, target.y);
    }

    this.lastPosition = target;
  }

  /**
   * Human-like clicking with realistic timing
   */
  async clickHuman(page, x, y, options = {}) {
    // Move to position with human-like movement
    await this.moveMouseHuman(page, x, y);

    // Small delay before clicking (reaction time)
    await this.delay(50 + Math.random() * 100);

    // Perform click with realistic timing
    const button = options.button || "left";
    await page.mouse.down({ button });
    await this.delay(50 + Math.random() * 50); // Click duration
    await page.mouse.up({ button });

    // Small delay after clicking
    await this.delay(100 + Math.random() * 200);
  }

  /**
   * Human-like scrolling
   */
  async scrollHuman(page, deltaX = 0, deltaY = 100) {
    // Random scroll amount variation
    const scrollVariation = 0.8 + Math.random() * 0.4; // 80% to 120% of requested scroll
    const actualDeltaY = deltaY * scrollVariation;

    // Multiple small scroll steps for realism
    const steps = 3 + Math.floor(Math.random() * 3); // 3-5 steps
    const stepDelta = actualDeltaY / steps;

    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel({ deltaX: deltaX / steps, deltaY: stepDelta });
      await this.delay(50 + Math.random() * 100);
    }

    // Final pause after scrolling
    await this.delay(200 + Math.random() * 300);
  }

  /**
   * Update last position (for tracking)
   */
  updatePosition(x, y) {
    this.lastPosition = { x, y };
  }

  /**
   * Utility delay function
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default HumanMouseMovement;
