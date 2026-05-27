import React from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useNetworkStore } from "../../stores/networkStore";

export function NetworkBanner() {
  const isConnected = useNetworkStore((s) => s.isConnected);
  const { t } = useTranslation();

  if (isConnected) return null;

  return (
    <View className="bg-error px-4 py-2">
      <Text className="text-white text-center text-[15px] font-medium">
        {t("common.networkOffline")}
      </Text>
    </View>
  );
}
