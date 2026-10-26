// Each control owns its pointer so moving and spraying work with two thumbs.
export function createTouchControls({ zone, stick, thumb, fireButton, onFireStart }) {
  const radius = 44;
  const deadzone = 0.12;
  const input = { x: 0, z: 0, firing: false };
  let enabled = false;
  let movePointer = null, firePointer = null;
  let originX = 0, originY = 0;

  function resetMove() {
    const pointer = movePointer;
    movePointer = null;
    input.x = input.z = 0;
    stick.hidden = true;
    thumb.style.transform = '';
    zone.classList.remove('engaged');
    if (pointer !== null && zone.hasPointerCapture(pointer)) zone.releasePointerCapture(pointer);
  }

  function resetFire() {
    const pointer = firePointer;
    firePointer = null;
    input.firing = false;
    fireButton.classList.remove('pressed');
    if (pointer !== null && fireButton.hasPointerCapture(pointer)) fireButton.releasePointerCapture(pointer);
  }

  function reset() {
    resetMove();
    resetFire();
  }

  function move(event) {
    if (event.pointerId !== movePointer) return;
    event.preventDefault();
    let dx = event.clientX - originX, dy = event.clientY - originY;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      // Slide the base after the thumb reaches its limit. Reversing direction
      // then responds immediately, even after a long drag across the screen.
      originX += dx * (1 - radius / distance);
      originY += dy * (1 - radius / distance);
      dx *= radius / distance;
      dy *= radius / distance;
    }
    const length = Math.min(distance, radius);
    const strength = Math.max(0, (length / radius - deadzone) / (1 - deadzone));
    input.x = length ? dx / length * strength : 0;
    input.z = length ? dy / length * strength : 0;
    const bounds = zone.getBoundingClientRect();
    stick.style.left = `${originX - bounds.left}px`;
    stick.style.top = `${originY - bounds.top}px`;
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  zone.addEventListener('pointerdown', event => {
    if (!enabled || movePointer !== null || event.button !== 0) return;
    event.preventDefault();
    movePointer = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    zone.setPointerCapture(movePointer);
    stick.hidden = false;
    zone.classList.add('engaged');
    move(event);
  });
  zone.addEventListener('pointermove', move);
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zone.addEventListener(name, event => {
      if (event.pointerId === movePointer) resetMove();
    });
    fireButton.addEventListener(name, event => {
      if (event.pointerId === firePointer) resetFire();
    });
  }

  fireButton.addEventListener('pointerdown', event => {
    if (!enabled || firePointer !== null || event.button !== 0) return;
    event.preventDefault();
    firePointer = event.pointerId;
    fireButton.setPointerCapture(firePointer);
    input.firing = true;
    fireButton.classList.add('pressed');
    onFireStart();
  });
  for (const element of [zone, fireButton]) {
    element.addEventListener('contextmenu', event => event.preventDefault());
  }
  window.addEventListener('blur', reset);
  window.addEventListener('resize', reset);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  });

  return {
    input,
    reset,
    setEnabled(value) {
      enabled = value;
      zone.parentElement.classList.toggle('enabled', value);
      reset();
    }
  };
}
