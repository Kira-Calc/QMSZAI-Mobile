# QMSZAI Mobile — 下一 CLI 接手

更新时间：2026-11-10。本文件是最新简明入口；详细历史见 HANDOVER.md。先核对实际文件，可能有其他 CLI 同时工作，勿覆盖其改动。

## 本轮增量（2026-11-10，第二十四轮：安卓蓝色主题 + 概览页对齐 iOS）

- `src/material.ts` 主色改正统蓝：`primary #1A73E8`、`primaryContainer #D3E3FD`、`onPrimaryContainer #041E49`、`secondaryContainer #DCE7F6`、`onSecondaryContainer #101C2B`，默认 ripple `rgba(26,115,232,0.12)`。
- `App.tsx` 概览页拆成 `ios ? 原 JSX : 新安卓 JSX`：安卓按 iOS 层级排 `Segmented`（24h/7d/30d）→ `heroCard` 白色数据卡（请求次数/成功率/8 高进度条/已使用·总额度）→ 四行统计 `Group` → 「快捷访问」「AI 功能」「用量与消息」三个 `Group`；弃用深色 hero + 2×2 tonal 磁贴。新增 `heroCard*`、`overviewGroup`、`overviewStatValue` 样式。
- 修 `iosStyles` 整键覆盖泄漏：补齐 `pill`/`pillText`/`modelVendor`/`chevron`/`tag`/`emptyTitle`/`billingGrid`/`miniStat`/`miniValue` 的 iOS 原值；模型状态徽标 iOS 走 `borderColor` 描边、安卓走 tonal 底色。
- `statusColor` 改平台三元（iOS 原值 / 安卓 `palette`）；账户头像底色改 `m3.primary`（iOS 仍 `#007AFF`）。
- 模拟任务完成时保留原耗时，不再写成「已完成」导致重复。
- 验证：typecheck、双端 `expo export` 通过；安卓 16 张截图重拍覆盖 `~/Desktop/qmszai-android/`；iOS 概览/模型目录/令牌/模型详情 pageSheet 无回归。
- 同日补充：iOS 卡片圆角回归。`cardSurface` 的 iOS 分支改为 `{ borderRadius: 12, borderCurve: 'continuous' }`（安卓仍 28 + elevation），并把 10 个子页被 M3 改掉的 iOS 圆角/高度/内边距/字号用 `ios ? 原值 : M3 值` 恢复；原先 10pt 的小卡片单独回 10。注意 `borderRadius: undefined` 会覆盖展开值，安卓需显式写 28。iOS 逐页截图与安卓模型体验/AI 创作复核通过。
- 同日补充二：安卓按压态方块。`android_ripple` 的蒙版恒为矩形（RN `getMask` 只给 `ColorDrawable`），圆角宿主上必然画方块，`overflow:'hidden'` 也裁不到自身背景。已新增 `pressedSurface`（白面 `m3.surfaceContainer`）/`pressedDim`（彩色面 `opacity 0.8`），圆角面（底栏项、各主按钮、chip、建议卡、签到/退出、兑换、复制邀请、底部「完成」、账户头卡、模型行）改用 `Pressable` 的 `pressed` 状态；矩形行仍用 ripple，由 `groupBody` 的圆角裁剪兜住。验证：按住底栏/令牌按钮为圆角胶囊，iOS 截图无变化。
- 同日补充三：新增 GitHub 展示用中文 `README.md`，以及 `docs/screenshots/` 8 张双端截图（宽 700）。iOS 用 `--no-dev --minify`（8095）关掉开发浮层，移动 `DevMenuFAB` 后两次截图按差异区合成；安卓在 Dev Menu 关闭 Tools button 后直拍。现已还原 `App.tsx` 初始态、关闭 8095 Metro、还原 FAB 位置。
- 未提交、未推送。

## 上一轮增量（2026-11-10，第二十三轮：安卓 Material 3 重做）

