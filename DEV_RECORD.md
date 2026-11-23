# QMSZAI Mobile 开发记录

> 建立日期：2026-11-17。这是本项目的**持续开发记录**，记录「需求怎么来的 → 按什么顺序做的 → 用什么方法验证的 → 结果如何」。
> 与另外两份文档的分工：
>
> - `DEV_RECORD.md`（本文）：为什么这么做、谁提的、按什么顺序、踩过什么坑。**每轮开发结束必须追加**。
> - `HANDOVER_NEXT_CLI.md`：当前代码事实、接手须知、可执行命令。偏「怎么继续干」。
> - `/Users/wenze/project.md`：跨项目档案里的当前断点与更新日志摘要。偏「这台机器上做到哪了」。
>
> 记录约定：只写事实，不写猜测；不写密钥、Cookie、账号密码值；未提交未推送要写明；用户提示词保留原话（能取到原文时逐字记，取不到的标【回溯】并说明依据）。

---

## 1. 项目概览

| 项 | 内容 |
| --- | --- |
| 名称 | 阡陌数智 · 移动端（QMSZAI Mobile） |
| 仓库 | `/Users/wenze/Documents/GitHub/QMSZAI-Mobile`，远程 `github.com/Kira-Calc/QMSZAI-Mobile`（main） |
| 定位 | 阡陌数智（new-api 系）用户控制台的 iOS / Android 客户端 |
| 服务端 | 测试环境 `https://test.qmszai.cn`；接口依据 `~/Downloads/APP测试环境API接口文档.md` + new-api 源码对照 |
| 范围 | 登录用户的全部**非支付、非管理员**功能。管理员端、支付交易、「古今图书」明确不做 |
| 当前状态 | 全部页面接真实接口，双端功能与视觉回归通过；剩余为细节打磨与等待用户提交推送 |
| 提交策略 | 用户自行 commit / push，agent 不自动提交、不自动推送 |

---

## 2. 技术栈与环境

- Expo SDK 58 / React Native 0.88 / React 19 / TypeScript 6，入口 `index.ts` → `App.tsx`。
- 原生能力：`expo-secure-store`（会话）、`expo-glass-effect`（iOS 26 液态玻璃）、`expo-blur`（渐变模糊）、`expo-symbols`（SF Symbols）、`expo-video`、`expo-media-library`、`expo-sharing`、`expo-image-picker`、`expo-localization`、`expo-file-system`、`@react-native-async-storage/async-storage`、`react-native-svg`。
- 运行：`npx expo start --localhost --port 8091`，Expo Go 58.0.4。
- 质量门禁：`npx tsc --noEmit --noUnusedLocals`、`git diff --check`、必要时 `npx expo export --platform ios --platform android`。
- 设备：
  - iOS 模拟器 iPhone 18 Pro，UDID `C0A7ECCE-6CA4-40E4-B955-0ECB870F9B6D`（iOS 27）。注意另有一台 booted 设备，`simctl io booted` 会截错屏，命令里必须写 UDID。
  - 安卓 AVD `qmszai_pixel`（1080×2400，截图 900×2000，坐标 ×1.2），通常 `emulator-5554`。

---

## 3. 开发方法（我的 skill / 工具链）

这套方法在 2026-11-11 之后固定下来，是后续所有轮次的通用流程。

### 3.1 每轮的固定流程

1. 读 `/Users/wenze/project.md` 的接手入口 + 本项目章节 → 读 `HANDOVER_NEXT_CLI.md` → `git status` / `git diff` 核对实际代码，不信旧行号。
2. 改动只落在必要文件，跟随现有命名与结构（`themedStyles`、`palette` / `m3`、`t()` / `tf()`）。
3. `npx tsc --noEmit --noUnusedLocals` + `git diff --check` 必须干净。
4. **双端实测**：iOS 用 Appium 驱动 + `simctl` 截图；安卓用 `adb` 点击 + `screencap`。涉及 iOS/安卓观感差异的，必须两端各截一张图核对。
5. 写 `HANDOVER_NEXT_CLI.md` 本轮小节 → 写 `/Users/wenze/project.md` 的断点与更新日志。
6. 明确告知用户「未提交、未推送」，等用户处理。

### 3.2 iOS 自动化

- Appium 3.9.0 + `appium-xcuitest-driver`，`appium --port 4723`，capability：`platformName=iOS`、`bundleId=host.exp.Exponent`、`automationName=XCUITest`、`noReset=true`、`udid` 写死。
- 自建轻量脚本 `/tmp/wd.mjs`（每次环境重置后重建）：`tap x y` / `swipe` / `type` / `shot` / `src` / `clickid 名称`。`src` 拉 `GET /session/:id/source` 存 `/tmp/wd_src.xml`，`clickid` 从 UI 树里按 `name` 或 `label` 找元素再算中心点，比手猜坐标稳。
- 取元素坐标：`grep` UI 树里的 `x/y/width/height`，直接按 UI 树坐标点击（点在屏幕上就是 1:1 的 pt）。
- 截图：`xcrun simctl io <UDID> screenshot /tmp/x.png`；`openurl` 拉起项目；`ui <UDID> appearance dark|light` 切系统外观。
- 已知坑：
  - 登录后系统会弹「保存密码?」，必须点「以后」。
  - 输入框用 clear + 逐字符发送按键，比一次 `setValue` 稳。
  - Expo Go 右上角悬浮齿轮是开发覆盖层，不是 App UI，可能压住右上角按钮。
  - 自动化 `keys` 在 iOS/安卓都插不进换行，多行输入只能验证单行。
  - `simctl recordVideo` 偶尔报 `Host recording is already in progress` 且 `pkill` 后仍占用；截图耗时大于动画时长，抓不到中间帧。要看动画中间态只能临时把 `duration` 放大（如 1200/1500/3000ms），确认后必须改回。

### 3.3 安卓自动化

```bash
export ANDROID_HOME=~/Library/Android/sdk
$ANDROID_HOME/platform-tools/adb reverse tcp:8091 tcp:8091
$ANDROID_HOME/platform-tools/adb shell am force-stop host.exp.exponent
$ANDROID_HOME/platform-tools/adb shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8091' host.exp.exponent
$ANDROID_HOME/platform-tools/adb exec-out screencap -p > /tmp/shot.png
$ANDROID_HOME/platform-tools/adb shell input tap <x> <y>
$ANDROID_HOME/platform-tools/adb shell cmd uimode night yes|no   # 夜间模式
```

