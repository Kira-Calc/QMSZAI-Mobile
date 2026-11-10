import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardSurface, pressedDim, ripple } from '../material';

const ios = Platform.OS === 'ios';

import {
  Badge,
  GlassPillButton,
  Group,
  Row,
  Segmented,
  Sheet,
  animateContentChange,
  Subpage,
  palette,
  type Tone,
} from '../ui';

type FaceResult = {
  mode: 0 | 1;
  title: string;
  verdict: string;
  tone: Tone;
  time: string;
  cost: number;
  rows: Array<{ label: string; value: string }>;
  note: string;
};

const sampleImages = ['示例人像 A', '示例人像 B', '示例人像 C'];

export function FaceToolsScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<0 | 1>(0);
  const [slots, setSlots] = useState<Array<string | null>>([null, null]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FaceResult[]>([]);
  const [selected, setSelected] = useState<FaceResult | null>(null);

  const ready = mode === 0 ? slots[0] !== null : slots[0] !== null && slots[1] !== null;

  const pickImage = (slot: 0 | 1) => {
    Alert.alert('选择图片', '演示模式不会访问相册，请选择一个示例人像。', [
      ...sampleImages.map((name) => ({
        text: name,
        onPress: () =>
          setSlots((current) => {
            const next: Array<string | null> = [...current];
            next[slot] = name;
            return next;
          }),
      })),
      { text: '取消', style: 'cancel' as const },
    ]);
  };

  const run = () => {
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const isDetect = mode === 0;
      const result: FaceResult = isDetect
        ? {
            mode: 0,
            title: '人脸检测结果',
            verdict: '检测成功',
            tone: 'success',
            time: '刚刚',
            cost: 0.05,
            rows: [
              { label: '人脸数量', value: '1 张' },
              { label: '最高置信度', value: '0.982' },
              { label: '人脸位置', value: 'x 214 · y 168 · 196 × 208' },
              { label: '检测耗时', value: '620 ms' },
              { label: '来源图片', value: slots[0] ?? '—' },
            ],
            note: '置信度高于 0.9 通常可直接使用；低于阈值时建议更换更清晰的正脸图片。',
          }
        : {
            mode: 1,
            title: '人脸比对结果',
            verdict: '判定为同一人',
            tone: 'success',
            time: '刚刚',
            cost: 0.1,
            rows: [
              { label: '相似度', value: '92.4%' },
              { label: '判定阈值', value: '80%' },
              { label: '图片 1', value: slots[0] ?? '—' },
              { label: '图片 2', value: slots[1] ?? '—' },
              { label: '比对耗时', value: '840 ms' },
            ],
            note: '相似度仅表示模型判断，不构成身份认证依据。演示结果不来自真实图片。',
          };
      setResults((current) => [result, ...current]);
      setSelected(result);
      setBusy(false);
    }, 1500);
  };

  const reset = () => {
    setSlots([null, null]);
    setResults([]);
  };

  return (
    <Subpage
      title="人脸工具"
      onBack={onBack}
      right={
        slots[0] || results.length > 0 ? <GlassPillButton label="重置" onPress={reset} /> : null
      }
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <Segmented
          values={['人脸检测', '人脸比对']}
          selectedIndex={mode}
          onChange={(index) => {
            animateContentChange();
            setMode(index === 0 ? 0 : 1);
            setSlots([null, null]);
          }}
        />

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{mode === 0 ? '定位图片中的人脸' : '判断两张脸是否同一人'}</Text>
        </View>

        <View style={styles.slots}>
          <UploadSlot
            label={mode === 0 ? '待检测图片' : '图片 1'}
            value={slots[0]}
            onPress={() => pickImage(0)}
          />
          {mode === 1 ? (
            <UploadSlot label="图片 2" value={slots[1]} onPress={() => pickImage(1)} />
          ) : null}
        </View>


        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy }}
          disabled={!ready || busy}
          onPress={run}
          style={({ pressed }) => [
            styles.primaryButton,
            !ready || busy ? styles.disabled : null,
            pressed ? pressedDim : null,
          ]}
        >
          <Text style={styles.primaryText}>
            {busy ? '识别中…' : mode === 0 ? '开始检测' : '开始比对'}
          </Text>
        </Pressable>

        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>本次结果</Text>
          {results.length > 0 ? <Text style={styles.sectionMeta}>{results.length} 条</Text> : null}
        </View>

        {results.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>还没有结果</Text>
            <Text style={styles.emptyCopy}>选择示例图片并开始识别，结果会显示在这里。</Text>
          </View>
        ) : (
          <Group>
            {results.map((result, index) => (
              <Pressable
                key={`${result.title}-${index}`}
                accessibilityRole="button"
                onPress={() => setSelected(result)}
                android_ripple={ripple()}
                style={({ pressed }) => [styles.resultRow, pressed ? styles.resultRowPressed : null]}
              >
                <View style={styles.resultMain}>
                  <Text style={styles.resultTitle}>{result.title}</Text>
                  <Text style={styles.resultMeta}>
                    {result.time} · ¥{result.cost.toFixed(2)}
                  </Text>
                </View>
                <Badge text={result.verdict} tone={result.tone} />
              </Pressable>
            ))}
          </Group>
        )}
      </ScrollView>

      <Sheet visible={selected !== null} title="识别结果" onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <View style={styles.sheetHeading}>
              <Text style={styles.sheetTitle}>{selected.title}</Text>
              <Badge text={selected.verdict} tone={selected.tone} />
            </View>
            <Group>
              {selected.rows.map((row) => (
                <Row key={row.label} title={row.label} value={row.value} />
              ))}
              <Row title="费用" value={`¥${selected.cost.toFixed(2)}`} />
            </Group>
            <Text style={styles.sheetNote}>{selected.note}</Text>
          </>
        ) : null}
      </Sheet>
    </Subpage>
  );
}

