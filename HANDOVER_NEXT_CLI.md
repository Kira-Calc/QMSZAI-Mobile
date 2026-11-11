# QMSZAI Mobile：CLI 接手文档

更新日期：2026-11-11。以本文和实际代码为准。本轮已由「全部本地模拟数据」改为按《APP 测试环境 API 接口文档》接真实接口；旧交接里“未接真实业务接口”的描述已失效，键盘避让与阴影方案仍以本文为准。

## 项目与授权

- **补齐（2026-11-11 iOS 修复，最重要）**：iOS 之前登录后必然 401（界面停在登录页并提示「登录状态已失效，请重新登录」）。根因：iOS 的 NSURLSession 会接管 `Cookie` 请求头，手工 `setRequestHeader('Cookie', …)` 在真实域名的 HTTPS 请求上被原生 Cookie jar 覆盖/丢弃，服务端收不到会话。现在 `src/api/client.ts` 的 `authHeaders()` 在 iOS 只下发 `New-Api-User`，`session` Cookie 交给原生 jar（登录响应的 Set-Cookie 自动入 jar，重启仍有效）；安卓保持手工 Cookie。**不要再在 iOS 上手工设置 Cookie 头**。验证方式：Metro 日志里 `POST /api/user/login` 200 之后 `GET /api/user/self` 必须是 200。
- **iOS 自动化（本机环境）**：Xcode 27 缺 `Simulator.app`，`xcrun simctl` 只能截图不能点击；GitHub 不可达（Maestro/idb 装不上）。已用 npm 装 `appium@3.9.0` + `xctest/xcuitest@12.22.8`：`appium --port 4723` 后对 UDID `C0A7ECCE-6CA4-40E4-B955-0ECB870F9B6D`（iPhone 18 Pro, iOS 27, Expo Go 58.0.4）建 session（`appium:bundleId=host.exp.Exponent`），即可用 WebDriver tap/输入/取 UI 树/截图；坐标直接用 UI 树里的坐标。坑：iOS 登录后会弹系统「保存密码?」挡住整屏，点「以后」才能继续；输入框用 `element clear` + 逐字符 `POST /keys` 比 `setValue` 稳。
- **iOS 回归状态（2026-11-11 17:20）**：已在 iOS 真机模拟器逐页核对通过：聊天首页、概览、模型目录、令牌管理、账户中心、个人设置；聊天真实流式对话成功；AI 创作语音（speech-01-hd）生成「已完成」并可播放（缓存 `tts-*.mp3`）。待核对：模型广场价格详情、模型体验流式、模型融合、用量日志、钱包子页。本轮同时修了 AI 创作详情页/生成记录四处观感（徽标不拉满整行、去掉 `summary` 的「· 已完成」后缀、删「生成参数」重复计费 footer、空状态去说明小字，`EmptyState.message` 变可选），账户资料卡名称/余额加 `numberOfLines={1}`。测试令牌 #55 与测试会话/生成记录尚未清理；安卓待复核。
- 仓库：`/Users/wenze/Documents/GitHub/QMSZAI-Mobile`。
- 当前 HEAD：`c1f4f6a`（`11.11.10.20`）；前一提交 `59ac34e`。
- 用户自行提交、推送。不要自动 commit/push，不覆盖其他 CLI 改动。
- Expo SDK 58 / React Native 0.88 / React 19 / TypeScript 6。
- 服务端：测试环境 `https://test.qmszai.cn`（`src/api/client.ts` 的 `API_BASE_URL`）。接口唯一依据：`/Users/wenze/Downloads/APP测试环境API接口文档.md`。
- 先读 `/Users/wenze/project.md` 的入口与本项目章节，再核对适用 AGENTS.md、CLAUDE.md、git status 和 diff。
- 范围：登录用户的全部非支付、非管理员功能。管理员端、支付交易、「古今图书」不做。

## 本轮改动（真实接口接入）

开发前状态是纯 mock。下面是现在的实际结构。

### 接口层

| 文件 | 职责 |
| --- | --- |
| `src/api/client.ts` | 请求核心。`rawRequest` 用 XHR 读完整响应头与 `Set-Cookie`，统一解析 `{success,message,data}`；`apiRequest` 只返回 `data`；`pgRequest` 处理 `/pg/*` 的 `{error:{message}}`；`streamChat` 用 `expo/fetch` 手写 SSE 行解析；`chatOnce` 是非流式单次调用。 |
| `src/api/endpoints.ts` | 所有接口封装：站点配置、验证码、短信、登录/注册/找回/2FA、用户资料、模型、音色、视频能力、媒体任务、签到、邀请码、会话、消息、日志、任务、数据统计、令牌。 |
| `src/api/types.ts` | DTO 类型。 |
| `src/api/format.ts` | 额度→货币、时间、相对时间格式化。 |
| `src/auth/AuthProvider.tsx` | 登录态、2FA pending、站点配置、`quotaPerUnit`、会话恢复与退出。 |

