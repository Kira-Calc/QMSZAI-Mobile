import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';

const ios = Platform.OS === 'ios';

import {
  Badge,
  EmptyState,
  Group,
  Row,
  Segmented,
  Sheet,
  Subpage,
  animateContentChange,
  palette,
} from '../ui';
import { ModelLogo } from '../components/ModelLogo';
import { ripple } from '../material';
import { marketModels } from '../data/mockConsole';
import type { MarketModel } from '../types';

const filters = ['全部', '对话', '免费', '图像/视频'] as const;

function matches(model: MarketModel, filterIndex: number) {
  if (filterIndex === 1) {
    return model.category === 'chat';
  }
  if (filterIndex === 2) {
    return model.category === 'free';
  }
  if (filterIndex === 3) {
    return model.category === 'image' || model.category === 'video';
  }
  return true;
}

export function ModelMarketplaceScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [filterIndex, setFilterIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MarketModel | null>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return marketModels.filter((model) => {
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
    });
  }, [filterIndex, query]);

  const badgeLabel = (model: MarketModel) => {
    if (model.category === 'free') return '免费';
    if (model.category === 'image') return '图像';
    if (model.category === 'video') return '视频';
    return model.group === 'default' ? '对话' : model.group;
  };

  const priceLabel = (model: MarketModel) => {
    if (model.category === 'free') {
      return '免费';
    }
    if (model.category === 'image' || model.category === 'video') {
      return `¥${model.inputPrice.toFixed(2)} / 次`;
    }
    return `¥${model.inputPrice} / ¥${model.outputPrice} 每 1M`;
  };

  return (
    <Subpage title="模型广场" onBack={onBack}>
      <ScrollView
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
          <EmptyState
            title="没有匹配的模型"
            message="尝试更换关键词或筛选条件。"
            icon="magnifyingglass"
          />
        ) : (
          <Group>
            {filtered.map((model) => (
              <Pressable
                key={model.id}
                accessibilityRole="button"
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
              <Row title="上下文长度" value={selected.context} />
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
              <Row title="能力标签" value={selected.tags.join('、')} />
            </Group>
            <Text style={styles.sheetNote}>{selected.note}</Text>
          </>
        ) : null}
      </Sheet>
    </Subpage>
  );
}

const styles = StyleSheet.create({
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
});
