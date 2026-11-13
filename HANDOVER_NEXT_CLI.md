# QMSZAI Mobile：CLI 接手文档

更新日期：2026-11-12。以本文和实际代码为准。本轮已由「全部本地模拟数据」改为按《APP 测试环境 API 接口文档》接真实接口；旧交接里“未接真实业务接口”的描述已失效，键盘避让与阴影方案仍以本文为准。

## 项目与授权

- **补齐（2026-11-11 iOS 修复，最重要）**：iOS 之前登录后必然 401（界面停在登录页并提示「登录状态已失效，请重新登录」）。根因：iOS 的 NSURLSession 会接管 `Cookie` 请求头，手工 `setRequestHeader('Cookie', …)` 在真实域名的 HTTPS 请求上被原生 Cookie jar 覆盖/丢弃，服务端收不到会话。现在 `src/api/client.ts` 的 `authHeaders()` 在 iOS 只下发 `New-Api-User`，`session` Cookie 交给原生 jar（登录响应的 Set-Cookie 自动入 jar，重启仍有效）；安卓保持手工 Cookie。**不要再在 iOS 上手工设置 Cookie 头**。验证方式：Metro 日志里 `POST /api/user/login` 200 之后 `GET /api/user/self` 必须是 200。
- **iOS 自动化（本机环境）**：Xcode 27 缺 `Simulator.app`，`xcrun simctl` 只能截图不能点击；GitHub 不可达（Maestro/idb 装不上）。已用 npm 装 `appium@3.9.0` + `xctest/xcuitest@12.22.8`：`appium --port 4723` 后对 UDID `C0A7ECCE-6CA4-40E4-B955-0ECB870F9B6D`（iPhone 18 Pro, iOS 27, Expo Go 58.0.4）建 session（`appium:bundleId=host.exp.Exponent`），即可用 WebDriver tap/输入/取 UI 树/截图；坐标直接用 UI 树里的坐标。坑：iOS 登录后会弹系统「保存密码?」挡住整屏，点「以后」才能继续；输入框用 `element clear` + 逐字符 `POST /keys` 比 `setValue` 稳。
- **iOS 回归状态（2026-11-12 09:05，已完成）**：iOS 模拟器上普通用户全部非支付页面都已逐个点过并通过（聊天含流式与删除对话、概览、模型目录、模型广场含搜索/分类/详情、模型体验、模型融合、令牌、用量日志、任务、消息、账户/个人设置/钱包、AI 创作含语音播放）。本轮修改：模型详情去掉恒空的「上下文长度」行、空能力标签/空描述不渲染；`App.tsx` 新增 `chatModelIds`，模型体验/融合的选模型只列可对话模型；`useConsoleData` 新增 `refreshLogs`/`refreshTasks` 并在打开日志/任务子页时调用；钱包/个人设置进入时 `refreshUser()`；删除六处空态说明小字。测试对话与测试令牌 #55「Mobile client」均已删除（令牌页为空态，空态下不再显示说明小字）；服务端任务记录无删除接口，保留。安卓已重新拉起、聊天页正常，但未逐页复核，是下一步。
- **安卓回归状态（2026-11-12 09:26，已完成）**：安卓模拟器（`qmszai_pixel` / emulator-5554）上普通用户全部非支付页面逐页点过并通过（聊天含流式、删除对话、模型选择器；概览、模型目录含搜索、模型广场含分类与详情、模型体验含清空、模型融合真实跑通、令牌、用量日志含筛选、任务、消息、账户/个人设置/钱包、AI 创作四类）。本轮修：聊天模型选择器混入 asr/图像等不可对话模型（改传 `chatModels`）；选择器空「上下文/延迟」标签删除；任务耗时不再用「现在」当结束时间（无 `finish_time` 显示「—」）；消息页「全部消息已读」冗余小字删除。复核后同一轮又修掉两处：**回复 Markdown 渲染**（新增 `src/richText.tsx`，`RichText` 处理加粗/行内代码/代码块/`#` 标题/`- ` 列表/引用，`plainText()` 用于历史预览去标记，已接入聊天/模型体验/模型融合助手文本，双端截图核对）与**融合页键盘遮挡**（安卓键盘弹起时按键盘高度补 `paddingBottom`、再用 `measureInWindow` 把「发送并融合」滚到键盘上方；iOS 不补留白，保持原观感；安卓实测按钮完整露出可点）。安卓模拟器复核结束后自行退出，需要时按下方命令重启，重启后务必 `adb reverse tcp:8091 tcp:8091` 并重载 Expo Go，否则会看到旧缓存包（表现为旧版「演示 / 模拟数据」界面）。
- 仓库：`/Users/wenze/Documents/GitHub/QMSZAI-Mobile`。
- 当前 HEAD：`539127d`（`LangUpdate`，父提交 `9ff4dc7` `Darkmode`）。
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

## 夜间模式（2026-11-12 新增，双端已回归）

