import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { ReviewStackParamList } from "../types/navigation";
import { ReviewHomeScreen } from "../screens/Review/ReviewHomeScreen";
import { ContentConfirmScreen } from "../screens/Review/ContentConfirmScreen";
import { InterviewScreen } from "../screens/Review/InterviewScreen";
import { ReviewCompleteScreen } from "../screens/Review/ReviewCompleteScreen";

const Stack = createNativeStackNavigator<ReviewStackParamList>();

export function ReviewStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ReviewHome" component={ReviewHomeScreen} />
      <Stack.Screen name="ContentConfirm" component={ContentConfirmScreen} />
      {/* iOS 스와이프백은 beforeRemove 로 못 막으므로 제스처를 끄고 닫기 버튼으로만 이탈 */}
      <Stack.Screen
        name="Interview"
        component={InterviewScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="ReviewComplete"
        component={ReviewCompleteScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
