import ctypes
import json
import socket
import struct
import uuid as uuidlib

import dbus
import dbus.mainloop.glib
import dbus.service
from gi.repository import GLib
from config import (
    SERVICE_UUID, COMMAND_UUID, STATUS_UUID, INFO_UUID, BATTERY_UUID, DEVICE_NAME
)

BLUEZ_SVC            = 'org.bluez'
GATT_MGR_IFACE       = 'org.bluez.GattManager1'
GATT_SVC_IFACE       = 'org.bluez.GattService1'
GATT_CHAR_IFACE      = 'org.bluez.GattCharacteristic1'
DBUS_OM_IFACE        = 'org.freedesktop.DBus.ObjectManager'
DBUS_PROP_IFACE      = 'org.freedesktop.DBus.Properties'
LE_ADV_MGR_IFACE     = 'org.bluez.LEAdvertisingManager1'
LE_ADV_IFACE         = 'org.bluez.LEAdvertisement1'
AGENT_IFACE          = 'org.bluez.Agent1'
AGENT_MGR_IFACE      = 'org.bluez.AgentManager1'

# --- Legacy MGMT advertising fallback ---------------------------------------
# BlueZ 5.82's LEAdvertisingManager1.RegisterAdvertisement is broken against
# kernel 6.18 on this box, and it fails for *any* payload — even an empty one,
# so this is not the 31-byte budget problem that bit us before. BlueZ picks the
# extended-advertising MGMT path and sends Add Extended Advertising Data
# (0x0055) with a parameter block 8 bytes longer than the lengths it declares:
# it writes the 11-byte mgmt_cp_add_advertising header where the kernel parses
# the 3-byte mgmt_cp_add_ext_adv_data one. The kernel enforces
#   data_len == 3 + adv_data_len + scan_rsp_len
# and rejects with Invalid Parameters (0x0d), leaving the Pod completely
# invisible to CoreBluetooth while systemd still reports the service active.
# Observed as plen 11 vs 3 (empty) and plen 37 vs 29 (real payload).
#
# The BCM43430B0 is HCI 4.2 and has no extended advertising at all, so nothing
# is lost by using the legacy Add Advertising (0x003e) opcode, which this
# controller accepts. There is no BlueZ update available to fix the D-Bus path
# (5.82 is the newest in both Debian trixie and archive.raspberrypi.com), so
# the fallback below drives MGMT directly.
#
# Two constraints that are easy to get wrong:
#  * The advertising instance is owned by the MGMT socket that created it, so
#    _mgmt_sock is kept alive for the life of the process. Closing it — or
#    letting it get garbage collected — silently stops the advertisement.
#  * CPython 3.13's AF_BLUETOOTH binder only accepts a 1-tuple and hardcodes
#    HCI_CHANNEL_RAW, so there is no way to reach HCI_CHANNEL_CONTROL through
#    socket.bind(). We bind through libc with a packed sockaddr_hci instead.
# Do not "simplify" this to btmgmt: instances die with that process, and
# `btmgmt add-adv --help` hangs on this box.
MGMT_OP_SET_CONNECTABLE = 0x0007
MGMT_OP_ADD_ADVERTISING = 0x003E
MGMT_EV_CMD_COMPLETE    = 0x0001
MGMT_EV_CMD_STATUS      = 0x0002
HCI_DEV_NONE            = 0xFFFF
HCI_CHANNEL_CONTROL     = 3
MGMT_ADV_FLAG_CONNECTABLE = 1 << 0
MGMT_ADV_FLAG_DISCOV      = 1 << 1

AD_TYPE_UUID128_COMPLETE = 0x07
AD_TYPE_NAME_COMPLETE    = 0x09

_mgmt_sock = None


def _adv_payload():
    """Build (adv_data, scan_rsp) as raw AD structures for MGMT Add Advertising.

    The kernel prepends the Flags AD itself when MGMT_ADV_FLAG_DISCOV is set,
    which is why we must not add one here (and why the adv budget is 28, not
    31). 128-bit UUIDs go on the wire least-significant byte first.
    """
    uuid_le = uuidlib.UUID(SERVICE_UUID).bytes[::-1]
    adv_data = bytes([len(uuid_le) + 1, AD_TYPE_UUID128_COMPLETE]) + uuid_le
    name = DEVICE_NAME.encode('utf-8')
    scan_rsp = bytes([len(name) + 1, AD_TYPE_NAME_COMPLETE]) + name
    return adv_data, scan_rsp


