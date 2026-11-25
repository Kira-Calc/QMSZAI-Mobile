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

### 2026-11-24 · 聊天页模型选择器顶部「推荐模型」

- 用户需求（原话）：「给首页的这个列表做一个『推荐模型』的功能，放在列表最顶部，目前固定放五个各个领域有优势的模型上去（例如最强、最有性价比、速度最快等等），并且需要有标识来展示这是推荐的模型（旁边写上简单的文字描述）」。
- 新增 `src/recommendedModels.ts`：`recommendedModelPicks` 固定 6 条 —— `gpt-6-astra` 综合最强、`qwen3.8-max` 中文旗舰、`kimi-k2.7-code` 编程最强、`deepseek-v4-pro-0813` 深度推理、`glm-5.3-flash` 性价比最高、`mimo-v2.6-pro-ultraspeed` 响应最快（DeepSeek 一条是用户第二轮补充要求的）；`pickRecommendedModels(models)` 按 `id` 与实时模型列表精确匹配，账号里没有的自动跳过，不会出现点不动的行。DeepSeek 选正式版 `deepseek-v4-pro-0813`（`/api/pricing` 里写作「正式版 DeepSeek V4 Pro，极大增强 Agent 能力」），不用 `deepseek-v4-pro_官方`（描述是 cursor 专用别名）。
- 选型依据：账号 `/api/user/models` 真实可聊的模型（该账号没有 Claude / Gemini 条目），用 `/api/pricing` 的 `model_ratio` 与 `description` 交叉核对定位。
- `src/ChatWorkspace.tsx`：iOS 玻璃浮层（`ChatPopover`）与安卓全屏 sheet 两处都在列表最前面渲染「推荐模型」分组，行复用既有样式（图标 + 模型名 + 厂商），厂商名右侧加蓝色标签胶囊（`recommendTag`：`palette.blue` + `palette.tintBlueSoft`，11pt / 600）；推荐组与下方列表之间加「全部模型」小标题。搜索框有内容时整组隐藏，只显示过滤结果；无结果仍显示「没有匹配的模型」。选中态沿用原逻辑：iOS 行尾蓝色对勾，安卓行尾圆形蓝底对勾。
- `src/i18n.en.ts` 新增 7 条：推荐模型 / 全部模型 / 综合最强 / 中文旗舰 / 编程最强 / 性价比最高 / 响应最快。
- 验证（iOS iPhone 18 Pro，Expo Go 58.0.4；安卓 AVD `qmszai_pixel` / emulator-5554）：浅色与深色各一遍，推荐组位于列表最顶部、标签胶囊可读、默认选中 `gpt-6-astra` 打勾；点推荐行切换模型并关闭选择器；输入 `qwen` 后推荐组消失、只剩过滤结果，清空后恢复。安卓是单独卡片 + 「全部模型」标题，浅深色都正常。补 DeepSeek 一条后 iOS 复看：6 行顺序为 gpt-6-astra / qwen3.8-max / kimi-k2.7-code / deepseek-v4-pro-0813（鲸鱼图标 + 厂商 DeepSeek + 「深度推理」蓝胶囊）/ glm-5.3-flash / mimo-v2.6-pro-ultraspeed，行高与分隔线未变，长名字 `deepseek-v4-pro-0813`、`mimo-v2.6-pro-ultraspeed` 都能完整显示。
- 事故与结论（如实记录）：为看到真实模型列表，本轮临时在 `src/api/client.ts` 的 `restoreSession()` 注入会话；期间 iOS Expo Go 重载把会话清掉，账号 `kira` 密码未知，一度掉到登录页。后来用「注入 + 延迟 3 秒再 `persistSession`」把会话写回 `SecureStore`，冷启动可正常读回（实测 `boot 352 124`），**iOS 当前是登录态且已稳定**；`src/api/client.ts` 已 `git checkout` 还原、无 diff（`grep TMP` 为空），`git status` 只有本轮 4 个文件。根因记录：**启动瞬间写 `SecureStore` 会静默不落盘**（写完当次读得到 352，重载后读回 `none`），约 3 秒后再写才可靠；另确认本轮全程没有出现 401，掉线是 `restoreSession()` 读不到 key 导致的 `signedOut`，不是 cookie 失效。安卓本轮只有临时注入会话，重载后即未登录，需要密码才能恢复。
- `npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。未提交、未推送。

### 2026-11-24 · gpt-* 全线 404（站点渠道配置问题），综合最强暂时换成 kimi-k3

- 用户反馈：给推荐里的 `gpt-6-astra` 发消息弹「发送失败 / Invalid URL (POST /v1/v1/chat/completions)」。
- 定位结论：**不是 App 的问题**。App 走的是 `${API_BASE_URL}/pg/chat/completions`（`src/api/client.ts` 的 `streamChat` / `chatOnce`），URL 只拼一次；`/v1/v1/...` 是站点侧 OpenAI 渠道的 base_url 带了 `/v1`，new-api 再拼一次 `/v1/chat/completions` 造成的，报错文案是上游 OpenAI 兼容服务的原文。
- 证据（用当前登录会话直连 `/pg/chat/completions`，非流式）：`gpt-6-astra` / `gpt-6-sol` / `gpt-6-luna` / `gpt-6.1-sol` / `gpt-6.1-terra` / `gpt-5.6-sol` / `gpt-5.6-luna` / `gpt-5.6-terra` / `gpt-5.5` **全部 404** 且文案一致；`kimi-k3_官方` / `MiniMax-M3_官方` / `glm-5.3` / `qwen3.8-max` / `deepseek-v4-pro-0813` 均 200 正常回复。修法在后台：把该渠道的模型地址末尾 `/v1` 去掉（或改成不带 `/v1` 的域名），App 端无可改。
- 处理（用户选择「换成 kimi-k3」）：`src/recommendedModels.ts` 的「综合最强」由 `gpt-6-astra` 改为 `kimi-k3_官方`，并在文件里留注释说明原因与换回条件；其余 5 条不变。
- 验证：iOS 实测选择器第一行显示 `kimi-k3_官方`（Moonshot + 「综合最强」蓝胶囊），点选后头部与输入框占位都变成 `kimi-k3_官方`，选择器关闭。`npx tsc --noEmit --noUnusedLocals` 通过。
- **等站点把 OpenAI 渠道修好后再把「综合最强」换回 `gpt-6-astra`。**

### 2026-11-24 · 概览页小组件改用与账户页同一套 Group / Row

- 用户反馈（原话）：「这两个页面内的小组件明显不一样，要以账户页这样的为标准」，截图给的是概览页（`QuickAction` 卡片列表 + 2×2 统计块）与账户页（标准 iOS 分组列表）的对比。
- iOS 概览分支（`App.tsx` 的 `Overview`）全部换成 `src/ui.tsx` 的 `Group` / `Row`：顶部 4 个数字（可用模型 / 启用令牌 / 平均延迟 / 异常队列）从 `StatBlock` 2×2 色块改成一张列表卡（`value` 右对齐灰字，与账户页「当前分组 / 剩余额度」一致）；快捷访问 / AI 功能 / 用量与任务三组改成 `Group header + Row icon + chevron`，行高 47、图标 24、分隔线内缩 16、箭头 12×18 全部沿用共享组件，不再有自己的一套。
- 删除不再使用的 `QuickAction` / `StatBlock` 两个组件及其样式（`sectionHeader` / `sectionTitle` / `actionList` / `quickAction` / `quickSymbol` / `quickBody` / `quickTitle` / `quickIcon` / `chevron` / `gridTwo` / `statBlock*` / `statValue`），iOS 保留 `statLabel` 给 `MiniStat` 用（令牌详情页未改动）。顺带清掉随之无用的 `ripple`、`ComponentProps` 导入。
- 「任务」原来复用 `square.stack.3d.up`，和上面的「模型目录」图标一模一样；换成 `checklist`（安卓映射 `checkbox-outline`，加在 `src/components/AppIcon.tsx`），避免两行看起来是同一个入口。
- 安卓概览不动（本来就是 `Group` / `Row`，但统计行用偏大的 `accessory` 数字，属安卓风格，保留）。
- 验证（iOS iPhone 18 Pro）：概览与账户页并排比对，卡片圆角 / 行高 / 图标大小 / 分隔线缩进 / 箭头样式一致；滚动到 AI 功能、用量与任务，长列表无错位。令牌页「新建令牌」浮层（`MiniStat` 相关样式）复核正常。`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。未提交、未推送。
- 深色也验了：账户 → 个人设置 → 外观 → 深色，概览的统计卡与三组列表为深色卡片（`#1C1C1E` 系）+ 蓝色图标 + 深色分隔线，与账户页深色观感一致；验完已切回浅色。顺带记一个操作坑：底部五项标签栏在列表滚动后会自动收起，此时点底部坐标没反应，要先滚回顶部再点。

