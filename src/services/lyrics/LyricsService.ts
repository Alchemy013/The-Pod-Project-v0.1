export interface LyricLine {
  time: number;
  text: string;
}

export type LyricsResult =
  | { status: 'found'; lines: LyricLine[] }
  | { status: 'not_found' }
  | { status: 'error' };

function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const line of lrc.split('\n')) {
    const m = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) continue;
    const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / (m[3].length === 2 ? 100 : 1000);
    const text = m[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

export async function fetchLyrics(
  title: string,
  artist: string,
  album: string,
  duration: number,
): Promise<LyricsResult> {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
      album_name: album,
      duration: String(Math.round(duration)),
    });
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://lrclib.net/api/get?${params}`, { signal: controller.signal });
    clearTimeout(t);
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'error' };
    const data = await res.json();
    if (!data.syncedLyrics) return { status: 'not_found' };
    const lines = parseLrc(data.syncedLyrics);
    if (lines.length === 0) return { status: 'not_found' };
    return { status: 'found', lines };
  } catch {
    return { status: 'error' };
  }
}
