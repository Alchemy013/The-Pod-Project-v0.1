import json
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
        return {
            'Type': dbus.String('peripheral'),
            'LocalName': dbus.String(DEVICE_NAME),
            'ServiceUUIDs': dbus.Array([dbus.String(SERVICE_UUID)], signature='s'),
            'Includes': dbus.Array(['tx-power'], signature='s'),
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
        adapter_props.Set('org.bluez.Adapter1', 'Discoverable', dbus.Boolean(True))
        adapter_props.Set('org.bluez.Adapter1', 'DiscoverableTimeout', dbus.UInt32(0))
        adapter_props.Set('org.bluez.Adapter1', 'Pairable', dbus.Boolean(True))
        print(f'[ADV] Adapter set discoverable as "{DEVICE_NAME}"')
    except Exception as e:
        print(f'[ADV] Warning: could not set discoverable: {e}')


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

    _set_discoverable(bus, adapter_path)

    # Register advertisement via D-Bus — works headless, no btmgmt/TTY needed
    adv = ThePodAdvertisement(bus)
    adv_mgr = dbus.Interface(bus.get_object(BLUEZ_SVC, adapter_path), LE_ADV_MGR_IFACE)
    adv_mgr.RegisterAdvertisement(
        dbus.ObjectPath(ThePodAdvertisement.PATH), {},
        reply_handler=lambda: print('[ADV] Advertisement registered'),
        error_handler=lambda e: print(f'[ADV] Advertisement error: {e}'),
    )

    agent = AutoPairAgent(bus)
    agent_mgr = dbus.Interface(bus.get_object(BLUEZ_SVC, '/org/bluez'), AGENT_MGR_IFACE)
    agent_mgr.RegisterAgent(dbus.ObjectPath(AutoPairAgent.PATH), 'NoInputNoOutput')
    agent_mgr.RequestDefaultAgent(dbus.ObjectPath(AutoPairAgent.PATH))
    print('[AGENT] Auto-pair agent registered')

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