function UploadSlot({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}：${value ?? '尚未选择'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.slot, pressed ? styles.slotPressed : null]}
    >
      <Text style={styles.slotLabel}>{label}</Text>
      <View style={styles.slotBody}>
        <Text style={styles.slotPlus}>{value ? '✓' : '+'}</Text>
        <Text style={styles.slotName}>{value ?? '点击选择图片'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  resetText: {
    fontSize: 16,
  },
  hero: {
    backgroundColor: palette.card,
    padding: ios ? 16 : 18,
    gap: 5,
    ...cardSurface,
  },
  heroTitle: {
    color: palette.label,
    fontSize: 20,
    fontWeight: '600',
  },
  slots: {
    flexDirection: 'row',
    gap: 10,
  },
  slot: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: ios ? 12 : 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.separator,
    backgroundColor: palette.card,
    padding: ios ? 12 : 14,
    gap: 8,
    minHeight: ios ? 132 : 140,
  },
  slotPressed: {
    backgroundColor: palette.fill,
  },
  slotLabel: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  slotBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  slotPlus: {
    color: palette.blue,
    fontSize: 26,
    fontWeight: '300',
  },
  slotName: {
    color: palette.secondaryLabel,
    fontSize: 13,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: ios ? 48 : 52,
    borderRadius: ios ? 12 : 26,
    backgroundColor: palette.blue,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sectionTitle: {
    color: palette.secondaryLabel,
    fontSize: ios ? 13 : 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  sectionMeta: {
    color: palette.tertiaryLabel,
    fontSize: 12,
    marginRight: 4,
  },
  empty: {
    backgroundColor: palette.card,
    padding: 24,
    ...cardSurface,
    alignItems: 'center',
    gap: 5,
  },
  emptyTitle: {
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyCopy: {
    color: palette.secondaryLabel,
    fontSize: 13,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: ios ? 12 : 14,
  },
  resultRowPressed: {
    backgroundColor: palette.fill,
  },
  resultMain: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    color: palette.label,
    fontSize: 16,
  },
  resultMeta: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  sheetHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  sheetTitle: {
    flex: 1,
    color: palette.label,
    fontSize: 22,
    fontWeight: '600',
  },
  sheetNote: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
});
