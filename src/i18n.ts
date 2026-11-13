// 应用内语言。
//
// 约束：
// - 只有中文（简体）与英文两套文案；界面里所有文案都以中文原文作为 key，
//   通过 t('中文原文') 取当前语言，缺失翻译时回落到中文。
// - language 是「跟随系统」解析后的结果（zh / en），setting 是用户选择
//   （system / zh / en），两者都要能驱动界面重渲染。
// - App() 里调用 useLanguage()，切换后整棵树重新渲染；模块级常量里的文案
//   需要在渲染时再取（或改成函数），否则会停留在首次求值的语言。

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import { getLocales } from 'expo-localization';

import { en } from './i18n.en';

export type Language = 'zh' | 'en';
export type LanguageSetting = 'system' | Language;

const STORAGE_KEY = 'qmszai.language';

let setting: LanguageSetting = 'zh';
let language: Language = 'zh';
const listeners = new Set<() => void>();

// 系统语言标签。Hermes 的 Intl 在部分环境里拿不到真实系统语言，
// iOS 读 SettingsManager，Android 读 I18nManager，最后才回落到 Intl。
function systemLocaleTag(): string {
  try {
    const tag = getLocales()[0]?.languageTag;
    if (tag) return tag;
  } catch {
    // 拿不到时继续用下面的兜底。
  }
  try {
    if (Platform.OS === 'ios') {
      const languages = NativeModules.SettingsManager?.settings?.AppleLanguages;
      if (Array.isArray(languages) && typeof languages[0] === 'string' && languages[0]) {
        return languages[0];
      }
    } else {
      const identifier = NativeModules.I18nManager?.localeIdentifier;
      if (typeof identifier === 'string' && identifier) return identifier.replace('_', '-');
    }
  } catch {
    // 取不到系统语言时继续用 Intl。
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {
    return '';
  }
}

// 中文系统一律视为简体中文，其余落到英文。
function detectSystemLanguage(): Language {
  return systemLocaleTag().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function resolve(next: LanguageSetting): Language {
  return next === 'system' ? detectSystemLanguage() : next;
}

function apply(next: LanguageSetting, persist = true) {
  const nextLanguage = resolve(next);
  const changed = next !== setting || nextLanguage !== language;
  setting = next;
  language = nextLanguage;
  if (changed) listeners.forEach((listener) => listener());
  if (persist) {
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }
}

export function setLanguage(next: LanguageSetting) {
  apply(next);
}

export function getLanguage(): Language {
  return language;
}

export function getLanguageSetting(): LanguageSetting {
  return setting;
}

export function isEnglish(): boolean {
  return language === 'en';
}

// 中文原文 -> 当前语言。
export function t(key: string): string {
  if (language !== 'en') return key;
  return en[key] ?? key;
}

// 带占位符的文案：pattern 里用 {0} {1} 标记插入位置。
export function tf(pattern: string, ...values: Array<string | number>): string {
  const text = t(pattern);
  return text.replace(/\{(\d+)\}/g, (match, index) => {
    const value = values[Number(index)];
    return value === undefined ? match : String(value);
  });
}

// 启动时恢复上次选择；默认中文，和加入语言设置前的表现一致。
export async function initLanguage() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'system' || saved === 'zh' || saved === 'en') apply(saved, false);
  } catch {
    // 存储不可用时保持中文。
  }
}

// 跟随系统时，从后台回到前台重新读取一次系统语言。
AppState.addEventListener('change', (state) => {
  if (state !== 'active' || setting !== 'system') return;
  apply('system', false);
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

export function useLanguageSetting(): LanguageSetting {
  return useSyncExternalStore(subscribe, getLanguageSetting, getLanguageSetting);
}
