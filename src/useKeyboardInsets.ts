import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

// Android 边到边窗口由调用方按高度避让；iOS 可选择手动避让，避免重复补偿 KAV。
export function useKeyboardInsets(manualIOS = false) {
  const [state, setState] = useState({ visible: false, inset: 0 });

  useEffect(() => {
    let lastHeight = -1;
    const apply = (height: number, event?: KeyboardEvent) => {
      // will/did 通知经常给出相同终点，不能重新启动正在进行的布局动画。
      if (height === lastHeight) return;
      lastHeight = height;
      if (event && Platform.OS === 'ios' && manualIOS && event.duration > 0) {
        Keyboard.scheduleLayoutAnimation(event);
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
