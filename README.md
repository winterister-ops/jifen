# 星星银行

一款面向儿童的积分激励小应用。孩子完成日常任务可以赚取星星积分，攒够积分后可以兑换奖励。界面采用暖色卡通风格，操作简单，适合家长和孩子一起使用。

## 功能概览

### 首页

- **做任务赚积分**：点击任务卡片即可加分，支持 12 项预设任务（洗手、吃饭、刷牙、睡觉等）
- **换奖励花积分**：切换到奖励 Tab，用积分兑换动画片、零食、玩具、游乐场等奖励
- **自适应网格**：任务/奖励卡片随屏幕宽度自动调整列数，越宽显示越多列
- **排序**：默认收起，点击展开后可按默认顺序或积分高低排序，选择会保存在本地
- **积分不足锁定**：当前星星不够时，奖励卡片会灰显，点击会提示「积分不够哦」
- **动效反馈**：加分时有飘字提示、星星徽章弹跳动画；赚积分时还有撒花效果
- **震动反馈**：完成任务和兑换奖励时触发短振动（可在「我的 → 设置」中开关，默认开启；需设备与浏览器支持）

### 积分记录

- **按日期查看**：默认显示今天的记录，顶部展示当日条数与净积分
- **全部记录**：一键切换查看所有历史，按日期分组展示
- **日历选择**：通过日历跳转到任意日期，有记录的日期带小圆点标记
- **回到今天**：浏览其他日期时可快速切回今天

### 我的

- **宝贝资料**：自定义昵称（最多 12 字）和头像（儿童 emoji + 十二生肖）
- **积分统计**：剩余星星、累计获得、累计消耗
- **设置**：震动反馈开关，控制完成任务和兑换奖励时的振动；默认开启，偏好保存在本机（不同步云端）
- **统计**：查看各任务/奖励的累计完成次数（仅显示有记录的项）
- **撤销上一条**：误操作时可撤回最近一条记录并恢复积分
- **全部清空**：两步确认后清空所有积分和记录（保留宝贝资料）

### 导航与交互

- **底部 Tab**：首页 · 记录 · 我的（「我的」内可进入统计子页）
- **滚动隐藏**：参考 X App，页面上滑时底部栏滑出隐藏，下滑时重新展示；回到顶部或切换 Tab 时自动恢复显示

### 数据与同步

- **本地存储**：数据保存在浏览器 `localStorage`，离线可用；排序偏好、震动开关等本机设置也保存在本地
- **云端同步**：接入 Firebase Realtime Database，多设备自动同步
- **环境隔离**：
  - 本地开发（`localhost` / `127.0.0.1` / 直接打开文件）→ 开发环境
  - 部署到线上域名 → 生产环境
  - 开发与生产使用独立的本地存储 key 和云端数据路径，互不影响

## 页面结构

```
jifen/
├── index.html          # 页面结构与模态框
├── styles.css          # 样式（含底部栏滚动动画）
├── app.js              # 业务逻辑与 UI 渲染
├── data.js             # 任务/奖励配置、Firebase 与环境常量
├── icons/              # IconPark 功能入口图标（Apache 2.0）
│   ├── home.svg
│   ├── transaction-order.svg
│   ├── star.svg
│   └── ...
└── README.md
```

## 自定义任务与奖励

在 `data.js` 中修改 `TASKS` 和 `REWARDS` 数组即可，每项包含：

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识，用于统计次数 |
| `emoji` | 任务/奖励图标（emoji） |
| `name` | 显示名称 |
| `pts` | 积分值 |

```javascript
const TASKS = [
  { id: 'wash', emoji: '🧼', name: '自己洗手', pts: 2 },
  // ...
];

const REWARDS = [
  { id: 'cartoon', emoji: '📺', name: '看动画片15分钟', pts: 10 },
  // ...
];
```

## 本地运行

无需安装依赖，直接用浏览器打开即可：

```bash
# 方式一：直接打开
open index.html

# 方式二：本地静态服务（推荐，Firebase 同步更稳定）
python3 -m http.server 8080
# 然后访问 http://localhost:8080
```

## 部署

将整个 `jifen` 目录部署到任意静态托管服务（如 GitHub Pages、Vercel、Cloudflare Pages）即可。部署到线上域名后自动切换为生产环境。

如需独立开发环境 Firebase 项目，在 `data.js` 的 `firebaseConfigDev` 中填入配置；留空则开发环境复用线上 Firebase，但数据路径仍为 `mybaby-dev`。

## 技术说明

| 项目 | 说明 |
|------|------|
| 架构 | 单页应用，纯 HTML / CSS / JavaScript，无构建工具 |
| 文件划分 | `index.html` 结构 · `styles.css` 样式 · `app.js` 逻辑 · `data.js` 配置 |
| 存储 | localStorage + Firebase Realtime Database |
| UI 图标 | [IconPark](https://iconpark.oceanengine.com/)（Apache 2.0），页面功能入口使用 |
| 字体 | 中文正文 [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC)，数字 [Fredoka](https://fonts.google.com/specimen/Fredoka)；均通过 Google Fonts CDN 加载，详见下方「字体许可」 |
| 任务图标 | Emoji，保留在任务卡片和历史记录中 |
| 布局 | 首页任务网格使用 CSS `auto-fill` + `minmax` 自适应列数，内容区最大宽度 720px |
| 适配 | 移动端优先，底部栏支持 safe-area；滚动时自动隐藏/展示 |
| 震动 | 使用 [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)；Android 支持较好，iOS Safari 支持有限 |

## 字体许可

页面通过 [Google Fonts](https://fonts.google.com/) CDN 加载两套开源字体，均可免费商用：

| 字体 | 用途 | 授权 |
|------|------|------|
| [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) | 中文正文、按钮、标签等 UI 文字 | [SIL Open Font License 1.1](https://openfontlicense.org/) |
| [Fredoka](https://fonts.google.com/specimen/Fredoka) | 积分、角标、统计等数字展示 | [SIL Open Font License 1.1](https://openfontlicense.org/) |

字体在 `styles.css` 中通过 CSS 变量 `--font-body` 与 `--font-num` 分别指定，避免依赖苹方、微软雅黑等系统专有字体。

## 图标许可

`icons/` 目录下的 SVG 图标来自 ByteDance IconPark，遵循 [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)。
