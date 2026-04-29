import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View } from "react-native";
import Svg, { Circle, Polyline, Polygon, Path, Line, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";
import type { MainTabParamList } from "../types/navigation";
import { HistoryScreen } from "../screens/History/HistoryScreen";
import { RecommendScreen } from "../screens/Recommend/RecommendScreen";
import { ReviewStack } from "./ReviewStack";
import { AnalysisScreen } from "../screens/Analysis/AnalysisScreen";
import { MyScreen } from "../screens/My/MyScreen";

// ── Design System tokens ──────────────────────────────────
const INK       = "#221F1A";   // --color-primary
const MUTED     = "#9C9589";   // --color-text-3
const TAB_BG    = "#F8F6F1";   // --color-surface — warm paper
const BORDER    = "#EAE7E0";   // --color-border

// ── Minimal SVG tab icons ─────────────────────────────────
type IconProps = { focused: boolean };

function IconHistory({ focused }: IconProps) {
  const stroke = focused ? INK : MUTED;
  const sw = focused ? 1.8 : 1.4;
  return (
    <Svg width={22} height={22} viewBox="0 0 20 20" fill="none">
      <Circle cx="10" cy="10" r="7" stroke={stroke} strokeWidth={sw} />
      <Polyline points="10,6 10,10 13,12" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function IconRecommend({ focused }: IconProps) {
  const stroke = focused ? INK : MUTED;
  const sw = focused ? 1.8 : 1.4;
  return (
    <Svg width={22} height={22} viewBox="0 0 20 20" fill="none">
      <Circle cx="10" cy="10" r="7" stroke={stroke} strokeWidth={sw} />
      <Polygon points="13,7 8,9.5 7,13 12,10.5" fill={stroke} />
    </Svg>
  );
}

function IconReview({ focused }: IconProps) {
  const stroke = focused ? INK : MUTED;
  const sw = focused ? 1.8 : 1.4;
  return (
    <Svg width={22} height={22} viewBox="0 0 20 20" fill="none">
      <Path
        d="M5 15 L5 5 Q5 4 6 4 L14 4 Q15 4 15 5 L15 15 L10 12.5 L5 15Z"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
        fill={focused ? stroke : "none"}
        fillOpacity={focused ? 0.1 : 0}
      />
      <Line x1="7.5" y1="8" x2="12.5" y2="8" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      <Line x1="7.5" y1="10.5" x2="11" y2="10.5" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
    </Svg>
  );
}

function IconAnalysis({ focused }: IconProps) {
  const fill = focused ? INK : MUTED;
  return (
    <Svg width={22} height={22} viewBox="0 0 20 20" fill="none">
      <Rect x="4" y="11" width="3" height="5" rx="1" fill={fill} />
      <Rect x="8.5" y="7" width="3" height="9" rx="1" fill={fill} />
      <Rect x="13" y="4" width="3" height="12" rx="1" fill={fill} />
    </Svg>
  );
}

function IconMy({ focused }: IconProps) {
  const stroke = focused ? INK : MUTED;
  const sw = focused ? 1.8 : 1.4;
  return (
    <Svg width={22} height={22} viewBox="0 0 20 20" fill="none">
      <Circle cx="10" cy="7.5" r="3" stroke={stroke} strokeWidth={sw} />
      <Path d="M4 17 C4 13.5 6.7 11 10 11 C13.3 11 16 13.5 16 17" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
    </Svg>
  );
}

const TAB_ICON_MAP: Record<keyof MainTabParamList, (props: IconProps) => React.ReactElement> = {
  HistoryTab:   (p) => <IconHistory   {...p} />,
  RecommendTab: (p) => <IconRecommend {...p} />,
  ReviewTab:    (p) => <IconReview    {...p} />,
  AnalysisTab:  (p) => <IconAnalysis  {...p} />,
  MyTab:        (p) => <IconMy        {...p} />,
};

// ─────────────────────────────────────────────────────────
const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      initialRouteName="ReviewTab"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => TAB_ICON_MAP[route.name]({ focused }),
        tabBarActiveTintColor:   INK,
        tabBarInactiveTintColor: MUTED,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Pretendard",
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: TAB_BG,
          borderTopWidth: 1,
          borderTopColor: BORDER,
          elevation: 0,
          shadowOpacity: 0,
          paddingTop: 6,
          paddingBottom: 10,
          height: 60,
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
