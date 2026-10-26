import assert from 'node:assert/strict';
import test from 'node:test';
import { createAimAssist } from '../aim-assist.js';
import { movePlayer } from '../movement.js';

const origin = { x: 0, z: 0 };
function enemy(degrees, distance = 4) {
  const angle = degrees * Math.PI / 180;
  return { alive: true, x: Math.sin(angle) * distance, z: Math.cos(angle) * distance };
}

test('acquires nearby enemies in front and ignores dead, distant, and rear targets', () => {
  const assist = createAimAssist(() => true);
  const front = enemy(20);
  const targets = [enemy(180), enemy(0, 20), { ...enemy(0), alive: false }, enemy(40), front];
  assert.equal(assist.update(origin, 0, targets, 1 / 60), front);
});

test('blocked enemies are skipped and a newly blocked lock is released', () => {
  const blocked = enemy(0), clear = enemy(15);
  const walls = new Set([blocked]);
  const assist = createAimAssist((_, target) => !walls.has(target));
  assert.equal(assist.update(origin, 0, [blocked, clear], .1), clear);
  walls.add(clear);
  assert.equal(assist.update(origin, 0, [blocked, clear], .11), null);
});

test('retains a valid target even when another enemy becomes a better match', () => {
  const assist = createAimAssist(() => true);
  const first = enemy(20), newcomer = enemy(0, 1);
  assert.equal(assist.update(origin, 0, [first], .1), first);
  for (let i = 0; i < 120; i++) assert.equal(assist.update(origin, 0, [newcomer, first], 1 / 60), first);
});

test('retention tolerates small angle changes but cannot creep around behind the player', () => {
  const assist = createAimAssist(() => true);
  const target = enemy(24);
  assert.equal(assist.update(origin, 0, [target], .1), target);
  Object.assign(target, enemy(30));
  assert.equal(assist.update(origin, 0, [target], .1), target);
  Object.assign(target, enemy(36));
  assert.equal(assist.update(origin, 0, [target], .1), null);
  assert.equal(assist.update(origin, 0, [target], .1), null);
});

test('releases dead or removed targets immediately and reset clears acquisition state', () => {
  const assist = createAimAssist(() => true);
  const first = enemy(0), second = enemy(10);
  assist.update(origin, 0, [first, second], .01);
  first.alive = false;
  assert.equal(assist.update(origin, 0, [first, second], .001), second);
  assert.equal(assist.update(origin, 0, [], .001), null);
  assist.reset();
  assert.equal(assist.target, null);
  assert.equal(assist.update(origin, 0, [second], 0), second);
});

test('turning away releases the old target and acquisition handles angle wrapping', () => {
  const assist = createAimAssist(() => true);
  const target = enemy(-179);
  assert.equal(assist.update(origin, 179 * Math.PI / 180, [target], .1), target);
  assert.equal(assist.update(origin, 0, [target], .01), null);
});

test('obstruction checks on an unchanged target are batched rather than repeated every frame', () => {
  let checks = 0;
  const assist = createAimAssist(() => { checks++; return true; });
  const target = enemy(10);
  for (let i = 0; i < 120; i++) assist.update(origin, 0, [target], 1 / 120);
  assert.ok(checks >= 8 && checks <= 11);
});

test('assisted aim does not redirect movement or overwrite the requested direction', () => {
  const assist = createAimAssist(() => true);
  const target = enemy(20);
  const player = { x: 0, z: 0, heading: 0, turnSpeed: 0, moveSpeed: 0, speed: 3.6, radius: .5, runTime: 0, root: { rotation: {} } };
  const city = { move(p, x, z) { p.x += x; p.z += z; } };
  const input = {
    keys: new Set(['ArrowDown']), touch: { x: 0, z: 0 }, mode: 'direct', dt: 1 / 60, firing: true, height: 3.45,
    resolveAim(heading, dt) {
      const selected = assist.update(player, heading, [target], dt);
      return selected ? Math.atan2(selected.x - player.x, selected.z - player.z) : null;
    }
  };
  for (let i = 0; i < 30; i++) movePlayer(player, city, input);
  assert.ok(player.z > 0);
  assert.equal(player.x, 0);
  assert.equal(player.targetHeading, 0);
  assert.ok(player.heading > 0 && player.heading < Math.PI / 4);
  assert.equal(player.dx, Math.sin(player.heading));
});

test('Tank and Shift fine aim bypass automatic targeting', () => {
  for (const mode of ['direct', 'tank']) {
    const player = { x: 0, z: 0, heading: 0, turnSpeed: 0, moveSpeed: 0, speed: 3.6, radius: .5, runTime: 0, root: { rotation: {} } };
    movePlayer(player, { move() {} }, {
      keys: new Set(mode === 'direct' ? ['ShiftLeft', 'ArrowRight'] : ['ArrowRight']), touch: { x: 0, z: 0 },
      mode, dt: 1 / 60, firing: true, height: 3.45,
      resolveAim() { assert.fail('Manual modes must not invoke automatic targeting'); }
    });
    assert.ok(player.heading < 0);
  }
});
