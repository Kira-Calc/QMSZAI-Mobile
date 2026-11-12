import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import {
  generateCaptcha,
  registerAccount,
  resetPasswordByPhone,
  sendResetSms,
  sendSmsCode,
  verifyCaptcha,
} from '../api/endpoints';
import type { CaptchaChallenge } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { cardSurface, m3, pressedDim, shape } from '../material';
import { palette } from '../ui';
import { themedStyles, isDark } from '../theme';

const ios = Platform.OS === 'ios';

type Mode = 'login' | 'register' | 'reset';
type Step = 'form' | '2fa';

export function LoginScreen() {
  const { signIn, signIn2FA, publicStatus } = useAuth();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code2fa, setCode2fa] = useState('');

  const [countdown, setCountdown] = useState(0);
  const [captchaVisible, setCaptchaVisible] = useState(false);
  const captchaTarget = useRef<null | ((token: string | null) => void)>(null);

  const smsEnabled = publicStatus?.sms_verification !== false;
  const registerEnabled = publicStatus?.register_enabled !== false;

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const requestSms = (purpose: 'register' | 'reset') => {
    if (countdown > 0) return;
    const target = phone.trim();
    if (!target) {
      setError('请填写手机号');
      return;
    }
    setError('');
    captchaTarget.current = async (token) => {
      if (!token) return;
      setBusy(true);
      try {
        if (purpose === 'register') {
          await sendSmsCode(target, token);
        } else {
          await sendResetSms(target, token);
        }
        setCountdown(60);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    };
    setCaptchaVisible(true);
  };

  const submitLogin = async () => {
    if (busy) return;
    if (!username.trim() || !password) {
      setError('请填写账号和密码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const outcome = await signIn(username, password);
      if (outcome.kind === 'need2fa') {
        setStep('2fa');
      } else if (outcome.kind === 'needPassword') {
        setMode('reset');
        setPhone(/^1\d{10}$/.test(outcome.username) ? outcome.username : '');
        setError('该账号尚未设置密码，请验证手机号后设置密码');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit2FA = async () => {
    if (busy) return;
    if (!code2fa.trim()) {
      setError('请输入验证码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn2FA(code2fa);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async () => {
    if (busy) return;
    if (!phone.trim() || !code.trim() || !newPassword) {
      setError('请完整填写手机号、验证码和密码');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 20) {
      setError('密码需为 8–20 位');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await registerAccount({
        username: username.trim() || undefined,
        password: newPassword,
        phone: phone.trim(),
        verification_code: code.trim(),
      });
      const outcome = await signIn(username.trim() || phone.trim(), newPassword);
      if (outcome.kind === 'need2fa') setStep('2fa');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    if (busy) return;
    if (!phone.trim() || !code.trim() || !newPassword) {
      setError('请完整填写手机号、验证码和新密码');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 20) {
      setError('密码需为 8–20 位');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPasswordByPhone({
        phone: phone.trim(),
        code: code.trim(),
        new_password: newPassword,
      });
      setMode('login');
      setUsername(phone.trim());
      setPassword('');
      setCode('');
      setNewPassword('');
      setError('密码已重置，请使用新密码登录');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setStep('form');
    setCode('');
    setNewPassword('');
    setCode2fa('');
    setCountdown(0);
  };

  const submit = step === '2fa' ? submit2FA : mode === 'login' ? submitLogin : mode === 'register' ? submitRegister : submitReset;

  const title = step === '2fa' ? '两步验证' : mode === 'login' ? '登录' : mode === 'register' ? '注册账号' : '重置密码';

  const primaryLabel =
    step === '2fa' ? '验证' : mode === 'login' ? '登录' : mode === 'register' ? '注册并登录' : '重置密码';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style={isDark() ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={ios ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 28 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator
        >
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>阡</Text>
            </View>
            <Text style={styles.brandName}>{publicStatus?.system_name ?? '阡陌数智'}</Text>
          </View>

          <Text style={styles.title}>{title}</Text>

          <View style={styles.form}>
            {step === '2fa' ? (
              <Field
                label="验证码"
                value={code2fa}
                onChangeText={setCode2fa}
                placeholder="请输入 6 位验证码"
                keyboardType="number-pad"
                autoFocus
              />
            ) : mode === 'login' ? (
              <>
                <Field
                  label="账号"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="用户名或手机号"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="username"
                />
                <Field
                  label="密码"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="请输入密码"
                  secureTextEntry
                  textContentType="password"
                />
              </>
            ) : (
              <>
                <Field
                  label="手机号"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="请输入手机号"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                />
                {smsEnabled ? (
                  <Field
                    label="短信验证码"
                    value={code}
                    onChangeText={setCode}
                    placeholder="请输入验证码"
                    keyboardType="number-pad"
                    right={
                      <Pressable
                        accessibilityRole="button"
                        disabled={countdown > 0 || busy}
                        onPress={() => requestSms(mode === 'register' ? 'register' : 'reset')}
                        hitSlop={8}
                      >
                        <Text style={[styles.codeButton, countdown > 0 ? styles.codeButtonDisabled : null]}>
                          {countdown > 0 ? `${countdown}s` : '获取验证码'}
                        </Text>
                      </Pressable>
                    }
                  />
                ) : null}
                {mode === 'register' ? (
                  <Field
                    label="用户名"
                    value={username}
                    onChangeText={setUsername}
                    placeholder="留空自动生成"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                ) : null}
                <Field
                  label={mode === 'register' ? '设置密码' : '新密码'}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="8–20 位"
                  secureTextEntry
                  textContentType="newPassword"
                />
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={submit}
              style={({ pressed }) => [
                styles.primary,
                pressed ? pressedDim : null,
                busy ? styles.primaryBusy : null,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>{primaryLabel}</Text>
              )}
            </Pressable>

            {step === '2fa' ? (
              <TextLink label="返回登录" onPress={() => { setStep('form'); setError(''); }} />
            ) : mode === 'login' ? (
              <View style={styles.linkRow}>
                {registerEnabled ? <TextLink label="注册账号" onPress={() => switchMode('register')} /> : null}
                <TextLink label="忘记密码" onPress={() => switchMode('reset')} />
              </View>
            ) : (
              <TextLink label="返回登录" onPress={() => switchMode('login')} />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CaptchaSheet
        visible={captchaVisible}
        onClose={() => {
          setCaptchaVisible(false);
          captchaTarget.current?.(null);
        }}
        onVerified={(token) => {
          setCaptchaVisible(false);
          captchaTarget.current?.(token);
        }}
      />
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  textContentType,
  autoFocus,
  right,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences';
  autoCorrect?: boolean;
  textContentType?: 'username' | 'password' | 'newPassword' | 'telephoneNumber';
  autoFocus?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          keyboardAppearance={isDark() ? 'dark' : 'light'}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.tertiaryLabel}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoCorrect={autoCorrect ?? false}
          textContentType={textContentType}
          autoFocus={autoFocus}
          style={styles.input}
        />
        {right}
      </View>
    </View>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

function CaptchaSheet({
  visible,
  onClose,
  onVerified,
}: {
  visible: boolean;
  onClose: () => void;
  onVerified: (token: string) => void;
}) {
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [clicks, setClicks] = useState<{ x: number; y: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();

  const load = async () => {
    setLoading(true);
    setError('');
    setClicks([]);
    try {
      const next = await generateCaptcha();
      setChallenge(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const targets = challenge?.target_chars ?? [];

  const tap = async (char: { char: string; x: number; y: number }) => {
    if (!challenge || loading) return;
    const next = [...clicks, { x: char.x, y: char.y }];
    setClicks(next);
    if (next.length >= targets.length) {
      setLoading(true);
      try {
        const result = await verifyCaptcha(challenge.token, next);
        onVerified(result.token ?? challenge.token);
      } catch (err) {
        setError(errorMessage(err));
        setClicks([]);
        await load();
      } finally {
        setLoading(false);
      }
    }
  };

  const stageWidth = challenge?.width || 300;
  const stageHeight = challenge?.height || 180;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.captchaBackdrop}>
        <View style={[styles.captchaCard, { paddingBottom: 20 + insets.bottom }]}>
          <Text style={styles.captchaTitle}>安全验证</Text>
          <View style={styles.captchaTargetRow}>
            {targets.map((target, index) => (
              <View
                key={`${target.char}-${index}`}
                style={[styles.captchaTarget, index < clicks.length ? styles.captchaTargetDone : null]}
              >
                <Text style={[styles.captchaTargetText, index < clicks.length ? styles.captchaTargetTextDone : null]}>
                  {target.char}
                </Text>
              </View>
            ))}
          </View>
          <View style={[styles.captchaStage, { aspectRatio: stageWidth / stageHeight }]}>
            {challenge
              ? challenge.chars.map((char, index) => (
                  <Pressable
                    key={`${char.char}-${index}`}
                    onPress={() => tap(char)}
                    style={[
                      styles.captchaChar,
                      {
                        left: (char.x / stageWidth) * 100 + '%',
                        top: (char.y / stageHeight) * 100 + '%',
                      },
                    ]}
                  >
                    <Text style={styles.captchaCharText}>{char.char}</Text>
                  </Pressable>
                ))
              : null}
            {loading ? (
              <View style={styles.captchaLoading}>
                <ActivityIndicator color={palette.blue} />
              </View>
            ) : null}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.captchaActions}>
            <TextLink label="刷新" onPress={load} />
            <TextLink label="取消" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}

const styles = themedStyles(() => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.groupedBackground,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: ios ? 20 : 24,
    paddingTop: ios ? 36 : 48,
    gap: ios ? 28 : 32,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: ios ? 9 : shape.md,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  brandName: {
    color: palette.label,
    fontSize: 17,
    fontWeight: '600',
  },
  title: {
    color: palette.label,
    fontSize: ios ? 32 : 30,
    lineHeight: ios ? 38 : 38,
    fontWeight: '700',
    letterSpacing: ios ? 0.2 : 0,
  },
  form: {
    gap: ios ? 14 : 16,
    backgroundColor: palette.card,
    padding: ios ? 16 : 20,
    ...cardSurface,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: palette.secondaryLabel,
    fontSize: ios ? 13 : 12,
    fontWeight: ios ? '400' : '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: ios ? 46 : 54,
    paddingHorizontal: ios ? 12 : 14,
    borderRadius: ios ? 10 : shape.md,
    backgroundColor: ios ? palette.fill : m3.surfaceContainerLow,
    borderWidth: ios ? StyleSheet.hairlineWidth : 0,
    borderColor: palette.separator,
  },
  input: {
    flex: 1,
    color: palette.label,
    fontSize: ios ? 17 : 16,
    paddingVertical: 0,
  },
  codeButton: {
    color: palette.blue,
    fontSize: ios ? 15 : 14,
    fontWeight: '500',
  },
  codeButtonDisabled: {
    color: palette.tertiaryLabel,
  },
  error: {
    color: palette.red,
    fontSize: 13,
    lineHeight: 18,
  },
  primary: {
    minHeight: ios ? 50 : 52,
    borderRadius: ios ? 12 : 26,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBusy: {
    opacity: 0.7,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: ios ? 17 : 16,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  link: {
    color: palette.blue,
    fontSize: ios ? 15 : 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 4,
  },
  captchaBackdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: 'flex-end',
  },
  captchaCard: {
    backgroundColor: palette.card,
    borderTopLeftRadius: ios ? 16 : shape.xl,
    borderTopRightRadius: ios ? 16 : shape.xl,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },
  captchaTitle: {
    color: palette.label,
    fontSize: 17,
    fontWeight: '600',
  },
  captchaTargetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  captchaTarget: {
    width: 44,
    height: 44,
    borderRadius: ios ? 10 : shape.md,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captchaTargetDone: {
    backgroundColor: palette.blue,
  },
  captchaTargetText: {
    color: palette.secondaryLabel,
    fontSize: 20,
  },
  captchaTargetTextDone: {
    color: '#FFFFFF',
  },
  captchaStage: {
    borderRadius: ios ? 12 : shape.lg,
    backgroundColor: palette.fill,
    overflow: 'hidden',
  },
  captchaChar: {
    position: 'absolute',
    width: 40,
    height: 40,
    marginLeft: -20,
    marginTop: -20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captchaCharText: {
    color: palette.label,
    fontSize: 22,
  },
  captchaLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.captchaOverlay,
  },
  captchaActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
}));
