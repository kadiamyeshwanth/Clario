import React from 'react';
import { Tabs } from 'expo-router';
import { House, ListBullets, ChatCircleDots, Target, DotsThreeCircle } from 'phosphor-react-native';
import { useTheme } from '../../theme';
import { t as tr } from '../../lib/i18n';

export default function TabsLayout() {
  const t = useTheme();
  const icon = (Icon) => ({ color, focused }) => <Icon size={24} color={color} weight={focused ? 'fill' : 'regular'} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.text3,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarLabelStyle: { fontFamily: t.font.uiBold, fontSize: 11 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: tr('Home'), tabBarIcon: icon(House) }} />
      <Tabs.Screen name="activity" options={{ title: tr('Transactions'), tabBarIcon: icon(ListBullets) }} />
      <Tabs.Screen name="ask" options={{ title: tr('Ask'), tabBarIcon: icon(ChatCircleDots) }} />
      <Tabs.Screen name="plan" options={{ title: tr('Plan'), tabBarIcon: icon(Target) }} />
      <Tabs.Screen name="more" options={{ title: tr('More'), tabBarIcon: icon(DotsThreeCircle) }} />
    </Tabs>
  );
}
