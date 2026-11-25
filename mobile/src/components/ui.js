/**
 * ui.js — Clario's primitives for React Native.
 *
 * The phone versions of the web's `n-card`, `n-btn`, `n-input`, `n-label`,
 * `n-empty` and the progress track, using the same tokens (theme.js).
 */
import React from 'react';
import { View, Text as RNText, Pressable, TextInput, ActivityIndicator, ScrollView, RefreshControl, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { money } from '../lib/money';

export const Text = ({ variant = 'body', color, style, ...rest }) => {
  const t = useTheme();
  const v = {
    display: { fontFamily: t.font.display, fontSize: 26, lineHeight: 32, color: t.text, letterSpacing: -0.5 },
    title: { fontFamily: t.font.uiHeavy, fontSize: 20, color: t.text },
    heading: { fontFamily: t.font.uiBold, fontSize: 15, color: t.text },
    body: { fontFamily: t.font.ui, fontSize: 14, color: t.text },
    small: { fontFamily: t.font.ui, fontSize: 12.5, color: t.text2 },
    caption: { fontFamily: t.font.uiBold, fontSize: 11, color: t.text3, textTransform: 'uppercase', letterSpacing: 0.8 },
    figure: { fontFamily: t.font.monoBold, fontSize: 28, color: t.text, letterSpacing: -0.5 },
    mono: { fontFamily: t.font.mono, fontSize: 14, color: t.text },
  }[variant];
  return <RNText style={[v, color && { color }, style]} {...rest} />;
};

/** Amount text: colour only on money — green in, red out. */
export const Money = ({ value, type, code, sign = true, variant = 'mono', style }) => {
  const t = useTheme();
  const color = type === 'income' ? t.green : type === 'expense' ? t.red : undefined;
  const prefix = sign && type === 'income' ? '+' : sign && type === 'expense' ? '−' : '';
  return <Text variant={variant} color={color} style={style}>{prefix}{money(Math.abs(value), code ? { code } : undefined)}</Text>;
};

export const Screen = ({ children, scroll = true, refreshing, onRefresh, padded = true, edges = ['top'] }) => {
  const t = useTheme();
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && { padding: 16, paddingBottom: 40 }, { gap: 14 }]}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.brand} /> : undefined}
    >{children}</ScrollView>
  ) : <View style={[{ flex: 1 }, padded && { padding: 16 }]}>{children}</View>;
  // Keep focused fields above the keyboard (edge-to-edge Android doesn't resize the window).
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export const Card = ({ children, style, brand, onPress }) => {
  const t = useTheme();
  const body = (
    <View style={[{
      backgroundColor: brand ? t.brand : t.card, borderRadius: t.radius.lg, padding: 16,
      borderWidth: StyleSheet.hairlineWidth, borderColor: brand ? 'transparent' : t.border, ...t.shadow,
    }, style]}>{children}</View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>{body}</Pressable> : body;
};

export const Button = ({ title, onPress, variant = 'primary', loading, disabled, icon, style, small }) => {
  const t = useTheme();
  const bg = variant === 'primary' ? t.brand : variant === 'danger' ? t.red : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? t.onBrand : variant === 'ghost' ? t.text2 : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{
        backgroundColor: bg, borderRadius: t.radius.pill, paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 14 : 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        borderWidth: variant === 'default' ? StyleSheet.hairlineWidth * 2 : 0, borderColor: t.borderStrong,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon}
      <Text variant="body" color={fg} style={{ fontFamily: t.font.uiBold, fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
};

export const Field = ({ label, error, style, ...input }) => {
  const t = useTheme();
  return (
    <View style={[{ gap: 6 }, style]}>
      {!!label && <Text variant="caption">{label}</Text>}
      <TextInput
        placeholderTextColor={t.text3}
        style={{
          backgroundColor: t.well, color: t.text, borderRadius: t.radius.md, paddingHorizontal: 14, paddingVertical: 12,
          fontFamily: t.font.ui, fontSize: 15, borderWidth: 1, borderColor: error ? t.red : t.border,
        }}
        {...input}
      />
      {!!error && <Text variant="small" color={t.red}>{error}</Text>}
    </View>
  );
};

/** Segmented pill control (the web's `a11y-seg`). */
export const Segmented = ({ options, value, onChange, scroll }) => {
  const t = useTheme();
  const items = options.map(([v, label]) => {
    const on = v === value;
    return (
      <Pressable key={String(v)} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: on }}
        style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: t.radius.pill, backgroundColor: on ? t.brand : 'transparent' }}>
        <Text variant="small" color={on ? t.onBrand : t.text2} style={{ fontFamily: t.font.uiBold }}>{label}</Text>
      </Pressable>
    );
  });
  const box = { flexDirection: 'row', backgroundColor: t.well, borderRadius: t.radius.pill, padding: 4, gap: 2, alignSelf: 'flex-start' };
  return scroll ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={box}>{items}</ScrollView> : <View style={box}>{items}</View>;
};

export const Progress = ({ pct, color }) => {
  const t = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 999, backgroundColor: t.well, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: color || t.brand, borderRadius: 999 }} />
    </View>
  );
};

export const Row = ({ left, title, subtitle, right, onPress, onLongPress }) => {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: pressed ? 0.7 : 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border })}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text variant="small" numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </Pressable>
  );
};

export const Empty = ({ title, body, action }) => (
  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
    <Text variant="heading">{title}</Text>
    {!!body && <Text variant="small" style={{ textAlign: 'center', maxWidth: 280 }}>{body}</Text>}
    {action}
  </View>
);

export const Loading = () => {
  const t = useTheme();
  return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={t.brand} /></View>;
};

export const ErrorNote = ({ error, onRetry }) => {
  const t = useTheme();
  return (
    <Card style={{ borderColor: t.red, gap: 8 }}>
      <Text variant="body" color={t.red}>{error?.message || 'Something went wrong.'}</Text>
      {onRetry && <Button title="Try again" small variant="default" onPress={onRetry} style={{ alignSelf: 'flex-start' }} />}
    </Card>
  );
};

/** Header used at the top of each tab, like the web PageHeader. */
export const Header = ({ title, subtitle, right }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
    <View style={{ flex: 1 }}>
      <Text variant="title" style={{ fontSize: 24 }}>{title}</Text>
      {!!subtitle && <Text variant="small">{subtitle}</Text>}
    </View>
    {right}
  </View>
);