def _mgmt_request(sock, opcode, hci_index, params, what):
    """Send one MGMT command and block until its completion event arrives."""
    sock.sendall(struct.pack('<HHH', opcode, hci_index, len(params)) + params)
    sock.settimeout(5)
    while True:
        pkt = sock.recv(1024)
        event, index, plen = struct.unpack('<HHH', pkt[:6])
        body = pkt[6:6 + plen]
        if index != hci_index or len(body) < 3:
            continue
        if event not in (MGMT_EV_CMD_COMPLETE, MGMT_EV_CMD_STATUS):
            continue
        if struct.unpack('<H', body[:2])[0] != opcode:
            continue
        if body[2] != 0:
            raise OSError(f'MGMT {what} rejected: 0x{body[2]:02x}')
        return


def _advertise_via_mgmt(hci_index):
    """Register a connectable advertisement over the legacy MGMT opcode."""
    global _mgmt_sock

    adv_data, scan_rsp = _adv_payload()
    params = struct.pack(
        '<BIHHBB',
        1,                                                     # instance
        MGMT_ADV_FLAG_CONNECTABLE | MGMT_ADV_FLAG_DISCOV,      # flags
        0, 0,                                                  # duration, timeout
        len(adv_data), len(scan_rsp),
    ) + adv_data + scan_rsp

    sock = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_RAW, socket.BTPROTO_HCI)
    try:
        libc = ctypes.CDLL('libc.so.6', use_errno=True)
        sockaddr_hci = struct.pack(
            '<HHH', socket.AF_BLUETOOTH, HCI_DEV_NONE, HCI_CHANNEL_CONTROL
        )
        if libc.bind(sock.fileno(), sockaddr_hci, len(sockaddr_hci)) != 0:
            raise OSError(ctypes.get_errno(), 'bind to MGMT control channel failed')

        # Claim connectability explicitly, and do it *before* adding the
        # instance. bluetoothd only keeps the adapter connectable while it
        # believes something needs it — a registered D-Bus advertisement or a
        # discoverable adapter. Ours is registered behind its back over MGMT
        # and `_set_discoverable` turns both `Discoverable` and `Pairable` off,
        # so bluetoothd concludes nothing needs connections and issues
        # Set Connectable(off). The kernel then downgrades LE advertising from
        # ADV_IND to **ADV_SCAN_IND** and switches to a random address.
        # That failure is vicious because the Pod still looks perfectly healthy:
        # iOS discovers it, shows the right name and a strong RSSI, and then
        # every connect times out after ~10s having never sent a CONNECT_IND,
        # with *zero* HCI events on the Pi to show for it. Do not drop this
        # call, and do not rely on `Discoverable=True` to imply it.
        _mgmt_request(sock, MGMT_OP_SET_CONNECTABLE, hci_index, b'\x01',
                      'Set Connectable')
        _mgmt_request(sock, MGMT_OP_ADD_ADVERTISING, hci_index, params,
                      'Add Advertising')
    except Exception:
        sock.close()
        raise

    # Held for the process lifetime — the instance dies with the socket.
    _mgmt_sock = sock


class AutoPairAgent(dbus.service.Object):
    PATH = '/org/thepod/agent'

    def __init__(self, bus):
        dbus.service.Object.__init__(self, bus, self.PATH)

    @dbus.service.method(AGENT_IFACE)
    def Release(self): pass

    @dbus.service.method(AGENT_IFACE, in_signature='o')
    def RequestAuthorization(self, device): pass

    @dbus.service.method(AGENT_IFACE, in_signature='os')
    def AuthorizeService(self, device, uuid): pass

    @dbus.service.method(AGENT_IFACE, in_signature='o', out_signature='u')
    def RequestPasskey(self, device): return dbus.UInt32(0)

    @dbus.service.method(AGENT_IFACE, in_signature='ou')
    def RequestConfirmation(self, device, passkey): pass

    @dbus.service.method(AGENT_IFACE, in_signature='o', out_signature='s')
    def RequestPinCode(self, device): return '0000'

    @dbus.service.method(AGENT_IFACE)
    def Cancel(self): pass