- 恢复模拟器快照后必须 `adb reverse` + 重载 Expo Go，否则看到的是旧缓存包（表现为旧版「演示 / 模拟数据」界面）。
- 安卓登录态容易失效（`fetchSelf` 401 → `clearSession`），账号 `kira` 密码未知。做纯视觉验证时的做法：从 iOS 模拟器的 `host.exp.Exponent.binarycookies` 里解析出仍有效的 `session`，临时塞进 `src/api/client.ts` 的 `restoreSession()`，**验完立刻 `git checkout -- src/api/client.ts` 并确认无 diff**。

### 3.4 视觉判断手段

- **像素取样**：`python3` + PIL 在截图固定坐标取 RGB，用来量化「遮罩多深」「底色对不对」而不是凭感觉。例：iOS 浅色页面底色 `#F2F2F7` 上，backdrop 0.35 → `(186,…)`、0.12 → `(215,215,220)`、0.10 → `(219,219,224)`。
- **临时放大动画时长**抓中间帧，判断是「插值过渡」还是「瞬切」。
- **伪造临时数据**验证少见状态（未读徽标、进度条、已完成的生成记录），验完删除。
- 截图里的圆形齿轮浮层是模拟器自身的，不属于 App。

### 3.5 后端事实核对

遇到「这个功能后端有没有接口」的问题，不靠猜：对照 new-api 主干源码（`model/`、`controller/`、`router/api-router.go`）+ 直接 curl 线上路由探测（404 即无）。例：确认**没有**头像接口、`/api/token/:id/key` 是 POST 而不是 GET、`aff_code` 来自 `/api/user/self`。

---

## 4. 用户提示词档案

> 说明：能取到原话的逐字记录；早期轮次只留有整理后的需求要点，标注【回溯】，依据是 `HANDOVER_NEXT_CLI.md` 与代码变更。
> 这份档案的用途：新会话接手时不需要用户重述一遍要求。

### 4.1 项目级长期约束（每一轮都必须遵守）

【原话，2026-11-11 至 2026-11-13 多轮下达】

- 「iOS 参照 Apple HIG（含 iOS 26 液态玻璃）；Android 按 Material 3 向 iOS 观感靠拢；安卓主题色 `#1A73E8`，iOS 保持 `#007AFF`。」
- 「改安卓不影响 iOS；iOS 保留原有圆角、尺寸、字号；安卓组件不要阴影，仅底部导航栏保留。」
- 「键盘弹出时输入框同步上移；输入区上方用渐变模糊，不要灰色渐变带或不透明底色。」
- 「说明性小字一律去掉；页面底部不被安全区硬切；不用整页渐变；纵向滚动页保留系统滚动条。」
- 「不含管理员端与支付；『古今图书』完全不做；不自动 commit、不自动 push。」
- 「测试环境 `https://test.qmszai.cn/`；有问题向用户反馈。」
- 「夜间模式全界面适配；外观、语言均为『跟随系统 / 中文（简体）/ English』三选一，默认浅色 + 简体中文。」

### 4.2 按轮次的提示词

| # | 日期 | 提示词 | 类型 |
| --- | --- | --- | --- |
| 1 | 11-09 | 用 Expo + TypeScript 做阡陌数智的移动端 App，先出完整 UI，后续接真实接口 | 【回溯】 |
| 2 | 11-09～11-11 | 五个标签页（聊天 / 概览 / 模型 / 令牌 / 账户）+ 子页体系；iOS 走 HIG 与液态玻璃，安卓按 Material 3 重做 | 【回溯】 |
| 3 | 11-11 | 输入区上方的渐变阴影不合格，改成渐变模糊；安卓全部扁平化，只有底栏留阴影 | 【回溯】 |
| 4 | 11-11 | 接真实接口，登录、令牌、聊天、AI 创作都要真数据 | 【回溯】 |
| 5 | 11-12 | 聊天要能流式输出、停止、删除会话；回复里的 Markdown 要正常渲染 | 【回溯】 |
| 6 | 11-12 | 所有模型列表加搜索、A-Z 索引、按名称排序 | 【回溯】 |
| 7 | 11-12 | 消息气泡加时间戳、复制；用户消息要能编辑后重新生成 | 【回溯】 |
| 8 | 11-12 | 底栏收起/展开不要瞬切，要有过渡动画 | 【回溯】 |
| 9 | 11-12 | 令牌表单对齐网页端：分组多选 + 优先级、无限额度、金额、模型限制、IP 白名单 | 【回溯】 |
| 10 | 11-12 | 做全界面夜间模式 | 【回溯】 |
| 11 | 11-13 | 外观、语言都改成「跟随系统 / 浅色或简体中文 / 深色或 English」三选一，默认浅色 + 简体中文 | 【要点】 |
| 12 | 11-13 | 钱包邀请码显示不对（灰框底边溢出、`l`/`I` 分不清） | 【要点】 |
| 13 | 11-13 | 把「消息」入口从概览页搬到账户中心右上角 | 【要点】 |
| 14 | 11-13 | 「加一个自定义头像的功能，问后端有没有接口」 | 【原话】 |
| 15 | 11-13 | 令牌页要能复制密钥 | 【要点】 |
| 16 | 11-13 | AI 创作要有生成记录、进度条，离开页面和杀 App 都不能丢 | 【要点】 |
| 17 | 11-13 | 生成结果要在 App 内预览和下载，不要跳浏览器 | 【要点】 |
| 18 | 11-13 | 「令牌页的新建令牌按钮放到右下角变成一个圆圈」 | 【原话】 |
| 19 | 11-13 | 「点击上方空白区域时，不会退回到上一个界面」 | 【原话】 |
| 20 | 11-13 | 「注意看ios端，当下面的卡片弹出时，会有一个明显的灰色遮罩，这样太突兀了」 | 【原话】 |
| 21 | 11-13 / 11-16 | 「存储开发进度」 | 【原话】 |
| 22 | 11-17 | 进度写进 `project.md`；把本项目所有提示词、开发 skill、开发顺序、结构、开发日志整理成持续记录文档；QMSZAI Mobile 设为活跃项目，所有 UQ 项目标记已完成 | 【原话】 |
| 23 | 11-23 | 「现在要检查mobile和web端的对话与令牌管理同步的问题；检查这两项是否能同步且技术上是否能实现」 | 【原话】 |
| 24 | 11-23 | 「现在提示登录失效后，会有一个弹窗，但我需要让它自动跳转到重新登录对界面」 | 【原话】 |
| 25 | 11-23 | 「模型列表里有些图标不对，没有对应上」 | 【原话】 |
| 26 | 11-23 | 「这个每一个状态显示都是来自后端的真实数据吗」 | 【提问】关于模型状态胶囊 |

