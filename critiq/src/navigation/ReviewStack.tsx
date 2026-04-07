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
      <Stack.Screen name="Interview" component={InterviewScreen} />
      <Stack.Screen
        name="ReviewComplete"
        component={ReviewCompleteScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