### 2026-11-24 · 网页端新建的对话在移动端看不到（会话列表只在挂载时拉一次）

- 现象：用户在网页测试环境留了一个对话（`ID 448`「问候语」，模型 `GLM-4-Flash_免费`），移动端「对话历史 / 最近对话」里没有。
- 原因（不是接口问题）：`ChatWorkspace` 的会话列表只在组件挂载时 `fetchConversations(50, 0)` 一次。聊天标签页是常驻挂载的，之后不会再拉，唯一的补拉是「删除失败」那条分支，所以在其他端新建 / 删除的会话都不会反映到手机上来。接口本身返回正常：`/api/chat/conversations` 给了 2 条（448、444）。
- 改法：抽出 `refreshConversations()`，在四个时机刷新——**进入 / 切回聊天标签**（`active` 变 true）、**App 回到前台**（`AppState` → `active`）、**打开对话历史**（顶部 `历史` 和「查看全部」都改成走 `openHistory`）。注意不要简单 `setConversations(新列表)`：那样会把本地已加载的消息、正在流式输出的回复清掉。
- 合并规则：以服务端列表为准排序，逐条保留本地 `messages` / `loaded`；其他端改过的会话（服务端 `UpdatedAt` 比本地新、且不是当前打开的会话）清掉缓存、下次打开重新拉消息；服务端已没有的会话随之移除，只保留**本地刚新建 20 秒内且列表还没返回**的那条（`pendingCreated`），避免自己刚发的对话一闪而过。并发刷新用 `refreshing` 递增票据丢弃过期响应。
- 验证（iOS）：改前历史里只有 `Hi`；改后切到聊天标签即出现「问候语 · GLM-4-Flash_免费 · 刚刚」，点开能看到网页端的两条消息（`hello` / `Hello! I am glm-4. How can I assist you today?`）。又用接口造了一条「临时同步测试」（`ID 449`）专门验证「不切标签、直接点历史」：能立刻看到；再用接口删掉后重开历史即消失。全新对话在 App 内新建仍立即出现在列表（历史角标 2 → 3）。测试数据已清理（449、450 都已删除）。
- 顺手发现（未改，待用户决定）：模型目录里的 `deepseek-fetch` 上游不支持——`/pg/chat/completions` 返回 `The supported API model names are deepseek-flash, deepseek-v4-pro, but you passed deepseek-fetch`。而 App 每次重载后默认模型取列表第一个（`models[0]`，按名称排序正好落在 `deepseek-fetch`），所以「重载 → 新建对话 → 直接发」会失败。
- `npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。未提交、未推送。

### 2026-11-24 · 编辑令牌会卡死（iOS 上两个 Modal 同时 present / dismiss）

- 现象（用户原话）：「在这个页面编辑令牌，会卡死」，截图是令牌管理页的 `Mobile client` 卡片。点卡片 → 详情 → 「编辑」之后整个页面失去响应；之后连「新建令牌」FAB 也弹不出任何面板。JS 其实还活着（底部标签栏有时还能切），是上半部分内容区的点击被吃掉了。
- 根因：详情和新建 / 编辑表单原本各是一个 `react-native` 的 `Modal`（都走 `App.tsx` 的 `SheetModal`）。点「编辑」时同一帧里把详情的 `visible` 置为 false、把表单的置为 true——**iOS 不允许在「另一个 Modal 正在关闭」时 present**，UIKit 把先前那个的关闭卡住，它就以完全透明的样子留在最上层，全屏 `Pressable` 把点击全部接走；此后所有 `Modal` 都 present 不出来。快速点「编辑」（前一个还在 280ms 开场动画里）也能触发同样的状态。
- 改法：新增 `TokenSheets`，详情与表单**共用一个 `SheetModal`**，用 `mode`（`detail` / `form`）切内容；点「编辑」只是换页，不再关闭再打开 `Modal`。`TokenDetailPanel` / `TokenFormPanel` 只渲染面板内容，不再自带 `Modal`；表单通过 `closeRef` 把「点面板上方空白」的语义交给共用 Modal（选择页 → 表单 → 关闭），保持原来「先退一层」的行为。
- 兜底：`SheetModal` 关闭动画的 `finished` 回调万一没回来（被系统打断等），400ms 后强制 `setMounted(false)`，不让一个全透明但仍拦截点击的 Modal 留在屏幕上。
- 细节：表单的「保存 / 创建」按钮文案改用挂载时的 `editing` 判断，避免提交成功后面板淡出时 `initial` 已被清空、文案闪成「创建」；`onCancelForm` 只关面板、不再顺手清 `editingToken`（下次打开时 `openCreateToken` / `openEditToken` 会重置）。
- 验证（iOS iPhone 18 Pro，Appium）：详情 → 编辑 → 改名 `tmp-edit2` → 保存，列表即时更新；新建令牌 → 点「分组优先选择」进选择页 → 点面板上方空白只退回表单（没关掉整个面板）→ 输入 `tmp-check` → 创建，列表出现 `#65`；再开详情 → 删除 → 确认框 → 列表恢复为只有 `Mobile client`。反复开关后点卡片、点 FAB、切标签页都正常，无残留遮罩。测试令牌 `#65` 已删除。
- 事故如实记录：这轮为了把最新代码送进 App（Fast Refresh 当时已断）重载了 Expo Go，iOS 掉回登录页——`SecureStore` 里的记录没读回来，浏览器 jar 里的 `session` 也已失效（401），无法自行恢复；已请用户在模拟器上手动重新登录（`kira`，11:04 登录成功），之后没有再重载，登录态正常。
- `npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。未提交、未推送。

### 2026-11-24 · 用户要求：以后不要再让 App 掉登录（iOS 与安卓都算）

- 用户原话：「以后不要帮我自动退出登录」，随后补充「不管是 iOS 还是安卓，都不要动」。起因是本轮为把新代码送进 App 重载了 Expo Go，iOS 掉回登录页。
- 已写进 `HANDOVER_NEXT_CLI.md` 顶部的硬性约定和 `/Users/wenze/project.md` 的 QMSZAI 章节操作红线：**两个平台一样对待**——不 `simctl terminate/launch` Expo Go、不 force-stop 或重启安卓的 Expo Go、不重载 App、不随手 `simctl openurl exp://…`；改完代码先等 Fast Refresh，没生效先问用户；不改 `client.ts` 的会话逻辑、不调 `logout`；重启模拟器前先说明会掉登录并征得同意；掉登录只能请用户手动登录。

