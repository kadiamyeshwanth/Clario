/**
 * Ask Mira — the on-server, no-API-key assistant, in a chat.
 * Questions never leave the Clario server; Mira answers from your own data.
 */
import React, { useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PaperPlaneRight } from 'phosphor-react-native';
import { api } from '../../lib/api';
import { useTheme } from '../../theme';
import { Text, Header } from '../../components/ui';
import { t as tr } from '../../lib/i18n';

const SUGGESTIONS = [
  'How much did I spend on food this month?',
  'What were my biggest expenses last month?',
  'Can I afford a 40k laptop?',
  'Compare this month to last month',
  'How will this month end?',
];

/** Renders **bold** and *italic* from Mira's answers. */
const Rich = ({ text, color }) => {
  const t = useTheme();
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <Text variant="body" color={color} style={{ lineHeight: 21 }}>
      {parts.map((p, i) => p.startsWith('**') ? <Text key={i} variant="body" color={color} style={{ fontFamily: t.font.uiHeavy }}>{p.slice(2, -2)}</Text>
        : p.startsWith('*') ? <Text key={i} variant="body" color={t.text2} style={{ fontStyle: 'italic' }}>{p.slice(1, -1)}</Text>
        : p)}
    </Text>
  );
};

export default function Ask() {
  const t = useTheme();
  const [messages, setMessages] = useState([{ id: 'hi', role: 'mira', text: 'Hi, I’m Mira. Ask me anything about your money — I answer from your own transactions, on Clario’s server.' }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const memory = useRef({});
  const list = useRef(null);

  const send = async (text = input) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'me', text: q }]);
    setBusy(true);
    try {
      const r = await api.post('/ai/chat', { message: q.slice(0, 500), memory: memory.current });
      memory.current = r.memory || {};
      setMessages((m) => [...m, { id: `m${Date.now()}`, role: 'mira', text: r.message }]);
    } catch (e) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'mira', text: e.message, error: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
        <View style={{ padding: 16, paddingBottom: 8 }}><Header title={tr('Ask Mira')} subtitle="Private by design — no third-party AI" /></View>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m }) => (
            <View style={{
              alignSelf: m.role === 'me' ? 'flex-end' : 'flex-start', maxWidth: '88%',
              backgroundColor: m.role === 'me' ? t.brand : t.card, borderRadius: 18, padding: 12,
              borderBottomRightRadius: m.role === 'me' ? 6 : 18, borderBottomLeftRadius: m.role === 'me' ? 18 : 6,
            }}>
              <Rich text={m.text} color={m.role === 'me' ? '#fff' : m.error ? t.red : t.text} />
            </View>
          )}
          ListFooterComponent={messages.length <= 1 ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={{ borderWidth: 1, borderColor: t.borderStrong, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, alignSelf: 'flex-start' }}>
                  <Text variant="small" color={t.text}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : busy ? <Text variant="small" style={{ marginLeft: 4 }}>Mira is thinking…</Text> : null}
        />
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.bg }}>
          <TextInput
            value={input} onChangeText={setInput} onSubmitEditing={() => send()} returnKeyType="send" maxLength={500}
            placeholder="Ask about your spending…" placeholderTextColor={t.text3}
            style={{ flex: 1, backgroundColor: t.well, color: t.text, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, fontFamily: t.font.ui, fontSize: 15 }}
          />
          <Pressable accessibilityLabel="Send" onPress={() => send()} disabled={busy || !input.trim()}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.5 : 1 }}>
            <PaperPlaneRight size={20} color="#fff" weight="fill" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
