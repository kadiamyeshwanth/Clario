import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Wallet, Receipt, Trophy, Tag, Bell, GearSix, SignOut, CaretRight, ChatCircleText } from 'phosphor-react-native';
import { useAuth } from '../../lib/auth';
import { confirm } from '../../lib/confirm';
import { useTheme } from '../../theme';
import { Screen, Card, Row, Header, Text } from '../../components/ui';
import { t as tr } from '../../lib/i18n';

export default function More() {
  const t = useTheme();
  const { user, signOut } = useAuth();
  const item = (Icon, label, href, sub) => (
    <Row key={href} left={<Icon size={22} color={t.brand} weight="fill" />} title={tr(label)} subtitle={sub}
      right={<CaretRight size={16} color={t.text3} />} onPress={() => router.push(href)} />
  );
  return (
    <Screen>
      <Header title={tr('More')} subtitle={user?.email} />
      <Card style={{ paddingVertical: 4 }}>
        {item(ChatCircleText, 'SMS auto-import', '/sms-import', 'GPay, PhonePe, cards — recorded from bank SMS')}
        {item(Wallet, 'Accounts', '/wallets', 'Balances, transfers between accounts')}
        {item(Receipt, 'Split', '/splits', 'Share costs with friends and flatmates')}
        {item(Trophy, 'Challenges', '/challenges', 'Commit to a spending goal')}
        {item(Tag, 'Subscriptions', '/subscriptions', 'What renews, and when')}
        {item(Bell, 'Notifications', '/notifications')}
        {item(GearSix, 'Settings', '/settings', 'Currency, language, devices, your data')}
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <Row left={<SignOut size={22} color={t.red} />} title={tr('Sign out')}
          onPress={() => confirm('Sign out?', 'You can sign back in any time.', signOut, 'Sign out')} />
      </Card>
      <View style={{ alignItems: 'center', marginTop: 8 }}><Text variant="small">Clario · your data stays yours</Text></View>
    </Screen>
  );
}
