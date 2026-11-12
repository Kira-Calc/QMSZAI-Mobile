# QMSZAI Mobile：CLI 接手文档

更新日期：2026-11-12。以本文和实际代码为准。本轮已由「全部本地模拟数据」改为按《APP 测试环境 API 接口文档》接真实接口；旧交接里“未接真实业务接口”的描述已失效，键盘避让与阴影方案仍以本文为准。

## 项目与授权

- **补齐（2026-11-11 iOS 修复，最重要）**：iOS 之前登录后必然 401（界面停在登录页并提示「登录状态已失效，请重新登录」）。根因：iOS 的 NSURLSession 会接管 `Cookie` 请求头，手工 `setRequestHeader('Cookie', …)` 在真实域名的 HTTPS 请求上被原生 Cookie jar 覆盖/丢弃，服务端收不到会话。现在 `src/api/client.ts` 的 `authHeaders()` 在 iOS 只下发 `New-Api-User`，`session` Cookie 交给原生 jar（登录响应的 Set-Cookie 自动入 jar，重启仍有效）；安卓保持手工 Cookie。**不要再在 iOS 上手工设置 Cookie 头**。验证方式：Metro 日志里 `POST /api/user/login` 200 之后 `GET /api/user/self` 必须是 200。
- **iOS 自动化（本机环境）**：Xcode 27 缺 `Simulator.app`，`xcrun simctl` 只能截图不能点击；GitHub 不可达（Maestro/idb 装不上）。已用 npm 装 `appium@3.9.0` + `xctest/xcuitest@12.22.8`：`appium --port 4723` 后对 UDID `C0A7ECCE-6CA4-40E4-B955-0ECB870F9B6D`（iPhone 18 Pro, iOS 27, Expo Go 58.0.4）建 session（`appium:bundleId=host.exp.Exponent`），即可用 WebDriver tap/输入/取 UI 树/截图；坐标直接用 UI 树里的坐标。坑：iOS 登录后会弹系统「保存密码?」挡住整屏，点「以后」才能继续；输入框用 `element clear` + 逐字符 `POST /keys` 比 `setValue` 稳。
- **iOS 回归状态（2026-11-12 09:05，已完成）**：iOS 模拟器上普通用户全部非支付页面都已逐个点过并通过（聊天含流式与删除对话、概览、模型目录、模型广场含搜索/分类/详情、模型体验、模型融合、令牌、用量日志、任务、消息、账户/个人设置/钱包、AI 创作含语音播放）。本轮修改：模型详情去掉恒空的「上下文长度」行、空能力标签/空描述不渲染；`App.tsx` 新增 `chatModelIds`，模型体验/融合的选模型只列可对话模型；`useConsoleData` 新增 `refreshLogs`/`refreshTasks` 并在打开日志/任务子页时调用；钱包/个人设置进入时 `refreshUser()`；删除六处空态说明小字。测试对话与测试令牌 #55「Mobile client」均已删除（令牌页为空态，空态下不再显示说明小字）；服务端任务记录无删除接口，保留。安卓已重新拉起、聊天页正常，但未逐页复核，是下一步。
- **安卓回归状态（2026-11-12 09:26，已完成）**：安卓模拟器（`qmszai_pixel` / emulator-5554）上普通用户全部非支付页面逐页点过并通过（聊天含流式、删除对话、模型选择器；概览、模型目录含搜索、模型广场含分类与详情、模型体验含清空、模型融合真实跑通、令牌、用量日志含筛选、任务、消息、账户/个人设置/钱包、AI 创作四类）。本轮修：聊天模型选择器混入 asr/图像等不可对话模型（改传 `chatModels`）；选择器空「上下文/延迟」标签删除；任务耗时不再用「现在」当结束时间（无 `finish_time` 显示「—」）；消息页「全部消息已读」冗余小字删除。复核后同一轮又修掉两处：**回复 Markdown 渲染**（新增 `src/richText.tsx`，`RichText` 处理加粗/行内代码/代码块/`#` 标题/`- ` 列表/引用，`plainText()` 用于历史预览去标记，已接入聊天/模型体验/模型融合助手文本，双端截图核对）与**融合页键盘遮挡**（安卓键盘弹起时按键盘高度补 `paddingBottom`、再用 `measureInWindow` 把「发送并融合」滚到键盘上方；iOS 不补留白，保持原观感；安卓实测按钮完整露出可点）。安卓模拟器复核结束后自行退出，需要时按下方命令重启，重启后务必 `adb reverse tcp:8091 tcp:8091` 并重载 Expo Go，否则会看到旧缓存包（表现为旧版「演示 / 模拟数据」界面）。
- 仓库：`/Users/wenze/Documents/GitHub/QMSZAI-Mobile`。
- 当前 HEAD：`79f01a2`（`11.11.17.18`，用户已提交昨天的 iOS 修复）；前一提交 `c1f4f6a`。
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
- iOS 全量页面回归（2026-11-12，真实账号 `kira`）：全部非支付页面截图核对通过，聊天流式与对话删除、模型融合真实落库、AI 创作语音可播放。
- 安卓全量页面回归（2026-11-12，同一账号）：全部非支付页面截图核对通过，聊天流式、模型融合真实落库；登录态经 Metro 反向代理 `127.0.0.1:8091` 正常。
- Markdown 渲染（2026-11-12）：`src/richText.tsx` 的 `RichText` 已接入聊天、模型体验、模型融合的助手文本，双端截图确认加粗、`- ` 列表、`#` 标题、` ``` ` 代码块均按样式显示，不再出现 `**`/`#` 原文；对话历史预览改用 `plainText()`，不再显示 `##`、`-` 等标记。
- 模型融合键盘遮挡（2026-11-12）：安卓键盘覆盖窗口且窗口不缩小，改为键盘弹起时按键盘高度补 `paddingBottom`、再用 `measureInWindow` 定位「发送并融合」按钮滚入可视区；iOS 不补留白以免改变现有观感。安卓截图确认按钮完整露出可点。
- 站点配置实测：`register_enabled=true`、`sms_verification=true`、`system_name=阡陌数智`、`turnstile_check=false`；`/api/pricing` 返回 338 个模型。