---

### 4.3 提示词风格与偏好总结

把 22 条提示词放在一起看，模式非常稳定。这部分用于「用户没说，但默认要这样做」的判断。

**表达方式**

- 短句、口语为主，一次只提一个具体现象，很少写长需求文档。例：「令牌页的新建令牌按钮放到右下角变成一个圆圈」。
- 报问题多用否定句，只给现象不给原因：「点击上方空白区域时，不会退回到上一个界面」「当下面的卡片弹出时，会有一个明显的灰色遮罩，这样太突兀了」。**期望的是自己找到根因**，而不是照着字面调参数。
- 会直接贴截图沟通，截图本身就是验收标准的一部分（位置、间距、层级都要对得上）。
- 要求"存储开发进度"时，指的是**写进档案**，不是口头复述。

**隐含的优先级**（冲突时按此顺序判断）

1. 平台观感正确（iOS 像 iOS、安卓像 M3 且向 iOS 靠拢，不用一套折衷方案糊两边）。
2. 视觉干净：没有多余的小字、入口、徽标、留白、灰带。
3. 交互不出错：点了要有反应，该退一层就退一层，键盘不能挡住操作。
4. 动效自然：能插值就不要瞬切，但必须快（不能落后于键盘）。
5. 代码整洁：类型干净、样式走令牌、文案走 i18n。

**「一句话需求」→ 实际要做的动作**

| 用户说 | 真实含义 | 落地动作 |
| --- | --- | --- |
| 「太突兀了」 | 层级 / 动画 / 权重问题，通常不是单个颜色值 | 先查是不是整块背板跟着动画走，再看透明度与投影配比 |
| 「不会退回到上一个界面」 | 命中区域或事件没接上 | 先看背板是不是纯 `View`，有没有 `Pressable`；多级弹层要按「一次退一层」分流 |
| 「放到右下角」 | 悬浮且不随内容滚动 | 外层包 `flex: 1` 容器，列表补 `paddingBottom`，位置按底栏高度推算 |
| 「和 iOS 一样」 | 观感对齐，不是照抄尺寸 | 安卓保留 M3 尺寸与无阴影，只对齐层级、圆角语言、信息密度 |
| 「不要小字」 | 说明性副标题一律删 | 保留单位、状态、必填提示；空态只留一句话 |
| 「存储进度」 | 写档案 | `DEV_RECORD.md`（过程）+ `HANDOVER_NEXT_CLI.md`（事实）+ `project.md`（状态）三处同步 |
| 「问后端有没有接口」 | 不要猜、不要造 | 对照 new-api 源码 + curl 探测路由，给结论和证据 |

**已被用户明确否掉的方案（不要再提）**

- 输入条上方的灰色渐变阴影 / 不透明底色遮罩（11-11 判定不合格，改用 `BlurView` + SVG 蒙版）。
- 安卓照搬 iOS 阴影（只允许底栏有阴影）。
- 用 `LayoutAnimation` 做尺寸/圆角动画（会抖动）。
- 弹层用 `Modal animationType="slide"` 连背板一起推上来。
- 管理员端、支付、「古今图书」相关的一切功能。

## 5. 开发顺序与里程碑

按实际执行顺序，对应 git 提交（`git log --oneline`：`d620e7c` → `657eb72`）。

### 阶段一：脚手架与纯模拟 UI（11-09 ~ 11-11）

1. `create-expo-app` 建 TypeScript 模板（`d620e7c Initial commit`、`4069225 First`）。
2. 纯 mock 数据搭完整信息架构：五标签页 + 子页（聊天、概览、模型目录、模型广场、模型详情、模型体验、模型融合、令牌、用量日志、任务、消息、账户、个人设置、钱包、AI 创作、登录）。
3. iOS 侧做 Apple HIG 观感：12pt continuous 圆角白卡、SF Symbols、液态玻璃底栏（可拖动指示块、滚动收起为圆钮）、分组列表 `Group`/`Row`。
4. 安卓按 Material 3 重做（`src/material.ts` 为唯一令牌来源），再把主色改为 `#1A73E8`；概览页拆成 iOS / 安卓两套 JSX。

### 阶段二：输入区与键盘（11-11）

- 放弃「输入条上方阴影」，改为 `expo-blur` 的 `BlurTargetView` + `BlurView` + SVG 透明度蒙版做渐变模糊（强度 45、上伸 40dp、总高 48dp）。
- 聊天页改普通 View + `useKeyboardInsets(true)`：安卓用键盘事件高度，iOS 用 `screen.height - keyboard.screenY`；上移 180ms / 收起 140ms。
- 安卓全面扁平化：卡片、输入框、建议卡、弹层、底栏选中项去阴影，只保留底栏整体阴影。

### 阶段三：真实接口接入（11-11 ~ 11-12）

1. `src/api/client.ts`：XHR 读 `Set-Cookie`、`Cookie` + `New-Api-User`、30s 超时、`{success,message,data}` 判定、SSE 流式解析、错误中文化。
2. `src/api/endpoints.ts` 覆盖站点配置 / 验证码 / 短信 / 登录注册找回 / 2FA / 用户资料 / 模型 / 音色 / 视频能力 / 媒体任务 / 签到 / 邀请码 / 会话 / 消息 / 日志 / 任务 / 统计 / 令牌。
3. **iOS 401 根因修复**：NSURLSession 接管 `Cookie` 头，iOS 不再手工设 `Cookie`，交给原生 jar，只发 `New-Api-User`。
4. `AuthProvider` + `LoginScreen`（同屏 login/register/reset、图形验证码坐标点选、2FA、站点配置、`quotaPerUnit`）。
5. `useConsoleData` / `liveConsole` / `mediaModels` 做 DTO→UI 映射与计费换算；删掉 `consoleAdapter`，mock 只剩 `usageRangeOptions`。
6. 逐页接入：聊天（真实会话、流式、删除）、概览、模型目录、模型广场、模型体验、模型融合、令牌、日志、任务、消息、账户 / 个人设置 / 钱包、AI 创作（图/视频/音乐/语音）。
7. 人脸工具因文档无接口，移除入口与页面。