- **开关位置**：账户页「外观」分组下的「夜间模式」`Switch`（`App.tsx`）。默认浅色，不跟随系统。
- **核心**：新增 `src/theme.ts`。
  - `palette` / `m3` 是**读取时解析的 Proxy**（getter），所以 `styles` 里引用的 `palette.xxx` 会始终取当前配色，不需要重建样式表。
  - `themedStyles(factory)` 返回一个稳定的对象，并登记工厂；`setScheme()` 先改模块内 `scheme`，再重跑全部工厂并写回同一对象，最后通知订阅者。
  - `useScheme()`（`useSyncExternalStore`）在 `App()` 里订阅，切换时整棵树重渲染；`isDark()` 供非样式分支使用（`StatusBar`、`keyboardAppearance`、玻璃 `tintColor`）。
  - `initTheme()` 在 `App` 挂载时从 AsyncStorage（key `qmszai.theme`）恢复；`setScheme()` 同步调用 `Appearance.setColorScheme`。
- **配色**：iOS 暗色走系统语义色（`#0A84FF` 等），安卓暗色保留品牌主色 `#1A73E8`（白字对比度足够，未换浅蓝）。新增语义 token：`strongLabel`、`subtleLabel`、`deepLabel`、`inputBackground`、`pressedFill`、`tintBlue/Green/Amber/Rose`、`hero*`、`glass*`、`tabBar*`、`solidButton`/`onSolidButton`、`destructive` 等。iOS 暗色 `inputBackground = #2C2C2E`（与面板 `#1C1C1E` 区分，否则输入框看不见），安卓暗色 `inputBackground = #1B2024` + `separator` 描边。
- **样式改造**：`App.tsx` 的 `baseStyles` / `iosStyles` 改为 `makeBaseStyles()` / `makeIosStyles()`，两者在 `styles = themedStyles(...)` 里合并；`src/ui.tsx`、`src/ChatWorkspace.tsx`、`src/LiquidTabBar.tsx`、`src/screens/*.tsx`（11 个页面）的 `StyleSheet.create` 全部换成 `themedStyles`。
- **易踩的坑**：iOS 样式是**浅合并覆盖**，`iosStyles.foo` 一旦覆盖 base 的 `foo` 就整键替换，缺 `color` 的键在暗色下会回落到黑字（已逐个补：`detailTitle`、`accountName`、`accountBalance`、`tokenTitle` 等）。
- **系统 UI**：`app.json` 的 `userInterfaceStyle` 改 `"automatic"`；所有 18 处 `<TextInput>` 都加 `keyboardAppearance={isDark() ? 'dark' : 'light'}`（`Appearance.setColorScheme` 不会改变系统键盘，必须显式传）；`LoginScreen` 与 `BootScreen`/子页/主壳的 `StatusBar` 改为按 `isDark()` 取 `light`/`dark`。
- **玻璃组件**：`GlassSurface` / `LiquidTabBar` 的 `GlassView.tintColor` 暗色用强深色 tint；`SegmentedControl` 传 `appearance` 与暗色 `fontStyle`/`activeFontStyle`；安卓 `GlassSurface` fallback 暗色用 `m3.surfaceContainer` 且无阴影。
- **其他细节**：账户页 `Switch` 的 `trackColor` 用 `{ false: ios ? palette.fill : palette.separator, true: palette.blue }`（安卓浅色下 `palette.fill` 太浅）；安卓「创建/编辑」主按钮文字用 `palette.onSolidButton`（浅色深底白字、暗色反转为浅底深字，替代原先写死的 `#15191E`）；`AppIcon` 默认色改 `palette.blue`。
- **回归结论（iOS + 安卓，截图逐页核对）**：
  - iOS 暗色：账户、个人设置、钱包、令牌列表、令牌新建弹层（含键盘）、分组选择页（返回/完成玻璃按钮、选中圆角行）、模型限制页、模型目录、模型详情弹层、概览、用量日志、任务、消息、聊天首页、对话历史弹层、模型选择弹层、会话气泡、AI 创作（含测试模型弹层、尺寸选择页）、模型体验（含选模型弹层）、模型融合、模型广场、登录页（临时强制渲染验证后已还原）。
  - 安卓暗色：账户、聊天、概览、模型目录、令牌、令牌新建弹层、分组选择页、个人设置、钱包、用量日志；状态栏图标随主题变白。
  - 持久化：双端杀进程/重启 Expo Go 后仍是上次所选主题；随后都已切回浅色，抽查账户/聊天/令牌表单与改动前一致。
- **已知非问题**：Expo Go 悬浮齿轮（iOS）正好压住部分右上角按钮（分组页「完成」、模型体验「切换」），这是模拟器开发覆盖层，不是布局问题；绕法是点按钮左侧未被覆盖的位置。
- `npx tsc --noEmit --noUnusedLocals` 通过。改动未提交、未推送。

## 外观设置入口调整 + 跟随系统（2026-11-13 新增）

