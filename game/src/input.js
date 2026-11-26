// Keyboard and mouse input. Held keys and the mouse position become analogue axes; one-shot keys
// (confirm, pause, view, mute, restart) are queued as bit flags so a tap between frames is never lost.

export const ACT_CONFIRM = 1;
export const ACT_PAUSE = 2;
export const ACT_VIEW = 4;
export const ACT_MUTE = 8;
export const ACT_RESTART = 16;

const USED = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE',
  'KeyC', 'KeyP', 'KeyM', 'KeyR', 'Space', 'Enter', 'Escape',
]);

const DEADZONE = 0.13;

/** Mouse position in [-1, 1] with a soft dead zone and a little response curve. */
function axis(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= DEADZONE) return 0;
  const scaled = (magnitude - DEADZONE) / (1 - DEADZONE);
  return Math.sign(value) * scaled * (0.55 + scaled * 0.45);
}

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseLive = false;

  function onKeyDown(event) {
    if (!USED.has(event.code)) return;
    if (event.code === 'Enter') {
      if (!event.repeat) actions |= ACT_CONFIRM;
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      if (!event.repeat) actions |= ACT_PAUSE;
    } else if (event.code === 'KeyC') {
      if (!event.repeat) actions |= ACT_VIEW;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACT_MUTE;
    } else if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACT_RESTART;
    } else {
      keys.add(event.code);
    }
    event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    keys.clear();
    mouseLive = false;
  });
  window.addEventListener('mousemove', (event) => {
    mouseX = axis((event.clientX / window.innerWidth) * 2 - 1);
    mouseY = axis((event.clientY / window.innerHeight) * 2 - 1);
    if (mouseX !== 0 || mouseY !== 0) mouseLive = true;
  });
  window.addEventListener('mouseleave', () => {
    mouseLive = false;
  });

  // Clicking the 3D view is a second way to begin or resume; the caller decides where it applies.
  canvas.addEventListener('pointerdown', () => {
    actions |= ACT_CONFIRM;
  });

  return {
    /** Clear mouse steering after a screen change so the cursor used to click Start does not bank. */
    resetMouse() {
      mouseX = 0;
      mouseY = 0;
      mouseLive = false;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    axes() {
      const pitch = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0) + (mouseLive ? -mouseY : 0);
      const roll = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0) + (mouseLive ? mouseX : 0);
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        yaw: (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0),
        throttle: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
        brake: keys.has('Space'),
        mouse: mouseLive,
        mouseX: mouseLive ? mouseX : 0,
        mouseY: mouseLive ? mouseY : 0,
      };
    },
  };
}