尚未确认：

- 键盘动画逐帧同步性与快速开合回归（沿用上轮结论，本轮未改算法）。
- iOS 软键盘实机验证：模拟器无软键盘（硬件键盘接通），融合页键盘遮挡逻辑是按同一套 `measureInWindow` 实现，仅安卓实测。
- Markdown 只覆盖常见标记，不含表格、图片、HTML、链接跳转（链接仅保留文字）。
- 支付、管理员端、古今图书：不做。

## 模型选择搜索 + A-Z 索引 + 顶部模糊（2026-11-12 新增）

- 聊天页模型弹出时，顶部模型选择框本身变成搜索框（iOS 用 `TextInput` 替换胶囊内容，安卓 sheet 头部是「搜索框 + 完成」一行），不再在列表里额外加搜索框。输入时按「模型名 + 厂商」过滤，右侧出现清除按钮，无结果显示「没有匹配的模型」。关闭弹层会清空搜索词。
- iOS 弹层遮罩从选择框底部开始，保证弹层打开时顶部搜索框仍可直接点按输入；`ChatPopover` 已移除 `header` 槽位，改为 `indexLetters` / `indexOffsetFor`。
- 所有模型列表右侧加 A-Z 索引（`src/ui.tsx` 的 `AlphabetRail`，字母取 `src/modelSort.ts` 的 `letterOf` / `alphabetOf`，非字母归 `#`，不足两个字母时自动隐藏）。点击字母用行 `onLayout` 记录的偏移 `scrollTo`。接入：聊天弹层、安卓聊天 sheet、`ModelExperienceScreen`、`FusionScreen` 两个弹层、`App.tsx` 模型目录、`ModelMarketplaceScreen` 模型广场。
- 所有模型列表统一按名称自然排序：字母 A→Z、数字按大小（`sortByName` / `sortModelNames`）。
- 模型目录向下滚动时列表会直接贴住搜索框，`ModelsView` 用 `BlurTargetView` + 渐变遮罩的 `BlurView` 做顶部模糊，透明度和 `contentOffset.y / 24` 绑定，回到顶部即淡出。注意：安卓的 `BlurView` 必须和 `BlurTargetView` 同级，不能嵌在目标视图里（否则不生效），结构是 `列表行容器 > [BlurTargetView > ScrollView] + 模糊层`。
- iOS 键盘弹出时不再关闭模型弹层，改为重新测量页面尺寸更新 `popoverBounds`，弹层跟随上移；安卓 sheet 内 `keyboardShouldPersistTaps="handled"` 保证点列表项时键盘不吞掉点击。
- 验证：双端截图确认顶部搜索框输入 `q`/`qwen` 过滤、清除按钮、A-Z 点击跳转（聊天弹层、模型体验、融合两个弹层、模型目录、模型广场）、模型目录滚动时模糊淡入；`npx tsc --noEmit --noUnusedLocals` 通过。未提交、未推送。