### 阶段四：双端回归 + 交互细化（11-12）

- 双端全量页面回归（真实账号），修：模型详情空行、空能力标签、可对话模型过滤、日志/任务进入即刷新、用户资料刷新、空态小字。
- `src/richText.tsx`：Markdown 粗体 / 行内代码 / 代码块 / 标题 / 列表 / 引用；历史预览用 `plainText()`。
- 模型列表统一：搜索框（聊天弹层顶部直接变搜索）、A-Z 索引 `AlphabetRail`、自然排序、顶部滚动模糊、空结果卡片、底部渐隐。
- 消息气泡时间戳 / 复制 / 编辑重生成（服务端无单条编辑接口，只能本地改）。
- 底栏收起/展开：单个 `Animated.Value` 驱动宽度 / 高度 / 圆角 / 双层内容交叉淡化（240ms）。
- 令牌：分组可搜索多选 + 优先级、无限额度 / 金额 / 模型限制 / IP 白名单、表单键盘避让、iOS `Switch` 居中、选择页交叉淡化。
- 令牌弹层键盘遮挡：面板铺到屏幕底部，`paddingBottom = 键盘高度 + 16`（+16 是键盘顶部半透明边缘的宽度）。
- **夜间模式**：`src/theme.ts`（4 套 palette + 2 套 m3、读取时求值的 Proxy、`themedStyles`、`useScheme`/`isDark`/`initTheme`），全部 `StyleSheet.create` 改 `themedStyles`，18 处 `TextInput` 加 `keyboardAppearance`。（提交 `9ff4dc7`）

### 阶段五：三选一设置 + 账号相关（11-13，提交 `539127d`）

- 外观三选一（跟随系统 / 浅色 / 深色）搬到「个人设置」，`Appearance.setColorScheme` + `addChangeListener`。
- 语言三选一 + `src/i18n.ts` / `i18n.en.ts`（442 条），613 处文案 codemod 包 `t()/tf()`，修模块级常量冻结、`expo-localization` 取系统语言。
- 钱包邀请码改成 `Row`（等宽字体 + 复制），补 `/api/user/aff`；英文长值缩短。
- 消息入口搬到账户中心右上角玻璃按钮 + 未读徽标；概览页清理；消息空态按 tab 区分。
- 自定义头像：后端确认无接口 → 本地存储（`src/avatar.ts` + `src/components/UserAvatar.tsx`），预留远端同步注释。
- 令牌：进入即刷新、`POST /api/token/:id/key` 复制密钥。
- AI 创作：进度条（不确定进度 30s 到 90%）、模型行图标、应用内预览（`expo-video`）、固定底部下载（相册 / 分享回退）、记录持久化 + 后台任务恢复（`src/mediaGenerations.ts`、`src/services/mediaTasks.ts`）。
- 令牌页新建入口改右下角圆形 FAB。
- 令牌弹层点空白返回，分层退一层。

### 阶段六：弹层动效细节（11-16 ~ 11-17）

- `SheetModal` 容器：背板 `opacity` 淡入 + 面板 `translateY` 上滑（开 280ms / 关 200ms，播完卸载）。
- iOS 遮罩压轻（浅 0.35 → 0.10，深 0.62 → 0.40），面板补自身投影；安卓不动。
- 建立本开发记录文档；活跃项目切到 QMSZAI Mobile。

---

## 6. 项目结构

```
index.ts                 注册根组件
App.tsx                  App 壳 + 五个主标签页 + 旧页面（概览/模型/令牌/账户）+ 令牌弹层 + SheetModal
src/
  api/
    client.ts            请求核心：XHR + Set-Cookie、鉴权头、超时、SSE 流式、错误中文化
    endpoints.ts         全部接口封装
    types.ts             DTO 类型
    format.ts            额度→货币、时间、相对时间
  auth/AuthProvider.tsx  登录态、2FA pending、站点配置、quotaPerUnit、会话恢复/退出
  theme.ts               4 套 palette + 2 套 m3、themedStyles、useScheme/useThemeMode/initTheme/isDark
  material.ts            Material 3 令牌（cardSurface/softShadow 在 iOS 返回空对象）
  i18n.ts / i18n.en.ts   t()/tf()、语言解析与持久化、英文词典
  ui.tsx                 共享组件：Group/Row/Sheet/SheetHeader/AlphabetRail/GlassSurface/SegmentedControl 等
  LiquidTabBar.tsx       液态玻璃底栏 + 收起/展开动画
  ChatWorkspace.tsx      聊天：会话列表、流式、气泡操作、模型选择浮层、输入条与模糊
  richText.tsx           Markdown 渲染 + plainText()
  messageTime.ts         气泡时间格式
  modelSort.ts           名称自然排序与字母归并
  useKeyboardInsets.ts   键盘高度与避让
  avatar.ts              本机头像存储（按 userId 索引，预留远端同步）
  mediaGenerations.ts    生成记录 store（AsyncStorage + 订阅 + 账号隔离）
  services/
    useConsoleData.ts    并发取数（模型/日志/任务/额度/令牌/公告）
    liveConsole.ts       DTO→UI 映射、计费换算、分组优先级解析
    mediaModels.ts       媒体模型分类、价格、任务状态与结果 URL 提取
    mediaTasks.ts        后台任务轮询（video/music/music3/audio）+ 恢复
  components/
    AppIcon.tsx          SF Symbols / Ionicons 统一图标
    ModelLogo.tsx        厂商矢量 logo
    UserAvatar.tsx       头像（无图回退首字母）
  screens/
    LoginScreen.tsx      登录/注册/找回 + 图形验证码 + 2FA
    ModelExperienceScreen.tsx / FusionScreen.tsx / ModelMarketplaceScreen.tsx
    MediaStudioScreen.tsx       AI 创作（图片/视频/音乐/语音）
    MessagesScreen.tsx / TasksScreen.tsx / UsageLogsScreen.tsx
    PersonalScreen.tsx / WalletScreen.tsx
  data/mockConsole.ts    仅剩 usageRangeOptions
  types.ts               UI 侧类型（Token、MediaGeneration 等）
```

---

## 7. 开发规范

