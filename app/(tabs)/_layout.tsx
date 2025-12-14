import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: {
          fontSize: 16,
          fontWeight: "bold",
          textAlignVertical: "center",
          marginBottom: 15,
        },
        tabBarStyle: {
          height: 60 + insets.bottom,
          backgroundColor: "#1E1E1E",
          borderTopColor: "#333",
          paddingBottom: insets.bottom,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Cámara",
          tabBarIcon: () => null,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Galería",
          tabBarIcon: () => null,
        }}
      />
    </Tabs>
  );
}