- 入口：账户页不再有「外观 / 夜间模式」开关，改到「个人设置 → 外观」，三选一：跟随系统 / 浅色 / 深色（选中行右侧蓝色对勾）。
- `src/theme.ts` 新增 `ThemeMode = 'system' | 'light' | 'dark'`：
  - `mode` 是用户选择，`scheme` 是最终生效的明暗；`resolveMode('system')` 读 `Appearance.getColorScheme()`。
  - `setMode(next)` 用 `Appearance.setColorScheme(next === 'system' ? 'auto' : next)`：跟随系统时把外观交还系统，固定浅/深色时覆盖系统。持久化到 AsyncStorage `qmszai.theme`，值可能是 `system / light / dark`（旧值兼容）。
  - `useThemeMode()` 供设置页显示勾选；`useScheme()` 仍是整树重渲染的订阅点。
  - 模块级 `Appearance.addChangeListener`：只有 `system` 模式跟随系统实时变化，固定模式忽略（注意 RN 的 `setColorScheme` 不会派发 change 事件，因此不会自触发）。
- 默认仍是浅色；显式选过「跟随系统」后才真正跟随系统。
- 验证：iOS 三选项切换正常、系统切深色时实时跟随、固定深色时系统切浅色仍保持深色、杀进程后主题保留；安卓用 `adb shell cmd uimode night yes/no` 实测同样跟随/忽略，强杀重启后主题保留。随后双端都已切回「浅色」（系统外观也还原为浅色）。
- **注意（iOS 会话）**：本轮用 Appium `terminate_app` 强杀 Expo Go 后出现过一次回到登录页（首次 `fetchSelf` 401 触发 `clearSession`）。已从模拟器 `host.exp.Exponent.binarycookies` 里取出仍有效的 `session` 临时恢复登录（临时代码已删除，`src/api/client.ts` 无 diff）。App 账号 `kira` 密码未知，**不要在未确认登录态的情况下再强杀 iOS Expo Go**。
- `npx tsc --noEmit --noUnusedLocals` 通过。夜间模式已在提交 `9ff4dc7`，本轮改动未提交、未推送。

## 语言选择（2026-11-13 新增）

- **入口**：与「外观」并列，在「个人设置 → 语言」三选一：跟随系统 / 简体中文 / English（行尾蓝色对勾，交互与外观分组一致）。
- **`src/i18n.ts`**：`Language = 'zh' | 'en'`，`LanguageSetting = 'system' | Language`；`setting` 是用户选择，`language` 是解析后的结果，两者都能驱动重渲染。
  - `t(key)`：中文原文即 key，英文时查 `en[key]`，缺失回落中文。`tf(pattern, ...values)` 用 `{0}` `{1}` 占位替换。
  - `setLanguage()` / `initLanguage()`（AsyncStorage key `qmszai.language`，默认中文）、`getLanguage` / `getLanguageSetting` / `isEnglish`。
  - `useLanguage()` / `useLanguageSetting()` 走 `useSyncExternalStore`；`App()` 里调用 `useLanguage()` 让整棵树跟着换文案。
  - 「跟随系统」在 `AppState` 回到 `active` 时重新解析一次系统语言。
  - 系统语言识别：`expo-localization` 的 `getLocales()[0].languageTag` 为主，`NativeModules.SettingsManager`（iOS）/ `I18nManager`（Android）/ `Intl` 依次兜底。**这层兜底是必要的**：Expo Go 的 Hermes 里 `Intl` 与 `SettingsManager` 都拿不到真实系统语言，只有 `expo-localization` 能正确识别（曾是「跟随系统」失效的根因）。
  - **新增依赖**：`expo-localization@~58.0.5`（`package.json` + `package-lock.json`），`app.json` 的 `plugins` 追加 `expo-localization`。
- **`src/i18n.en.ts`**：442 条中文原文 → 英文词典，key 与源码里的 `t()/tf()` 一一对应（曾用脚本校验无缺失/多余）。新增界面文案时**必须同时补词典**，否则英文下会显示中文。
- **改造方式**：一次性 codemod 把 613 处文案包成 `t()` / `tf()`（脚本已删除），随后手工收尾：
  - `src/api/client.ts`：英文模式下 `localizeMessage()` 直接返回服务端原文（不再走 `MESSAGE_MAP` 英译中），内部错误文案（网络失败、超时、401/403/429/5xx、请求失败、流式格式异常等）用 `t()`。
  - **模块级常量会冻结语言**：`appTabs()`（`LiquidTabBar`）、`buildChatTools()` / `suggestions`（`ChatWorkspace`）、`buildConfigs()` + `hero` + `voicePresets`（`MediaStudioScreen`）、`filters` / `kindLabel` / `stateMeta` / `categoryMeta`（`MessagesScreen`、`TasksScreen`、`UsageLogsScreen`、`ModelMarketplaceScreen`、`ModelExperienceScreen`）、`statusLabel()` / `tokenStatusLabel()`（`App.tsx`）、`appearanceOptions` / `languageOptions`（`PersonalScreen`）全部改成函数或在组件内求值。
  - `src/services/liveConsole.ts`：`VENDOR_MAP` 保留中文 key，`vendorOf()` 返回时才 `t(hit[1])`。
  - `src/services/useConsoleData.ts`：订阅 `useLanguage()` 并加入 effect 依赖，语言切换后重新取数——映射层会把「按次计费」「令牌 #1」等中文标签写进数据。