分三层：**设计与平台规范**（做出来什么样）、**代码规范**（怎么写）、**流程与安全规范**（怎么交付）。这些是长期有效的约定，改动要先问用户。

### 7.1 设计与平台规范

- **平台分工**：iOS 走 Apple HIG + iOS 26 液态玻璃（`GlassView`）；安卓走 Material 3，但观感向 iOS 靠拢（同样的信息层级、圆角语言、分组列表）。**不要用一套折衷方案同时糊两边**。
- **主题色**：iOS `#007AFF`（深色 `#0A84FF`）；安卓 `#1A73E8`，深浅色都用品牌蓝。
- **阴影**：安卓只有底部导航栏有阴影，其余组件一律扁平；iOS 卡片靠留白与描边层次，弹层可带柔和投影（`shadowOpacity 0.1`、radius 18、offset `{0,-4}`）。
- **圆角**：iOS 卡片 12pt + `borderCurve: 'continuous'`、无描边；安卓按 M3 形状令牌（`material.ts`）。
- **尺寸**：iOS 保留原有圆角 / 字号 / 间距，不因安卓调整而变。安卓触摸目标 ≥ 48dp，iOS ≥ 44pt。
- **文案**：不加说明性小字；空态一句话；不写营销腔。数字带单位，状态用短词。
- **滚动**：纵向页面保留系统滚动条；底部不被安全区硬切；不用整页渐变。
- **图标**：iOS 用 SF Symbols（`SymbolView`），安卓用 `AppIcon` 的 Ionicons 映射，两者从同一个 `name` 出发（如 `plus` → `add`）。
- **动效基线**（改时长先对照这组）：
  - 底部弹层：开 280ms（`Easing.out(cubic)`）、关 200ms（`Easing.in(cubic)`），播完才卸载。
  - 底栏收起/展开：240ms `Easing.inOut(Easing.ease)`，单个 `Animated.Value` 同时驱动宽/高/圆角/双层淡入淡出。
  - 键盘：iOS 首次上移 ≤180ms、收起 ≤140ms；其余跟系统动画；不能落后键盘，也不能回落后再跳一下。
  - 主标签切换：内容 240ms 淡入上移，标题 280ms。
- **弹层**：背板淡入 + 面板上滑；点背板返回一层（选择页 → 表单 → 关闭），不要一次关到底。
- **主题实现**：颜色只能引用 `palette.*` / `m3.*`，样式里不写字面量。`iosStyles` 是**整键覆盖**，iOS 分支必须写全该键的所有属性（否则会回落到黑字或丢 `flexDirection`）。

### 7.2 代码规范

- **类型**：TypeScript strict；收尾必须 `npx tsc --noEmit --noUnusedLocals` 零报错。不写 `any`；外部 DTO 先 `unknown` + 类型守卫（参考 `mediaGenerations.ts` 的 `isRecord`）。
- **命名**：页面/组件 PascalCase（`ChatWorkspace.tsx`、`UserAvatar.tsx`），模块 camelCase（`mediaGenerations.ts`、`useKeyboardInsets.ts`）。页面统一放 `src/screens/`。
- **组件写法**：`export function Name({ … }: { … }) {}`，props 用内联对象类型；跨文件复用的类型放 `src/types.ts` 或 `src/api/types.ts`。
- **样式**：一律 `themedStyles()` 工厂，不用 `StyleSheet.create` 静态表；`makeBaseStyles()` + `makeIosStyles()` 浅合并，样式键用语义名（`modalSheet`、`tokensPane`），不要 `box1`。
- **平台分支**：`Platform.OS === 'ios' ? A : B` 或提前 `const ios = Platform.OS === 'ios'`；共用逻辑抽上层，**不要整段复制两遍**（整页级别确实差异大时，像概览页那样拆两套 JSX 并在注释里说明）。
- **模块级状态**（本机存储、主题、语言）：统一 `模块级变量 + subscribe/emit + useSyncExternalStore`，参考 `theme.ts`、`i18n.ts`、`avatar.ts`、`mediaGenerations.ts`。
- **注释**：中文，写「为什么」和坑点，不写「这是什么」。例：`// +16 是键盘顶部半透明模糊边的宽度，刚好等于键盘高度时按钮会被压住`。文件头写模块职责与关键约束。
- **错误处理**：区分「后台静默失败」（刷新失败保持空数组、不打断其他模块）与「用户动作失败」（必须 `Alert` 提示）；不要把服务端错误原文直接抛给用户，走 `localizeMessage`。
- **依赖**：新增原生依赖用 `npx expo install`（不要手写版本），同时补 `app.json` 的 `plugins` 并说明权限文案。

### 7.3 交互与无障碍

- 所有可点区域给 `accessibilityRole="button"`，给语义化 `accessibilityLabel`（现网 45 个 label、71 个 role）。例：背板遮罩也要有 label（「取消」「关闭令牌详情」）。
- 可选中项用 `accessibilityState={{ selected }}`；选中行既要有颜色也要有勾选/序号。
- 小图标按钮包一层 32–44pt 圆底，避免点不中。
- 弹层里的列表要 `keyboardShouldPersistTaps="handled"`，键盘弹起时点列表项要一次生效（不能先收键盘再点第二次）。
- 键盘弹起时，被聚焦的字段和主操作按钮都必须在可视区内；iOS 需要「键盘高度 + 16」的底部内边距。

### 7.4 国际化

- 中文原文即 key：`t('复制密钥')`；带参用 `tf('{0} 等 {1} 个', a, b)`。
- **新增界面文案必须同轮补 `src/i18n.en.ts`**，否则英文下会露出中文（现网 463 条，需与源码 key 一一对应）。
- 模块级常量不能存 `t()` 的结果（会在模块加载时冻结语言），改成函数或在组件内求值。
- 格式化分语言：中文用万/亿，英文用 K/M/B；相对时间区分单复数；日期英文用 `en-US`。
- 不需要翻译的：服务端错误映射表的中文值、厂商中文 key、语言名本身（「简体中文」）。

### 7.5 流程与提交规范

- **不自动 commit、不自动 push**，不覆盖其他 CLI 的改动；提交与推送由用户执行。
- 每轮收尾：`npx tsc --noEmit --noUnusedLocals` + `git diff --check`，并说明「未提交、未推送」。
- 改了视觉就必须**双端截图**；只在一端验证要明确写出来。
- 安卓验证若临时改了 `src/api/client.ts`，验完立刻 `git checkout -- src/api/client.ts` 并确认 `git status` 里没有它。
- 文档三件套同步：`DEV_RECORD.md`（过程与需求）→ `HANDOVER_NEXT_CLI.md`（代码事实与命令）→ `project.md`（跨项目状态）。
- 新需求先进 §4.2 表格，再动代码。