### 2026-11-24 · 令牌卡片的「暂停」按钮改为红色，按住时红底白字

- 用户原话：「这个暂停的字应该是红色的，并且手指按在上面时，还会变成红底白字以提示」，附图是令牌管理页 `Mobile client` 卡片（`#62`）。
- 原因：暂停是**中断服务**的动作，按 iOS HIG 属于 destructive，应该用红色；此前和「启用」共用同一个次要按钮样式（蓝字），看不出这一下的风险等级。
- 改法：`App.tsx` `TokensView` 里的切换按钮改成函数式 `style` + 函数式 children（拿 `Pressable` 的 `pressed`），只有 `status === 'active'`（文案「暂停」）时文字用 `palette.destructive`，按住时背景与边框换成 `palette.destructive`、文字用 `palette.onAccent`（白）；`paused`（「启用」）仍是蓝色文字，按住只给 `palette.pressedFill`，不碰危险色。
- 样式落点：新增 `secondaryButtonTextDanger` / `secondaryButtonTextOnDanger` / `secondaryButtonDangerPressed` / `secondaryButtonPressed` 四个键，放在 `makeBaseStyles()`。注意 `styles` 是 `makeBaseStyles()` 与 `makeIosStyles()` 的并集类型，**只加到 iOS 样式块会过不了 `tsc`**（第一次就踩到了，已挪回 base）。
- 顺带补的两个主题 token（深色核对时发现的问题）：
  - `palette.destructiveFill`（iOS 深色 `#C63A43`、安卓深色 `#B3261E`，浅色与 `destructive` 同值）：深色下 `destructive` 是给**文字**用的浅红（`#FF6961` / `#FFB4AB`），直接当实心背景会让白字对比只有 2.8:1 左右，所以按压底色单独取一个更深的红。
  - `palette.controlFill`（iOS 浅 `#F2F2F7` / 深 `#2C2C2E`，安卓浅 `#F2F5F7` / 深 `#28313A`）：iOS `secondaryButton` 原来用 `fillMuted`，而深色下 `fillMuted` 与 `card` 都是 `#1C1C1E`，整颗「暂停 / 启用」按钮在卡片上**看不见**（浅色 `#F2F2F7` 在白卡上正常）。换掉后浅色外观不变、深色重新出现按钮底。
