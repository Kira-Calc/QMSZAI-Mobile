import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from 'react-native';

// Android 边到边窗口由调用方按高度避让；iOS 可选择手动避让，避免重复补偿 KAV。
export function useKeyboardInsets(manualIOS = false) {
  const [state, setState] = useState({ visible: false, inset: 0 });

  useEffect(() => {
    let lastHeight = -1;
    const apply = (height: number, event?: KeyboardEvent) => {
      // will/did 通知经常给出相同终点，不能重新启动正在进行的布局动画。
      if (height === lastHeight) return;
      const opening = lastHeight <= 0 && height > 0;
      const closing = lastHeight > 0 && height === 0;
      lastHeight = height;
      if (event && Platform.OS === 'ios' && manualIOS && event.duration > 0) {
        if (closing) {
          // 回落快速收尾，避免沿用系统键盘较长的退出曲线。
          LayoutAnimation.configureNext({
            duration: Math.min(event.duration, 140),
            update: { type: LayoutAnimation.Types.easeOut },
          });
        } else if (opening) {
          // JS 布局提交稍晚于系统键盘，缩短首段上移以减少追赶感。
          LayoutAnimation.configureNext({
            duration: Math.min(event.duration, 180),
            update: { type: LayoutAnimation.Types.easeOut },
          });
        } else {
          Keyboard.scheduleLayoutAnimation(event);
        }
      }
      setState({ visible: height > 0, inset: Platform.OS === 'android' || manualIOS ? height : 0 });
    };
    const update = (event: KeyboardEvent) => {
      const height = Platform.OS === 'ios'
        ? Math.max(0, Dimensions.get('screen').height - event.endCoordinates.screenY)
        : event.endCoordinates.height;
      apply(height, event);
    };
    const hide = (event: KeyboardEvent) => {
      apply(0, event);
    };
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', update),
      Keyboard.addListener('keyboardDidHide', hide),
      ...(Platform.OS === 'ios' ? [
        Keyboard.addListener('keyboardWillShow', update),
        Keyboard.addListener('keyboardWillChangeFrame', update),
      ] : []),
    ];
    const metrics = Keyboard.metrics();
    if (metrics && Keyboard.isVisible()) {
      const height = Platform.OS === 'ios'
        ? Math.max(0, Dimensions.get('screen').height - metrics.screenY)
        : metrics.height;
      apply(height);
    }
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, [manualIOS]);

  return state;
}