## 弹层空结果 + 模型图标 + 底部渐隐（2026-11-12 新增）

- 模型搜索无结果时弹层不再塌成一条：`ChatPopover` 的 `ScrollView` 去掉 `flex: 1` 改 `maxHeight`，`estimatedHeight` 空态取 88，卡片按内容展开并显示「没有匹配的模型」（iOS/安卓一致）。
- `src/ui.tsx` 的 `Row` 新增 `leading` 插槽，`FusionScreen` 的「选择助手模型 / 选择总结模型」与 `ModelExperienceScreen` 的模型弹层行都传入 `ModelLogo size={24}`，与模型目录/聊天弹层一致。
- 「底部矩形切除」= 列表滚动时卡片被弹层底边切成直角硬边。`src/ui.tsx` 的 `Sheet` 与 `ChatWorkspace` 安卓聊天 sheet 都在列表底部叠 32pt 的 `react-native-svg` 线性渐变（透明 → `palette.groupedBackground`，`pointerEvents="none"`），渐变 id 每个 `Sheet` 实例自增避免冲突。高度与 `sheetContent.paddingBottom` 的 32 对齐，滚到末尾时最后一张卡的圆角正好在渐隐区上方，不会被压暗。iOS 的 `ChatPopover` 是浮动圆角卡片，不需要渐隐。
- 验证：iOS `选择助手模型` 用 `跳到 L` / `跳到 S` 定位后截图，中部滚动时底边淡出无硬边、末尾卡片圆角完整；安卓聊天 sheet 底部行淡出、输入 `zzzq` 显示「没有匹配的模型」、点「完成」正常关闭。`npx tsc --noEmit --noUnusedLocals` 通过。未提交、未推送。
- 同一轮修「点加号弹出 AI 功能菜单后，再点加号或空白处关不掉」：`ChatPopover` 新增 `overlayTop`（默认仍从锚点底部开始，保留模型选择时顶部搜索框可点），AI 功能菜单传 `overlayTop={0}`，让遮罩覆盖整页（含加号本身），点空白处或再次点加号都会 `onClose`。另外 `ChatWorkspace` 新增 `active` 属性（`App.tsx` 传 `activeTab === 'chat'`），切到其他标签页时收起工具菜单与模型弹层，切回来不会残留。双端验证：iOS/安卓点加号开、点空白关、连点两次加号关、切到「模型」再回「聊天」菜单已消失；模型选择弹层顶部搜索框仍可直接输入，点列表外空白正常关闭。

## 模型体验 / 模型融合弹层搜索框（2026-11-12 新增）

