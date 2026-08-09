// Every record gets one stable hue derived from its id/title. The v2 design
// bleeds that hue into album, playlist and player headers ("colour wash"), so
// a single number drives the art block, the header gradient and the accent
// ring — no artwork required, and real art just layers on top when it lands.
export function hueFor(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % 360;
}

/** Saturated line colour — the ring inside art blocks, genre tiles. */
export const ringColor = (hue: number) => `hsl(${hue}, 44%, 54%)`;
/** Darkest step of the art gradient. */
export const tintColor = (hue: number) => `hsl(${hue}, 28%, 11%)`;
/** Lightest step — also the top colour of a header wash. */
export const washColor = (hue: number) => `hsl(${hue}, 38%, 20%)`;

export function getInitial(title: string) {
  return title.trim().charAt(0).toUpperCase() || '?';
}