- 删除账户页「关于演示模式」提示块（`App.tsx` 与 `baseStyles`/`iosStyles` 的 notice* 样式一并清理）。
- 新增 `src/material.ts`：M3 色板 `m3`（surface 层级、primary/primaryContainer、error/success/warning 容器）、`shape`（4/8/12/16/28/full）、`type`（M3 字阶）、`elevation`（level1/2）、`ripple()`，以及平台感知的 `cardSurface` / `softShadow`（iOS 返回空对象，安卓给 28/16 圆角 + 1 级海拔）。
- `ui.tsx` 安卓分支接入 `m3`：`palette` 安卓值改由 `m3` 提供；分段控件改胶囊 + 选中态白底微阴影；Group 28 圆角无描边 + elevation；Row 56 高、标题 500 字重；Badge 改 M3 tonal chip（无描边、12% 同色底）；EmptyState/Sheet/GlassPillButton 尺寸对齐 M3；行与分段加 `android_ripple`。
- `LiquidTabBar` 安卓改 M3 底栏：`primaryContainer` 胶囊选中指示器、primary 图标与文字、surfaceContainerLowest 底 + elevation，scrim 颜色改用 `palette.groupedBackground`。
- `App.tsx`（`baseStyles` 只作用于安卓）：标题 30/600、eyebrow 12/500 + 0.4 字距、区间切换改胶囊分段、状态块改 tonal 色块（16 圆角无描边）、快捷访问与卡片 28 圆角 + 极淡阴影、搜索框改 52 高胶囊并加左侧搜索图标、状态徽标改 tonal chip、主按钮改 M3 filled 胶囊、次按钮改 outlined、进度条用 `m3.primary`。
- `ChatWorkspace.tsx`：工具栏/气泡/建议卡/历史列表/输入条按 M3 调整（气泡 16 圆角、输入条 52 高胶囊、发送按钮 42 圆形），并把硬编码的 iOS 蓝/灰改成 `palette`；iOS 分支保留原值。
- `src/screens/*.tsx` 10 个子页：卡片换 `cardSurface`/`softShadow`，按钮改胶囊（52 高），抽屉/输入框/标签圆角对齐 M3，行高与内边距加大，列表行与主要按钮加 ripple；`Subpage` 安卓改 M3 top app bar（圆形返回键 + 22sp 左对齐标题），Sheet 头部「完成」改文字按钮。
- 清理：移除「价格与分组为演示数据」「进度为演示数据…」等演示说明小字，删除无引用的 notice*/settingsList/scoreText/quickIcon 样式。

验证：`npm run typecheck` 通过；iOS/Android `expo export` 通过；安卓 16 模拟器逐页截图（聊天、概览、模型、令牌、账户、对话历史、AI 创作、模型广场、个人设置、任务、消息、用量日志、钱包、模型体验、人脸工具、模型融合）；iOS 27 截图复核聊天/概览/账户/个人设置无回归。截图在 `~/Desktop/qmszai-android/`。

新增待办：iOS 端部分按钮因共用样式也变成胶囊（签到、兑换、发送等），符合 iOS 26 观感；若要严格回退，可用 `ios ? 原值 : 新值` 拆分。

## 上一轮增量（2026-11-10，第二十二轮：安卓实机验证 + 跨平台图标）

- 本机装好安卓环境：JDK 17（华为云镜像）+ SDK（cmdline-tools/emulator/platform-36/系统镜像）+ AVD `qmszai_pixel`（Pixel 7, Android 16）。Expo Go 58.0.5 经 gh-proxy 下载安装，`adb reverse tcp:8091` 连 Metro。
- 新增 `src/components/AppIcon.tsx`：iOS 用 `SymbolView`、Android 用 Ionicons，修掉安卓端所有 Unicode 占位图标（底栏、行图标、空状态、快捷访问等）。新增依赖 `@expo/vector-icons`。
- 修安卓子页顶部色带：`subpageOverlay`/`subpagePane`/`ChatWorkspace.sheetRoot` 改用 `palette.groupedBackground`。
- 修安卓 Modal 顶部灰条：`pageSheet` 改为 iOS 用 pageSheet、安卓用 `fullScreen`，并加 `statusBarTranslucent`。
- 验证：typecheck、双端 export、安卓逐页截图、iOS 回归对比。