- `src/ui.tsx` 的 `Sheet` 新增 `searchValue` / `onSearchChange` / `searchPlaceholder` / `empty` / `emptyText`：传 `onSearchChange` 就在标题下方固定一条搜索框（含放大镜、清除按钮），不随列表滚动；列表为空时显示「没有匹配的模型」。iOS 走 38pt 灰色胶囊，安卓 46pt `palette.fill` 胶囊，沿用 `Sheet` 原有 M3 尺寸。
- `ModelExperienceScreen`：新增 `modelQuery` / `visibleModels`，弹层内按名称过滤，A-Z 字母与 `indexOffsetFor` 基于过滤后的列表重算；打开与关闭弹层都会清空搜索词。`FusionScreen`：`assistantQuery` / `summaryQuery` 分别过滤两个弹层，字母/偏移同样重算，关闭或选中后清空。
- 键盘兼容：`Sheet` 的 `ScrollView` 与 `ChatPopover` 的滚动列表补 `keyboardShouldPersistTaps="handled"`。搜索框聚焦时点模型行会立即选中（不再需要先点一下收键盘再点一次），iOS/安卓一致。验证时注意：融合助手弹层已选满 3 个时点未选行会弹「最多 3 个助手模型」，表现为点按无变化，不是点击失效。
- 验证（iOS + 安卓）：模型体验输入 `qwen` / `glm` 过滤、清除按钮、`zzz` 空态、点行直接关闭并切模型；融合两个弹层过滤后行内打勾、选中后配置行同步；关闭再打开搜索词已清空；A-Z 索引与底部渐隐在过滤后仍正确。`npx tsc --noEmit --noUnusedLocals` 通过。未提交、未推送。

## 消息气泡操作（2026-11-12 新增）

- 用户与助手气泡下方都有时间戳与复制按钮：复制后图标变蓝色对勾约 1.6s；时间格式当天 `HH:mm`、昨天 `昨天 HH:mm`、一周内 `星期X HH:mm`、更早显示日期（`src/messageTime.ts`）。
- 用户气泡额外有铅笔按钮：点击后原文本回填输入框并聚焦，输入条上方显示「正在编辑消息，发送后将重新生成回复」+「取消」。发送时从被编辑的消息开始截断，重新流式生成回复；失败会回滚到编辑前的消息列表。
- **限制**：服务端只有会话级删除和追加消息接口，没有单条消息编辑/删除接口，所以编辑只改本地会话；重新进入该对话时会按服务端记录恢复（表现为旧消息仍在、等于多了一轮）。如后续需要真正覆盖历史，必须先在服务端补消息编辑/删除接口。

## 底部导航栏收起/展开动画（2026-11-12 新增）

- 现象：模型目录等可滚动页面下滑时，底部导航栏从完整栏跳到小圆钮，中间没有过渡，看起来是「瞬切」。
- 原因：收起状态原先靠切换 `minimized` 换整套样式（`styles.barMinimized`），再用 `LayoutAnimation` 包一层；`LayoutAnimation` 只做 opacity 属性动画，不插值宽度/圆角，且在动画期间 `bar.onLayout` 会把中间宽度写回状态，形成反馈抖动。
- 现在：`src/LiquidTabBar.tsx` 用单个 `Animated.Value`（`miniProgress`，240ms，`Easing.inOut(Easing.ease)`）驱动宽度（`barWidth` ↔ 60）、高度（64 ↔ 60）、圆角（iOS 32 / 安卓 `shape.xl` ↔ 30），同时驱动两套内容交叉淡化（`tabsLayer` 1→0、`miniLayer` 0→1），`useNativeDriver: false`（尺寸动画只能 JS 驱动）。`GlassView` 用 `Animated.createAnimatedComponent` 包成 `AnimatedGlassView` 参与动画。
- 完整栏宽度改为从外层 dock 的 `onLayout` 换算（`dockWidth - 32`），不再在动画中的 bar 自身上量宽度，避免抖动。
- `App.tsx` 的 `setTabBarMinimizedAnimated` 只负责切状态，已移除 `LayoutAnimation` 及其 import，避免与 `Animated` 重复动画。
- 验证：iOS 临时把时长加到 1500ms 抓中间帧确认宽度/圆角/内容淡出在插值（不是瞬切），恢复 240ms 后实机下滑收起为 60×60 圆形玻璃钮、点按或上滑展开回完整栏、切到其他标签页选中态与指示块正常；安卓同一套手势收起/展开正常，无阴影异常。`npx tsc --noEmit --noUnusedLocals` 通过。