### 7.6 安全与隐私

- 不输出、不记录密钥、Cookie、账号密码值；密钥只进剪贴板，不落到界面或日志。
- 会话存 `expo-secure-store`；**iOS 不要手工设 `Cookie` 头**（会被 NSURLSession 覆盖），交给原生 jar。
- 不把 `project.md` 等本机档案整体提交到公开仓库；截图里有敏感值先遮挡。
- 安卓临时注入会话只用于本机视觉验证，不改提交。

### 7.7 验证标准

- **视觉**：双端各截一张图；涉及颜色/遮罩的用像素取样给出数值（例：0.35 → `(186,…)`、0.10 → `(219,219,224)`）。
- **动效**：截图抓不到中间帧时，临时把 `duration` 放大确认是插值还是瞬切，确认后改回原值并在日志里记一笔。
- **功能**：真实账号走主路径 + 回退路径（失败、空态、无权限）。
- **数据**：临时令牌 / 伪造生成记录 / 伪造未读消息，验完即删，并复核接口 `total` 回到原值。

## 8. 开发日志

### 2026-11-09 ~ 11-11 · 从空模板到双端完整 UI

- 建 Expo TS 模板；纯 mock 搭出五标签页 + 全部子页，iOS 液态玻璃底栏、12pt continuous 圆角、`Group`/`Row` 设置列表。
- 安卓按 M3 重做，主色定为 `#1A73E8`，概览页单独拆出安卓 JSX（放弃深色 hero 与 2×2 磁贴）。

### 2026-11-11 · 扁平化 + 键盘避让 + 渐变模糊

- 用户判定「输入条上方渐变阴影」不合格：40dp 渐变末段用页面底色不透明收尾，把卡片从中间切平。改为 `BlurTargetView` + `BlurView` + SVG 蒙版。
- 安卓全面去阴影（卡片 / 输入框 / 建议卡 / 弹层 / 底栏选中项），只留底栏整体阴影。
- 键盘：安卓用键盘事件高度、iOS 用 `screen.height - keyboard.screenY`；首次上移 180ms。

### 2026-11-12 · 真实接口 + 双端全量回归

- 接口层落地；iOS 401 根因（NSURLSession 接管 Cookie 头）修复；登录 / 验证码 / 2FA 打通。
- 双端逐页回归通过；补 Markdown 渲染、模型搜索 + A-Z 索引 + 自然排序 + 顶部模糊、气泡时间戳/复制/编辑重生成。
- 底栏收起/展开改单 `Animated.Value` 插值（240ms），修掉 `LayoutAnimation` 的抖动。
- 令牌表单对齐网页端（分组多选、无限额度、金额、模型限制、IP 白名单）；令牌弹层键盘避让。
- 全局夜间模式落地（`src/theme.ts`，提交 `9ff4dc7`）。

### 2026-11-13 · 设置项、账号、令牌与 AI 创作收尾（提交 `539127d`）

- 外观 / 语言改三选一；新增 `expo-localization` 依赖与 `i18n.en.ts`（442 → 463 条）。
- 钱包邀请码显示修正（灰框 → `Row`，等宽字体，补 `aff_code` 为空时调 `/api/user/aff`）。
- 消息入口移到账户中心右上角（玻璃按钮 + 未读徽标）；概览页清理。
- 自定义头像（后端无接口 → 本机存储，预留远端同步）。
- 令牌：进入即刷新、复制密钥（`POST /api/token/:id/key`）。
- AI 创作：进度条、模型行图标、应用内预览 + 固定底部下载（相册 / 分享回退）、记录持久化与后台任务恢复。
- 令牌页新建入口改右下角 56pt 圆形 FAB；令牌弹层点空白返回（分层退一层）。

### 2026-11-16 · 弹层遮罩与动效

- 用户反馈 iOS「卡片弹出时有明显灰色遮罩刷上来」。根因是 `Modal animationType="slide"` 把整屏背板和面板一起从底部推上来。
- 新增 `SheetModal`：`animationType="none"`，背板只做 `opacity`，面板单独 `translateY`；关 200ms 播完才卸载（`TokenModal` 用 `lastToken` 保持内容）。
- iOS 遮罩 0.35 → 0.10（深色 0.62 → 0.40），面板补自身投影；安卓数值未动（深色页面底色纯黑，遮罩叠黑无视觉效果）。
- 踩坑：`simctl recordVideo` 报 `Host recording is already in progress`，`pkill` 后仍占用；调试用的 `duration: 1200/1500/3000` 已全部改回 280。

### 2026-11-17 · 建立持续开发记录 + 切换活跃项目

- 新增本文档（`DEV_RECORD.md`），把项目级长期约束、按轮次提示词、开发顺序、目录结构、设计规范、开发日志固化下来，作为持续记录入口。
- `project.md`：QMSZAI Mobile 设为唯一活跃项目；所有 UQ 课程项目标记为已完成；补本轮断点与更新日志。
- `AGENTS.md` 的「唯一活跃项目」同步改为 QMSZAI Mobile。
- 补充 §4.3「提示词风格与偏好总结」：表达方式（短句、只给现象、贴截图）、隐含优先级（平台观感 > 视觉干净 > 交互正确 > 动效自然 > 代码整洁）、「一句话需求 → 实际动作」对照表、已被否掉的方案清单。
- 把 §7「设计规范」扩成 §7.1–§7.7 的完整开发规范：设计/平台、代码、交互与无障碍、国际化、流程与提交、安全与隐私、验证标准，含动效时长基线（弹层 280/200、底栏 240、键盘 180/140、标签切换 240/280）。
- 本轮仅文档改动，未改代码逻辑；未提交、未推送。

---

## 9. 已知限制与待确认

