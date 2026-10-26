export function movePlayer(player, city, { keys, touch, mode, dt, firing, height }) {
  const touchStrength = Math.hypot(touch.x, touch.z);
  const x = touchStrength ? touch.x : Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const z = touchStrength ? touch.z : Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  const precise = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const maxSpeed = player.speed * (precise ? 0.4 : firing ? 0.7 : 1);
  let throttle = 0;

  if (mode === 'tank') {
    throttle = -z;
    const turnRate = precise ? 0.65 : firing ? 1.7 : 3.2;
    const targetTurnSpeed = -x * turnRate;
    if (targetTurnSpeed) {
      const decay = Math.exp(-18 * dt);
      player.heading += targetTurnSpeed * dt + (player.turnSpeed - targetTurnSpeed) * (1 - decay) / 18;
      player.turnSpeed = targetTurnSpeed + (player.turnSpeed - targetTurnSpeed) * decay;
    } else player.turnSpeed = 0;
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
    const target = player.targetHeading ?? player.heading;
    const angle = Math.atan2(Math.sin(target - player.heading), Math.cos(target - player.heading));
    player.heading = Math.abs(angle) < 0.0001 ? target : player.heading + angle * (1 - Math.exp(-16 * dt));
    player.turnSpeed = 0;
  }

  player.heading = Math.atan2(Math.sin(player.heading), Math.cos(player.heading));
  player.dx = Math.sin(player.heading);
  player.dz = Math.cos(player.heading);
  player.root.rotation.y = player.heading;

  const targetSpeed = throttle * maxSpeed;
  const damping = throttle ? 14 : 24;
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
