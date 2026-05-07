import React from "react";
import { Modal, View, Text, Pressable } from "react-native";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  actions: { label: string; onPress: () => void; variant?: "primary" | "destructive" | "default" }[];
  onClose: () => void;
}

export function ConfirmDialog({ visible, title, message, actions, onClose }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-dim justify-center items-center px-6" onPress={onClose}>
        <Pressable className="bg-surface w-full rounded-2xl p-6" onPress={(e) => e.stopPropagation()}>
          <Text className="text-text text-lg font-bold mb-2">{title}</Text>
          <Text className="text-text-secondary text-base mb-6">{message}</Text>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