- **英文格式**：`formatCompact` 英文走 K/M/B（不再出现「万/亿」）；`formatRelative` 与 `ChatWorkspace.relativeTime` 英文区分单复数（`1 hour ago` / `n hours ago`，不再有 `1 days ago`）；`messageTime.ts` 英文用 `Yesterday {0}` 与 `toLocaleDateString('en-US', …)`。
- **双端验证**：
  - iOS 逐页核对 Personal Settings（含语言分组）、Chat、Overview、Models、Tokens（新建弹层 / 分组选择页 / 模型限制页）、Model Playground、Model Fusion、Model Hub、AI Studio（Image/Music/Voice）、Usage logs、Tasks、Messages、Wallet；`zh-Hans-AU` 系统下「跟随系统」解析为中文。
  - 安卓（系统 `en-US`）核对个人设置、Chat、Overview；「跟随系统」保持英文；强杀 Expo Go 后语言与登录态均保留。
  - 双端最后都切回「简体中文 + 浅色」。
- 源码里仍有中文但**不需要翻译**：`client.ts` 的 `MESSAGE_MAP` 中文值（仅中文模式使用）、`ModelLogo.tsx` 的「豆包/文心/海螺」匹配词、`messageTime.ts` 的 `'日一二三四五六'`、`PersonalScreen` 的 `'简体中文'`（语言名本身）、`liveConsole` 的 `VENDOR_MAP` 中文 key、`MediaStudioScreen` 参数对象的中文键（`尺寸`/`数量`/`音色` 等内部字段）。
- `npx tsc --noEmit --noUnusedLocals` 通过。改动未提交、未推送；HEAD 仍为 `9ff4dc7`。

## 钱包邀请码显示修正 + 接口确认（2026-11-13 新增）

- **问题**：钱包「邀请奖励」卡里，邀请码塞在一个 `marginHorizontal: 16` 的灰色圆角框内，而 `Group` 会给每个子节点自动插入 `separator`（只左缩进 16、右到卡片边缘）。结果分隔线从灰框左边起、一路伸到卡片右缘，看起来像灰框底边溢出/卡片被切；同时灰框样式接近输入框，和整页 `Row` 语言不一致。
- **改法**：去掉灰框，邀请码改成标准 `Row`：左侧「邀请码」，右侧等宽字体（iOS `Menlo` / 安卓 `monospace`）+ 复制图标，整行可点复制；分隔线回到行与行之间，与「额度说明」一致。新增 `Row` 的可选 `accessibilityLabel`，该行读作「复制邀请码」。
  - 等宽字体顺带解决 `l`/`I` 混淆：实际邀请码是 4 位随机串（如 `lWEa`），非等宽字体下首字符看起来像大写 `I`。
  - 复制邀请码弹「已复制邀请码」，复制链接仍是「已复制邀请链接」；英文下新增两条词典 `复制邀请码` / `已复制邀请码`。
- **真实接口确认**（对照 new-api 后端源码）：
  - 「待使用收益 / 总收益 / 邀请人数」与邀请码都来自 `GET /api/user/self` 的 `aff_quota` / `aff_history_quota` / `aff_count` / `aff_code`（`controller/user.go` 的 `buildSelfUserData`），不是本地假数据。
  - `aff_code` 为空时网页端会调 `GET /api/user/aff`（`GetAffCode`，首次访问生成 4 位码）。App 之前只读 `/api/user/self`，空码会一直显示「—」；本轮接上已有但一直没用的 `fetchAffCode()`，缺失时补拉一次（失败静默，不影响其它内容）。
  - 「复制邀请链接」是客户端拼的 `https://test.qmszai.cn/register?aff=<code>`，与网页端邀请链接同一路由（注册页读取 `aff` 参数），没有额外的邀请链接接口。
  - 未包含网页端的「邀请额度转入余额」（`POST /api/user/aff_transfer`）：目前钱包只做展示与复制，属于后续可选功能。
- **顺带修的英文挤压**：「余额来源」的英文值过长（`Check-in, redemption codes, invite rewards`）会把标题挤成 `Balance...`，改为 `Check-in, codes, invites`。
- **验证**：双端（简体中文 + 浅色）钱包页分隔线与行样式正常；点「邀请码」行弹出「已复制邀请码」、点「复制邀请链接」弹出「已复制邀请链接」；切英文后 `Invite code` / `Copy invite link` / `Balance sources` 均不截断，随后双端切回简体中文。`npx tsc --noEmit --noUnusedLocals` 通过；词典 444 条与源码 key 一一对应。

## 消息入口移到账户中心右上角（2026-11-13 新增）

- **改法**：消息不再是概览页的一行/一项，改成账户中心主 header 右上角的圆形玻璃图标按钮（`GlassIconButton`，`size={36}`，图标 `bell`，accessibilityLabel「消息」）。只在 `activeTab === 'account'` 时渲染，点按 `setSubpage('messages')`。
  - iOS 用液态玻璃 `GlassView`（与个人设置的「返回」胶囊同款材质），安卓走 `GlassSurface` 的 `m3.surfaceContainer` 浅灰圆底（无阴影）。
  - 未读数来自 `messages.filter(m => !m.read).length`，> 0 时在按钮右上角叠一个 18pt 红色徽标（`minWidth: 18`、圆角 9、白字 11pt 粗体，超过 99 显示 `99+`）。
  - 按钮包在 `Animated.View`（复用 `titleStyle`）里，切 tab 时和标题一起淡入上移；`marginBottom` 让 36pt 按钮与 30pt 标题视觉居中而不是贴底。
