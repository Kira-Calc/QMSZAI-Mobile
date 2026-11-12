import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';
import { alphabetOf, letterOf, sortByName } from '../modelSort';

const ios = Platform.OS === 'ios';

import {
  Badge,
  EmptyState,
  Group,
  Row,
  Segmented,
  Sheet,
  Subpage,
  AlphabetRail,
  animateContentChange,
  palette,
} from '../ui';
import { ModelLogo } from '../components/ModelLogo';
import { ripple } from '../material';
import { themedStyles, isDark } from '../theme';
import type { MarketModel } from '../types';

const filters = ['全部', '对话', '图像/视频', '音频'] as const;

function matches(model: MarketModel, filterIndex: number) {
  if (filterIndex === 1) {
    return model.category === 'chat';
  }
  if (filterIndex === 2) {
    return model.category === 'image' || model.category === 'video';
  }
  if (filterIndex === 3) {
    return model.category === 'audio';
  }
  return true;
}

function priceText(value: number) {
  if (!value) return '¥0';
  if (value >= 1) return `¥${value.toFixed(2)}`;
  return `¥${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function ModelMarketplaceScreen({
  onBack,
  models,
}: {
  onBack: () => void;
  models: MarketModel[];
}) {
  const source = models;
  const insets = useSafeAreaInsets();
  const [filterIndex, setFilterIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MarketModel | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const groupY = useRef(0);
  const bodyY = useRef(0);
  const rowOffsets = useRef<number[]>([]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    // 过滤后再按名称自然排序，避免接口返回顺序随分组或热度变化。
    return sortByName(source.filter((model) => {
      if (!matches(model, filterIndex)) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [model.name, model.vendor, model.group, ...model.tags]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    }));
  }, [filterIndex, query, source]);

  const letters = useMemo(() => alphabetOf(filtered.map((model) => model.name)), [filtered]);

  const offsetFor = (letter: string) => {
    const index = filtered.findIndex((model) => letterOf(model.name) === letter);
    if (index < 0) return undefined;
    return groupY.current + bodyY.current + (rowOffsets.current[index] ?? 0);
  };

  const badgeLabel = (model: MarketModel) => {
    if (model.category === 'free') return '免费';
    if (model.category === 'image') return '图像';
    if (model.category === 'video') return '视频';
    if (model.category === 'audio') return '音频';
    return model.group === 'default' ? '对话' : model.group;
  };

  const priceLabel = (model: MarketModel) => {
    if (model.category === 'free') {
      return '免费';
    }
    if (model.category === 'image' || model.category === 'video' || model.category === 'audio') {
      return model.outputPrice > 0
        ? `${priceText(model.inputPrice)} / ${priceText(model.outputPrice)} 每 1M`
        : `${priceText(model.inputPrice)} / 次`;
    }
    return `${priceText(model.inputPrice)} / ${priceText(model.outputPrice)} 每 1M`;
  };

  return (
    <Subpage title="模型广场" onBack={onBack}>
      <View style={styles.listRow}>
      <ScrollView
        ref={scrollRef}
        style={styles.listScroll}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBox}>
          {Platform.OS === 'ios' ? (
            <SymbolView name="magnifyingglass" tintColor={palette.tertiaryLabel} style={styles.searchIcon} />
          ) : (
            <AppIcon name="magnifyingglass" size={16} color={palette.tertiaryLabel} />
          )}
          <TextInput
            keyboardAppearance={isDark() ? 'dark' : 'light'}
            value={query}
            onChangeText={setQuery}
            placeholder="搜索模型、厂商或分组"
            placeholderTextColor={palette.tertiaryLabel}
            autoCorrect={false}
            style={styles.searchInput}
          />
          {query.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.clear}>×</Text>
            </Pressable>
          ) : null}
        </View>

        <Segmented
          values={[...filters]}
          selectedIndex={filterIndex}
          onChange={(index) => {
            animateContentChange();
            setFilterIndex(index);
          }}
        />

        <Text style={styles.summary}>
          {filtered.length} 个模型
        </Text>

        {filtered.length === 0 ? (
          <EmptyState title="没有匹配的模型" icon="magnifyingglass" />
        ) : (
          <Group
            onLayout={(event) => {
              groupY.current = event.nativeEvent.layout.y;
            }}
            onBodyLayout={(event) => {
              bodyY.current = event.nativeEvent.layout.y;
            }}
          >
            {filtered.map((model, index) => (
              <Pressable
                key={model.id}
                accessibilityRole="button"
                onLayout={(event) => {
                  rowOffsets.current[index] = event.nativeEvent.layout.y;
                }}
                onPress={() => setSelected(model)}
                android_ripple={ripple()}
                style={({ pressed }) => [styles.modelRow, pressed ? styles.modelRowPressed : null]}
              >
                <View style={styles.modelLogo}>
                  <ModelLogo name={model.name} size={26} />
                </View>
                <View style={styles.modelBody}>
                <View style={styles.modelTop}>
                  <Text style={styles.modelName} numberOfLines={1}>
                    {model.name}
                  </Text>
                  <Badge
                    text={badgeLabel(model)}
                    tone={model.category === 'free' ? 'success' : 'neutral'}
                  />
                </View>
                <Text style={styles.modelVendor}>
                  {model.context === '—' ? model.vendor : `${model.vendor} · 上下文 ${model.context}`}
                </Text>
                <View style={styles.modelBottom}>
                  <View style={styles.tags}>
                    {model.tags.map((tag) => (
                      <Text key={tag} style={styles.tag}>
                        {tag}
                      </Text>
                    ))}
                  </View>
                  <Text style={styles.price}>{priceLabel(model)}</Text>
                </View>
                </View>
              </Pressable>
            ))}
          </Group>
        )}

      </ScrollView>
      <AlphabetRail
        letters={letters}
        onSelect={(letter) => {
          const offset = offsetFor(letter);
          if (offset === undefined) return;
          scrollRef.current?.scrollTo({ y: Math.max(0, offset - 6), animated: true });
        }}
      />
      </View>

      <Sheet visible={selected !== null} title="模型详情" onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <View style={styles.sheetHeading}>
              <ModelLogo name={selected.name} size={34} />
              <View style={styles.sheetTitleBlock}>
                <Text style={styles.sheetTitle}>{selected.name}</Text>
                <Text style={styles.sheetVendor}>{selected.vendor}</Text>
              </View>
              <Badge
                text={badgeLabel(selected)}
                tone={selected.category === 'free' ? 'success' : 'neutral'}
              />
            </View>
            <Group>
              <Row title="分组" value={selected.group === 'default' ? '默认' : selected.group} />
              {selected.category === 'chat' ? (
                <>
                  <Row title="输入价格" value={`¥${selected.inputPrice} / 1M`} />
                  <Row title="输出价格" value={`¥${selected.outputPrice} / 1M`} />
                  {selected.cachePrice !== undefined ? (
                    <Row title="缓存读取" value={`¥${selected.cachePrice} / 1M`} />
                  ) : null}
                </>
              ) : (
                <Row title="单次价格" value={`¥${selected.inputPrice.toFixed(2)}`} />
              )}
              {selected.tags.length > 0 ? (
                <Row title="能力标签" value={selected.tags.join('、')} />
              ) : null}
            </Group>
            {selected.note ? <Text style={styles.sheetNote}>{selected.note}</Text> : null}
          </>
        ) : null}
      </Sheet>
    </Subpage>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  listRow: { flex: 1, flexDirection: 'row' },
  listScroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: ios ? 40 : 52,
    borderRadius: ios ? 10 : 26,
    backgroundColor: palette.card,
    paddingHorizontal: ios ? 10 : 16,
  },
  searchIcon: {
    width: 16,
    height: 16,
  },
  searchFallback: {
    color: palette.tertiaryLabel,
    fontSize: 18,
  },
  searchInput: {
    flex: 1,
    color: palette.label,
    fontSize: ios ? 17 : 16,
    paddingVertical: ios ? 8 : 10,
  },
  clear: {
    color: palette.tertiaryLabel,
    fontSize: 20,
  },
  summary: {
    color: palette.secondaryLabel,
    fontSize: 13,
    marginLeft: 4,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: ios ? 12 : 14,
    gap: 12,
  },
  modelLogo: {
    width: 26,
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  modelBody: {
    flex: 1,
    gap: 3,
  },
  modelRowPressed: {
    backgroundColor: palette.fill,
  },
  modelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modelName: {
    flex: 1,
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  modelVendor: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  modelBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 3,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  tag: {
    color: palette.secondaryLabel,
    fontSize: 11,
    backgroundColor: palette.fill,
    borderRadius: ios ? 6 : 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  price: {
    color: palette.secondaryLabel,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  sheetHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 4,
  },
  sheetTitleBlock: {
    flex: 1,
    gap: 3,
  },
  sheetTitle: {
    color: palette.label,
    fontSize: 24,
    fontWeight: '600',
  },
  sheetVendor: {
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  sheetNote: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
}));