- 验证（iOS iPhone 18 Pro）：浅色静止态「暂停」为 `#B3404A` 红字，按压帧录屏抽帧为 `#B3404A` 底 + 纯白字；深色静止态为 `#FF6961` 红字、按压帧为 `#C33842`（≈`destructiveFill`）+ 白字，按钮底也能和卡片分开。两轮验证都点过令牌，最后都已切回「启用」，外观已改回「浅色」，全程没有重载 App。
- 工具坑（给后面写脚本的同事）：W3C 的 `POST /session/{id}/actions` 只发 `pointerDown` 会在 WDA 上直接 500，且整段手势是**原子执行**的，按住中途截图拿不到 `pressed` 帧（背景仍是 `#F2F2F7`），所以那次「按住」实际在请求结束时被当作一次点击执行了。要抓按压态只有录屏抽帧这一条路；因此验完记得把令牌切回「启用」。全过程没有重载 App，iOS 登录态未受影响。
- `npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。未提交、未推送。

### 2026-11-24 · 概览页补齐网页端「数据看板」的全部指标

- 用户原话：「在 mobile 端的界面内，有一些内容还是不完整，只有 web 有」，附网页端「数据看板」与移动端概览页的对比截图。网页端四组卡片：账户数据（账户余额 / 历史消耗 / 今日免费模型）、使用统计（请求次数 / 统计次数）、资源消耗（统计额度 / 统计Tokens）、性能指标（平均RPM / 平均TPM），移动端只有「请求次数（区间）/ 已使用 / 余额」。
- 数据层（对照 `https://test.qmszai.cn/assets/Dashboard-B6HJKfkF.js` 逐个字段核过）：
  - 账户数据：`/api/user/self` 的 `quota`（余额）、`used_quota`（历史消耗）、`request_count`（请求次数，历史累计）；今日免费模型取 `/api/user/free_daily_model/remaining`。
  - 使用统计 / 资源消耗 / 性能指标：全部来自 `/api/data/self`。**该接口必须带 `start_timestamp` / `end_timestamp`，不带参数服务端返回 `[]`**；现在固定取最近 30 天（`default_time=day`），区间切换用 `created_at` 在前端按天过滤。统计次数 = `count` 累加，统计额度 = `quota` 累加，统计Tokens = `token_used` 累加。
  - 平均 RPM / TPM 与网页端同公式：区间总量 ÷ 区间分钟数，三位小数（24h 即 7/1440 = 0.005、1541/1440 = 1.070）。
