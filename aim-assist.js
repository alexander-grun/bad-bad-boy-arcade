const ACQUIRE_ANGLE = 25 * Math.PI / 180;
const HOLD_ANGLE = 32 * Math.PI / 180;
const MAX_DISTANCE = 9.25;
const CHECK_INTERVAL = .1;

// Selection is relative to the player's requested direction, never the
// assisted angle, so tracking cannot pull the aim around behind the player.
export function createAimAssist(canTarget) {
  let target = null;
  let untilCheck = 0;

  function eligible(enemy, origin, heading, limit) {
    if (!enemy.alive) return false;
    const dx = enemy.x - origin.x, dz = enemy.z - origin.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared < .01 || distanceSquared > MAX_DISTANCE * MAX_DISTANCE) return false;
    const angle = Math.atan2(dx, dz) - heading;
    return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= limit;
  }

  function reset() {
    target = null;
    untilCheck = 0;
  }

  return {
    reset,
    get target() { return target; },
    update(origin, heading, enemies, dt) {
      untilCheck -= dt;
      if (target && (!enemies.includes(target) || !eligible(target, origin, heading, HOLD_ANGLE))) reset();
      // Keep a valid target instead of choosing another one every frame.
      // Batch obstruction checks and idle acquisition at 10 Hz; immediately
      // reconsider targets that die or leave the requested direction.
      if (untilCheck <= 0) {
        untilCheck = CHECK_INTERVAL;
        if (target && !canTarget(origin, target)) target = null;
        if (!target) {
          let best = Infinity;
          for (const enemy of enemies) {
            if (!eligible(enemy, origin, heading, ACQUIRE_ANGLE)) continue;
            const dx = enemy.x - origin.x, dz = enemy.z - origin.z;
            const angle = Math.atan2(dx, dz) - heading;
            const score = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) + Math.hypot(dx, dz) * .05;
            if (score < best && canTarget(origin, enemy)) {
              best = score;
              target = enemy;
            }
          }
        }
      }
      return target;
    }
  };
}
