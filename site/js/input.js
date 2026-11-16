import { DOWN, LEFT, RIGHT, UP } from "./engine.js";

const KEYS = {
  arrowup: UP,
  arrowdown: DOWN,
  arrowleft: LEFT,
  arrowright: RIGHT,
  w: UP,
  s: DOWN,
  a: LEFT,
  d: RIGHT,
};

const MIN_SWIPE_PX = 24;

export function onKeyboardMove(handler) {
  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest("select, input, textarea, dialog[open]")) return;
    const dir = KEYS[event.key.toLowerCase()];
    if (dir === undefined) return;
    event.preventDefault();
    handler(dir);
  });
}

// Pointer events cover touch, pen and mouse drags with one code path.
export function onSwipe(element, handler) {
  let start = null;
  element.addEventListener("pointerdown", (event) => {
    if (event.isPrimary) start = { x: event.clientX, y: event.clientY };
  });
  element.addEventListener("pointerup", (event) => {
    if (!start || !event.isPrimary) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < MIN_SWIPE_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) handler(dx > 0 ? RIGHT : LEFT);
    else handler(dy > 0 ? DOWN : UP);
  });
  element.addEventListener("pointercancel", () => (start = null));
}