## 上一轮增量（2026-11-10，第二十一轮：玻璃层兜底）

- 修复「历史」胶囊偶发丢失白色底：`GlassSurface` 的 `GlassView` 加 0.5 白色背景，`LiquidTabBar.barGlass` 加 0.42 白色背景，作为玻璃材质未渲染时的兜底，视觉不变。
- 验证：typecheck、双端 export、iOS 截图对比工具栏与底栏。

## 上一轮增量（2026-11-10，第二十轮：指示条改为落在屏幕边距）

- 模型目录页 `splitContent` 去掉横向 padding，搜索框包 `modelsSearchWrap`，列表内容自带 `paddingHorizontal: 20`，`ScrollView` 变为横向满幅，系统指示条不再压住右侧徽标。
- 其余页面原本就是满幅滚动，无改动。
- 验证：typecheck、双端 export、iOS 截图（临时自动滚动）确认指示条位置。

## 上一轮增量（2026-11-10，第十九轮：恢复系统滚动指示器）

- 删除全部 `showsVerticalScrollIndicator={false}`（17 处），纵向滚动页面/Sheet 使用平台原生滚动条（iOS 系统指示条、Android 系统滚动条）。
- 例外：聊天「+」玻璃浮层内列表保持无指示条（菜单形态）。
- 验证：typecheck、双端 export、iOS 截图（临时 flashScrollIndicators）确认指示条正常。

## 上一轮增量（2026-11-10，第十八轮：子页满幅 + 系统圆角）

- 删除 `Subpage` 的 `bottomFade`/渐变层，子页 `SafeAreaView` 去掉 `bottom` 边，内容铺满到屏幕底边、由设备圆角裁切。
- 8 个滚动子页用 `useSafeAreaInsets()` 追加 `paddingBottom: 24 + insets.bottom`；AI 创作底栏与模型体验输入条补安全区内边距。
- 验证：typecheck、双端 export、iOS 截图核对模型广场/消息/钱包/AI 创作/模型体验。

## 上一轮增量（2026-11-10，第十七轮：子页底部边缘渐隐，已被第十八轮取代）

- `Subpage` 增加 `bottomFade` 与 `subpageBody`/`subpageFade`，底部 28pt 渐变淡出，修复子页内容被安全区硬切出「切角」。
- AI 创作、模型体验设为 `bottomFade={false}`（底部有固定栏）。
- 验证：typecheck、双端 export、iOS 截图核对模型广场/钱包/消息/AI 创作。

## 上一轮增量（2026-11-10，第十六轮：账户页去掉 AI 功能板块）

- 账户中心移除「AI 功能」分组，`AccountView` 删掉对应的 5 个跳转 props。
- AI 入口保留在概览页区块与聊天「+」菜单。
- 验证：typecheck、双端 export、iOS 截图。

## 上一轮增量（2026-11-10，第十五轮：清理说明性小字）

- 删除各页说明性小字：聊天欢迎语与输入条 disclaimer、概览卡片 summary、AI 创作/人脸工具/模型融合的标题下说明段、模型体验空状态与底部 disclaimer、模型广场页脚。
- 移除 8 处 Group `footer`（融合 2、体验 1、个人设置 3、用量日志 1、钱包 1）；AI 创作 footer 只保留模型与预计消耗。
- 钱包奖励说明删除划转限制段落。
- 验证：typecheck、双端 export、iOS 截图核对 9 个页面。

## 上一轮增量（2026-11-10，第十四轮：模型广场扩充 + 图标）