1. **服务端没有单条消息编辑/删除接口**：气泡编辑只改本地会话，重新进入该对话会按服务端记录恢复（表现为多一轮）。要真正覆盖历史必须先由后端补接口。
2. **安卓登录态**：账号 `kira` 密码未知，会话失效后无法在安卓上重新登录；纯视觉验证靠临时注入 iOS 会话（已还原，`client.ts` 无 diff）。需要用户提供密码或重新登录。
3. **多行输入无法自动化验证**：Appium 按键插不进换行，IP 白名单多行只验证过单行提交与回填。
4. **Markdown 覆盖有限**：只处理粗体、行内代码、代码块、标题、列表、引用；不含表格 / 图片 / HTML，链接只保留文字。
5. **AI 创作安卓回归**：应用内预览与下载（相册权限、视频控件）只在 iOS 实测过；音乐任务（`music` / `music3`）后台恢复未单独跑。
6. **键盘动画逐帧同步性**：沿用 11-11 的结论，未做快速开合的逐帧回归。
7. **钱包**：只做展示与复制，未接「邀请额度转入余额」（`POST /api/user/aff_transfer`）。
8. **README 落后**：`README.md` 仍写着「使用本地模拟数据，尚未接入登录和业务接口」，与现状不符，需要时单独更新。

---

## 10. 维护规则

- 每轮开发结束，在 §8 追加一节（日期 + 做了什么 + 为什么 + 验证方式 + 踩坑），不要改写历史结论；结论被推翻时新增一条并注明「旧结论作废，原因…」。
- 用户新提的提示词，先加进 §4.2 表格再动代码，标【原话】或【要点】；若暴露出新的偏好规律，补进 §4.3。
- 出现新的长期约定（颜色、圆角、动效时长、文案规则），写进 §7 对应小节，并在 §8 当天日志里注明是哪一轮用户要求的。
- 代码结构变化时同步 §6；设计规则变化时同步 §7，并写明是哪一轮用户要求的。
- 本文档不放密钥、Cookie、账号密码、private token。

### 2026-11-23 · 跨端同步核查（对话 / 令牌管理）

- 用户要求检查 mobile 与 web 的「对话」「令牌管理」是否同步、技术上能否实现。本轮只做核查，未改代码。
- **令牌管理：同一数据源**。App `GET /api/token/?p=1&page_size=100`；网页 `GET /api/token/?p=1&size=100`（同一路由，分页参数名不同，后端均兼容）。同环境同账号时天然同步，无本地缓存，进入令牌页即刷新。
- **对话分三条链路**：① App「聊天」→ `/api/chat/conversations` + `/messages`，服务端按用户存；② 网页「模型体验」（`/console/llm-experience`）→ 同一组 `CHAT_CONVERSATIONS` 接口，与 App 共用会话表，理论上天然互通；③ 网页「对话」(`/console/chat/:id?`) → Chat2Link：选令牌后渲染 iframe，模板来自 `localStorage["chats"]`，历史留在第三方聊天应用里，**不落我们的会话表，因此与 App 不同步**。App 的「模型体验」是 `useState` 本地会话，也不落库。
- **现状不同步的直接原因**：App 固定连 `https://test.qmszai.cn`（`src/api/client.ts` 第 9 行），网页当前停在 `qmszai.cn`（生产，会话已过期）；且此前核到的令牌数差异来自账号不同（kira/ID 124 在 test 为 0 条）。
- 两个环境都确认存在 `/api/chat/conversations` 与 `/api/token/`（匿名 401 而非 404），前端构建哈希一致（`index-CVhRzXOk.js`），后端是否分库未匿名确认。
- 结论：令牌同步已具备；「App 聊天 ↔ 网页模型体验」已具备（需同账号实测确认字段级差异：App 写入的 assistant 消息不带 `reasoning_content/status`）；「App 聊天 ↔ 网页对话页」必须先把网页对话页改成第一方会话页（需要 web 源码），否则无法同步。
- 未提交、未推送。

### 2026-11-23 · 登录失效改为自动跳转登录页

- 用户反馈：会话过期时点发送会弹「发送失败 / 登录状态已失效，请重新登录」，希望直接跳回登录页。
- `src/api/client.ts` 新增 401 广播：`onUnauthorized(listener)` / `isUnauthorized(error)`，`rawRequest` 与 4 个 `expoFetch` 调用（`speechToFile` / `pgPostJson` / `chatOnce` / `streamChat`）在收到 401 且当前有会话时通知监听者；登录页输错密码（无会话）不会触发。
- `src/auth/AuthProvider.tsx` 订阅：`clearSession()` + 清空 `user`/`siteStatus` + `status = 'signedOut'`，App 自动渲染 `LoginScreen`。
- 11 处 API 错误 `Alert`（聊天发送、模型体验、融合、签到、资料/密码保存、令牌启停/保存/删除/复制密钥）加 `isUnauthorized` 早退，避免 401 时先弹框再跳转。
- 实机验证（iOS，Expo Go 58.0.4）：登录后临时把 `streamChat` 改成直接 `notifyUnauthorized(401)` + 抛 `ApiError(401)`，点发送后**没有弹框**，界面直接切到 `LoginScreen`；验证时临时注释 `clearSession()` 以保留会话，验完已还原，App 自动恢复登录态，测试产生的空对话也已删除。
- 未提交、未推送。

### 2026-11-23 · 模型图标按厂商对应

- 用户反馈：模型列表里有些图标对不上。根因有两个——`modelBrand` 只按模型名正则判断，未知名称一律回落 Gemini 星芒；`speech-01-hd`（服务端 `vendor_id=1` 即 MiniMax）名称里没有厂商词，被误判成同类。
- `src/components/ModelLogo.tsx` 整体重写：
  - 品牌从 11 个扩到 20 个：openai / claude / qwen / gemini / deepseek / meta / mistral / kimi / xai / doubao / wenxin / minimax / zhipu / iflytek / hunyuan / baichuan / stepfun / vidu / suno / longcat。矢量取自 `@lobehub/icons-static-svg@1.106.0`（与网页端厂商图标同源），OpenAI / Claude / Gemini / Meta / Mistral / DeepSeek 沿用 Simple Icons。
  - 数据结构改成「多图层 + 可选线性渐变」：讯飞 3 层、豆包与混元 4 层，百川 / 阶跃 / Vidu / MiniMax 用渐变；渐变分 `objectBoundingBox` 与 `userSpaceOnUse` 两种单位，按原设计稿保留。
  - 判定顺序改为：模型名前缀 → 站点厂商名 → 模型名包含 → 首字 monogram（彩色圆角方块），**不再回落 Gemini**。这样 `deepseek-r1-distill-qwen` 仍显示 DeepSeek，`speech-01-hd` 靠 vendor 显示 MiniMax。
  - 单色品牌（OpenAI、xAI、Kimi 的 K、Suno、LongCat）跟随主题取黑/白，取自 `useScheme()` 而非系统外观，避免「应用固定深色 + 系统浅色」时黑图标看不见。
  - 新增 `vendor` 入参；`App.tsx` 模型目录、`ChatWorkspace`（当前模型 / 选择器 / 历史）、`ModelMarketplaceScreen`（列表 / 详情）共 5 处传入 vendor。