- **概览页清理**：iOS 的 `QuickAction`「消息」和安卓的 `Row`「消息」都删掉，`Overview` 的 `onOpenMessages` 参数一并移除；分组标题「用量与消息」改为「用量与任务」（英文 `Usage & tasks`），现在只剩「用量日志」「任务」。
- **顺带修的空态文案**：消息页空态原来不管筛哪个 tab 都写「没有未读消息」，在「全部」下不成立；改为「全部」→「暂无消息」、「未读」→「没有未读消息」（新增词典 `暂无消息` / `No messages`）。
- **验证**：双端账户中心右上角出现铃铛按钮，点按进入消息页；概览页「用量与任务」只剩两项；临时注入一条未读消息确认徽标位置正确（iOS 叠在按钮右上、不越出 header，安卓同理），验完已还原。夜/浅色双端各看一遍（深色下是深灰玻璃 + 蓝色铃铛），最后都回到「简体中文 + 浅色」。iOS 上 Expo Go 的齿轮在铃铛下方（按钮 y≈78–115pt，齿轮 y≈122 起），不遮挡。`npx tsc --noEmit --noUnusedLocals` 通过，词典 444 条与源码 key 仍一一对应。

## 自定义头像：本地存储 + 预留远端同步（2026-11-13 新增）

- **后端确认没有头像接口**（对照 new-api 主干源码，并探测线上路由）：
  - `model/user.go` 的 `User` 结构只有 `username` / `display_name` / `email` / `phone` / `quota` / `aff_code` 等字段，没有 avatar 列。
  - `router/api-router.go` 的 `/api/user` 自助路由（`self`、`aff`、`checkin`、`setting`、`2fa`、`passkey`、`access_tokens`、`sessions`…）里没有头像或上传路由；唯一的 Upload 是管理员的 `taskPluginRoute`（上传任务插件）。
  - `controller/user.go` 的 `UpdateSelf` 写库前只保留 `id` / `username` / `password` / `display_name`，客户端多传 `avatar` 会被丢掉。
  - 线上 `https://test.qmszai.cn/api/avatar`、`/api/upload` 都是 404。
  - 因此本轮只做本机头像；若以后线上打了自定义补丁，需要先跟后端确认再打开同步。
- **存储（`src/avatar.ts`）**：
  - AsyncStorage key `qmszai.avatar`，值是按用户 ID 索引的 `Record<userId, fileUri>`；图片文件拷到 `Paths.document/avatars/<userId>-<timestamp>.jpg`（`expo-file-system` 新 API：`Directory` / `File` / `copySync`）。
  - `initAvatars()` 启动时 rehydrate，**文件已被系统清掉时自动剔除该条**（避免破图）；`saveAvatar` 先写新文件再删旧文件，`removeAvatar` 删记录 + 删文件。
  - `useAvatar(userId)` 用 `useSyncExternalStore` 订阅，换/删头像后所有使用处立即刷新（账户中心 header 与个人设置共用同一份状态）。
  - 文件头注释写明接远端时要动的两处：`GET /api/user/self` 返回 avatar 时在 `useAvatar` 兜底、`saveAvatar` 之后回传服务端；本机存储结构与 UI 不用改。
- **交互**（避开安卓三按钮 Alert 把长文案挤成一行）：
  - 个人设置页头像可点（右下角相机角标，`accessibilityLabel="更换头像"`），**直接打开相册**，不再弹选项框。选图参数 `mediaTypes: ['images']`、`allowsEditing: true`、`aspect: [1,1]`、`quality: 0.8`；不申请相册权限（iOS PHPicker / 安卓系统选择器都不需要）。
  - 有头像时「账号」分组末尾多一行红色「移除头像」，点它弹两项确认「取消 / 移除」（`destructive`）。
  - iOS 上「Alert 里立刻 present 相册会被系统丢弃」是历史踩过的坑；现在是点头像直接开相册，天然规避，不需要再延时。
- **组件**：新增 `src/components/UserAvatar.tsx`（有图显示图片，无图回退昵称首字母；尺寸与圆角由 `size` 决定，`overflow: 'hidden'` 保证圆形裁切）；`App.tsx` 的 `AccountView` 与 `src/screens/PersonalScreen.tsx` 都改用它。`AppIcon` 新增 `camera → camera-outline`。
- **依赖**：新增 `expo-image-picker ~58.0.10`；`app.json` 的 `plugins` 加 `["expo-image-picker", { "photosPermission": "允许访问相册，用于设置头像。" }]`。
- **词典**：新增 `更换头像` / `移除头像` / `移除头像？` / `移除` / `无法打开相册`（英文 `Change photo` / `Remove photo` / `Remove photo?` / `Remove` / `Cannot open photo library`），共 449 条，与源码 `t()` / `tf()` key 一一对应。
- **验证**：双端各走一遍「选图 → 裁剪 → 头像出现（账户中心同步）→ 模块重载后仍在（`src/avatar.ts` 重新求值仍能 rehydrate）→ 移除 → 回退首字母 → 账户中心同步」；英文下按钮与确认框文案正常；最后双端都回到「简体中文 + 浅色」。`npx tsc --noEmit --noUnusedLocals` 通过，`git diff --check` 干净。改动未提交、未推送。

