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
    // Direction changes apply immediately to movement and the stream, including
    // full reversals. There is no wait for the character to turn before moving.
    if (x || z) {
      player.heading = Math.atan2(x, z);
      throttle = Math.min(1, Math.hypot(x, z));
    }
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
  city.move(player, player.dx * distance, player.dz * distance, player.radius);
  const travelled = Math.hypot(player.x - oldX, player.z - oldZ);
  if (Math.abs(distance) > 0.0001 && travelled < Math.abs(distance) * 0.1) player.moveSpeed = 0;
  player.runTime += Math.sign(distance) * travelled * Math.PI * 2 / (height * 0.45);
  return travelled > 0.0001;
}