关键约定：

- `/api/*` 业务失败可能仍是 HTTP 200，必须看 `success`；`/pg/*` 错误是 `{error:{message}}`，且 `error` 可能为 `null`。
- 鉴权同时需要 `Cookie: session=...` 与 `New-Api-User: <userId>`；2FA pending 阶段只有 Cookie、`userId=0`，此时不发送 `New-Api-User`。
- Cookie 与 `userId` 存 `expo-secure-store`；登录响应必须能读到 `Set-Cookie`，否则提示「登录会话保存失败，请重试」。
- 超时默认 30s；`/pg/images/sync` 单独放到 180s。
- `localizeMessage` 把服务端英文错误转中文，例如 `Username or password is incorrect, or user has been banned` → 「账号或密码错误」（实测）。
- `GET /api/user/logout` 是 GET。`PUT /api/user/self` 即使在只改密码时也必须回传当前 `username`。

### 登录与账号

`src/screens/LoginScreen.tsx`：

- 同屏 `Mode = login | register | reset` 切换；2FA 是独立 step。
- 图形验证码是底部 `Modal`：服务端返回 `chars` 坐标与 `target_chars` 顺序，客户端渲染并按顺序点选，再提交 `clicks`；舞台宽高用服务端 `width/height` 的 `aspectRatio`。
- 注册/找回都先过图形验证码，再加短信验证码；站点 `sms_verification=true`。
- 登录 `require_2fa` → 2FA 页；`need_set_password` → 切到找回模式并预填手机号。
- 站点配置来自 `/api/public/status`；登录后用 `/api/status` 的 `quota_per_unit`（缺省 500000）换算额度。

### 数据映射

- `src/services/useConsoleData.ts`：并发拉取 `playground-models`、`pricing`、日志、任务、`data/self`、令牌、公告，失败项保持空数组不阻塞其他模块。
- `src/services/liveConsole.ts`：DTO→UI 映射与计费。
  - 按次计费（`quota_type=1`）用 `model_price × group_ratio`；按 token 用 `model_ratio × 2 × group_ratio`（每 1M）。
  - 额度按 `quota_per_unit` 折成 ¥；令牌额度表单按元输入，提交时乘回 `quota_per_unit`。
  - 令牌 `unlimited_quota` 时不显示百分比，展示「不限额度」。
- `src/services/mediaModels.ts`：媒体模型分类、价格标签、任务状态/进度/错误与媒体 URL 提取（递归找第一个 http(s) 媒体链接）。
- `src/data/mockConsole.ts` 只剩 `usageRangeOptions`；`src/services/consoleAdapter.ts` 已删除。

### 页面接入

- `ChatWorkspace`：真实会话列表、消息按需加载、流式对话、停止、删除会话；模型由 props 注入，模型列表晚到时补默认模型。
- `PersonalScreen`：资料、额度、签到、改名、改密、退出。
- `WalletScreen`：余额、消耗、邀请码、复制。
- `ModelMarketplaceScreen`：真实模型，四个筛选项（全部/对话/图像视频/音频）。
- `ModelExperienceScreen`：真实流式对话，模型列表更新时校正选中项。
- `MediaStudioScreen`：真实媒体生成。
  - 图片 `POST /pg/images/sync`（同步出图，取 `data[0].url`）。
  - 视频 `POST /pg/video/generations` + `/pg/video/fetch`。
  - 音乐 `POST /pg/music/submit` + `/pg/music/fetch`。
  - 语音 `POST /pg/audio/submit` + `/pg/audio/fetch`。
  - 参数来自 `/api/video/model-capabilities` 与 `/api/user/model/voices`；轮询 4s、最多 75 次；结果可打开/复制链接。
- `FusionScreen`：真实多模型并行 `chatOnce` + 总结模型汇总，保留各模型原始回答与失败原因。
- 人脸工具因文档无对应接口，已移除入口、聊天「+」入口与 `FaceToolsScreen.tsx`。

## 仍需用真实账号校正的点

1. 登录成功链路未端到端实测（缺测试账号），包括 XHR 能否稳定读到 `Set-Cookie`。
2. `/api/token/` 系列文档未收录，现按 new-api 标准实现（`GET/POST /api/token/`、`PUT/DELETE /api/token/:id`），返回结构需校正。
3. `/api/data/self` 返回结构按标准假设实现，需核对字段。
4. 短信链路只验证到图形验证码面板与手机号校验，未向真实手机号发码。
5. `/pg/*` 各渠道返回结构差异大，任务状态与结果 URL 提取是兜底逻辑，需真实任务核对。
6. `GET /api/video/model-capabilities` 不经过 `{success,message,data}` 包装（字段为 `code`），已单独处理，仍需实测。

