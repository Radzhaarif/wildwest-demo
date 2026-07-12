const DEBUG_SEED_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DEBUG_SEED_LENGTH = 16;

export function createDebugSeed(random = Math.random) {
  let seed = "";
  for (let index = 0; index < DEBUG_SEED_LENGTH; index += 1) {
    seed += DEBUG_SEED_ALPHABET[Math.floor(random() * DEBUG_SEED_ALPHABET.length)];
  }
  return seed;
}

export function normalizeDebugSeed(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return normalized.length === DEBUG_SEED_LENGTH ? normalized : null;
}

export function deriveDebugSeed(seed, ...parts) {
  // deriveDebugSeed дает независимые deterministic streams от одного run seed:
  // map, battle, rewards и dialog payloads не должны расходовать общий счетчик.
  return createDebugSeed(createSeededRandom([seed, ...parts].join(":")));
}

export function createSeededRandom(seed) {
  return sfc32(...hashStringToUint32s(String(seed)));
}

function hashStringToUint32s(source) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;

    const result = (a + b + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = ((c << 21) | (c >>> 11)) | 0;
    c = (c + result) | 0;

    return (result >>> 0) / 4294967296;
  };
}
