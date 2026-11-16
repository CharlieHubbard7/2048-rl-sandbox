// Everything the page remembers between visits lives under one key.
// Storage can be unavailable (private windows, blocked site data), in which
// case the game simply starts fresh each time.
const KEY = "twos:v1";

export function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Nothing to do: the current game keeps working, it just won't resume.
  }
}
