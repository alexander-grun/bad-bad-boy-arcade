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
  assert.ok(change > 0 && change < .04);
  step(60);
  assert.ok(Math.abs(player.heading - (-Math.PI + .02)) < .0001);
});

test('direct turn smoothing is independent of frame rate and settles after release', () => {
  const headings = [];
  for (const fps of [30, 60, 120]) {
    const { player, input, step } = setup({ codes: ['KeyD'] });
    input.dt = 1 / fps;
    step(fps / 5);
    headings.push(player.heading);
    const before = player.heading;
    input.keys.clear();
    step(fps / 2);
    assert.ok(player.heading > before);
    assert.ok(Math.abs(player.heading - Math.PI / 2) < .0001);
  }
  assert.ok(Math.max(...headings) - Math.min(...headings) < 1e-10);
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
