// mulberry32: a tiny seeded PRNG with a single 32-bit state.
//
// Your board and the AI's board each get a generator built from the same
// seed, so the n-th tile spawn on both boards uses the same random draws.
// Saving `state` and passing it back in resumes the sequence exactly.
export function createRng(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    },
    get state() {
      return state;
    },
  };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
