import assert from 'node:assert/strict';
import test from 'node:test';
import { createTouchControls } from '../touch-controls.js';

class Element extends EventTarget {
  hidden = false;
  style = {};
  classes = new Set();
  captures = new Set();
  classList = {
    add: name => this.classes.add(name),
    remove: name => this.classes.delete(name),
    toggle: (name, value) => value ? this.classes.add(name) : this.classes.delete(name)
  };
  getBoundingClientRect() { return { left: 10, top: 120 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    this.captures.delete(id);
    pointer(this, 'lostpointercapture', id);
  }
}

function pointer(element, type, pointerId = 1, clientX = 100, clientY = 200) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId, clientX, clientY, button: 0 });
  element.dispatchEvent(event);
}

function setup() {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  const zone = new Element(), stick = new Element(), thumb = new Element(), fireButton = new Element();
  zone.parentElement = new Element();
  let bursts = 0;
  const controls = createTouchControls({ zone, stick, thumb, fireButton, onFireStart: () => bursts++ });
  controls.setEnabled(true);
  return { controls, zone, stick, thumb, fireButton, bursts: () => bursts };
}

test('joystick starts under the finger, ignores jitter, and supports analog speed', () => {
  const { zone, stick, controls } = setup();
  pointer(zone, 'pointerdown');
  assert.equal(stick.hidden, false);
  assert.equal(stick.style.left, '90px');
  assert.equal(stick.style.top, '80px');
  pointer(zone, 'pointermove', 1, 103, 200);
  assert.equal(controls.input.x, 0);
  pointer(zone, 'pointermove', 1, 122, 200);
  assert.ok(controls.input.x > 0.2 && controls.input.x < 0.3);
  assert.equal(controls.input.z, 0);
});

test('joystick response gives more room for fine movement and still reaches full speed', () => {
  const { zone, controls } = setup();
  pointer(zone, 'pointerdown');
  let previous = 0;
  for (const distance of [6, 10, 16, 22, 30, 38, 44]) {
    pointer(zone, 'pointermove', 1, 100 + distance, 200);
    assert.ok(controls.input.x > previous);
    previous = controls.input.x;
    assert.equal(controls.input.z, 0);
    if (distance <= 16) assert.ok(controls.input.x < .15);
  }
  assert.equal(controls.input.x, 1);
});

test('long drags slide the base, cap diagonal speed, and allow immediate reversal', () => {
  const { zone, stick, controls } = setup();
  pointer(zone, 'pointerdown');
  pointer(zone, 'pointermove', 1, 300, 400);
  assert.ok(Math.abs(Math.hypot(controls.input.x, controls.input.z) - 1) < 1e-10);
  assert.ok(parseFloat(stick.style.left) > 200);
  pointer(zone, 'pointermove', 1, 220, 320);
  assert.ok(controls.input.x < 0 && controls.input.z < 0);
});

test('movement and spray keep separate pointers, including extra fingers and releases', () => {
  const { zone, controls, fireButton, bursts } = setup();
  pointer(zone, 'pointerdown');
  pointer(zone, 'pointermove', 1, 144, 200);
  pointer(fireButton, 'pointerdown', 2);
  pointer(fireButton, 'pointerdown', 3);
  pointer(fireButton, 'pointerup', 3);
  pointer(zone, 'pointerdown', 4);
  pointer(zone, 'pointermove', 4, 0, 0);
  pointer(zone, 'pointerup', 4);
  assert.equal(controls.input.x, 1);
  assert.equal(controls.input.firing, true);
  assert.equal(bursts(), 1);
  pointer(fireButton, 'pointerup', 2);
  assert.equal(controls.input.firing, false);
  assert.equal(controls.input.x, 1);
  pointer(fireButton, 'pointerdown', 5);
  pointer(zone, 'pointerup', 1);
  assert.equal(controls.input.x, 0);
  assert.equal(controls.input.firing, true);
});

test('release, cancellation, and lost capture clear movement and firing', () => {
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const { zone, stick, controls, fireButton } = setup();
    pointer(zone, 'pointerdown');
    pointer(zone, 'pointermove', 1, 100, 156);
    assert.equal(controls.input.z, -1);
    pointer(fireButton, 'pointerdown', 2);
    pointer(zone, event);
    pointer(fireButton, event, 2);
    assert.deepEqual(controls.input, { x: 0, z: 0, firing: false });
    assert.equal(stick.hidden, true);
    assert.equal(zone.captures.size, 0);
    assert.equal(fireButton.captures.size, 0);
  }
});

test('blur, resize, and backgrounding reset both controls', () => {
  for (const event of ['blur', 'resize', 'visibilitychange']) {
    const { zone, controls, fireButton } = setup();
    pointer(zone, 'pointerdown');
    pointer(zone, 'pointermove', 1, 144, 200);
    pointer(fireButton, 'pointerdown', 2);
    if (event === 'visibilitychange') {
      document.hidden = true;
      document.dispatchEvent(new Event(event));
    } else window.dispatchEvent(new Event(event));
    assert.deepEqual(controls.input, { x: 0, z: 0, firing: false });
  }
});

test('disabled controls ignore input and a new round starts cleanly', () => {
  const { zone, controls, fireButton, stick, bursts } = setup();
  pointer(zone, 'pointerdown');
  pointer(fireButton, 'pointerdown', 2);
  controls.setEnabled(false);
  pointer(zone, 'pointerdown', 3);
  pointer(fireButton, 'pointerdown', 4);
  assert.deepEqual(controls.input, { x: 0, z: 0, firing: false });
  assert.equal(stick.hidden, true);
  assert.equal(bursts(), 1);
  controls.setEnabled(true);
  pointer(zone, 'pointerdown', 5);
  assert.equal(stick.hidden, false);
});