## 令牌跨端同步确认 + 进入令牌页自动刷新（2026-11-13 新增）

- **结论**：令牌列表本来就走真实接口，不存在「本地令牌」或单向同步。App 启动时 `useConsoleData.refresh()` 调 `GET /api/token/?p=1&page_size=100`；网页端和 App 读写的是同一张 `tokens` 表。同一账号 + 同一环境（`https://test.qmszai.cn`）下，任一端新建/删除，另一端都能看到。
- **本次排查**：App 当前登录账号是 `989294`（用户名 `kira`，用户 ID 124）。用该账号的 access token 直查线上接口，返回 `{"page":1,"page_size":100,"total":0,"items":[]}`，说明这个账号本身没有令牌；截图上「暂无令牌」是真实数据，不是同步失败。网页端看到的 3 个令牌应属于另一个账号或另一个环境，需要核对网页登录账号与环境。
- **补的改动（`App.tsx`）**：令牌页每次切进来都调用一次 `consoleData.refreshTokens()`（和日志/任务子页进入即刷新的策略一致），网页端新建/删除的令牌不用重启 App 就能同步；新建、删除令牌后的原有显式刷新保持不变。
- **验证**：用同一账号的 access token 从网页侧创建一个临时令牌（#60 `sync-check`），切到 App 令牌页能立即显示；再删除后切走再切回，列表恢复「暂无令牌」。临时令牌已删除，接口 `total` 回到 0。`npx tsc --noEmit --noUnusedLocals` 通过，`git diff --check` 干净。改动未提交、未推送。

## 令牌密钥复制（2026-11-13 新增）

- **背景**：列表接口返回的 `key` 是服务端掩码（`buildMaskedTokenResponse` → `MaskTokenKey`），网页端也是单独取完整密钥，所以 App 之前只能创建/编辑/删除，无法拿到可用密钥。
- **接口**：新增 `fetchTokenKey(id)`（`src/api/endpoints.ts`），`POST /api/token/{id}/key`，返回 `{ key }`；这是 new-api 现行路由（`router/api-router.go` 的 `tokenRoute.POST("/:id/key", …)`），GET 同路径会 404。
- **交互**：令牌详情弹层在「最后使用」下面新增「复制密钥」行，右侧显示 `sk-••••••••` 和复制图标；点按后取完整密钥，补上 `sk-` 前缀写入剪贴板，并弹「已复制密钥」。失败时弹「复制失败」+ 服务端消息。密钥不落在界面和日志里，只进剪贴板。
- **词典**：新增 `复制密钥` / `复制失败` / `已复制密钥` / `无法读取密钥`，共 453 条，与源码 `t()` / `tf()` key 一一对应。
- **验证**：iOS 打开 `Mobile client`（#61）→「复制密钥」→ 用 `xcrun simctl pbpaste` 核对剪贴板为 51 字符（`sk-` + 48 位密钥）；`npx tsc --noEmit --noUnusedLocals` 通过，`git diff --check` 干净。改动未提交、未推送。

## AI 创作进度条 + 模型列表图标（2026-11-13 新增）

- **进度条（`src/screens/MediaStudioScreen.tsx`）**：
  - 新增 `GenerationProgress`：4pt 圆角轨道 + 蓝色填充；同步图片/语音拿不到真实百分比时，用 30 秒 easeOut 缓慢走到 90% 的不确定进度；视频/音乐任务返回 `progress` 后切换为精确百分比（0–100，旁边显示数字）。
  - `MediaGeneration` 新增 `progress?: number`（`src/types.ts`）。`waitForTask` 不再把百分比拼进 `summary`，改为 `updateRecord(recordId, { progress })`，成功/失败后记录状态变化、进度条自然消失。
  - 展示位置：生成记录的「生成中」卡片内（标题/元信息下方、摘要上方），以及生成详情弹层标题下方；只在 `status === 'running'` 时渲染。
- **模型列表图标**：AI 创作的模型选择 Sheet 中，`picker.key === t('模型')` 时给每行加 `leading={<ModelLogo name={option} size={24} />}`，与聊天/模型融合/模型体验的选择器一致；参数选择（尺寸、数量等）不加图标。
- **验证**：iOS 用临时伪造的 `running` 记录目测进度条（填充、圆角、间距正常），随后删除伪造数据并重新进入页面确认列表为空；模型 Sheet 截图确认 `image-01`、`qwen-*`、`doubao-*` 等行图标正常。`npx tsc --noEmit --noUnusedLocals` 通过，`git diff --check` 干净。改动未提交、未推送。

## AI 创作结果应用内预览 + 下载（2026-11-13 新增）

