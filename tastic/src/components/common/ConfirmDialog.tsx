import React from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, Dimensions } from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  loading?: boolean;
  actions: { label: string; onPress: () => void; variant?: "primary" | "destructive" | "default" }[];
  onClose: () => void;
}

export function ConfirmDialog({ visible, title, message, loading, actions, onClose }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-dim justify-center items-center px-6" onPress={onClose}>
        <View
          className="bg-surface w-full rounded-2xl p-6"
          style={{ maxHeight: SCREEN_HEIGHT * 0.8 }}
        >
          <Text className="text-text text-lg font-bold mb-4">{title}</Text>
          {loading ? (
            <View className="items-center py-8 mb-4">
              <ActivityIndicator size="large" color="#6366F1" />
              <Text className="text-text-secondary text-sm mt-3">평론 생성 중...</Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled
              className="mb-6"
            >
              <Text className="text-text-secondary text-base leading-6">{message}</Text>
            </ScrollView>
          )}
          <View className="gap-3">
            {actions.map((action) => {
              const bgClass =
                action.variant === "primary"
                  ? "bg-primary"
                  : action.variant === "destructive"
                  ? "bg-error"
                  : "bg-surface-tertiary";
              const textClass =
                action.variant === "primary" || action.variant === "destructive"
                  ? "text-white"
                  : "text-text";
              return (
                <Pressable
                  key={action.label}
                  className={`${bgClass} py-3 rounded-xl items-center`}
                  onPress={action.onPress}
                >
                  <Text className={`${textClass} font-semibold text-base`}>{action.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
