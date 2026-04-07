import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import type { MainTabParamList } from "../types/navigation";
import { HistoryScreen } from "../screens/History/HistoryScreen";
import { RecommendScreen } from "../screens/Recommend/RecommendScreen";
import { ReviewStack } from "./ReviewStack";
import { AnalysisScreen } from "../screens/Analysis/AnalysisScreen";
import { MyScreen } from "../screens/My/MyScreen";

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, string> = {
  HistoryTab: "\uD83D\uDCCB",
  RecommendTab: "\uD83D\uDCA1",
  ReviewTab: "\u270D\uFE0F",
  AnalysisTab: "\uD83D\uDCCA",
  MyTab: "\uD83D\uDC64",
};

export function MainTabs() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      initialRouteName="ReviewTab"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>
            {TAB_ICONS[route.name]}
          </Text>
        ),
        tabBarActiveTintColor: "#6366F1",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          backgroundColor: "#FFFFFF",
          paddingTop: 4,
        },
      })}
    >
      <Tab.Screen
        name="HistoryTab"
        component={HistoryScreen}
        options={{ tabBarLabel: t("tabs.history") }}
      />
      <Tab.Screen
        name="RecommendTab"
        component={RecommendScreen}
        options={{ tabBarLabel: t("tabs.recommend") }}
      />
      <Tab.Screen
        name="ReviewTab"
        component={ReviewStack}
        options={{ tabBarLabel: t("tabs.review") }}
      />
      <Tab.Screen
        name="AnalysisTab"
        component={AnalysisScreen}
        options={{ tabBarLabel: t("tabs.analysis") }}
      />
      <Tab.Screen
        name="MyTab"
        component={MyScreen}
        options={{ tabBarLabel: t("tabs.my") }}
      />
    </Tab.Navigator>
  );
}