- 今日免费模型接口的 `enabled` / `limit` / `used` / `remaining` 都在响应**顶层**（没有 `data` 包装，功能未配置时是 `{success:true,data:null}`），所以 `fetchFreeDailyModelUsage()` 走 `rawRequest` 自己解析，两种形态都兼容；`enabled === false` 或 `limit === 0` 时整行不渲染。
- 顺带修正两处旧数据：`OverviewMetrics` 的 `requests` 其实是**区间**次数，与网页端「请求次数」（历史累计）不是一回事，改名 `times`；`reliability`（成功率）是「有请求就 100%」的假数据、后端也没有对应字段，删除，连带删掉那条进度条。
- 界面：iOS / 安卓都换成 5 个 `Group`（账户数据 / 使用统计 / 资源消耗 / 性能指标 / 站点状态），全部 `Row`；删掉原 iOS `heroPanel` 与安卓 `heroCard` 及其样式（`hero*` / `panelLabel` / `heroMetric` / `progressTrack` / `progressFill`），`cardSurface` 导入随之移除。
- 新增：`formatInt()`（千分位，2,573）、`FreeDailyModelUsage` 类型（`src/api/types.ts`）、`fetchDataSelf(params)` 的区间参数、`useConsoleData` 里的 `freeDaily` 状态、英文文案（账户数据 / 使用统计 / 统计次数 / 统计额度 / 统计Tokens / 资源消耗 / 性能指标 / 平均RPM / 平均TPM / 站点状态 / 今日免费模型）。
- 数值核对（用当前登录会话直连接口，与网页截图一致）：余额 120715631 = ¥241.43、历史消耗 29798635 = ¥59.60、今日免费模型 2/30、请求次数 2,573、24h 统计次数 7、统计额度 518700 = ¥1.04、统计Tokens 1,541、RPM 0.005、TPM 1.070。
- 事故如实记录：这轮改到了非组件模块（`src/api/format.ts`、`src/services/*`、`src/api/*`），Expo Go 整包重载，iOS 又掉回登录页（15:46，`SecureStore` 没读回 cookie，服务端 session 仍有效）；用户 16:00 左右手动重新登录后已恢复，没有再重载。
- 验证（iOS iPhone 18 Pro，用户登录后）：24h 实测账户数据 ¥241.43 / ¥59.60 / 2/30，使用统计 2,573 / 7，资源消耗 ¥1.04 / 1,541，性能指标 0.005 / 1.070，站点状态 244 / 1 / — / 0，与网页端「数据看板」逐项一致；切 7d 后统计次数变为 10、Tokens 1,924（= 11-23 的 3 次 + 383 tokens 与今日累加），区间过滤生效。验完已切回 24h、回到聊天页。安卓未验证（无登录态）。
- `npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。未提交、未推送。

### 2026-11-24 · 模型详情点「分组」可逐个复制分组名

- 用户原话：「加一个当用户点击这个对应分组后，弹出复制选项的功能，ios 安卓都要做」（附图：`gpt-6.1-sol` 的「分组 · gpt-codex3 等 10 个」那一行）。
- 现状的问题：那一行是折叠文案，10 个分组只露出第一个，用户没法拿到具体分组名（在网页端是「可用分组」的标签列表）。
- 改动：
  - `src/types.ts`：`Model` 增加 `groups: string[]`（`enable_groups` 原样列表），`groupLabel` 仍是折叠后的展示文案。
  - `src/services/liveConsole.ts`：`groupListOf()` 负责回落（没配 `enable_groups` 时用用户分组 / `default`），`groupLabelOf()` 只负责折叠，两者拼在 `mapConsoleModels` 里一起产出。
  - `App.tsx` 的 `ModelDetail`：分组行改成 `Pressable`，值右侧加蓝色复制图标；点开是 `SheetModal` 底部列表（标题「分组」+ 模型名 + 关闭按钮），每行一个分组。
  - 点某一行 → `Clipboard.setStringAsync(group)`，该行就地变成「已复制 ✓」（1.6 秒后复原），面板不自动关闭，方便连续复制多个；关闭面板时清掉计时器与已复制状态。
  - 复用已有的 `groupOption` / `groupOptionMain` / `groupOptionName` / `groupOptionPressed` / `groupPickerList` 行样式（令牌分组选择器那套），双端一致；列表 `maxHeight: 300`，10 个分组可滚动。
  - 新增样式 `detailHeaderMain` / `settingsRowPressed` / `groupCopiedLabel`；i18n 新增「关闭分组列表」「复制 {0}」「分组 {0}，点按可复制」。
- 修正（用户 16:23 反馈「这个文字有错位」）：第一版把值放进了不可伸缩的 `copyKeyValue`，而 `settingsValue` 自带 `flex: 1`（flexBasis 0），文字框宽度算成 0 后向右溢出，`billingGrid` 又 `overflow: hidden`，于是「default」被卡片右缘截成「defau」、复制图标被挤到屏幕外。改成专用 `groupValueRow`（`flex: 1` + `flexDirection: 'row'` + `justifyContent: 'flex-end'` + `gap: 8`）配 `groupValueText`（`flexShrink: 1` + 右对齐），iOS 另外覆盖成 17pt / `subtleLabel`，和其它行一致。
- 验证：`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。**实机未验证**——首版改到 `types.ts`、`liveConsole.ts`、`i18n.en.ts`，Expo Go 整包重载，iOS 回到登录页（16:19，本次会话第三次）；用户 16:22 重新登录后看到了首版错位，随后这版布局修正 Metro 的 HMR 没送到运行中的 App（日志里没有新的 Bundled 记录），需要手动 reload 一次才能看到。
- 未提交、未推送。

### 2026-11-24 · 模型详情的「路由」按网页端改成「分组」

