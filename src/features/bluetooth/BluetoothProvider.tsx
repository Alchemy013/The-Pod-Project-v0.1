import BluetoothService from "@/services/bluetooth/BluetoothService";
import React, { createContext, useContext } from "react";

const BluetoothContext = createContext(BluetoothService);

export function BluetoothProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BluetoothContext.Provider value={BluetoothService}>
      {children}
    </BluetoothContext.Provider>
  );
}

export function useBluetooth() {
  return useContext(BluetoothContext);
}