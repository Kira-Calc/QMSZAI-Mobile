# 阡陌数智 · 移动端

> qmszai.cn 控制台的移动端重设计 —— 一套代码，两种原生观感：iOS 走 Apple HIG，Android 走 Material 3。

<p>
  <img alt="Expo" src="https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white" />
  <img alt="React Native" src="https://img.shields.io/badge/React%20Native-0.88-61DAFB?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white" />
  <img alt="Status" src="https://img.shields.io/badge/%E7%8A%B6%E6%80%81-%E6%BC%94%E7%A4%BA%E6%95%B0%E6%8D%AE-orange" />
</p>

## 简介

这是「阡陌数智」用户控制台的移动端实现，覆盖网站端除管理与支付之外的全部日常功能：聊天、概览、模型目录、令牌、用量日志、任务、消息、模型体验、AI 创作、人脸工具、模型融合、模型广场、个人设置与钱包。

项目不是把网页塞进 WebView，也不是一套样式两端通用：**同一个业务页面在两端各有独立样式分支**，iOS 使用系统组件、SF Symbols、连续圆角与液态玻璃，Android 使用 Material 3 的色板、形状与海拔体系，并在信息层级上向 iOS 版本对齐。

> 当前所有数据来自 `src/data/mockConsole.ts` 的模拟数据，未接入真实业务接口。详见「项目状态与边界」。

## 界面预览

**iOS（iOS 26 / HIG）**

<p>
  <img src="docs/screenshots/ios-chat.png" width="23%" alt="iOS 聊天" />
  <img src="docs/screenshots/ios-overview.png" width="23%" alt="iOS 概览" />
  <img src="docs/screenshots/ios-marketplace.png" width="23%" alt="iOS 模型广场" />
  <img src="docs/screenshots/ios-personal.png" width="23%" alt="iOS 个人设置" />
</p>

**Android（Material 3）**

<p>
  <img src="docs/screenshots/android-chat.png" width="23%" alt="Android 聊天" />
  <img src="docs/screenshots/android-overview.png" width="23%" alt="Android 概览" />
  <img src="docs/screenshots/android-ai-studio.png" width="23%" alt="Android AI 创作" />
  <img src="docs/screenshots/android-tokens.png" width="23%" alt="Android 令牌" />
</p>

## 功能

| 模块 | 能力 | 说明 |
| --- | --- | --- |
| 聊天 | 历史会话、模型切换、流式逐字回复、停止/清空、消息删除、建议问题 | 默认首屏；历史为 pageSheet，模型切换为锚定浮层 |
| 概览 | 区间切换（24h / 7d / 30d）、请求量与成功率、额度进度、统计分组、快捷入口 | 两端信息层级一致，视觉各自原生 |
| 模型目录 | 20 个模型、搜索、状态胶囊、详情 sheet、厂商矢量 logo | 对齐 `/console/model` |
| API 令牌 | 新建 / 启用 / 暂停 / 编辑 / 删除 / 详情、额度进度 | 删除有二次确认 |
| 用量日志 | 按类型筛选、分页加载、单条详情 | 对齐 `/console/log` |
| 任务 | 进度、耗时、取消、重试、语音类任务 | 模拟任务完成保留原始耗时 |
| 消息 | 未读筛选、全部已读、删除 | 对齐 `/console/message` |
| 模型体验 | 多模型切换、建议问题、流式回复、停止、清空 | 对齐 `/console/llm-experience` |
| AI 创作 | 图片 / 视频 / 音乐 / 语音四类参数表单、语音场景预设、异步任务与本次记录 | 不生成真实文件 |
| 人脸工具 | 检测与比对、双图槽位、结果列表与详情 | 不访问相册，使用示例人像 |
| 模型融合 | 快速选择、多助手模型、总结模型、500 字输入、合并结果与会话 | 对齐 `/console/fusion` |
| 模型广场 | 39 个模型、12 家厂商、搜索、分类筛选、价格与上下文 | 对齐 `/pricing` |
| 个人设置 | 资料摘要、每日签到与月历、账户绑定、语言/通知/草稿偏好、退出确认 | 对齐 `/console/personal` |
| 钱包 | 余额统计、兑换码校验与本地入账、邀请链接与奖励、兑换记录 | 充值与划转不做 |

## 设计说明