- `marketModels` 8 → 39 个真实模型，12 家厂商，覆盖对话/免费/图像/视频。
- `ModelLogo` 新增 xAI、ByteDance、Baidu、MiniMax 官方矢量 logo。
- 模型广场列表加厂商 logo（26pt），详情 sheet 加 logo（34pt）；分组徽标中文化（对话/图像/视频/免费）。
- 图像/视频行不再显示「上下文 —」；详情 sheet 分组 `default` 显示为「默认」。
- 验证：typecheck、双端 export、iOS 截图核对全部新 logo 与分组。

## 上一轮增量（2026-11-10，第十三轮：补齐界面切换动画）

- 主标签切换加 `opacity` + `translateY` 淡入（内容 240ms、标题 280ms）。
- 子页右侧推入/推出（320ms / 260ms），主界面 `-30%` 视差 + 8% 暗化层；子页改覆盖层渲染，保留主界面状态。
- 聊天会话切换消息区淡入（220ms）。
- `ui.tsx` 增加 `animateContentChange()`，接入 6 处筛选段控件与概览时间范围；Android 开启 LayoutAnimation 实验开关。
- 模拟日志/消息中的模型名与新模型目录对齐。
- 验证：typecheck、双端 export、`simctl recordVideo` 抽帧确认动画实际生效。

## 上一轮增量（2026-11-10，第十二轮：扩充真实模型目录）

- `models` 由 4 个扩到 20 个真实模型，覆盖 OpenAI、Anthropic、Google、Alibaba、DeepSeek、Meta、Mistral AI、Moonshot AI。
- `ModelLogo` 增加 DeepSeek / Meta / Mistral / Kimi 官方矢量路径与品牌识别，纯图标无底色。
- 概览「可用模型」改为按模型状态动态计算（当前 18/20）。
- `ChatPopover` 支持 `scrollable`，聊天模型浮层 20 项在玻璃卡片内滚动；定位优先下方展开并限高，避免压状态栏。
- 菜单背板透明度 0.9 → 0.95。
- 修复底部内容在悬浮导航栏下方被硬裁出白边（「被切掉一块」）：`LiquidTabBar` 新增底部滚动边缘渐隐（`react-native-svg` 线性渐变，安全区实底、向上过渡透明），并拆成 `dockRoot` + `dock` 两层让渐隐铺满物理底边。
- 验证：typecheck、iOS/Android export 通过；截图核对新 logo、可滚动模型浮层、概览计数、令牌页与聊天页底部渐隐。

## 上一轮增量（2026-11-10，第十一轮：右上角玻璃按钮与导航栏对齐）

- 新增 `SheetHeader`：56pt 高、左右 16pt、标题绝对居中（left/right 96）、右侧玻璃「完成」胶囊；替换 `ui.tsx` 的 `Sheet`、聊天历史与 Android 模型选择的旧纯文字「完成」，App 模型详情 sheet 改用 `SheetHeader`（标题「模型详情」）。
- `Subpage` 导航栏 52pt 高、paddingHorizontal 16、标题 left/right 96；右上动作统一 `GlassPillButton`：消息「全部已读」、人脸「重置」、模型体验「清空」、模型融合「新建」。
- 删除模型融合助手选择 sheet 中多余的底部「完成」。
- 还原 `App.tsx` 临时调试崩溃：`selectedModel` 初始值回到 `null`。
- 验证：typecheck、iOS/Android export 通过；截图核对模型详情 sheet、消息页、模型体验页导航栏。

## 上一轮增量（2026-11-10，第十轮：聊天输入框集成 AI 功能）

- 聊天输入条左侧加 48pt 玻璃「+」按钮，点击从按钮上方弹出锚定玻璃菜单：AI 创作、模型体验、人脸工具、模型融合、模型广场；选中后经 `onOpenTool` 跳到对应子页。
- 抽出 `ChatPopover` 复用组件（透明 Modal、玻璃卡片、弹簧、上下自动翻转、点空白关闭），模型切换浮层同步改用它。
- `App.tsx` 子页改为覆盖层渲染，主界面保持挂载，从聊天打开工具再返回不会丢会话与草稿。
- 修复弹出菜单偶发「背景消失」：透明 Modal 内玻璃材质可能不渲染，`ChatPopover` 内增加 `rgba(255,255,255,0.9)` 背板兜底，模型浮层同样生效。
- 验证：typecheck、iOS/Android export 通过；截图核对 + 按钮、工具菜单、模型浮层与子页覆盖层。

