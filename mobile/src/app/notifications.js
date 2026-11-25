import React from 'react';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { linkFor } from '../lib/push';
import { useTheme } from '../theme';
import { Screen, Card, Text, Button, Row, Loading, ErrorNote, Empty } from '../components/ui';

export default function Notifications() {
  const t = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/notifications') });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/mark-all-read'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const open = async (n) => {
    if (!n.isRead) api.patch(`/notifications/${n._id}/read`).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => {});
    if (n.link) router.push(linkFor(n.link));
  };
  const color = { danger: t.red, warning: t.brand, success: t.green, info: t.text2 };

  return (
    <Screen edges={[]} refreshing={q.isRefetching} onRefresh={q.refetch}>
      {q.isLoading ? <Loading /> : (q.isError && !q.data) ? <ErrorNote error={q.error} onRetry={q.refetch} /> : (
        <>
          {q.data.unreadCount > 0 && <Button small variant="default" title="Mark all as read" style={{ alignSelf: 'flex-start' }} onPress={() => readAll.mutate()} />}
          {q.data.data.length === 0 ? <Empty title="You’re all caught up" body="Budget warnings, bill reminders and split updates appear here." /> : (
            <Card style={{ gap: 2 }}>
              {q.data.data.map((n) => (
                <Row key={n._id} onPress={() => open(n)}
                  left={<Text variant="heading" color={color[n.type] || t.text2}>●</Text>}
                  title={n.title}
                  subtitle={`${n.body}`}
                  right={!n.isRead ? <Text variant="small" color={t.brand}>new</Text> : null} />
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
