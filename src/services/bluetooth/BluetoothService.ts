import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import {
  POD_COMMAND_UUID,
  POD_DEVICE_NAME,
  POD_SERVICE_UUID,
  POD_STATUS_UUID,
  PodCommand,
  PodCommandWithId,
  PodResponse,
  decodeResponse,
  encodeCommand,
} from './protocol';

type NotificationListener = (response: PodResponse) => void;

/**
 * Is this scan result one of our Pods?
 *
 * Two independent signals, because on this hardware neither is guaranteed:
 * the name rides the *scan response* and the service UUID rides the
 * *advertisement*, and the firmware's advertising path has more than one way
 * to end up publishing only one of them. Either alone identifies a Pod, so
 * accept either rather than requiring both.
 */
function isPod(device: Device): boolean {
  if (device.name === POD_DEVICE_NAME || device.localName === POD_DEVICE_NAME) return true;
  const target = POD_SERVICE_UUID.toLowerCase();
  return (device.serviceUUIDs ?? []).some((u) => u.toLowerCase() === target);
}

interface ChunkBuffer {
  parts: string[];
  total: number;
}

// Opting into Core Bluetooth state preservation/restoration. With this set,
// iOS keeps pending connections alive while the app is suspended, queues BLE
// events, and *relaunches the app in the background* when one arrives — which
// is the mechanism behind an Apple-Watch-style "it's just connected" feel.
// Paired with `bluetooth-central` in UIBackgroundModes (app.json); both are
// required, neither works alone. The identifier must stay stable across
// releases — iOS keys the preserved state on it, so changing it orphans the
// restoration and silently reverts to cold connects.
const RESTORE_ID = 'thepod-ble-central';

// Post-connect readiness probe. A live link answers a PING in well under 100ms,
// so these only cost anything on the connect that would otherwise have been
// silently deaf. Worst case 4×1.4s, comfortably inside connect()'s 12s race.
const HANDSHAKE_TRIES = 4;
const HANDSHAKE_TIMEOUT = 1400;

class ThePodBluetoothService {
  private manager = new BleManager({
    restoreStateIdentifier: RESTORE_ID,
    restoreStateFunction: (restored) => {
      // Runs at construction. `null` means a normal cold start; a value means
      // iOS handed the app back its live peripherals after terminating it.
      const peripherals = restored?.connectedPeripherals ?? [];
      if (peripherals.length) this.adoptRestored(peripherals[0]);
    },
  });
  private device: Device | null = null;
  private statusSubscription: Subscription | null = null;
  private pendingRequests = new Map<string, (response: PodResponse) => void>();
  private chunkBuffers = new Map<string, ChunkBuffer>();
  private notificationListeners = new Set<NotificationListener>();
  private disconnectListeners = new Set<() => void>();
  private connectListeners = new Set<() => void>();
  private _isConnecting = false;
  private _pendingReconnectId: string | null = null;
  private _scanInFlight: Promise<Device[]> | null = null;

  // CoreBluetooth allows a single scan per central manager, so a second
  // startDeviceScan silently takes over the callback from the first. The
  // earlier scan then resolves with an empty result that can overwrite the
  // real device list. Share one in-flight scan between concurrent callers.
  async scan(): Promise<Device[]> {
    if (this._scanInFlight) return this._scanInFlight;
    this._scanInFlight = this._scanInternal().finally(() => {
      this._scanInFlight = null;
    });
    return this._scanInFlight;
  }

  private async _scanInternal(): Promise<Device[]> {
    const state = await this.manager.state();
    if (state !== State.PoweredOn) {
      throw new Error('Bluetooth is not powered on');
    }

    return new Promise((resolve) => {
      const found = new Map<string, Device>();

      // Scan unfiltered and match in JS, rather than passing the service UUID
      // to startDeviceScan. Both hide the room's phones and TVs equally, but a
      // radio-level filter makes *discovery itself* depend on the advertisement
      // carrying the UUID — and if the Pod ever advertises without it the Pod
      // simply cannot be found, with no way to tell that apart from "not
      // powered on". Matching here degrades instead: the name in the scan
      // response is enough on its own. Costs one extra predicate per packet.
      this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          console.error('[BLE] Scan error:', error);
          return;
        }
        if (!device || !isPod(device)) return;
        found.set(device.id, device);
      });

