import { create } from "zustand";

interface NetworkState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isConnected: true,
  setConnected: (isConnected) => set({ isConnected }),
}));