## 上一轮增量（2026-11-10，第九轮：去掉列表说明小字）

- 概览 `QuickAction` 删除 `detail` 副标题（快捷访问/AI 功能/用量与消息），iOS 行高 52；账户中心「AI 功能」「个人设置」「钱包」条目删除 `Row` 的 `subtitle`。
- 清理不再使用的概览 props 与计算；令牌用量、模型厂商、消息预览等数据性副标题保留。
- 验证：`npm run typecheck`、iOS/Android `expo export` 通过；截图核对概览与账户中心。

## 上一轮增量（2026-11-09，第八轮：iOS 圆角与账户中心）

- 按用户反馈统一 iOS 圆角：卡片 12pt + `borderCurve: 'continuous'`、去描边；`src/ui.tsx` 的 `groupBody` 同步为 12pt continuous。
- 账户中心重排：头像系统蓝居中白字、姓名 20pt/600、余额 17pt/600，资料卡补 disclosure chevron；「当前计划/账单状态/API 端点/移动端模式」改用共享 `Group`+`Row`，分隔线内缩 16pt。
- 分组标题与卡片左缘对齐（`groupHeader`、`groupFooter`、`sectionTitle` 去掉 marginLeft）。
- 概览 `heroPanel`/`gridTwo`/`actionList`、令牌卡片/按钮、模型行、空态、详情面板统一 12pt continuous；令牌页改系统蓝进度条、轻字重、灰色填充次要按钮。
- 六个子页的 12/16pt 圆角补 `borderCurve: 'continuous'`。
- 聊天空态去掉浅蓝圆形底，改为纯 sparkle 图标。
- 修复模型行因 `iosStyles` 浅合并丢失 `flexDirection`、状态胶囊撑满整行的问题。
- 验证：`npm run typecheck`、iOS/Android `expo export` 通过；截图核对账户中心、概览、令牌、模型目录、个人设置、钱包与聊天首屏。

## 上一轮增量（2026-11-09，第七轮：模型 logo、锚定浮层与玻璃按钮）

- 新增 `src/components/ModelLogo.tsx`：`react-native-svg` 绘制 OpenAI / Claude / Qwen / Gemini 官方矢量 logo，Gemini 为品牌渐变；按模型名匹配。
- 聊天模型切换改为按钮锚定浮层：iOS 用 `measureInWindow` 定位 + 原生 `GlassView` 菜单卡片 + 弹簧动画，点空白关闭；每行显示纯图标 logo（无底色）、模型名、厂商和选中勾。Android 仍用 pageSheet。模型目录列表也补了 logo。
- `src/ui.tsx` 新增 `GlassSurface` / `GlassIconButton` / `GlassPillButton`，接入子页返回、聊天工具栏三个控件、令牌弹层关闭按钮；iOS 26+ 原生 `GlassView`，低版本、「减弱透明度」和 Android 回退半透明白底。
- 新增依赖 `react-native-svg@15.16.0`。
- 验证：`npm run typecheck`、iOS/Android `expo export` 通过；iOS 27 模拟器截图核对工具栏玻璃按钮、模型浮层与四行 logo、模型目录 logo、AI 创作玻璃返回按钮。浮层是原生玻璃自绘菜单，不是 UIKit `UIMenu`；点按路径未脚本化验证。

## 本轮增量（2026-11-09，第六轮：聊天页重写）