- `src/services/liveConsole.ts` 的 `VENDOR_MAP` 补齐：`speech/asr/music-` → MiniMax，`hy*` → 腾讯，`qvq/wand/gte` → 通义千问，新增 `baichuan` / `longcat` / `mimo` / `joyai` / `vidu`。
- 验证（iOS，Expo Go 58.0.4）：逐项搜索并截图核对 gpt、glm、kimi、longcat、mimo（monogram）、step、baichuan、ernie、hy4、qwen、doubao、speech；浅色与深色各看一遍，图标与厂商一致。模型选择器与聊天头部图标同步正确。
- Android 共用同一组件，本轮未启动安卓模拟器复测；`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。未提交、未推送。

### 2026-11-23 · 移除写死的模型状态胶囊

- 用户提问模型列表每行的「可用」是否来自后端。核对结论：**不是**。`mapModels` 里 `status: 'stable'` 是写死的，所以所有模型都是同一个绿胶囊；后端也没有逐模型状态字段——`/api/pricing` 没有 status，`GET /api/model_status` 返回 404，`/api/user/models` 只返回模型名数组。
- 同一批数据里真实的部分：模型名（`/api/user/models`，回落 `/api/pricing`）、厂商（`vendor_id`）、费率（`model_ratio` / `completion_ratio` × 分组倍率）、标签（`quota_type` / `supported_endpoint_types` / `is_foreign`）、详情路由（`enable_groups`）、说明（`description`）。
- 处理：模型目录行去掉状态胶囊；模型详情头部去掉同一个假状态；`statusLabel` 与 `ModelStatus` / `Model.status` 一并删除，`statusColor` 只保留令牌状态三种；`liveConsole.mapModels` 与 `ChatWorkspace` 的兜底模型去掉 `status` 字段；词典删掉 `可用`/`观察`/`限流`。
- 顺带修正详情页标签：`健康检查` 实际显示的是计费方式（`updatedAt` 存「按 token 计费 / 按次计费」），改名为 `计费方式`（英文 `Billing`）。
- 仍为占位、非后端数据：详情页「上下文」「延迟」两个格子恒为 `—`（后端无此字段），「成本」是按输入价格分档的推算值。
- iOS 实测（重新登录后）：列表各行只剩图标 + 模型名 + 厂商；详情显示 路由 / 输入费率 / 输出费率 / 计费方式。typecheck 与 `git diff --check` 通过，未提交、未推送。

### 2026-11-23 · 移除模型详情的占位格子（上下文 / 延迟 / 成本）

- 承接上一条：详情页仍有三个格子是占位或推算——「上下文」「延迟」后端没有字段，恒显 `—`；「成本」是把输入费率按档位算成「免费/低/中/高」的结果。用户回复「去掉」。
- `App.tsx` 的 `ModelDetail` 删除这三格，只保留 路由 / 输入费率 / 输出费率 / 计费方式；模型目录搜索索引同步去掉 `model.context`。
- `src/types.ts`：`Model` 去掉 `context` / `latency` / `price`，`MarketModel` 去掉 `context`。
- `src/services/liveConsole.ts`：删 `priceTier()`，`mapModels` / `mapMarketModels` 不再产出这三项；`ChatWorkspace` 的兜底模型同步。
- `src/screens/ModelMarketplaceScreen.tsx`：当 `context` 已不存在，行副标题简化为只显示厂商名。
- `src/i18n.en.ts`：删 `上下文` / `成本` 两条词条（`Context` / `Cost` 不再被引用）。
- 验证（iOS，Expo Go 58.0.4，iPhone 18 Pro）：`Baichuan2-53B`（按 token）显示 ¥10.00/1M ×2 + 按 token 计费；`asr-1.0`（按次）显示 ¥2.50/次、输出费率 `—`、按次计费。浅色与深色各看一遍，无占位格子。验完把外观改回「浅色」（用户此前的设置）。
- Android 复测（AVD `qmszai_pixel` / emulator-5554，Expo Go 58.0.4，`adb reverse tcp:8091`）：模型目录图标与厂商一致（MiniMax 语音波形、百川渐变），行内只剩模型名 + 厂商；`Baichuan2-53B` 详情同样只有 路由 / 输入费率 / 输出费率 / 计费方式，浅色与深色均正常，验完外观改回「浅色」。
- `npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。未提交、未推送。

### 2026-11-23 · 小米（mimo）图标改为官方 squircle

- 用户指出 `mimo-*`（厂商「小米」）显示成红色圆角方块 + 首字「小」，是 monogram 兜底，不是小米的标。
- 候选取了两个：LobeHub 的 `XiaomiMiMo`（`Xiaomi` / `MIMO` 两行字标，24pt 下糊成一团）与 Simple Icons 的 `Xiaomi`（橙色 squircle + 挖空「mi」，官方 2021 标）。选后者，24–28pt 仍可辨认，且与厂商名「小米」对应。
- `ModelLogo.tsx` 新增品牌 `xiaomi`（fill `#FF6900`，单图层路径）；判定规则加 `NAME_PREFIX_RULES` `/^mimo/`、`VENDOR_RULES` `小米 / xiaomi / mimo`、`NAME_CONTAINS_RULES` `/xiaomi|mimo|小米/`。品牌数 20 → 21。
- 挖空的「mi」是透明，浅色卡片上显白、深色卡片上显卡片底色（深灰），实测两种都清楚，不需要额外垫白底（垫白底会在 squircle 圆角外露出白角）。
- 验证：iOS 与安卓，`mimo-v2.5 / -cc / -pro / -pro-cc / v2.6-flash / v2.6-pro / v2.6-pro-ultraspeed` 全部显示橙色小米标；iOS 深色、安卓浅色各看一遍。`npx tsc --noEmit --noUnusedLocals` 与 `git diff --check` 通过。未提交、未推送。
