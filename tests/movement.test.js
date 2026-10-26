import assert from 'node:assert/strict';
import test from 'node:test';
import { movePlayer } from '../movement.js';

function setup({ mode = 'direct', heading = 0, codes = [], touch = { x: 0, z: 0 }, firing = false } = {}) {
  const player = { x: 0, z: 0, heading, turnSpeed: 0, moveSpeed: 0, speed: 3.6, radius: .5, runTime: 0, root: { rotation: {} } };
  const city = { move(entity, dx, dz) { entity.x += dx; entity.z += dz; } };
  const input = { mode, keys: new Set(codes), touch, firing, dt: 1 / 60, height: 3.45 };
  const step = (frames = 1) => { for (let i = 0; i < frames; i++) movePlayer(player, city, input); };
  return { player, city, input, step };
}

test('direct arrows move immediately while the character turns smoothly toward travel', () => {
  for (const [code, dx, dz] of [['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0], ['ArrowRight', 1, 0]]) {
    const { player, step } = setup({ heading: Math.atan2(-dx, -dz), codes: [code] });
    step();
    assert.ok(player.x * dx + player.z * dz > 0);
    assert.ok(Math.hypot(player.dx - dx, player.dz - dz) > .1, 'Facing does not snap to the requested direction');
    step(60);
    assert.ok(Math.abs(player.dx - dx) < 1e-10);
    assert.ok(Math.abs(player.dz - dz) < 1e-10);
  }
});

test('direct movement reverses on the first frame, including while firing', () => {
  const { player, input, step } = setup({ codes: ['KeyW'], firing: true });
  step(30);
  const before = player.z;
  input.keys = new Set(['KeyS']);
  step();
  assert.ok(player.z > before);
  assert.ok(player.dz < .99, 'Movement reverses before the smooth turn finishes');
  assert.equal(player.dx, Math.sin(player.heading));
  assert.equal(player.dz, Math.cos(player.heading));
  assert.equal(player.root.rotation.y, player.heading);
  step(60);
  assert.equal(player.dz, 1);
});

test('direct facing takes the short path across the angle boundary', () => {
  const heading = Math.PI - .02;
  const { player, step } = setup({ heading, touch: { x: Math.sin(-Math.PI + .02), z: Math.cos(-Math.PI + .02) } });
  step();
  const change = Math.atan2(Math.sin(player.heading - heading), Math.cos(player.heading - heading));
  assert.ok(change > 0 && change <= .04 + 1e-10);
  assert.ok(Math.abs(player.heading - (-Math.PI + .02)) < .0001);
});

test('direct turns finish at the same angle across frame rates, without aim drift', () => {
  const headings = [];
  for (const fps of [30, 60, 120]) {
    const { player, input, step } = setup({ codes: ['KeyD'] });
    input.dt = 1 / fps;
    step(fps / 30);
    headings.push(player.heading);
    input.keys.clear();
    step(fps / 2);
    assert.equal(player.heading, Math.PI / 2);
    step(fps);
    assert.equal(player.heading, Math.PI / 2);
  }
  assert.ok(Math.max(...headings) - Math.min(...headings) < 1e-10);
});

test('small joystick aim corrections reach the exact angle in one frame while firing', () => {
  for (const fps of [30, 60, 120]) {
    const angle = .05;
    const { player, input, step } = setup({ touch: { x: Math.sin(angle) * .25, z: Math.cos(angle) * .25 }, firing: true });
    input.dt = 1 / fps;
    step();
    assert.ok(Math.abs(player.heading - angle) < 1e-10);
    assert.equal(player.dx, Math.sin(player.heading));
    assert.equal(player.dz, Math.cos(player.heading));
  }
});

test('releasing Direct movement stops within eight centimetres at full speed', () => {
  const { player, input, step } = setup({ codes: ['KeyW'] });
  step(120);
  const before = player.z;
  input.keys.clear();
  step(60);
  assert.equal(player.moveSpeed, 0);
  const coast = Math.abs(player.z - before);
  assert.ok(coast > 0 && coast < .08);
});

test('direct diagonal movement has the same speed as cardinal movement and aliases do not stack', () => {
  const cardinal = setup({ codes: ['KeyD', 'ArrowRight'] });
  const diagonal = setup({ codes: ['KeyD', 'KeyW'] });
  cardinal.step(60); diagonal.step(60);
  assert.ok(Math.abs(Math.hypot(cardinal.player.x, cardinal.player.z) - Math.hypot(diagonal.player.x, diagonal.player.z)) < 1e-10);
});

test('direct joystick preserves analog speed and takes priority over keyboard input', () => {
  const slow = setup({ touch: { x: .25, z: 0 }, codes: ['KeyW'] });
  const fast = setup({ touch: { x: 1, z: 0 } });
  slow.step(60); fast.step(60);
  assert.ok(Math.abs(slow.player.x / fast.player.x - .25) < 1e-10);
  assert.ok(Math.abs(slow.player.z) < 1e-10);
});

test('Shift gives Direct keyboard controls precise rotation at arbitrary angles while spraying', () => {
  for (const [code, direction] of [['ArrowRight', -1], ['KeyD', -1], ['ArrowLeft', 1], ['KeyA', 1]]) {
    const { player, step } = setup({ codes: ['ShiftLeft', code], firing: true });
    step(30);
    assert.ok(Math.abs(player.heading - direction * .325) < 1e-10);
    assert.equal(player.x, 0);
    assert.equal(player.z, 0);
    assert.equal(player.dx, Math.sin(player.heading));
    assert.equal(player.dz, Math.cos(player.heading));
  }
});

test('releasing fine-aim keys preserves the exact chosen angle without snapping to a movement direction', () => {
  const { player, input, step } = setup({ heading: Math.PI, codes: ['ShiftRight', 'ArrowRight'] });
  step(17);
  const heading = player.heading;
  input.keys.delete('ArrowRight');
  step(20);
  input.keys.clear();
  step(60);
  assert.ok(Math.abs(player.heading - heading) < 1e-10);
  assert.equal(player.x, 0);
  assert.equal(player.z, 0);
});

test('entering fine aim stops travel and cancels any unfinished automatic turn', () => {
  const { player, input, step } = setup({ codes: ['ArrowUp'] });
  step(3);
  assert.ok(player.moveSpeed > 0);
  assert.ok(Math.abs(player.heading - Math.PI) > .1);
  const before = { x: player.x, z: player.z, heading: player.heading };
  input.keys = new Set(['ShiftLeft']);
  step(60);
  assert.equal(player.moveSpeed, 0);
  assert.equal(player.x, before.x);
  assert.equal(player.z, before.z);
  assert.ok(Math.abs(player.heading - before.heading) < 1e-10);
});

test('Shift up/down repositions slowly along the chosen aim without changing it', () => {
  for (const [code, direction] of [['ArrowUp', 1], ['ArrowDown', -1], ['KeyW', 1], ['KeyS', -1]]) {
    const heading = .37;
    const { player, step } = setup({ heading, codes: ['ShiftLeft', code] });
    step(60);
    assert.ok(Math.abs(player.heading - heading) < 1e-10);
    assert.ok(direction * (player.x * Math.sin(heading) + player.z * Math.cos(heading)) > 0);
    assert.ok(Math.abs(player.moveSpeed) <= player.speed * .4);
  }
});

test('releasing Shift restores normal directional movement and fine aim is frame-rate independent', () => {
  for (const fps of [30, 60, 120]) {
    const { player, input, step } = setup({ codes: ['ShiftLeft', 'ArrowRight'] });
    input.dt = 1 / fps;
    step(fps);
    assert.ok(Math.abs(player.heading + .65) < 1e-10);
    input.keys.delete('ShiftLeft');
    step();
    assert.ok(player.x > 0);
    assert.equal(player.moveX, 1);
    assert.equal(player.moveZ, 0);
  }
});

test('tank controls turn in place and back up without changing the facing direction', () => {
  const turn = setup({ mode: 'tank', codes: ['ArrowRight'] });
  turn.step(30);
  assert.ok(turn.player.heading < 0);
  assert.equal(turn.player.x, 0);
  assert.equal(turn.player.z, 0);
  turn.input.keys.clear();
  const heading = turn.player.heading;
  turn.step();
  assert.equal(turn.player.heading, heading);
  const reverse = setup({ mode: 'tank', heading: Math.PI, codes: ['KeyS'] });
  reverse.step(30);
  assert.ok(reverse.player.z > 0);
  assert.ok(Math.abs(reverse.player.heading - Math.PI) < 1e-10);
  assert.ok(reverse.player.moveSpeed < 0);
});

test('tank joystick can steer and move at the same time', () => {
  const { player, step } = setup({ mode: 'tank', touch: { x: .5, z: -.5 } });
  step(30);
  assert.ok(player.heading < 0);
  assert.ok(player.moveSpeed > 0);
  assert.ok(Math.hypot(player.x, player.z) > 0);
});

test('releasing input brakes to rest and both modes still use city collisions', () => {
  for (const mode of ['direct', 'tank']) {
    const { player, city, input, step } = setup({ mode, codes: ['KeyW'] });
    step(30);
    input.keys.clear(); step(60);
    assert.equal(player.moveSpeed, 0);
    const before = { x: player.x, z: player.z };
    city.move = () => {};
    input.keys.add('KeyW'); step();
    assert.deepEqual({ x: player.x, z: player.z }, before);
    assert.equal(player.moveSpeed, 0);
  }
});