- 底栏顺序改为「聊天、概览、模型、令牌、账户」，聊天成为默认首屏。
- 重写 `src/ChatWorkspace.tsx`：顶部工具栏（历史带未读数、当前模型选择、新建对话）、消息气泡（用户蓝底/助手白卡+模型名）、建议问题、打字动画、停止按钮、圆角输入框与圆形发送按钮、键盘避让。
- 对话历史改为 pageSheet：最近对话列表、新建、删除确认、选中标记、消息数/模型/相对时间；模型选择 pageSheet 列出 4 个模型，切换只影响当前对话的模拟回复。
- 空态提供最近对话入口；消息列表底部对齐，少量消息时贴近输入条。全部仍为本地模拟数据，不持久化、不调用真实接口。
- 验证：`npm run typecheck` 通过；iOS/Android `expo export` 通过；iOS 27 模拟器截图核对聊天首页、历史 pageSheet、模型选择 pageSheet、会话气泡与输入区/底栏位置。

## 本轮增量（2026-11-09，第五轮）

- 用户要求底栏使用 Apple 液体玻璃。已安装 `expo-glass-effect@58.0.5`，新增 `src/LiquidTabBar.tsx`：iOS 26+ 原生 `GlassView` 轨道、白色玻璃选中指示器、SF Symbols；指示器可左右拖动，经过标签即时切换并回弹吸附；向下滚动或向下拖动底栏收起为 60pt 圆形玻璃钮，向上滚动/拖动或轻点恢复。
- 底栏悬浮于内容之上，内容可从玻璃下穿过；四个标签页滚动内容底部预留 96pt。`App.tsx` 已接入滚动检测与 `LayoutAnimation`，聊天空出底栏高度；iOS 26 以下/Android 半透明回退，并响应「减弱透明度」设置。
- 验证：`npm run typecheck`、iOS/Android `expo export` 通过；iOS 27 模拟器截图核对白色玻璃指示器首尾定位、展开态、收起态、概览、账户与聊天页。模拟器工具无法脚本化拖动手势，手势路径待手测。

## 本轮增量（2026-11-09，第四轮续开发）

- 用 opencli 会话 `qmszai` 核实登录后的侧边栏与主要页面字段；记录已写入 `docs/FEATURE_PARITY.md`，临时页面文本未提交。
- 新增 `ModelExperienceScreen`（模型切换/建议问题/逐字回复/停止/清空）、`MediaStudioScreen`（图片/视频/音乐/语音参数与异步任务）、`FaceToolsScreen`（检测/比对）、`FusionScreen`（多模型融合）、`PersonalScreen`（签到/绑定/偏好）、`WalletScreen`（兑换码/邀请）、`ModelMarketplaceScreen`（搜索/筛选/价格详情）。
- 账户页与概览接入全部新入口；任务类型新增 `voice`；模拟数据新增 `marketModels`。
- 验证：`npm run typecheck`、iOS/Android `expo export` 通过；iOS 模拟器截图核对新页面。8091 Metro 可用；未逐项点按全部流程。
- 仍未接真实接口；`App.tsx` 还包含概览/模型/令牌/账户旧页面，深色模式、Android 视觉、订阅流水与古书法系统待做。免费用量/博客/订阅/消息已核实当前账号无权访问；古今图书按用户要求不做。

## 开始前

读取 `/Users/wenze/AGENTS.md`、`/Users/wenze/project.md` 的 Codex 接手入口和 QMSZAI Mobile 章节，再读本文件与 `docs/FEATURE_PARITY.md`。仅恢复本项目。中文交流。项目路径 `/Users/wenze/Documents/GitHub/QMSZAI-Mobile`。

## 用户已经确认的需求

- 网站 https://qmszai.cn/ 的普通用户全部功能，不包含管理员功能，暂不做支付。
- 旧界面“AI 味太重”，iOS 必须参照 Apple 系统组件及 HIG；Android 独立考虑，不能简单照搬 iOS。
- 可用 Expo Go。没有网站源码、管理权限或已确认业务认证契约，继续用模拟数据开发。
- 不是只做四五个展示页面；按实际站点功能逐项实现完整流程，不用按钮/外链/静态页面冒充完成。