- 用户原话：「根据 web 的命名，mobile 这个路由应该是分组吧？」（附图：模型详情里的「路由 / default」）。
- 核对网页端：`Pricing` 页那一列叫**「可用分组」**，筛选器是「可用令牌分组」，数据源是 `/api/pricing` 的 `enable_groups`（`Model` 页里的「路由」是渠道层面的事，和这里不是一回事）。
- 改动：
  - `src/types.ts`：`Model.route` → `Model.groupLabel`，加注释说明是网页端「可用分组」。
  - `src/services/liveConsole.ts`：新增 `groupLabelOf(groups, userGroup)`——0 个分组回落到用户分组 / `default`，1–2 个直接列（`a / b`），超过 2 个折叠成 `tf('{0} 等 {1} 个', 首个, 总数)`，避免 10 个分组的模型把详情页那一行撑成多行。
  - `App.tsx`：`ModelDetail` 的 `SettingsRow` 标签改成 `t("分组")`，模型搜索的匹配字段同步改成 `model.groupLabel`。
  - `src/ChatWorkspace.tsx`：`fallbackModel` 占位字段跟着改名。
  - `src/i18n.en.ts`：删掉不再使用的 `"路由": "Routing"`（`"分组": "Group"` 本来就有）。
- 数据核对：`/api/pricing` 共 340 个模型，1 个分组 234 个，其余 2–10 个（如 `gpt-6.1-sol` 10 个、`gemini-2.5-flash-lite` 4 个）。
- 验证（iOS，用户重新登录后）：`Baichuan2-53B` 显示「分组 · default」；`gpt-6.1-sol` 显示「分组 · gpt-codex3 等 10 个」，单行不换行。`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。
- 事故如实记录：这轮改到 `services/liveConsole.ts`、`types.ts`、`i18n.en.ts`，Expo Go 又整包重载了一次（16:13 截图里会话列表短暂为空、历史角标归零、模型回到 `Doubao-pro-32k`）；未掉登录，切回聊天页后历史列表自动刷新回来了。以后尽量把这些改动攒到一次做完。
- 未提交、未推送。

### 2026-11-24 · 安卓「切换模型」改成和 iOS 同一个锚定浮层

- 用户原话：「安卓端首页点进切换模型的界面，还是这种几乎占一整页的弹窗，要做成和 ios 那样类似的弹窗」（安卓截图：整页搜索栏 + 全屏列表）；看完 iOS 浮层截图后追问「没法做成这样的嘛」，明确了要的是 iOS 那种**贴着工具栏、浮在聊天页上**的卡片，而不是底部 sheet。
- 中途试过一版「透明 Modal + 底部面板（约七成屏高）」，用户看了实际观感后否掉，最终方案是**双端共用 `ChatPopover`**：安卓不再走 `Modal`（`presentationStyle` 在安卓本来就不生效，等于整页）。
- 改动（`src/ChatWorkspace.tsx`）：
  - 删除安卓分支的整页 / 底部弹窗 `Modal`，模型列表统一渲染在 `ChatPopover` 里（`scrollable`、`estimatedHeight = 模型数 × 60 + 16`、A-Z 索引复用 `popoverOffsetFor`）。
  - 顶部模型选择框在弹层打开时变成搜索框，原来只有 iOS 成立（`Platform.OS === 'ios' && modelPickerVisible`），现在双端都这样，搜索框仍可点按（浮层遮罩从锚点下方开始）。
  - `openModelPicker` 双端都先 `measureInPage(modelButton)` 拿锚点再打开；键盘弹起时重新量页面尺寸的 effect 也去掉 iOS 限制，弹层跟着上移。
  - 推荐分组标题（`recommendHeader` / `recommendHeaderSpaced`）去掉平台分支，统一 14pt 内缩，和行内容对齐（原来是安卓的 `marginLeft: 4`）。
  - 清理随整页弹窗失效的样式与 ref：`modelSheet*`、`sheetSearch*`、`sheetListRow`、`sheetScroll`、`sheetFade`、`modelSearch` / `modelSearchInput`、`modelList` / `modelRow` / `modelMain` / `modelName` / `modelVendor` / `checkCircle`，以及 `modelSheetScroll` / `modelSheetListY` / `modelSheetRowOffsets` / `sheetOffsetFor` / `modelSheetAnim` / `windowHeight`。`sheetRoot` 与 `sheetContent` 保留给对话历史那个整页 Modal。
- 补阴影（用户反馈「和背景没区分度」）：`popoverShadow` 改成按平台分支——iOS 保持原生 `shadowOpacity 0.18 / radius 24 / offset y 12`；安卓的 `shadow*` 不生效，改给 `elevation: 16`，并补 `backgroundColor: palette.card` + `borderRadius: 20`（elevation 需要有圆角底色才会投影；玻璃回退层同色 card，叠上去看不出来）。模型浮层与「+」菜单共用这个样式，同时生效。
- 验证：iOS 实机复测通过（顶部点模型 → 选择框变搜索框、浮层停在工具栏下方，推荐 6 条 + 全部模型 + A-Z 索引均正常，点空白关闭）；`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。**安卓模拟器上仍无登录态（`kira` 密码未知，按约定也不重启 App），安卓侧只做了代码层校验**，用户登录后需看一眼：浮层宽度与位置、搜索框输入时键盘不遮挡、列表滚动 / A-Z 定位、深色下浮层与背景能否分开。