## 令牌新建/编辑弹层键盘遮挡（2026-11-12 新增）

- 现象：令牌页「新建令牌 / 编辑令牌」底部弹层调出键盘后，键盘直接盖住「分组、额度」字段与「取消 / 创建」按钮（iOS 数字键盘与全键盘都复现）。
- 原因：`TokenFormModal` 是自定义 `Modal` + `modalBackdrop`（`justifyContent: 'flex-end'`），没有做键盘避让，`Modal` 本身不会自动上移。
- 修法：不用 `KeyboardAvoidingView`（它会把整块面板抬起，面板和键盘之间露背景色）。改为让白色面板一直铺到屏幕底部、键盘浮在面板之上，`paddingBottom = 键盘高度 + 16`（`useKeyboardInsets(true)`，键盘收起时 30pt）。+16 是必须的：键盘顶部有半透明模糊边，刚好等于键盘高度时「取消 / 创建」会被这条边压住（实测被盖住约 10pt）。安卓保持原样：Modal 窗口随键盘 resize，`paddingBottom` 固定 22。
- 验证：iOS 分别聚焦「名称」（全键盘）与「额度」（数字键盘）截图确认按钮完整露出、面板与键盘之间是面板底色而非页面背景；安卓两种键盘（数字键盘、Gboard 全键盘）实测按钮完整露出、与键盘间约 22dp，无同类遮挡。键盘收起/关闭弹层后页面无残留位移。`npx tsc --noEmit --noUnusedLocals` 通过。未提交、未推送。

## 令牌分组改为可选择列表（2026-11-12 新增）

- 现象：网页端「分组优先选择」是可搜索的多选下拉（输入关键词过滤，选择顺序即优先级），App 里只能手填分组名。
- 数据：沿用已有 `fetchUserGroups()`（`GET /api/user/groups`，返回 `{ name: { ratio, desc } }`）。排序与网页端一致：`default` 置顶，其余按名称（拉丁字母排在中文前）。
- 提交：网页端请求体同时带 `group`（首个分组，服务端旧字段）与 `routing_group_order`（JSON 字符串数组，如 `"[\"default\",\"claude-aws1\"]"`）。`createToken` / `updateToken` 都补了 `routing_group_order`，`App.tsx` 的 `submitToken` 里 `group = routingGroups[0]`。
- 回填：`mapTokens` 用 `parseRoutingGroups()` 解析 `routing_group_order`，`Token.scope` 显示成 `a → b`，同时把 `routingGroups` 交给编辑表单回填。
- 交互：`TokenFormModal` 内做模式切换（表单 ↔ 分组选择页），不嵌套第二个 `Modal`。选择页有「返回 / 选择分组 / 完成」、搜索框、序号圆点、`x 倍率`，点行切换选中并把新选项追加到末尾，所以取消再选就等价于调整优先级。表单里显示带序号的小胶囊（`1 default`…）。
- 键盘：分组选择页在 iOS 用固定高度面板（`windowHeight - 96`）+ 列表 `flex: 1`，否则列表会把「完成」按钮顶到键盘下面；表单页仍用「面板铺到屏幕底部 + `paddingBottom = 键盘高度 + 16`」。安卓 Modal 随键盘缩放，列表保持 `maxHeight: 300`。
- 回退：`fetchUserGroups` 失败时 `groups` 为空数组，分组字段退化为手填输入框，不会卡死创建流程。
- 顺带：`AppIcon` 补了 `chevron.down → chevron-down`，此前安卓会落回 `ellipse-outline`，分组字段右侧显示成一个空心圆。
- 验证（iOS + 安卓）：列表加载、搜索 `claude` / `gem` 过滤、多选序号、取消再选调整顺序、返回表单显示 `1/2/3` 胶囊、创建后列表显示 `a → b`、编辑回填顺序一致、保存后顺序更新、删除清理；两端的键盘弹起时「完成」按钮都完整露出。`npx tsc --noEmit --noUnusedLocals` 通过。未提交、未推送。