## 最新实际代码

- Expo ~58.0.23、React 19.3.0、RN 0.88.1、TS ~6.0.3；新增 `react-native-svg@15.16.0`。
- App.tsx：底栏顺序为聊天、概览、模型、令牌、账户，聊天为默认页。已按 iOS 调整系统蓝、浅灰分组背景、分组列表、大标题和字体层级，移除原大黑卡、彩色指标方块、装饰环。iOS 卡片统一 12pt + `borderCurve: 'continuous'` 且不带描边；账户资料卡与四行设置列表已改为共享 `Group`/`Row`，分隔线内缩 16pt，分组标题与卡片左缘对齐。
- 原生分段控件：@react-native-segmented-control/segmented-control；图标：expo-symbols；安全区域：react-native-safe-area-context。
- 模型详情为独立 pageSheet，有完成按钮和滚动内容，默认不打开。底栏为 `src/LiquidTabBar.tsx` 自定义布局 + `expo-glass-effect` 原生玻璃材质（iOS 26+），悬浮于内容之上并可收起为圆形玻璃钮，不是 UIKit 原生 TabBar。
- **新增 src/LiquidTabBar.tsx（2026-11-09 第五轮）**：悬浮玻璃轨道、白色玻璃指示器（横向拖动切换并回弹）、SF Symbols、滚动/纵向拖动收起与展开、iOS 26 以下/Android 回退和减弱透明度适配；`expo-glass-effect` 已加入依赖。
- src/types.ts：共享类型；src/data/mockConsole.ts：模拟数据；src/services/consoleAdapter.ts：业务适配边界。
- **src/ChatWorkspace.tsx（第六轮重写，第七轮模型浮层）**：历史/模型/新建工具栏、历史 pageSheet、iOS 按钮锚定模型浮层与 Android pageSheet、消息气泡、建议问题、打字动画、停止、键盘避让；只保留内存状态，未请求真实模型，没有持久化。
- **新增 src/components/ModelLogo.tsx（第七轮）**：react-native-svg 绘制 OpenAI/Claude/Qwen/Gemini 官方矢量 logo，Gemini 渐变，聊天模型浮层与模型目录共用，纯图标无底色。
- **src/ui.tsx 玻璃组件（第七轮）**：`GlassSurface` / `GlassIconButton` / `GlassPillButton`，iOS 26+ 原生 `GlassView`，低版本与减弱透明度回退；已用于子页返回、聊天工具栏、令牌弹层关闭。
- **新增 src/ui.tsx 与三个 screen（2026-11-09 第三轮）**：日志、任务、消息页面；令牌编辑/删除；概览「用量与消息」入口。
- **新增六个 screen（2026-11-09 第四轮）**：`ModelExperienceScreen`、`MediaStudioScreen`、`FaceToolsScreen`、`PersonalScreen`、`WalletScreen`、`ModelMarketplaceScreen`；账户页与概览已接入。均为模拟数据。
- 令牌已有模拟创建/启停/详情；编辑与删除已补。
- docs/FEATURE_PARITY.md：网站公开路由与逐项完成度。管理员与支付已排除。

## 验证事实

2026-11-09 第八轮：`npm run typecheck` 通过；iOS、Android `expo export` 均通过；iOS 27 模拟器截图核对账户中心、概览、令牌、模型目录、个人设置、钱包与聊天首屏的圆角、分组对齐与布局。
2026-11-09 第五轮：`npm run typecheck` 通过；iOS、Android `expo export` 均通过；iOS 27 模拟器截图核对概览与聊天页的液体玻璃底栏、选中胶囊、收起态、安全区与输入条位置。滚动/拖动手势因模拟器无脚本点击工具未实测。
2026-11-09 第四轮：`npm run typecheck` 通过；iOS、Android `expo export` 均通过；iOS 模拟器截图核对概览、AI 功能入口、模型体验、AI 创作、人脸工具、个人设置、钱包、模型广场与账户页。
交互点击（参数 Sheet、提交生成、签到、兑换、模型切换与流式回复）尚未逐项手动操作验证，只确认了布局与静态状态。
8091 仍能提供 iOS bundle 并用于本轮验证；8090/8095 已停止。iPhone 18 Pro 模拟器装 Expo Go 58.0.4，无需降级 SDK。
项目仍不是 Git 仓库；未提交、未推送。先查端口与所属进程再复用 Metro，勿杀其他任务。

