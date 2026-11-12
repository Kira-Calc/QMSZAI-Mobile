import { Fragment, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

// 轻量 Markdown 渲染：只处理模型回复里最常见的几种标记，
// 避免把 **加粗**、`代码`、- 列表、# 标题原样显示出来。
// 不做完整 Markdown 解析（不引第三方库、不支持表格/图片/HTML）。

const inlinePattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;

function inlineNodes(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  inlinePattern.lastIndex = 0;
  while ((match = inlinePattern.exec(line)) !== null) {
    if (match.index > last) nodes.push(line.slice(last, match.index));
    const token = match[0];
    const key = `i${match.index}`;

    if (token.startsWith('`')) {
      nodes.push(
        <Text key={key} style={styles.code}>
          {token.slice(1, -1)}
        </Text>,
      );
    } else if (token.startsWith('[')) {
      // [文字](链接)：只保留文字，链接在 App 里点不开。
      nodes.push(
        <Text key={key} style={styles.bold}>
          {token.slice(1, token.indexOf(']'))}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={key} style={styles.bold}>
          {token.slice(2, -2)}
        </Text>,
      );
    }

    last = match.index + token.length;
  }

  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let inCode = false;

  lines.forEach((raw, index) => {
    const key = `b${index}`;
    const newline = index === 0 ? null : '\n';

    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      return;
    }

    if (inCode) {
      blocks.push(
        <Fragment key={key}>
          {newline}
          <Text style={styles.codeBlock}>{raw || ' '}</Text>
        </Fragment>,
      );
      return;
    }

    // 表格分隔行（|---|:--:|）没有信息量，直接丢掉。
    if (/^\s*\|?[\s:-]*\|[\s|:-]*$/.test(raw)) return;

    const heading = raw.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push(
        <Fragment key={key}>
          {newline}
          <Text style={styles.heading}>{inlineNodes(heading[1])}</Text>
        </Fragment>,
      );
      return;
    }

    const bullet = raw.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        <Fragment key={key}>
          {newline}
          <Text>• </Text>
          {inlineNodes(bullet[1])}
        </Fragment>,
      );
      return;
    }

    // 引用行去掉 > 标记，按普通段落显示。
    const quote = raw.match(/^\s*>\s?(.*)$/);
    blocks.push(
      <Fragment key={key}>
        {newline}
        {inlineNodes(quote ? quote[1] : raw)}
      </Fragment>,
    );
  });

  return blocks;
}

export function RichText({
  text,
  style,
  selectable = true,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
}) {
  return (
    <Text selectable={selectable} style={style}>
      {renderBlocks(text)}
    </Text>
  );
}


// 列表预览用：把 Markdown 标记去掉，只留纯文本。
export function plainText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) return '';
      return line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/__([^_\n]+)__/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\[([^\]\n]+)\]\([^)\n]+\)/g, '$1');
    })
    .filter((line) => line.trim().length > 0)
    .join(' ')
    .trim();
}

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

const styles = StyleSheet.create({
  bold: { fontWeight: '600' },
  heading: { fontWeight: '600' },
  code: {
    fontFamily: mono,
    fontSize: 14,
  },
  codeBlock: {
    fontFamily: mono,
    fontSize: 14,
  },
});
