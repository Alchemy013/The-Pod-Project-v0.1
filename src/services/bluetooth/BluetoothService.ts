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

interface ChunkBuffer {
  parts: string[];
  total: number;
}

class ThePodBluetoothService {
  private manager = new BleManager();
  private device: Device | null = null;
  private statusSubscription: Subscription | null = null;
  private pendingRequests = new Map<string, (response: PodResponse) => void>();
  private chunkBuffers = new Map<string, ChunkBuffer>();
  private notificationListeners = new Set<NotificationListener>();
  private disconnectListeners = new Set<() => void>();

  async scan(): Promise<Device[]> {
    const state = await this.manager.state();
    if (state !== State.PoweredOn) {
      throw new Error('Bluetooth is not powered on');
    }

    return new Promise((resolve) => {
      const found = new Map<string, Device>();

      this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          console.error('[BLE] Scan error:', error);
          return;
        }
        if (!device) return;
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
    const CONNECT_TIMEOUT = 12000;
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('BLE connect timed out')), CONNECT_TIMEOUT)
    );
    await Promise.race([this._connectInternal(deviceId), timer]);
  }

  private async _connectInternal(deviceId: string): Promise<void> {
    const connected = await this.manager.connectToDevice(deviceId, {
      requestMTU: 512,
      timeout: 10000,
    });
    await connected.discoverAllServicesAndCharacteristics();
    console.log('[BLE] Negotiated MTU:', connected.mtu);
    this.device = connected;
    this.subscribeToStatus();
    connected.onDisconnected(() => {
      this.device = null;
      this.statusSubscription = null;
      this.pendingRequests.clear();
      this.chunkBuffers.clear();
      for (const listener of this.disconnectListeners) listener();
    });
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
