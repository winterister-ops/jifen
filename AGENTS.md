# jifen Codex Rules

## 项目定位

- 这是「星星银行」，一款面向家长和孩子的积分激励 PWA。
- 维护时优先保持产品简单、亲切、适合手机使用。
- 代码是静态前端页面，使用 Firebase 相关能力做登录与云同步；不要无故引入后端服务、构建系统或重型框架。

## 日常维护原则

- 先阅读现有实现，再按当前文件风格做小范围修改。
- 优先复用已有函数、状态结构、CSS 变量、组件样式和交互模式。
- 避免无关重构、格式化整文件或批量改名。
- 用户数据相关逻辑要保守处理，尤其是积分、历史记录、删除记录、离线/云同步合并。
- 改动 `js/firestore-sync.js`、`js/sync.js`、`js/history.js` 或 Firebase 规则时，要特别留意多端同步、离线恢复、历史记录净积分一致性。
- 不要提交密钥、私人账号、Firebase 控制台截图或本地环境文件。

## README 写作规范

改写或新增 `README.md` 时遵守：

### 只写功能介绍

- 面向家长/用户，说明能做什么、怎么用。
- 按页面/模块组织，比如任务、奖励、记录、我的。
- 用产品语言，不写实现细节。

### 禁止写入

- 技术栈、API、SDK 名称，例如 Firebase、Vibration API、oobCode。
- 部署、本地开发、环境配置、排错步骤。
- 控制台操作路径、数据库规则、CI/CD 等运维说明。

### 必须保留

- 「字体许可」章节，包含 Google Fonts 和 SIL OFL 1.1。
- 「图标许可」章节，包含 IconPark 和 Apache 2.0。

### 表述示例

- 不要写：新账号在 Firebase Console -> Authentication -> Users -> Add user 创建。
- 应该写：打开应用需先登录家长账号。
- 不要写：仅 Android 等支持 Vibration API 的设备可用。
- 应该写：完成任务时可震动提醒（部分 Android 手机支持，可在设置中开关）。

## 测试与验证

- 修改 `.js`、`.html`、`.css` 后，优先运行 `npm test`。
- 如果只改 README、许可文字或注释，可以说明未运行测试的原因。
- 涉及手机布局、底部导航、弹窗、历史记录滚动或首次引导时，尽量做浏览器截图或手动走一遍关键流程。
- 测试失败时先定位是否由本次修改引起；不要为了通过测试而删除有效覆盖。

## 前端体验

- 这是给孩子和家长一起用的工具，文案要短、清楚、鼓励式。
- 移动端优先，注意 iPhone 安全区、底部导航、可点击区域和长文本省略。
- 保持现有暖色、圆润、卡通但克制的视觉风格。
- 不要把页面改成营销落地页；打开后应直接是可用应用体验。
- 图标、任务、奖励、积分变化等反馈要直观，避免让孩子误触造成不可逆操作。

## 数据与同步

- 积分 `score` 应与未删除历史记录的 `delta` 净和保持一致（见下方「积分权威来源」）。
- 删除历史记录、清空、迁移、合并云端状态时，要避免重复扣分/加分。
- Firestore 规则应保持用户只能读写自己的数据。
- 历史记录分页、统计、日期跳转相关改动要考虑记录很多的情况。

### 积分权威来源

维护 `score` 相关逻辑时遵守以下分层规则（实现见 `js/sync.js` 顶部注释与 `netScoreFromHistory` / `mergeUserDocScore` / `applyScoreFromHistoryNet`）：

1. **最终权威：历史净和** — 对「未删除且在 `lastClearAt` 之后」的全部历史 `delta` 求和。适用于：本地完整历史（`normalizeState` 非 Firestore 模式）、`mergeStates`（RTDB 迁移等全量历史合并）、Firestore 全量历史统计查询后的校正（`applyScoreFromHistoryNet`）。
2. **Firestore 用户文档合并（临时）** — 本地 `state.history` 仅为分页缓存，不能据此重算总分。合并用户文档时，取 `meta.scoreUpdatedAt` 较新一侧的 `score`；双方均为 0 时回退比较 `meta.updatedAt`。赚分/删记录等改分操作必须调用 `touchScoreMeta()`。
3. **Firestore 模式下的 `normalizeState`** — 不凭分页缓存重算 `score`，保留已存储字段；全量历史查询后由 `applyScoreFromHistoryNet` 对齐净和。
4. **改分入口** — `appendHistoryEntry`、`deleteHistoryRecords` 与历史条目同步更新 `score` 并 `touchScoreMeta()`，避免单独改分。

## 交付说明

- 最终说明要用中文，简洁说清改了什么、验证了什么。
- 如果没有运行测试，明确说明。
- 不要要求用户手动复制文件；用户和 Codex 共用同一个项目目录。