### 2026-11-24 · 账户充值（支付宝 / 微信 / 兑换码 / 充值记录 / 邀请奖励）

- 用户原话：「可以使用opencli操作浏览器查看web端实际的充值界面与流程，并且在mobile中做出来」。
- 网页端实测（`opencli browser web` 打开 `https://test.qmszai.cn/console/topup`，配合 `network` 抓包）：页面自上而下是账户统计（当前余额 / 历史消耗 / 请求次数）、充值数量 + 实付金额、选择支付方式（支付宝扫码支付 / 微信扫码支付）、选择充值额度 10·20·50·100·200·500（每档标「实付 ¥x，节省 ¥0」）、兑换码充值（输入框 + 兑换额度）、邀请奖励（待使用收益 / 总收益 / 邀请人数 + 划转到余额 + 邀请链接复制 + 奖励说明）；右上角「账单」弹窗是订单列表（订单号 / 支付方式 / 充值额度 / 支付金额 / 状态 / 创建时间）。
- 接口实测（都用当前登录会话直连）：
  - `GET /api/user/topup/info`：`enable_alipay_topup` / `enable_wechat_topup` 为 true，`enable_online_topup` / `stripe` / `creem` / `waffo` 全 false；`amount_options = [10,20,50,100,200,500]`、`min_topup = 1`、`alipay_min_topup = 0.01`、`wechat_min_topup = 1`、`payment_unit_price = 1`、`discount = {}`。
  - `POST /api/user/alipay/pay {amount}` → `{qr_code: "https://qr.alipay.com/...", trade_no: "AP..."}`；`POST /api/user/wechat/pay {amount}` → `{qr_code: "weixin://wxpay/bizpayurl?pr=...", trade_no: "WX...", amount: "1.00"}`。
  - 状态轮询 `GET /api/user/{alipay,wechat}/status?trade_no=` → `{status: "pending", amount, money}`（网页端 3 秒一次；5 分钟没付就停）。
  - `GET /api/user/topup/self?page=1&page_size=n` → `{total, items:[{id, amount, money, trade_no, payment_method, create_time, complete_time, status}]}`，`create_time` 是 Unix 秒，未支付订单也会列出来（本轮留下了 3 笔 ¥1 的 `pending`）。
  - `POST /api/user/topup {key}` → `data` 就是兑换到的额度数字；`POST /api/user/aff_transfer {quota}` 传原生额度单位。
- 移动端落地（不新开 Tab，扩展已有的「账户 → 钱包」`src/screens/WalletScreen.tsx`）：
  - 顶部 hero 卡保留余额（`quota` → `formatQuota`）+ 历史消耗 / 请求次数 / 用户分组。
  - 「账户充值」组：充值数量行（`TextInput`，`number-pad`，副标题「最低 1」，整行可点聚焦）、实付金额行（`充值数量 × payment_unit_price × discount[n]`）、额度档位胶囊（`amount_options`，选中蓝底蓝字）、支付宝 / 微信扫码支付两行。
  - 「兑换码充值」组：兑换码输入（`autoCapitalize="characters"`，回车即兑换）+「兑换额度」行。
  - 「充值记录」组：取最近 5 笔，`¥金额` + 「支付宝/微信 · HH:mm」+ 状态（待支付 / 已支付 / 已失败）。
  - 「邀请奖励」组：待使用收益 / 总收益 / 邀请人数（数据来自 `/api/user/self` 的 `aff_quota` / `aff_history_quota` / `aff_count`）、邀请码行（点按复制）、复制邀请链接、「划转到余额」（`aff_quota > 0` 才出现，带二次确认）。
  - 支付：下单成功即弹居中卡片（`支付宝支付` / `微信支付` + 金额 + `等待支付` + 转圈 + 订单号），**不渲染二维码**（项目没有 QR 依赖，手机也用同机扫码没意义），改为 `Linking.openURL(qr_code)` 直接唤起对方 App；卡片里常驻「打开支付宝 / 打开微信」「复制支付链接」「关闭」，点背板也能关。唤起失败（没装 App）弹「无法打开支付应用 / 请复制支付链接后在对应 App 中打开」——微信在本机没装，正好验证到这条。
  - 轮询 effect 只依赖 `pay.method / pay.status / pay.tradeNo`，成功后 `refreshUser()` + 重拉订单，`pay.status` 变 `success` 后 effect 自己停；100 次（5 分钟）兜底置 `timeout`。
  - 遮罩用 `palette.overlay`，卡片 `maxWidth: 330`；`tsc` 不认 `useRef<TextInput>`，要写 `useRef<TextInputInstance>`（类型来自 `react-native`，和 `ChatWorkspace` 一致）。
  - 两个输入框的无障碍标签故意和行标题不同（`充值金额，最低 {0}` / `输入兑换码`），否则 VoiceOver 与 Appium 都会匹配到第一个同名元素（行标题），点不到输入框。
