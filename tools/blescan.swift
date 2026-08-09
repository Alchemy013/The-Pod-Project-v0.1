// Ground-truth BLE scanner for the Mac. The ONLY way to answer "is the Pod
// actually on the air, and with what payload" — the Pi cannot hear its own
// advertisements, and every Pi-side signal is misleading: `btmgmt info`'s
// `advertising` flag reports only the legacy toggle, and a clean HCI trace
// (ADV_IND + Advertise Enable + Success) is printed even when nothing radiates.
//
//   swiftc -O tools/blescan.swift -o /tmp/blescan && /tmp/blescan
//
// Healthy Pod looks like:
//   *** THEPOD name=ThePod rssi=-48 connectable=true uuids=["4FAFC201-...9001"]
// Missing uuids  -> the legacy Set Advertising toggle is overriding our
//                   instance (see Solved). Missing entirely, or name=— with a
//                   3-byte flags-only payload -> controller is wedged, reboot.
import Foundation
import CoreBluetooth

final class Scanner: NSObject, CBCentralManagerDelegate {
    var mgr: CBCentralManager!
    var seen = Set<String>()
    var pods = 0
    func start() { mgr = CBCentralManager(delegate: self, queue: nil) }

    func centralManagerDidUpdateState(_ c: CBCentralManager) {
        switch c.state {
        case .poweredOn:
            print("[scan] running 12s...")
            c.scanForPeripherals(withServices: nil,
                                 options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        case .unauthorized:
            print("[!] BLUETOOTH PERMISSION DENIED for this binary"); exit(2)
        case .poweredOff:
            print("[!] Bluetooth is OFF on this Mac"); exit(3)
        default:
            print("[state] \(c.state.rawValue)")
        }
    }

    func centralManager(_ c: CBCentralManager, didDiscover p: CBPeripheral,
                        advertisementData d: [String: Any], rssi: NSNumber) {
        let key = p.identifier.uuidString
        if seen.contains(key) { return }
        seen.insert(key)
        let name = (d[CBAdvertisementDataLocalNameKey] as? String) ?? p.name ?? "—"
        let uuids = (d[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?.map { $0.uuidString } ?? []
        let conn = (d[CBAdvertisementDataIsConnectable] as? NSNumber)?.boolValue ?? false
        let isPod = name == "ThePod"
            || uuids.contains { $0.lowercased().hasPrefix("4fafc201") }
        if isPod { pods += 1 }
        let tag = isPod ? "*** THEPOD" : "           "
        print("\(tag) name=\(name)  rssi=\(rssi)  connectable=\(conn)  uuids=\(uuids)  keys=\(Array(d.keys))")
    }
}

let s = Scanner(); s.start()
RunLoop.main.run(until: Date().addingTimeInterval(12))
print("[scan] done — pods seen: \(s.pods), total devices: \(s.seen.count)")