## 站点证据与待核实项

已通过 opencli（会话 `qmszai`）核实登录状态下的侧边栏与页面：数据看板、令牌、使用日志、任务、文本聊天、图片/视频/音乐/语音、人脸检测/比对、个人设置、钱包、模型广场。字段与限制见 FEATURE_PARITY.md。
已核实当前账号无权访问：免费用量、博客、订阅、消息。仍待核实：古书法系统自定义页、订阅/余额流水；任务页当前查询无结果，新建入口未确认。古今图书按用户要求完全不做。
官方文档入口：https://qmszai.apifox.cn/9427112m0 。业务接口的方法、认证、字段与权限仍未逐页核实；不得猜测权限或假装接入成功。

## 建议接下来执行

1. 在模拟器逐项操作新页面：AI 创作参数 Sheet 与提交、任务联动、模型体验流式/停止/清空、人脸示例选择与结果、签到、兑换码校验、模型广场搜索、聊天发送/删除/模型浮层选择；复核键盘避让与底部安全区。
2. 按 FEATURE_PARITY 补订阅/余额流水与古书法系统自定义页；免费用量/博客/订阅/消息已确认无权访问，古今图书不做；接口文档可用时再替换 adapter，先维持 mock/real 边界。
3. 继续拆分 App.tsx 剩余四个页面（概览/模型/令牌/账户），补深色模式、动态字体、无障碍与 Android 独立视觉验收；账户资料卡可进一步改为系统 inset grouped list 的 `listStyle` 语义，逐步替换自定义 Sheet 为系统表单。
4. 每次改动后运行 typecheck、双平台 export 并在模拟器目检；不要把编译成功当作真机兼容。
5. 同步项目内交接和 project.md；若 CLI 无全局档案写权限，记录待同步摘要，不覆盖其他 CLI 修改。

## API 配置独立事项（不要阻塞 Mobile 开发）

原 codex-qmszai 走阡陌数智 Responses/gpt-5.5，曾遇到加密上下文、429 和分组无可用渠道。
独立 codex-deepseek 使用本地 LiteLLM 把 Responses 转 Chat Completions：普通短请求成功，完整 Codex 请求被上游 HTTP 500 拒绝，尚不可宣称可用。测试已停，自动重试已禁用，原全局配置未改。
最新已查 DeepSeek 官方指南 https://api-docs.deepseek.com/quick_start/agent_integrations/codex/ ：官方 API 原生支持 Responses，base_url 为 https://api.deepseek.com/，需官方 API Key 和模型目录。不能拿阡陌数智密钥直接请求 DeepSeek 官方。用户尚未答复新密钥来源，也尚未配置官方直连。
开发密钥禁止输出、提交、进入移动 App 或 EXPO_PUBLIC。本任务无需读取任何密钥。用官方 Codex CLI 接手可直接从项目目录启动普通 codex；不要因开发任务擅自切换 provider。

## 可直接粘贴的提示

继续 QMSZAI Mobile。先读取 HANDOVER_NEXT_CLI.md、docs/FEATURE_PARITY.md 和本机项目入口。保留其他 CLI 新增的 ChatWorkspace。目标是 iOS 参照苹果系统组件、覆盖官网普通用户全部非支付功能，不包含管理员；继续模拟数据。先验证现有聊天与 Sheet，再按功能矩阵推进实现。不要读取开发 API 密钥，不要将 API 配置故障当成 Mobile 开发前置条件。完成后同步交接和 project.md。