## 用户已经确定的要求（UI，勿回退）

- 放弃输入区阴影，使用渐变背景模糊；不要恢复灰色渐变带或不透明底色遮罩。
- 安卓只有底部导航栏整体保留阴影，普通组件、输入框、建议卡不带阴影。
- iOS 原有圆角、尺寸、字号不随安卓改动而改变；iOS 主题色 `#007AFF`，安卓 `#1A73E8`。
- 输入框随键盘移动；动画要快，不能落后键盘，也不能回落后再跳一下。
- 不加说明性小字，不用整页渐变，纵向页保留系统滚动条，底部不被安全区硬切。

### 渐变模糊

`src/ChatWorkspace.tsx` 用 `expo-blur` 的 `BlurTargetView` 包裹内容、`BlurView` 采样背景，`masked-view` + SVG 透明度蒙版控制渐变。强度 45、light tint，上伸 40dp，总高 48dp，双端共用。键盘可见时延迟 90ms/220ms 淡入，收起 150ms 淡出，原生驱动。

### 键盘避让

聊天页已由 KAV 改为普通 View，调用 `useKeyboardInsets(true)`：

- Android 用键盘事件高度；展开时底部间距为键盘高度，收起恢复 `bottomInset`（76）。不要减安卓底部安全区。
- iOS 用 `screen.height - keyboard.screenY`；底部间距 `max(bottomInset, keyboardInset - safeAreaInsets.bottom)`。
- 监听 didShow/didHide，iOS 另监听 willShow/willChangeFrame；相同高度去重。
- iOS 首次上移最多 180ms easeOut，完全收起最多 140ms easeOut，其余用系统动画。

### 其他已完成修复

键盘展开时点「+」不再收起键盘：`ChatPopover` 改为页面内绝对定位覆盖层（`absoluteFill` + `zIndex: 30`），锚点用 `measureInPage`；键盘可见性变化自动收起；安卓返回键用 `BackHandler` 先关弹层。

## 运行与实测

```bash
cd /Users/wenze/Documents/GitHub/QMSZAI-Mobile
npx expo start --localhost --port 8091
npx tsc --noEmit
npx tsc --noEmit --noUnusedLocals
npx expo export --platform ios --platform android
```

Android：AVD `qmszai_pixel`，通常 emulator-5554。

```bash
export ANDROID_HOME=~/Library/Android/sdk
$ANDROID_HOME/platform-tools/adb reverse tcp:8091 tcp:8091
$ANDROID_HOME/platform-tools/adb shell am force-stop host.exp.exponent
$ANDROID_HOME/platform-tools/adb shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8091' host.exp.exponent
$ANDROID_HOME/platform-tools/adb exec-out screencap -p > /tmp/shot.png
```

设备 1080×2400，截图 900×2000，坐标 ×1.2。

iOS：iPhone 18 Pro，UDID `C0A7ECCE-6CA4-40E4-B955-0ECB870F9B6D`。

```bash
xcrun simctl openurl C0A7ECCE-6CA4-40E4-B955-0ECB870F9B6D "exp://127.0.0.1:8091"
xcrun simctl io C0A7ECCE-6CA4-40E4-B955-0ECB870F9B6D screenshot /tmp/shot.png
```

iOS 登录页右上角齿轮是 Expo Go 悬浮按钮，不是应用 UI。恢复模拟器快照后必须重载 Expo Go，不要凭旧画面判断代码。

## 验证结果

已通过：

- `npx tsc --noEmit`、`npx tsc --noEmit --noUnusedLocals`。
- `npx expo export --platform ios --platform android`。
- 安卓登录页、注册页、图形验证码面板、错误登录提示（「账号或密码错误」）截图核对正常。
- iOS 登录页截图正常。
- 站点配置实测：`register_enabled=true`、`sms_verification=true`、`system_name=阡陌数智`、`turnstile_check=false`；`/api/pricing` 返回 338 个模型。

尚未确认：

- 登录成功后的全部页面（概览、聊天、AI 创作、令牌、签到等）没有真实账号实测。
- 键盘动画逐帧同步性与快速开合回归（沿用上轮结论，本轮未改算法）。
- 安卓子页与浮层在残留阴影清理后的逐页验收。

## 下一步

1. 拿到测试账号后，先 curl 验证：`POST /api/user/login`（`Set-Cookie` + `data.id`）、`GET /api/user/self`、`/api/user/playground-models`、`/api/chat/conversations`、`/api/token/`、`/api/data/self`。
2. App 内跑通：登录 → 概览 → 聊天流式 → AI 创作四类 → 令牌增删改 → 签到，按真实返回修正映射与错误文案。
3. 回归双端 UI（登录后页面、键盘避让、输入区模糊、安卓无阴影）。
4. 修改后更新本入口与 `/Users/wenze/project.md`；保持未提交、未推送，交由用户处理。
