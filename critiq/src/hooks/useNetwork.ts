import { useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useNetworkStore } from "../stores/networkStore";

export function useNetwork() {
  const setConnected = useNetworkStore((s) => s.setConnected);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setConnected(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, [setConnected]);
}
