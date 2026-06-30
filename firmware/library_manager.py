import hashlib
import os
from mpd_controller import MPDController


def _make_id(*parts: str) -> str:
    return hashlib.md5(':'.join(parts).encode()).hexdigest()


def _parse_duration(raw) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def _parse_int(raw, default=0) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def build_library(mpd: MPDController) -> dict:
    raw_songs = mpd.get_all_songs()

    songs_by_id = {}
    albums_by_id = {}
    artists_by_id = {}

    for entry in raw_songs:
        if 'file' not in entry:
            continue

        file_path = entry.get('file', '')
        title = entry.get('title', os.path.splitext(os.path.basename(file_path))[0])
        artist_name = entry.get('artist', 'Unknown Artist')
        album_title = entry.get('album', 'Unknown Album')
        year = _parse_int(entry.get('date', '0')[:4] if entry.get('date') else '0')
        genre = entry.get('genre', '')
        track = _parse_int(entry.get('track', '0').split('/')[0])
        disc = _parse_int(entry.get('disc', '1').split('/')[0])
        duration = _parse_duration(entry.get('duration', entry.get('time', 0)))
        fmt = os.path.splitext(file_path)[1].lstrip('.').lower()

        artist_id = _make_id(artist_name)
        album_id = _make_id(artist_name, album_title)
        song_id = _make_id(file_path)

        song = {
            'id': song_id,
            'title': title,
            'artist': artist_name,
            'album': album_title,
            'albumId': album_id,
            'artistId': artist_id,
            'duration': duration,
            'trackNumber': track,
            'discNumber': disc,
            'genre': genre,
            'year': year,
            'format': fmt,
            'bitrate': _parse_int(entry.get('bitrate', 0)),
            'sampleRate': 0,
            'bitDepth': 0,
            'fileSize': 0,
            'path': file_path,
        }
        songs_by_id[song_id] = song

        if album_id not in albums_by_id:
            albums_by_id[album_id] = {
                'id': album_id,
                'title': album_title,
                'artist': artist_name,
                'artistId': artist_id,
                'year': year,
                'genre': genre,
                'songCount': 0,
                'duration': 0.0,
                'songs': [],
            }
        albums_by_id[album_id]['songs'].append(song)
        albums_by_id[album_id]['duration'] += duration
        albums_by_id[album_id]['songCount'] += 1

        if artist_id not in artists_by_id:
            artists_by_id[artist_id] = {
                'id': artist_id,
                'name': artist_name,
                'albumCount': 0,
                'songCount': 0,
                'albums': [],
            }
        artists_by_id[artist_id]['songCount'] += 1

    for album in albums_by_id.values():
        album['songs'].sort(key=lambda s: (s['discNumber'], s['trackNumber']))
        artist_id = album['artistId']
        if album not in artists_by_id[artist_id]['albums']:
            artists_by_id[artist_id]['albums'].append(album)
            artists_by_id[artist_id]['albumCount'] += 1

    for artist in artists_by_id.values():
        artist['albums'].sort(key=lambda a: a['year'])

    albums = sorted(albums_by_id.values(), key=lambda a: a['title'].lower())
    artists = sorted(artists_by_id.values(), key=lambda a: a['name'].lower())
    songs = sorted(songs_by_id.values(), key=lambda s: s['title'].lower())

    return {'albums': albums, 'artists': artists, 'songs': songs}