class ThePodApplication(dbus.service.Object):
    PATH = '/'

    def __init__(self, bus, command_handler):
        dbus.service.Object.__init__(self, bus, self.PATH)
        self.service = ThePodService(bus, command_handler)

    @dbus.service.method(DBUS_OM_IFACE, out_signature='a{oa{sa{sv}}}')
    def GetManagedObjects(self):
        objects = {}
        objects.update(self.service.get_managed_objects())
        return objects


class ThePodService(dbus.service.Object):
    PATH = '/org/thepod/service0'

    def __init__(self, bus, command_handler):
        dbus.service.Object.__init__(self, bus, self.PATH)
        self.command_char = CommandCharacteristic(bus, self.PATH, command_handler)
        self.status_char  = StatusCharacteristic(bus, self.PATH)
        self.info_char    = InfoCharacteristic(bus, self.PATH)
        self.battery_char = BatteryCharacteristic(bus, self.PATH)
        command_handler._send = self.status_char.send_notification

    def get_managed_objects(self):
        objects = {}
        objects[dbus.ObjectPath(self.PATH)] = {
            GATT_SVC_IFACE: {
                'UUID': dbus.String(SERVICE_UUID),
                'Primary': dbus.Boolean(True),
                'Characteristics': dbus.Array([
                    dbus.ObjectPath(self.command_char.path),
                    dbus.ObjectPath(self.status_char.path),
                    dbus.ObjectPath(self.info_char.path),
                    dbus.ObjectPath(self.battery_char.path),
                ], signature='o'),
            }
        }
        for char in [self.command_char, self.status_char, self.info_char, self.battery_char]:
            objects[dbus.ObjectPath(char.path)] = char.get_properties()
        return objects

    @dbus.service.method(DBUS_PROP_IFACE, in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        if interface == GATT_SVC_IFACE:
            return {
                'UUID': dbus.String(SERVICE_UUID),
                'Primary': dbus.Boolean(True),
            }
        raise dbus.exceptions.DBusException('org.bluez.Error.InvalidArguments')


class BaseCharacteristic(dbus.service.Object):
    def __init__(self, bus, service_path, char_index, uuid, flags):
        self.path = f'{service_path}/char{char_index}'
        self.service_path = service_path
        self.uuid = uuid
        self.flags = flags
        self.notifying = False
        dbus.service.Object.__init__(self, bus, self.path)

    def get_properties(self):
        return {
            GATT_CHAR_IFACE: {
                'Service': dbus.ObjectPath(self.service_path),
                'UUID': dbus.String(self.uuid),
                'Flags': dbus.Array(self.flags, signature='s'),
            }
        }

    @dbus.service.method(DBUS_PROP_IFACE, in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        if interface == GATT_CHAR_IFACE:
            return self.get_properties()[GATT_CHAR_IFACE]
        raise dbus.exceptions.DBusException('org.bluez.Error.InvalidArguments')

    @dbus.service.method(GATT_CHAR_IFACE, in_signature='a{sv}', out_signature='ay')
    def ReadValue(self, options):
        return []

    @dbus.service.method(GATT_CHAR_IFACE, in_signature='aya{sv}')
    def WriteValue(self, value, options):
        pass

    @dbus.service.method(GATT_CHAR_IFACE)
    def StartNotify(self):
        self.notifying = True
        print(f'[GATT] StartNotify: {self.uuid}')

    @dbus.service.method(GATT_CHAR_IFACE)
    def StopNotify(self):
        self.notifying = False
        print(f'[GATT] StopNotify: {self.uuid}')

    @dbus.service.signal(DBUS_PROP_IFACE, signature='sa{sv}as')
    def PropertiesChanged(self, interface, changed, invalidated):
        pass

    def _notify(self, value_bytes: bytes):
        if self.notifying:
            self.PropertiesChanged(
                GATT_CHAR_IFACE,
                {'Value': dbus.Array([dbus.Byte(b) for b in value_bytes], signature='y')},
                [],
            )


class CommandCharacteristic(BaseCharacteristic):
    def __init__(self, bus, service_path, command_handler):
        super().__init__(bus, service_path, 0, COMMAND_UUID, ['write'])
        self._handler = command_handler

    @dbus.service.method(GATT_CHAR_IFACE, in_signature='aya{sv}')
    def WriteValue(self, value, options):
        raw = bytes(value).decode('utf-8')
        print(f'[GATT] Command received: {raw}')
        self._handler.handle(raw)


class StatusCharacteristic(BaseCharacteristic):
    def __init__(self, bus, service_path):
        super().__init__(bus, service_path, 1, STATUS_UUID, ['notify'])

    def send_notification(self, data: dict):
        payload = json.dumps(data).encode('utf-8')
        self._notify(payload)


class InfoCharacteristic(BaseCharacteristic):
    def __init__(self, bus, service_path):
        super().__init__(bus, service_path, 2, INFO_UUID, ['read'])

    @dbus.service.method(GATT_CHAR_IFACE, in_signature='a{sv}', out_signature='ay')
    def ReadValue(self, options):
        info = json.dumps({'name': DEVICE_NAME, 'firmwareVersion': '1.0.0'})
        return [dbus.Byte(b) for b in info.encode('utf-8')]


class BatteryCharacteristic(BaseCharacteristic):
    def __init__(self, bus, service_path):
        super().__init__(bus, service_path, 3, BATTERY_UUID, ['read', 'notify'])

    @dbus.service.method(GATT_CHAR_IFACE, in_signature='a{sv}', out_signature='ay')
    def ReadValue(self, options):
        data = json.dumps({'percent': 100, 'charging': True, 'minutesRemaining': None})
        return [dbus.Byte(b) for b in data.encode('utf-8')]


class ThePodAdvertisement(dbus.service.Object):
    PATH = '/org/thepod/advertisement0'

    def __init__(self, bus):
        dbus.service.Object.__init__(self, bus, self.PATH)

    @dbus.service.method(DBUS_PROP_IFACE, in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        if interface != LE_ADV_IFACE:
            raise dbus.exceptions.DBusException('org.bluez.Error.InvalidArguments')
        # Legacy LE advertising has a hard 31-byte payload limit and this
        # controller has no extended advertising. Budget:
        #   flags 3 + 128-bit ServiceUUIDs 18 + LocalName "ThePod" 8 = 29.
        # Adding 'Includes': ['tx-power'] costs 3 more = 32, one byte over, and
        # BlueZ rejects the whole registration with org.bluez.Error.Failed —
        # which leaves the Pod BR/EDR-discoverable (so it still shows in iOS
        # Settings) but invisible to CoreBluetooth, i.e. to the app. Nothing
        # reads tx-power: signal bars come from RSSI measured by the phone.
        return {
            'Type': dbus.String('peripheral'),
            'LocalName': dbus.String(DEVICE_NAME),
            'ServiceUUIDs': dbus.Array([dbus.String(SERVICE_UUID)], signature='s'),
        }

    @dbus.service.method(LE_ADV_IFACE)
    def Release(self):
        print('[ADV] Released')


def find_adapter(bus):
    remote_om = dbus.Interface(bus.get_object(BLUEZ_SVC, '/'), DBUS_OM_IFACE)
    objects = remote_om.GetManagedObjects()
    for path, props in objects.items():
        if GATT_MGR_IFACE in props and LE_ADV_MGR_IFACE in props:
            return path
    return None


def _set_discoverable(bus, adapter_path):
    adapter_props = dbus.Interface(
        bus.get_object(BLUEZ_SVC, adapter_path),
        DBUS_PROP_IFACE
    )
    try:
        adapter_props.Set('org.bluez.Adapter1', 'Alias', dbus.String(DEVICE_NAME))

        # BR/EDR discoverable + pairable is deliberately OFF. It is a separate
        # path from LE advertising (which RegisterAdvertisement handles, and
        # which is the only thing CoreBluetooth sees), so turning it off costs
        # the app nothing. Leaving it on is what made iOS show its "ThePod
        # would like to pair" dialog on every connect: a permanently pairable
        # classic device invites a bond the protocol never asks for. No
        # characteristic in this service uses encrypt-*/secure-* flags, so
        # there is nothing here that requires an encrypted link — and an
        # unbonded BLE peripheral still auto-reconnects by identifier.
        adapter_props.Set('org.bluez.Adapter1', 'Discoverable', dbus.Boolean(False))
        adapter_props.Set('org.bluez.Adapter1', 'Pairable', dbus.Boolean(False))
        print(f'[ADV] Adapter alias "{DEVICE_NAME}" (BR/EDR pairing disabled)')
    except Exception as e:
        print(f'[ADV] Warning: could not configure adapter: {e}')


def start_server(command_handler):
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()
    adapter_path = find_adapter(bus)

    if not adapter_path:
        raise RuntimeError('No Bluetooth adapter found with GATT + LE advertising support')

    print('[GATT] Bluetooth adapter ready')

    app = ThePodApplication(bus, command_handler)

    gatt_mgr = dbus.Interface(bus.get_object(BLUEZ_SVC, adapter_path), GATT_MGR_IFACE)

    gatt_mgr.RegisterApplication(
        dbus.ObjectPath(app.PATH), {},
        reply_handler=lambda: print('[GATT] Application registered'),
        error_handler=lambda e: print(f'[GATT] Registration error: {e}'),
    )

    # Register advertisement via D-Bus — works headless, no btmgmt/TTY needed.
    # This is the preferred path and stays first so that a fixed BlueZ is used
    # automatically; on this box it fails and we fall back to raw MGMT. See the
    # long comment on _advertise_via_mgmt for why.
    hci_index = int(adapter_path.rsplit('hci', 1)[1])

    def _on_adv_error(e):
        print(f'[ADV] D-Bus advertisement failed ({e})')
        try:
            _advertise_via_mgmt(hci_index)
            print('[ADV] Advertisement registered (legacy MGMT fallback)')
        except Exception as exc:
            print(f'[ADV] Legacy MGMT advertising ALSO failed: {exc} — '
                  f'the Pod will be invisible to the app')

    adv = ThePodAdvertisement(bus)
    adv_mgr = dbus.Interface(bus.get_object(BLUEZ_SVC, adapter_path), LE_ADV_MGR_IFACE)
    adv_mgr.RegisterAdvertisement(
        dbus.ObjectPath(ThePodAdvertisement.PATH), {},
        reply_handler=lambda: print('[ADV] Advertisement registered'),
        error_handler=_on_adv_error,
    )

    agent = AutoPairAgent(bus)
    agent_mgr = dbus.Interface(bus.get_object(BLUEZ_SVC, '/org/bluez'), AGENT_MGR_IFACE)
    agent_mgr.RegisterAgent(dbus.ObjectPath(AutoPairAgent.PATH), 'NoInputNoOutput')
    agent_mgr.RequestDefaultAgent(dbus.ObjectPath(AutoPairAgent.PATH))
    print('[AGENT] Auto-pair agent registered')

    # Must run *after* RequestDefaultAgent: bluetoothd turns Pairable back on
    # when a default agent is installed, so setting it earlier silently loses
    # the race and leaves the adapter pairable (verified on hardware — the
    # property read back True until this call was moved down here).
    _set_discoverable(bus, adapter_path)

    def _on_device_properties_changed(interface, changed, invalidated, path):
        if interface == 'org.bluez.Device1' and 'Connected' in changed:
            if not bool(changed['Connected']):
                print(f'[GATT] Client disconnected ({path}) — pausing MPD')
                command_handler.mpd.pause_if_playing()

    bus.add_signal_receiver(
        _on_device_properties_changed,
        signal_name='PropertiesChanged',
        dbus_interface=DBUS_PROP_IFACE,
        path_keyword='path',
    )

    mainloop = GLib.MainLoop()
    print(f'[ThePod] GATT server running as "{DEVICE_NAME}"')
    mainloop.run()


if __name__ == '__main__':
    # Self-check for the advertising payload: `python3 gatt_server.py`.
    # Cheap guard on the byte layout the controller actually rejects on.
    _adv, _rsp = _adv_payload()
    assert struct.calcsize('<BIHHBB') == 11, 'mgmt_cp_add_advertising must pack to 11 bytes'
    assert _adv == bytes([17, AD_TYPE_UUID128_COMPLETE]) + uuidlib.UUID(SERVICE_UUID).bytes[::-1]
    assert _adv[0] == len(_adv) - 1, 'AD length byte counts type + value, not itself'
    assert _rsp[0] == len(_rsp) - 1 and _rsp[2:].decode() == DEVICE_NAME
    # The kernel prepends its own 3-byte Flags AD when MGMT_ADV_FLAG_DISCOV is set.
    assert len(_adv) <= 31 - 3, f'adv data {len(_adv)}B overruns the legacy 31-byte limit'
    assert len(_rsp) <= 31, f'scan response {len(_rsp)}B overruns the legacy 31-byte limit'
    print(f'self-check OK — adv {len(_adv)}B, scan_rsp {len(_rsp)}B')
