import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export function SkeletonCard() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={animatedStyle}
      className="bg-surface-tertiary rounded-2xl p-4 mb-3"
    >
      <View className="bg-text-tertiary/30 h-5 w-3/4 rounded mb-2" />
      <View className="bg-text-tertiary/30 h-4 w-1/2 rounded mb-2" />
      <View className="bg-text-tertiary/30 h-4 w-1/3 rounded" />
    </Animated.View>
  );
}