- 验证（iOS iPhone 18 Pro，17:17–17:19）：钱包页各分组排版正常；点档位 `¥10` → 充值数量变 10、实付 ¥10.00、胶囊变蓝；点「充值数量」任意位置弹出数字键盘、输入 `5` 后实付即时变 ¥510.00；点「微信扫码支付」→ 弹出支付卡片（微信支付 / ¥1.00 / 等待支付 + 转圈 / 订单号 WX…），随即弹出「无法打开支付应用」（本机未装微信），点「复制支付链接」提示「已复制支付链接」，关闭卡片后充值记录里立刻出现这笔 `¥1.00 微信 · 17:18 待支付`；「兑换额度」空输入提示「请输入兑换码」；邀请奖励三项均为 0，划转行按条件隐藏。`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。
- 已知限制：① 支付宝 `https://qr.alipay.com/...` 在 iOS 上会先开 Safari/Alipay 落地页（要求再点一次「打开支付宝」），试过 `alipays://platformapi/startapp?saId=10000007&qrcode=...` 但模拟器没装支付宝、无法验证，故仍用 https 兜底；② 充值记录只显示最近 5 笔，没做网页端「账单」弹窗的全量分页；③ 真实付款未验证（本机没有支付宝/微信，也没有可用的兑换码）。
- 事故与结论（如实记录）：上一轮 HMR 断掉之后本轮开局 App 已经在登录页；按既有做法从模拟器 `host.exp.Exponent.binarycookies` 取出仍有效的 `session`，临时写进 `client.ts` 的 `restoreSession()` 兜底并用 `setTimeout(3s)` 补写 `SecureStore`，恢复登录完成验证，**验完已 `git checkout -- src/api/client.ts`，`git status` 里没有该文件的改动**。这轮顺手确认：本机 Expo Go 里 `SecureStore.setItemAsync` 会返回成功，但重载后 `getItemAsync` 恒为 `null`（日志 `TMPSS get none none` 出现在写入成功之后），所以**任何整包重载都会掉到登录页**，与 cookie 无关；`binarycookies` 里的 session 仍有效（用它直连 `/api/user/self` 返回 200）。结论：本地只能靠用户手动登录恢复，不要再用重载“修”界面。
- 未提交、未推送。

#### 2026-11-24 · 安卓实机补验（充值页）

- 用户这边把上一轮全部改动提交成了 `a2551e1 payment`（含三份文档），已推送到 `origin/main`；本轮只剩 `src/screens/WalletScreen.tsx` 一处新增改动未提交。
- 安卓模拟器（`qmszai_pixel`，Pixel 尺寸 1080×2400 / 360×800dp）从快照启动后**登录态还在**（余额 ¥241.42，用户 989294），所以这轮能补上安卓实机验证。启动方式记一笔：`nohup $ANDROID_HOME/emulator/emulator -avd qmszai_pixel -no-boot-anim > /tmp/qmszai-emulator.log 2>&1 &`，**必须让父 shell 一直 wait 住 emulator 进程**（`emulator ... & wait`），否则脚本一退出模拟器就收到信号自杀（实测三次都这样，日志里是 `Wait for emulator ... to shutdown gracefully before kill`）。
- 安卓验证结果（全部通过）：
  - 账户中心 → 钱包：hero 余额卡、账户充值、兑换码充值、充值记录、邀请奖励、额度说明全部正常；档位胶囊两行换行（¥10·20·50·100 / 200·500）不挤。
  - 点「充值数量」整行 → 数字键盘弹出，**实付金额行仍在键盘上方可见**，输入即时联动（打到 134 → ¥134.00）。
  - 点档位「¥100」→ 数量 100、实付 ¥100.00、胶囊变浅蓝底蓝字。
  - 点「微信扫码支付」→ 支付卡片居中、遮罩压暗背景、转圈 + 「等待支付」、订单号 WX…；本机没装微信 → 弹「无法打开支付应用 / 请复制支付链接后在对应 App 中打开」；「复制支付链接」弹「已复制支付链接」，系统剪贴板预览显示 `weixin://wxpay/bizpayurl?pr=...`。
  - 点「支付宝扫码支付」→ 安卓装了 Chrome，`https://qr.alipay.com/...` 被浏览器接住（比 iOS 少一步，但仍不是直接进支付宝），返回 App 后卡片还在。
  - 空兑换码点「兑换额度」→ 弹「请输入兑换码」。
- 顺带修掉一个 iOS 没暴露的问题：下单成功后记录列表不刷新（`loadOrders()` 原来只在进入页面、支付成功、兑换成功时调用），所以刚下的单关掉弹窗也看不到。现在 `startPayment` 拿到订单号后立刻 `loadOrders()`，关闭弹窗就能看到这笔「待支付」。
- **本轮没能在实机上看到这个修复的生效**：Metro 之前重启过，两个 App 的 Fast Refresh 都没重连上（Metro 日志自重启后没有一条 Bundle 记录），按红线不重载 App，所以验证用的是重连前的 bundle。修复本身只有一行调用，`tsc` 与 `git diff --check` 通过，等下次 App 自然加载后生效。
- 又留下 3 笔 ¥1 的待支付测试单（18:10 支付宝、18:11 微信、18:12 微信），后端仍无删除接口。
