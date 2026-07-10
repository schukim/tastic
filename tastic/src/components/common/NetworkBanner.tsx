import React from "react";
import { View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNetworkStore } from "../../stores/networkStore";

export function NetworkBanner() {
  const isConnected = useNetworkStore((s) => s.isConnected);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  if (isConnected) return null;

  // 상단 노치/상태바를 덮지 않도록 safe-area top 을 패딩으로 반영
  return (
    <View className="bg-error px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
      <Text className="text-white text-center text-[15px] font-medium">
        {t("common.networkOffline")}
      </Text>
    </View>
  );
}
