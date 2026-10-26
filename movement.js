const MANUAL_AIM_TURN_RATE = 3.2;

function turnPlayer(player, targetSpeed, dt) {
  if (!targetSpeed) {
    player.turnSpeed = 0;
    return;
  }
  // Respond to a direction change immediately, then ease into the new turn.
  if (player.turnSpeed * targetSpeed < 0) player.turnSpeed = 0;
  const decay = Math.exp(-18 * dt);
  player.heading += targetSpeed * dt + (player.turnSpeed - targetSpeed) * (1 - decay) / 18;
  player.turnSpeed = targetSpeed + (player.turnSpeed - targetSpeed) * decay;
}

export function movePlayer(player, city, { keys, touch, mode, dt, firing, height, resolveAim = null }) {
  const touchStrength = Math.hypot(touch.x, touch.z);
  const x = touchStrength ? touch.x : Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const z = touchStrength ? touch.z : Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  const precise = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const maxSpeed = player.speed * (precise ? 0.4 : firing ? 0.7 : 1);
  let throttle = 0;

  if (mode === 'direct' && precise && !touchStrength) {
    // Shift temporarily gives keyboard players continuous aim between the
    // eight movement directions. Releasing it keeps the chosen angle.
    turnPlayer(player, -x * MANUAL_AIM_TURN_RATE, dt);
    player.targetHeading = player.heading;
    player.moveX = Math.sin(player.heading);
    player.moveZ = Math.cos(player.heading);
    throttle = -z;
    if (!throttle) player.moveSpeed = 0;
  } else if (mode === 'tank') {
    throttle = -z;
    const turnRate = precise ? MANUAL_AIM_TURN_RATE : firing ? 1.7 : 3.2;
    turnPlayer(player, -x * turnRate, dt);
  } else {
    // Travel responds immediately; facing and aim ease toward the requested
    // direction independently, so smooth turns never hold movement back.
    if (x || z) {
      const length = Math.hypot(x, z);
      player.moveX = x / length;
      player.moveZ = z / length;
      player.targetHeading = Math.atan2(x, z);
      throttle = Math.min(1, length);
    }
    const requested = player.targetHeading ?? player.heading;
    const target = resolveAim?.(requested, dt) ?? requested;
    const angle = Math.atan2(Math.sin(target - player.heading), Math.cos(target - player.heading));
    // Small corrections reach their exact angle in one frame. Larger turns
    // stay smooth and finish in finite time instead of trailing the input.
    const turnStep = 14 * dt;
    player.heading = Math.abs(angle) <= turnStep ? target : player.heading + Math.sign(angle) * turnStep;
    player.turnSpeed = 0;
  }

  player.heading = Math.atan2(Math.sin(player.heading), Math.cos(player.heading));
  player.dx = Math.sin(player.heading);
  player.dz = Math.cos(player.heading);
  player.root.rotation.y = player.heading;

  const targetSpeed = throttle * maxSpeed;
  const damping = throttle ? 14 : mode === 'direct' ? 48 : 24;
  const decay = Math.exp(-damping * dt);
  const distance = targetSpeed * dt + (player.moveSpeed - targetSpeed) * (1 - decay) / damping;
  player.moveSpeed = targetSpeed + (player.moveSpeed - targetSpeed) * decay;
  if (!throttle && Math.abs(player.moveSpeed) < 0.015) player.moveSpeed = 0;
  const oldX = player.x, oldZ = player.z;
  const moveX = mode === 'tank' ? player.dx : player.moveX ?? player.dx;
  const moveZ = mode === 'tank' ? player.dz : player.moveZ ?? player.dz;
  city.move(player, moveX * distance, moveZ * distance, player.radius);
  const travelled = Math.hypot(player.x - oldX, player.z - oldZ);
  if (Math.abs(distance) > 0.0001 && travelled < Math.abs(distance) * 0.1) player.moveSpeed = 0;
  player.runTime += Math.sign(distance) * travelled * Math.PI * 2 / (height * 0.45);
  return travelled > 0.0001;
}