## 下一步

1. 双端页面回归与细节打磨已完成（Markdown 渲染、融合页键盘遮挡、消息气泡时间戳/复制/编辑重生成、模型选择搜索与排序、模型体验/融合弹层搜索框、底部导航栏收起/展开动画、令牌分组多选与优先级），测试对话与令牌 #55 / #56 / #57 已清理；改动等用户决定提交/推送。
2. 需要真机/模拟器复跑时：iOS 用 Simulator + Appium（见下）；安卓先 `emulator -avd qmszai_pixel`，再 `adb reverse tcp:8091 tcp:8091`，用 `am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8091" host.exp.exponent` 拉起。
3. 改动后跑 `npx tsc --noEmit --noUnusedLocals`，并更新本入口与 `/Users/wenze/project.md`；保持未提交、未推送，交由用户处理。

## 令牌表单补齐网页端设置 + 选择页动效（2026-11-12 新增）

- **金额 / 无限额度**：`TokenFormModal` 新增 `unlimited`（新建默认开启，与网页端一致）与 `amount`。关闭「无限额度」后才显示「金额（元）」（`decimal-pad`，占位 `0.00`）；编辑时按 `remain_quota / quotaPerUnit` 反算回填。
- **模型限制列表**：新增全屏模型选择页（`pickerMode === 'models'`），数据来自 `fetchUserModels()`（与聊天/体验共用可对话模型），支持关键词过滤、多选、勾选标记；表单显示 `首个模型 等 N 个`，空为「留空支持所有模型」。
- **IP 白名单**：多行 `TextInput`（`formTextarea`），一行一个，支持 CIDR；原样提交给 `allow_ips`。
- **请求体**：`submitToken` 统一构造 `access = { remain_amount, unlimited_quota, model_limits_enabled: modelLimits.length > 0, model_limits: modelLimits.join(','), allow_ips }`；新建与更新都带（`updateToken` 之前写死空 `model_limits`/`allow_ips`，会把已有设置清空，本轮一并修掉）。无限额度时 `remain_quota` 与 `remain_amount` 都为 0，否则 `remain_amount = 金额`、`remain_quota = 金额 * quotaPerUnit`。
- **回填**：`Token` 新增 `modelLimits` / `allowIps`，`mapTokens` 拆 `model_limits`（逗号）与 `allow_ips`；编辑表单直接回填，保存后再次打开保持。
- **iOS Switch 对齐**：RN iOS 的 `Switch` 内部默认 `alignSelf: 'flex-start'`，在 46pt 行里顶部对齐，比「无限额度」文字高约 9pt。给 `Switch` 传 `style={{ alignSelf: 'center' }}`（`styles.switchControl`）后元素中心与文字中心一致（551..580 vs 557..574）。
- **表单滚动 + 键盘**：表单字段变多后，键盘弹起时 iOS 的 ScrollView 只显示上半段，点靠下的 IP 字段会被动作按钮挡住。现在每个字段包一层 `onLayout` 记录 `y`，`onFocus` 设置 `focusedField` 并在键盘高度变化后的 60ms / 320ms 各 `scrollTo(y - 12)` 一次（键盘动画期间第一次滚动会被旧视口高度截断，必须补第二次）。iOS 实测聚焦 IP 时字段完整露在「取消 / 创建」上方。
- **选择页底部重复按钮删除**：顶部已有玻璃「返回 / 完成」，去掉选择页底部的整宽「完成」，列表多出一屏空间。
- **切换动画**：`openPicker` / `closePicker` 调用 `animateContentChange()`（`LayoutAnimation` 200ms opacity）。iOS 抓中间帧确认表单与选择页在交叉淡化，不是瞬切；同时给 `modalSheet` 加 `overflow: 'hidden'`，否则高度过渡时选择页的行会画到面板圆角以外（遮罩区）。
- **安卓玻璃回退**：`GlassSurface` 的安卓 fallback 由白底 + `elevation.level1` 改为 `#ECF0F3`（`m3.surfaceContainer`）且无阴影。原先白色面板上的「返回 / 完成」与关闭按钮和底色同色，等于看不见；现在读作浅色胶囊按钮，仍符合「安卓不加阴影」。
- **验证**：iOS 新建令牌 #58（金额 2.5、模型限制 2 个、IP `1.2.3.4`）→ 详情「限额 ¥2.50」→ 编辑回填全部字段 → 保存后再次打开仍保持 → 删除；安卓 #59 同流程，另加分组 `default` + `aws-bedrock1`，保存后卡片显示 `default → aws-bedrock1`，随后删除。iOS 分组列表实测 46 条，与 `/api/user/groups` 一致。网页端测试令牌 `zz-cli-probe2`（id 100）已删除。`npx tsc --noEmit --noUnusedLocals` 通过。未提交、未推送。
- **测试环境限制**：Appium 的 `keys` / `setValue` 在 iOS、安卓都无法插入换行，IP 白名单的多行只用单行值验证过提交与回填；控件是标准 `multiline` `TextInput`，真机键盘回车可换行。

