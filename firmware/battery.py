"""
INA219 battery monitor for Waveshare UPS HAT (C).
I2C bus 1, address 0x43 (A1=Vs, A0=Vs on the Waveshare board).
Shunt resistor: 0.1 Ω  →  current LSB = 100 µA after calibration.
"""

try:
    import smbus2
    _SMBUS_OK = True
except ImportError:
    _SMBUS_OK = False

I2C_BUS  = 1
I2C_ADDR = 0x43

_REG_CONFIG  = 0x00
_REG_SHUNT   = 0x01
_REG_BUS     = 0x02
_REG_CURRENT = 0x04
_REG_CAL     = 0x05

# 32 V range, PGA ±320 mV, 12-bit ADC, continuous — Waveshare's reference config
# for this HAT. Was 0x019F (16 V, ±40 mV), which caps current at 40mV/0.1Ω =
# 400 mA and then silently saturates: a Zero 2 W with WiFi TX and the DAC live
# draws well past that, so any reading taken under load was pinned, not measured.
# Changing PGA does not affect scaling — the current LSB comes from _CAL.
_CONFIG = 0x399F
# Cal = 0.04096 / (100e-6 * 0.1) = 4096
_CAL    = 4096

_bus = None


def _open():
    global _bus
    if _bus is not None:
        return _bus
    if not _SMBUS_OK:
        return None
    try:
        b = smbus2.SMBus(I2C_BUS)
        _wr(b, _REG_CONFIG, _CONFIG)
        _wr(b, _REG_CAL, _CAL)
        _bus = b
        return b
    except Exception:
        return None


def _wr(bus, reg, val):
    bus.write_i2c_block_data(I2C_ADDR, reg, [(val >> 8) & 0xFF, val & 0xFF])


def _rd(bus, reg):
    d = bus.read_i2c_block_data(I2C_ADDR, reg, 2)
    return (d[0] << 8) | d[1]


def get_battery_info():
    """
    Returns {'percent': 0-100, 'voltage': float, 'current_ma': float, 'charging': bool}
    or None if the HAT is not readable.
    """
    bus = _open()
    if bus is None:
        return None
    try:
        # Bus voltage: bits 15:3, LSB = 4 mV
        raw_v = _rd(bus, _REG_BUS)
        voltage = ((raw_v >> 3) & 0x1FFF) * 0.004

        # Current: signed 16-bit, LSB = 100 µA
        raw_i = _rd(bus, _REG_CURRENT)
        if raw_i > 32767:
            raw_i -= 65536
        current_ma = raw_i * 0.1

        # LiPo curve: 3.0 V = 0 %, 4.2 V = 100 %
        percent = int(max(0, min(100, (voltage - 3.0) / (4.2 - 3.0) * 100)))

        # Positive current = power flowing into battery = charging
        charging = current_ma > 50

        return {
            'percent': percent,
            'voltage': round(voltage, 3),
            'current_ma': round(current_ma, 1),
            'charging': charging,
        }
    except Exception:
        return None
