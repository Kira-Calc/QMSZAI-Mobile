// 模型列表统一按名称做自然排序（字母 A→Z，数字按大小），避免接口返回顺序随分组变化。
const chunk = (value: string) => value.toLowerCase().match(/(\d+|\D+)/g) ?? [];

function naturalCompare(a: string, b: string) {
  const left = chunk(a);
  const right = chunk(b);
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const x = left[index];
    const y = right[index];
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return left.length - right.length;
}

export function sortByName<T extends { name: string }>(models: T[]): T[] {
  return [...models].sort((a, b) => naturalCompare(a.name, b.name));
}

export function sortModelNames(names: string[]): string[] {
  return [...names].sort(naturalCompare);
}

// A-Z 侧边索引：取名称首字母，非字母归到 #。
export function letterOf(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

export function alphabetOf(names: string[]): string[] {
  const letters = new Set<string>();
  names.forEach((name) => letters.add(letterOf(name)));
  return [...letters].sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a < b ? -1 : 1;
  });
}