## 模型限制图标 + 模型目录搜索空态（2026-11-12 新增）

- 模型限制选择页（`TokenFormModal` 的 `pickerMode === 'models'`）每行在复选框与模型名之间加 `<ModelLogo name={item} size={24} />`，复用模型目录/聊天弹层的同一组件；无法识别的名称回退 Gemini 星标。iOS、安卓截图确认图标与行文字垂直居中对齐、长模型名仍单行截断。
- 模型目录（`ModelsView`）过滤结果为空时不再整页空白：`ScrollView` 内渲染 `emptyState` 卡片，`query.trim()` 非空显示「没有匹配的模型」，否则显示「暂无模型」。卡片沿用 `emptyState` / `emptyTitle`（iOS 12pt continuous 白卡、安卓 M3 圆角），不带说明小字。
- 验证：iOS 模型限制页（deepseek-flash_官方 / MiniMax 等图标）、搜索 `zz` 显示空态、点清除后列表恢复；安卓输入 `zzzz` 显示空态、模型限制页图标正常；`npx tsc --noEmit --noUnusedLocals` 通过。改动未提交、未推送。
- 同轮按用户要求删除主标签页标题上方的灰色小字「阡陌数智 · 分组」：移除 `App.tsx` 头部唯一的 `styles.eyebrow` 文本及 base/iOS 两处样式定义，五个标签页（聊天/概览/模型/令牌/账户）统一生效。随后又按要求删除标题右侧的「在线」徽标（`liveBadge` / `liveDot` / `liveText`，base 与 iOS 样式一并清理），头部现在只保留标题。
- 分组 / 模型限制选择页的选中行原来在 iOS 上是直角蓝底：`iosStyles.groupOption` 覆盖了 base 样式却没有带 `borderRadius`。已补 `borderRadius: 10` + `borderCurve: 'continuous'`，并让选中行 `borderBottomColor: 'transparent'`，避免分隔线穿过圆角底色（安卓 base 的 8pt 圆角保留，同样隐藏选中行分隔线）。双端截图确认蓝底为圆角胶囊、上下行分隔线自然。