      setTimeout(() => {
        this.manager.stopDeviceScan();
        const devices = Array.from(found.values()).sort((a, b) => {
          const aIsPod = (a.name === POD_DEVICE_NAME || a.localName === POD_DEVICE_NAME) ? -1 : 0;
          const bIsPod = (b.name === POD_DEVICE_NAME || b.localName === POD_DEVICE_NAME) ? -1 : 0;
          return aIsPod - bIsPod;
        });
        resolve(devices);
      }, 8000);
    });
  }

  async connect(deviceId: string): Promise<void> {
    if (this._isConnecting) return;
    this._isConnecting = true;
    const CONNECT_TIMEOUT = 12000;
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('BLE connect timed out')), CONNECT_TIMEOUT)
    );
    try {
      await Promise.race([this._connectInternal(deviceId, 10000), timer]);
    } finally {
      this._isConnecting = false;
    }
  }

  /**
   * Arm a reconnect that stays pending until the Pod is back in range.
   *
   * CoreBluetooth's connect has no timeout of its own — it simply completes
   * whenever the peripheral turns up — so this needs no scan loop, no polling
   * and no backoff. iOS does the waiting, wakes the app when the Pod appears,
   * and keeps the radio idle in the meantime, which a repeated scan would not.
   *
   * Deliberately not routed through `connect()`: that one races a 12s timeout
   * because a human is watching it, which is the opposite of what's wanted here.
   */
  async connectWhenInRange(deviceId: string): Promise<void> {
    if (this.device || this._pendingReconnectId || this._isConnecting) return;
    this._pendingReconnectId = deviceId;
    try {
      await this._connectInternal(deviceId);
    } finally {
      this._pendingReconnectId = null;
    }
  }

  /**
   * Drop a pending reconnect so a manual scan or connect can take the radio.
   * Without this the armed connect above would sit on the peripheral forever
   * and a user who wants to pair a *different* Pod could never get in.
   */
  async cancelPendingConnect(): Promise<void> {
    const id = this._pendingReconnectId;
    if (!id) return;
    this._pendingReconnectId = null;
    try { await this.manager.cancelDeviceConnection(id); } catch {}
  }

  get isAwaitingPod(): boolean {
    return this._pendingReconnectId !== null;
  }

  /** `connectTimeoutMs` omitted = wait indefinitely (see connectWhenInRange). */
  private async _connectInternal(deviceId: string, connectTimeoutMs?: number): Promise<void> {
    const connected = await this.manager.connectToDevice(deviceId, {
      requestMTU: 512,
      ...(connectTimeoutMs === undefined ? {} : { timeout: connectTimeoutMs }),
    });
    await connected.discoverAllServicesAndCharacteristics();
    console.log('[BLE] Negotiated MTU:', connected.mtu);
    this.device = connected;
    this.subscribeToStatus();
    connected.onDisconnected(() => this.handleLinkLost());
    await this.handshake();
  }

  /**
   * A link is not usable the moment iOS reports "connected". The Pi drops every
   * notification while its `notifying` flag is False (`gatt_server._notify`), so
   * a command answered before iOS's StartNotify actually lands gets a reply that
   * goes nowhere — which is precisely the "first connect fetches nothing until I
   * reconnect" failure: on a first-ever connect there is no cached GATT database
   * and the MTU is still being negotiated, so the subscription lands late.
   *
   * So prove the round trip rather than sleeping and hoping. Each failed attempt
   * re-subscribes, because "the notify never took" is the thing being retried.
   */
  private async handshake(): Promise<void> {
    for (let attempt = 0; attempt < HANDSHAKE_TRIES; attempt++) {
      try {
        if ((await this.request({ cmd: 'PING' }, HANDSHAKE_TIMEOUT)).type === 'PONG') return;
      } catch {
        // No answer yet, or the write itself failed because the GATT table
        // wasn't queryable — both mean "try again", not "give up".
      }
      if (!this.device) throw new Error('ThePod disconnected while connecting');
      this.subscribeToStatus();
    }
    throw new Error('ThePod connected but never answered');
  }

  /**
   * Single teardown path for "the link is gone", whether iOS reported the
   * disconnect or the status notify died under us. Idempotent, because both
   * can fire for the same drop.
   */
  private handleLinkLost(): void {
    if (!this.device) return;
    this.device = null;
    this.statusSubscription?.remove();
    this.statusSubscription = null;
    this.pendingRequests.clear();
    this.chunkBuffers.clear();
    for (const listener of this.disconnectListeners) listener();
  }

  async disconnect(): Promise<void> {
    if (!this.device) return;
    this.statusSubscription?.remove();
    this.statusSubscription = null;
    try { await this.manager.cancelDeviceConnection(this.device.id); } catch {}
    this.device = null;
  }

  private subscribeToStatus(): void {
    this.statusSubscription?.remove();
    this.statusSubscription = null;
    if (!this.device) return;
    this.statusSubscription = this.device.monitorCharacteristicForService(
      POD_SERVICE_UUID,
      POD_STATUS_UUID,
      (error, characteristic) => {
        if (error) {
          // Swallowing this is what produces the worst failure mode there is:
          // the link looks up, the gate lets you into the app, and then every
          // request times out with nothing on screen to say why (an empty
          // library and a blank battery). If the status notify is dead the
          // connection is useless, so surface it as a disconnect and let the
          // reconnect logic re-arm rather than sitting there deaf.
          console.error('[BLE] Status monitor failed:', error.message);
          this.handleLinkLost();
          return;
        }
        if (!characteristic?.value) return;
        try {
          const response = decodeResponse(characteristic.value);
          this.handleResponse(response);
        } catch (e) {
          console.error('[BLE] Failed to decode response:', e);
        }
      }
    );
  }

  private handleResponse(response: PodResponse): void {
    if (response.type === 'CHUNK' || response.type === 'CHUNK_END') {
      const id = response._id;
      console.log(`[BLE] chunk ${response.seq}/${response.total} ${response.type} id=${id}`);
      const buffer = this.chunkBuffers.get(id) ?? { parts: [], total: response.total };
      buffer.parts[response.seq - 1] = response.data;
      if (response.type === 'CHUNK_END') {
        this.chunkBuffers.delete(id);
        const filled = buffer.parts.filter((p): p is string => p !== undefined).length;
        if (filled !== buffer.total) {
          console.error(`[BLE] Chunk mismatch: got ${filled}/${buffer.total} for ${id}`);
          return;
        }
        try {
          const assembled = decodeResponse(buffer.parts.join(''));
          this.handleResponse({ ...assembled, _id: id });
        } catch (e) {
          console.error('[BLE] Failed to assemble chunked response:', e);
        }
      } else {
        this.chunkBuffers.set(id, buffer);
      }
      return;
    }

    if (response._id) {
      const handler = this.pendingRequests.get(response._id);
      if (handler) {
        this.pendingRequests.delete(response._id);
        handler(response);
        return;
      }
    }

    for (const listener of this.notificationListeners) {
      listener(response);
    }
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xfffff).toString(36)}`;
  }

  async sendCommand(command: PodCommand): Promise<void> {
    if (!this.device) throw new Error('Not connected to ThePod');
    const withId: PodCommandWithId = { ...command, _id: this.generateId() };
    const encoded = encodeCommand(withId);
    await this.device.writeCharacteristicWithResponseForService(
      POD_SERVICE_UUID,
      POD_COMMAND_UUID,
      encoded
    );
  }

  async request(command: PodCommand, timeoutMs = 10000): Promise<PodResponse> {
    if (!this.device) throw new Error('Not connected to ThePod');
    const id = this.generateId();
    const withId: PodCommandWithId = { ...command, _id: id };

    return new Promise<PodResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timed out: ${command.cmd}`));
      }, timeoutMs);

      this.pendingRequests.set(id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });

      const encoded = encodeCommand(withId);
      this.device!.writeCharacteristicWithResponseForService(
        POD_SERVICE_UUID,
        POD_COMMAND_UUID,
        encoded
      ).catch((err) => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  /**
   * Fires when a link comes up that the app did **not** initiate — an iOS state
   * restoration, or a standing reconnect completing while backgrounded. The
   * store needs this because in those cases nothing is awaiting a promise.
   */
  onConnected(listener: () => void): () => void {
    this.connectListeners.add(listener);
    return () => this.connectListeners.delete(listener);
  }

  /**
   * Take ownership of a peripheral iOS restored to us. It is already connected
   * at the link layer, but this process has none of the per-connection state,
   * so services must be rediscovered and the status notify re-subscribed
   * before it is usable.
   */
  private async adoptRestored(device: Device): Promise<void> {
    try {
      if (!(await device.isConnected())) return;
      await device.discoverAllServicesAndCharacteristics();
      this.device = device;
      this.subscribeToStatus();
      device.onDisconnected(() => this.handleLinkLost());
      // Same readiness problem as a fresh connect, and worse here: nothing is
      // awaiting a promise, so an unproven link would be handed to the UI as
      // fully working.
      await this.handshake();
      for (const listener of this.connectListeners) listener();
    } catch {
      // Restoration is best-effort: drop the half-adopted link and let the
      // normal standing reconnect bring it up the ordinary way.
      this.handleLinkLost();
    }
  }

  /**
   * Re-arm whenever the radio comes back (user toggled Bluetooth, Control
   * Centre, Airplane mode). Without this the app sits disconnected until it is
   * manually relaunched, which is exactly the "little broken" feeling.
   */
  onBluetoothReady(listener: () => void): () => void {
    const sub = this.manager.onStateChange((state) => {
      if (state === State.PoweredOn) listener();
    }, true);
    return () => sub.remove();
  }

  /** Cheap liveness probe — used when the app returns to the foreground. */
  async verifyLink(): Promise<boolean> {
    if (!this.device) return false;
    try {
      const alive = await this.manager.isDeviceConnected(this.device.id);
      if (!alive) this.handleLinkLost();
      return alive;
    } catch {
      this.handleLinkLost();
      return false;
    }
  }

  async isConnected(): Promise<boolean> {
    if (!this.device) return false;
    return this.manager.isDeviceConnected(this.device.id);
  }

  get connectedDevice(): Device | null {
    return this.device;
  }
}

export const podService = new ThePodBluetoothService();
export default podService;