- **预览**：生成详情弹层在标题/进度下方新增 `GeneratedPreview`。图片用 RN `Image`（1:1 容器、`contain`、12/16pt 圆角、浅色占位底），视频用 `expo-video` 的 `useVideoPlayer` + `VideoView`（`nativeControls`、`contentFit="contain"`、`fullscreenOptions.enable`，16:9 容器）；语音/音乐不渲染预览，保留「播放语音/播放音乐」。
- **下载**：详情弹层底部新增固定「下载」按钮（`Sheet` 的 `footer`，不随内容滚动），解决了预览较高时下载入口落到屏幕外的问题；操作组保留「播放（仅音频）+ 复制链接（仅 `http(s)`）」，「打开结果」与 `Linking` 已移除。`localMediaFile()` 先把远端结果 `File.downloadFileAsync()` 到 `Paths.cache`（文件名 `qmszai-<recordId>-<timestamp>.<ext>`），`file://` 结果（语音、music-3 base64）直接 `new File(uri)`。
  - 图片/视频：`MediaLibrary.requestPermissionsAsync(true, ['photo'|'video'])` → `MediaLibrary.Asset.create(file.uri)`，成功弹「已保存到相册」；注意 SDK 58 里根导入的 `saveToLibraryAsync` 已废弃且会运行时抛错，必须用新 `Asset.create`。
  - 音频或相册权限被拒：回退 `Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle })`，iOS 可存到「文件」或用作铃声。
  - 下载中 `downloading` 状态把底部按钮文案改为「下载中…」并禁用，避免重复提交。
- **依赖与配置**：`package.json` 新增 `expo-video ~58.0.14`、`expo-media-library ~58.0.14`、`expo-sharing ~58.0.23`（`expo install` 同时补上此前漏声明的 `expo-image-picker ~58.0.10`）。`app.json` 增加 `expo-media-library` 插件：`photosPermission`、`savePhotosPermission`、`granularPermissions: ['photo','video']`，并保留 `expo-video`/`expo-sharing` 插件项。
- **词典**：新增 `生成结果`、`结果还没有生成`、`下载`、`下载中…`、`下载失败`、`已保存到相册`、`保存或分享`、`没有相册权限`、`当前设备不支持保存`。
- **验证**：iOS（Expo Go 58.0.4）用临时伪造的三条已完成记录（本地 HTTP 提供 PNG/MP4/MP3）确认：图片预览、视频首帧与原生播放控件、音频无预览且保留播放行、底部按钮切换「下载中…」、相册写权限弹窗、图片保存为 `IMG_0007.PNG`、视频保存为 `IMG_0008.MP4`、音频打开系统分享面板（「保存到文件」「用作铃声」）。**复测**：用真实生成的 `iPhone` 图片确认固定底部按钮直接可见，点按后提示「已保存到相册」，再存为 `IMG_0009.PNG`。测试记录与本地服务已清理，页面恢复空态。**注意**：用 Python `http.server` 测本地 MP4 时它不支持 `Range`，`expo-video` 会黑屏；换成支持 206 的静态服务即可，真实 CDN 不受影响。
- **未验证**：安卓模拟器本轮未运行，相册权限/保存与视频控件尚未做安卓回归；`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。改动未提交、未推送。

## AI 创作记录持久化 + 后台任务恢复（2026-11-13 新增）

- **问题**：生成记录原先放在 `MediaStudioScreen` 的 `useState` 里，任务轮询也绑在组件生命周期上。离开页面（组件卸载）后记录消失，图片/视频还在生成也无从查看；杀 App 重启同样丢失。
- **本机记录 `src/mediaGenerations.ts`**：仿 `src/avatar.ts` 的模块级 store + `AsyncStorage`（key `qmszai.media.generations`，上限 60 条），`useSyncExternalStore` 订阅；导出 `initMediaGenerations` / `bindMediaGenerationAccount` / `addMediaGeneration` / `updateMediaGeneration` / `useMediaGenerations`。写入串行化，避免进度高频更新时旧快照后落盘。账号隔离用 `qmszai.media.generations.account` 记录 userId，换账号登录时清空记录，同一账号重进不清。
- **后台轮询 `src/services/mediaTasks.ts`**：`waitForMediaTask(recordId, taskId, mode)` 把原来的 4s × 75 次轮询移出组件，支持 `video` / `music` / `music3` / `audio`；同一记录按 `recordId` 去重；成功/失败/超时都直接写 store。单次查询异常（断网、瞬时 5xx）跳过继续轮询；5 分钟超时落「任务超时，请稍后在任务页查看结果」。`resumePendingMediaTasks()` 扫描 store 中 `running` 且有 `taskId` 的记录重新接上轮询。
- **类型（`src/types.ts`）**：`MediaGeneration` 新增 `taskId?`、`taskMode?: MediaTaskMode`、`interrupted?`；新增 `MediaTaskMode = 'video' | 'music' | 'music3' | 'audio'`。
- **提交（`MediaStudioScreen.tsx`）**：先 `await addMediaGeneration(record)` 再发请求；视频/音乐拿到任务号后先写 `{ taskId, taskMode }` 再 `await waitForMediaTask(...)`，因此页面已卸载也能继续更新；`createdAt` 改存 ISO 时间，列表/详情用 `timeLabel()` 当天显示 `HH:mm`、跨天补 `M/D`；记录 id 改为 `gen-<base36 时间戳>-<序号>`，避免组件重挂后 id 冲突。
- **记录范围**：生成记录不再按当前「图片/视频/音乐/语音」过滤（原「本次生成记录」改为「生成记录」），不同类别的历史混排展示，每行都带类型标签；切 tab 或重进页面不会看不到别的类别。
- **中断语义**：hydrate 时仍为 `running` 但没有 `taskId` 的记录（图片/语音同步请求随进程结束）标记 `status: 'failed'` + `interrupted: true`，界面显示「生成已中断」，不再永久卡在「生成中」。
- **启动恢复（`App.tsx`）**：登录后 `initMediaGenerations → bindMediaGenerationAccount(user.id) → resumePendingMediaTasks()`；同时监听 `AppState` 回前台再扫一次，防止后台挂起定时器后任务停住。
- **词典**：`本次生成记录` 换成 `生成记录`（`Generations`），新增 `生成已中断`（`Generation interrupted`），共 463 条。
- **验证（iOS，Expo Go 58.0.4）**：① 图片生成中点「返回」离开，8s 后重进页面记录仍在且已「已完成」；② 杀 Expo Go 重启后记录仍在；③ 视频（`cogvideox-3`，5s/16:9/1280x720）提交后立刻杀 App，重启进入概览再进 AI 创作，记录保持「生成中」且进度从约 19% 继续涨到 78%，约 2 分钟后变「已完成」，详情页视频可播放、下载按钮正常。`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过。
- **未验证**：安卓模拟器本轮未运行；音乐任务（`music` / `music3`）未单独跑后台恢复（与视频同一条轮询路径）。本轮两条测试记录（`test persist 20261113-1546`、`test resume video 1548`）留在账号本机记录里。改动未提交、未推送。