两端差异集中在样式层，业务逻辑与组件结构共用。

- **设计令牌**：`src/material.ts` 存放 Material 3 色板（`m3`）、形状尺度（`shape`）、字阶（`type`）、海拔（`elevation`）以及平台感知的 `cardSurface` / `softShadow`。iOS 分支返回空对象或 iOS 原值，安卓分支给出 M3 值。
- **样式分支**：`App.tsx` 用 `baseStyles`（仅安卓生效）与 `iosStyles`（覆盖 iOS 原值）配合 `const ios = Platform.OS === 'ios'`；子页面内联写 `ios ? 原值 : M3 值`。修改安卓样式时，iOS 数值不受影响。
- **主色**：两端都用正统蓝。iOS 用系统蓝 `#007AFF`，安卓用 `#1A73E8`（M3 primary）。
- **圆角**：卡片在 iOS 为 12pt 连续圆角，安卓为 28dp；按钮 iOS 10–12pt、安卓为胶囊。
- **按压反馈**：Android 的 `android_ripple` 蒙版恒为矩形，在圆角卡片上会画出方块，因此圆角面统一改用 Material 3 状态层（`pressedSurface` / `pressedDim`），仅矩形列表行保留水波纹。
- **安全区与滚动**：页面底部按安全区留白，纵向页面保留系统滚动条，不使用整页渐变。

## 技术栈

- **Expo SDK 58** + **React Native 0.88** + **React 19** + **TypeScript 6**
- `expo-symbols`：iOS SF Symbols
- `expo-glass-effect`：iOS 26 液态玻璃胶囊与浮层
- `@react-native-segmented-control/segmented-control`：iOS 原生分段控件
- `react-native-svg`：厂商 logo 与图标（`src/components/ModelLogo.tsx`、`AppIcon.tsx`）
- `react-native-safe-area-context`：安全区

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（Expo Go 扫码或按 i / a 直接进模拟器）
npm start

# 指定平台
npm run ios
npm run android

# 类型检查
npm run typecheck

# 导出双端产物
npx expo export --platform ios --platform android
```

环境要求：Node.js 20+、Xcode（iOS 模拟器）或 Android Studio（Android 模拟器 / 真机），以及 Expo Go。

## 目录结构

```
.
├── App.tsx                     # 应用壳、底部标签、概览 / 模型 / 令牌 / 账户页、两端样式分支
├── index.ts                    # Expo 入口
├── src
│   ├── ChatWorkspace.tsx       # 聊天工作区（历史、模型切换、消息流、输入条）
│   ├── LiquidTabBar.tsx        # 底部标签栏（iOS 液态玻璃 / Android M3 导航栏）
│   ├── material.ts             # Material 3 令牌与平台感知样式工具
│   ├── ui.tsx                  # 共享组件：Group / Row / Badge / Segmented / Sheet / EmptyState
│   ├── types.ts                # 领域类型
│   ├── components              # 厂商 logo、图标
│   ├── data/mockConsole.ts     # 模拟数据
│   ├── services/consoleAdapter.ts
│   └── screens                 # 10 个子页面
├── docs
│   ├── FEATURE_PARITY.md       # 与网站的功能对齐记录
│   └── screenshots             # README 截图
├── HANDOVER.md                 # 完整开发交接记录
└── HANDOVER_NEXT_CLI.md        # 最新简明交接入口
```

## 项目状态与边界

- **模拟数据**：所有列表、金额、用量、日志均为本地模拟；没有真实登录、鉴权与请求。
- **未实现**：登录 / 注册 / OAuth、订阅与余额流水、真实充值与划转、真实文件上传与生成。
- **明确不做**：管理员端（渠道、用户、兑换码、系统设置等）、支付交易、古今图书。
- **待确认**：真实接口契约、计费规则与权限模型，需在拿到认证契约后补齐。

## 相关文档

- [功能对齐记录](docs/FEATURE_PARITY.md)：与网站路由的逐项对照与实现程度
- [完整交接记录](HANDOVER.md)：各轮改动、踩过的坑与验证方式
- [简明接手入口](HANDOVER_NEXT_CLI.md)：最新状态与下一步

## 许可

本仓库沿用 Expo 模板的 MIT 许可证，详见 [LICENSE](LICENSE)。界面中的第三方模型名称与厂商标识归各自所有者，仅用于演示。
