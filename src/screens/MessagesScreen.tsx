import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Badge,
  EmptyState,
  GlassPillButton,
  Group,
  Segmented,
  Sheet,
  animateContentChange,
  Subpage,
  palette,
  type Tone,
} from '../ui';
import { cardSurface, ripple } from '../material';

const ios = Platform.OS === 'ios';
import type { MessageCategory, MessageRecord } from '../types';

const categoryMeta: Record<MessageCategory, { label: string; tone: Tone }> = {
  system: { label: '系统', tone: 'info' },
  billing: { label: '账单', tone: 'warning' },
  security: { label: '安全', tone: 'danger' },
  product: { label: '产品', tone: 'neutral' },
};

const filters = ['全部', '未读'] as const;

export function MessagesScreen({
  messages,
  onBack,
  onRead,
  onReadAll,
  onDelete,
}: {
  messages: MessageRecord[];
  onBack: () => void;
  onRead: (id: string) => void;
  onReadAll: () => void;
  onDelete: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [filterIndex, setFilterIndex] = useState(0);
  const [selected, setSelected] = useState<MessageRecord | null>(null);

  const unreadCount = messages.filter((message) => !message.read).length;
  const filtered = useMemo(
    () => (filterIndex === 1 ? messages.filter((message) => !message.read) : messages),
    [filterIndex, messages],
  );
  const current = selected ? messages.find((message) => message.id === selected.id) ?? null : null;

  const open = (message: MessageRecord) => {
    if (!message.read) {
      onRead(message.id);
    }
    setSelected(message);
  };

  const confirmDelete = (message: MessageRecord) => {
    Alert.alert('删除消息？', '删除后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          onDelete(message.id);
          setSelected(null);
        },
      },
    ]);
  };

  return (
    <Subpage
      title="消息"
      onBack={onBack}
      right={
        unreadCount > 0 ? <GlassPillButton label="全部已读" onPress={onReadAll} /> : null
      }
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <Segmented
          values={[...filters]}
          selectedIndex={filterIndex}
          onChange={(index) => {
            animateContentChange();
            setFilterIndex(index);
          }}
        />

        {unreadCount > 0 ? (
          <Text style={styles.unreadSummary}>{unreadCount} 条未读</Text>
        ) : (
          <Text style={styles.unreadSummary}>全部消息已读</Text>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            title="没有未读消息"
            message="暂无新消息"
            icon="bell"
          />
        ) : (
          <Group header={filterIndex === 1 ? '未读' : '全部消息'}>
            {filtered.map((message) => {
              const meta = categoryMeta[message.category];
              return (
                <Pressable
                  key={message.id}
                  accessibilityRole="button"
                  onPress={() => open(message)}
                  android_ripple={ripple()}
                  style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
                >
                  <View style={styles.rowTop}>
                    {!message.read ? <View style={styles.unreadDot} /> : null}
                    <Text style={[styles.title, message.read ? styles.titleRead : null]} numberOfLines={1}>
                      {message.title}
                    </Text>
                    <Text style={styles.time}>{message.time}</Text>
                  </View>
                  <Text style={styles.snippet} numberOfLines={2}>
                    {message.body}
                  </Text>
                  <View style={styles.rowBottom}>
                    <Badge text={meta.label} tone={meta.tone} />
                  </View>
                </Pressable>
              );
            })}
          </Group>
        )}
      </ScrollView>

      <Sheet visible={current !== null} title="消息详情" onClose={() => setSelected(null)}>
        {current ? (
          <>
            <View style={styles.detailHeading}>
              <Text style={styles.detailTitle}>{current.title}</Text>
              <View style={styles.detailMetaRow}>
                <Badge
                  text={categoryMeta[current.category].label}
                  tone={categoryMeta[current.category].tone}
                />
                <Text style={styles.detailTime}>{current.time}</Text>
              </View>
            </View>
            <View style={styles.detailBody}>
              <Text style={styles.detailBodyText}>{current.body}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => confirmDelete(current)}
              style={styles.deleteButton}
            >
              <Text style={[styles.deleteText, { color: palette.red }]}>删除消息</Text>
            </Pressable>
          </>
        ) : null}
      </Sheet>
    </Subpage>
  );
}

const styles = StyleSheet.create({
  readAll: {
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  unreadSummary: {
    color: palette.secondaryLabel,
    fontSize: 13,
    marginLeft: 4,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: ios ? 12 : 14,
    gap: 5,
  },
  rowPressed: {
    backgroundColor: palette.fill,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.blue,
  },
  title: {
    flex: 1,
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  titleRead: {
    fontWeight: '400',
    color: palette.secondaryLabel,
  },
  time: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  snippet: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 19,
  },
  rowBottom: {
    flexDirection: 'row',
    marginTop: 2,
  },
  detailHeading: {
    gap: 8,
    paddingHorizontal: 4,
  },
  detailTitle: {
    color: palette.label,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 29,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailTime: {
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  detailBody: {
    backgroundColor: palette.card,
    padding: 16,
    ...cardSurface,
    borderRadius: ios ? 10 : 28,
  },
  detailBodyText: {
    color: palette.label,
    fontSize: 16,
    lineHeight: 24,
  },
  deleteButton: {
    minHeight: ios ? 48 : 52,
    borderRadius: ios ? 10 : 26,
    borderWidth: 1,
    borderColor: palette.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 17,
  },
});