## 令牌页新建入口改为右下角悬浮按钮（2026-11-13）

- **改动**：`TokensView` 顶部整宽的「新建令牌」按钮删除，改为右下角 56pt 圆形悬浮按钮（`styles.fab`），图标用 `AppIcon name="plus"`（iOS SF `plus` / 安卓 Ionicons `add`），`accessibilityLabel` 仍是「新建令牌」。列表外再包一层 `styles.tokensPane`（flex 1），按钮不随列表滚动；`tokensScrollContent` 额外留 `paddingBottom: 176`，最后一条不会被盖住。
- **两端差异**：iOS 用 `palette.blue` + 常规投影（`shadowOpacity 0.18`）；安卓用 `m3.primary`、无投影（符合「安卓组件不要阴影」），按压态统一 `opacity 0.82`（圆角宿主不用 `android_ripple`）。
- **位置**：`bottom: 84` 是按「悬浮导航栏顶边距内容底边 70pt（dock paddingTop 6 + bar 64）+ 14pt 间距」推出来的，改导航栏高度时要一起调。`styles.fab` 在安卓基础样式和 `makeIosStyles()` 里各写了一份（themedStyles 是整键覆盖，iOS 分支必须写全）。
- **验证**：iOS（Expo Go 58.0.4）令牌页截图确认按钮在导航栏上方、点击弹出新建令牌弹层；安卓 `qmszai_pixel`（1080×2400）同样截图确认无投影、位置与点击正常，弹层为 M3 全屏 sheet。`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过，未提交、未推送。
- **安卓登录态注意**：本次启动模拟器时安卓会话已失效（`fetchSelf` 401 触发 `clearSession`），账号 `kira` 密码未知。为做视觉验证，临时在 `src/api/client.ts` 的 `restoreSession()` 里塞了 iOS 模拟器 Cookie jar 中仍有效的 `session`（读 `host.exp.Exponent.binarycookies` 得到），验证完已 `git checkout -- src/api/client.ts` 完全还原。安卓现在仍是未登录状态，下次要在安卓上跑真实数据需要用户提供密码或重新登录。

## 令牌弹层支持点空白处返回（2026-11-13）

- **问题**：`TokenModal`（令牌详情）与 `TokenFormModal`（新建/编辑令牌）都是 `Modal transparent` + `View modalBackdrop`，背板没有点击处理，点面板上方灰色区域无反应；`TokenFormModal` 里的分组/模型选择页（`pickerMode`）也只能用左上「返回」或右上「完成」退出。
- **做法**：在两个弹层的 `modalBackdrop` 里、面板**之前**插入一个 `Pressable style={StyleSheet.absoluteFill}`（在面板下层，不影响面板内控件），点它关闭弹层。
- **分层返回**：`TokenFormModal` 的背板点击按 `pickerMode` 分流——选择页打开时只 `closePicker()` 回到表单，表单态才 `onCancel()` 关掉整个弹层，符合「一次退一层」。
- **无障碍**：背板按钮分别给了 `accessibilityLabel`：详情弹层「关闭令牌详情」、表单「取消」。
- **验证**：iOS 模拟器 ① 新建令牌表单点上方空白 → 关闭；② 点表单内输入框 → 正常聚焦、不关闭；③ 分组选择页点上方空白 → 回到表单，再点空白 → 关闭；④ 令牌详情点空白 → 关闭。安卓 `qmszai_pixel` 同样验证表单背板点击可关闭。`npx tsc --noEmit --noUnusedLocals`、`git diff --check` 通过，未提交、未推送。
- 安卓验证同样通过临时注入会话完成（`src/api/client.ts` 已 `git checkout` 还原，无 diff）。
