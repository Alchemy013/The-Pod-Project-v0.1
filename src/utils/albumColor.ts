// Hashed colour field: every album/artist gets a stable {bg, fg} pair and a
// single initial letter instead of real artwork until art actually loads.
const PALETTE = [
  { bg: '#32271b', fg: '#c68439' },
  { bg: '#321b2a', fg: '#c63995' },
  { bg: '#1b321c', fg: '#39c63e' },
  { bg: '#1b2032', fg: '#395ac6' },
  { bg: '#1b322e', fg: '#39c6ae' },
  { bg: '#1b3222', fg: '#39c663' },
] as const;

export function getAlbumColor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function getInitial(title: string) {
  return title.trim().charAt(0).toUpperCase() || '?';
}
