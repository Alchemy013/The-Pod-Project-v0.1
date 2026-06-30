# BLE UUIDs — must match protocol.ts
SERVICE_UUID     = '4fafc201-1fb5-459e-8fcc-c5c9c3319001'
COMMAND_UUID     = '4fafc201-1fb5-459e-8fcc-c5c9c3319002'
STATUS_UUID      = '4fafc201-1fb5-459e-8fcc-c5c9c3319003'
INFO_UUID        = '4fafc201-1fb5-459e-8fcc-c5c9c3319004'
BATTERY_UUID     = '4fafc201-1fb5-459e-8fcc-c5c9c3319005'

DEVICE_NAME      = 'ThePod'
MPD_HOST         = 'localhost'
MPD_PORT         = 6600
MUSIC_DIR        = '/var/lib/mpd/music'
MAX_CHUNK_BYTES  = 430   # 430 chars + ~75 byte envelope = ~505 bytes, under 512-byte iOS ATT limit
MAX_SAFE_BYTES   = 430   # send directly if encoded payload fits in one packet
