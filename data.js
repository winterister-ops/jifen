// ====== 应用版本（单一来源 package.json，发版：npm version patch） ======
const APP_VERSION = '0.0.94';

// ====== 宝贝信息默认值（首次使用或未设置时） ======
const DEFAULT_CHILD_NAME = '宝贝';
const DEFAULT_CHILD_AVATAR = '👧';
// 头像：0-12 岁男孩女孩 + 十二生肖
const AVATAR_OPTIONS = [
  '👶', '👦', '👧', '🧒',
  '🐭', '🐮', '🐯', '🐰', '🐲', '🐍', '🐴', '🐑', '🐵', '🐔', '🐶', '🐷'
];

// ====== 系统预设任务和奖励（不可删除，可改分值/emoji/名称/启用状态） ======
// 新用户引导默认启用 RECOMMENDED_*_IDS 中的项，其余默认关闭
const RECOMMENDED_TASK_IDS = ['brush', 'wash', 'eat', 'sleep', 'tidy', 'learn', 'polite'];
const RECOMMENDED_REWARD_IDS = ['cartoon', 'snack', 'icecream', 'toy', 'park'];

const ONBOARDING_HABIT_CATS = [
  { id: 'all', label: '全部' },
  { id: 'self', label: '自理' },
  { id: 'routine', label: '作息' },
  { id: 'chore', label: '家务' },
  { id: 'learn', label: '学习' },
  { id: 'social', label: '礼貌' },
];

const HABIT_CAT_BY_ID = {
  wash: 'self', brush: 'self', eat: 'self', veggie: 'self', dress: 'self', shoes: 'self', water: 'self',
  sleep: 'routine', wakeup: 'routine', nap: 'routine', screen: 'routine',
  tidy: 'chore', table: 'chore', trash: 'chore', pet: 'chore',
  learn: 'learn', read: 'learn', sport: 'learn', instrument: 'learn',
  polite: 'social', share: 'social', calm: 'social',
};

function isRecommendedTask(id) {
  return RECOMMENDED_TASK_IDS.includes(id);
}

function isRecommendedReward(id) {
  return RECOMMENDED_REWARD_IDS.includes(id);
}

const DEFAULT_TASKS = [
  { id: 'brush',   emoji: '🪥', name: '认真刷牙',   pts: 3, enabled: true,  preset: true },
  { id: 'wash',    emoji: '🧼', name: '自己洗手',   pts: 2, enabled: true,  preset: true },
  { id: 'eat',     emoji: '🍚', name: '自己吃饭',   pts: 5, enabled: true,  preset: true },
  { id: 'sleep',   emoji: '😴', name: '按时睡觉',   pts: 5, enabled: true,  preset: true },
  { id: 'tidy',    emoji: '🧸', name: '收拾玩具',   pts: 4, enabled: true,  preset: true },
  { id: 'learn',   emoji: '📚', name: '完成作业',   pts: 5, enabled: true,  preset: true },
  { id: 'polite',  emoji: '🙏', name: '讲礼貌',     pts: 2, enabled: true,  preset: true },
  { id: 'veggie',  emoji: '🥬', name: '吃蔬菜',     pts: 4, enabled: false, preset: true },
  { id: 'dress',   emoji: '👕', name: '自己穿衣服', pts: 4, enabled: false, preset: true },
  { id: 'shoes',   emoji: '👟', name: '自己穿鞋',   pts: 3, enabled: false, preset: true },
  { id: 'wakeup',  emoji: '☀️', name: '按时起床',   pts: 5, enabled: false, preset: true },
  { id: 'read',    emoji: '📖', name: '阅读15分钟', pts: 5, enabled: false, preset: true },
  { id: 'screen',  emoji: '📵', name: '控制屏幕时间', pts: 5, enabled: false, preset: true },
  { id: 'table',   emoji: '🍽️', name: '帮忙摆碗筷', pts: 3, enabled: false, preset: true },
  { id: 'trash',   emoji: '🗑️', name: '扔垃圾',     pts: 2, enabled: false, preset: true },
  { id: 'share',   emoji: '🤝', name: '懂得分享',   pts: 3, enabled: false, preset: true },
  { id: 'calm',    emoji: '😌', name: '不乱发脾气', pts: 5, enabled: false, preset: true },
  { id: 'water',   emoji: '🥤', name: '多喝白开水', pts: 2, enabled: false, preset: true },
  { id: 'nap',     emoji: '💤', name: '好好午睡',   pts: 4, enabled: false, preset: true },
  { id: 'sport',   emoji: '⚽', name: '运动锻炼',   pts: 5, enabled: false, preset: true },
  { id: 'instrument', emoji: '🎹', name: '练习乐器', pts: 6, enabled: false, preset: true },
  { id: 'pet',     emoji: '🐾', name: '照顾宠物',   pts: 5, enabled: false, preset: true },
];
const DEFAULT_REWARDS = [
  { id: 'cartoon',  emoji: '📺', name: '看动画片15分钟', pts: 10, enabled: true,  preset: true },
  { id: 'snack',    emoji: '🍪', name: '小零食一份',     pts: 8,  enabled: true,  preset: true },
  { id: 'icecream', emoji: '🍦', name: '冰淇淋一个',     pts: 15, enabled: true,  preset: true },
  { id: 'toy',      emoji: '🚗', name: '小玩具一个',     pts: 35, enabled: true,  preset: true },
  { id: 'park',     emoji: '🎡', name: '去游乐场玩',     pts: 50, enabled: true,  preset: true },
  { id: 'story',    emoji: '📕', name: '多讲一个故事',   pts: 8,  enabled: false, preset: true },
  { id: 'game',     emoji: '🎮', name: '亲子游戏15分钟', pts: 10, enabled: false, preset: true },
  { id: 'sticker',  emoji: '⭐', name: '贴纸一张',       pts: 5,  enabled: false, preset: true },
  { id: 'late',     emoji: '🌙', name: '晚睡15分钟',     pts: 15, enabled: false, preset: true },
  { id: 'dinner',   emoji: '🍕', name: '今晚吃什么我来选', pts: 20, enabled: false, preset: true },
  { id: 'cinema',   emoji: '🎬', name: '去看电影',       pts: 45, enabled: false, preset: true },
];

// ====== 环境隔离：本地开发 vs 线上真实 ======
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname)
  || location.protocol === 'file:';
const ENV = IS_LOCAL ? 'dev' : 'prod';

const firebaseConfigProd = {
  apiKey: "AIzaSyBSfzrKexHnCDOQ3k8vTSJ8oGqRtlh95tk",
  authDomain: "baby-points-9a82c.firebaseapp.com",
  databaseURL: "https://baby-points-9a82c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "baby-points-9a82c",
  storageBucket: "baby-points-9a82c.firebasestorage.app",
  messagingSenderId: "524651272617",
  appId: "1:524651272617:web:b827922fafbc5e083c4cb8"
};
const firebaseConfigDev = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const firebaseConfig = (ENV === 'dev' && firebaseConfigDev.databaseURL)
  ? firebaseConfigDev
  : firebaseConfigProd;
// 旧 RTDB 迁移默认关闭；如需临时迁移历史账号，可在控制台设置 stars_bank_enable_rtdb_migration=1。
const ENABLE_RTDB_MIGRATION = localStorage.getItem('stars_bank_enable_rtdb_migration') === '1';

// ====== 云数据与本地缓存（按登录用户 uid 隔离）======
// 业务数据在 Firestore：users/<uid> + users/<uid>/history/<eid>
// RTDB 迁移已收尾，默认不再读取旧 users/<uid>/data。
// 新账号在 Firebase Console → Authentication → Add user 创建，不支持前端自助注册。
const STORAGE_PREFIX = 'kid_points_v1_' + ENV + '_';

// 同一任务赚积分后的冷却时间（毫秒），防误触连点
const EARN_COOLDOWN_MS = 60 * 1000;

const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];

// ====== 通用工具 ======

function getAppVersion() {
  const meta = document.querySelector('meta[name="app-version"]');
  const fromMeta = meta && meta.getAttribute('content');
  if (fromMeta && fromMeta.trim()) return fromMeta.trim();
  if (typeof APP_VERSION === 'string' && APP_VERSION) return APP_VERSION;
  return '';
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function takeFirstEmoji(str) {
  const s = (str || '').trim();
  if (!s) return '';
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const first = seg.segment(s)[Symbol.iterator]().next();
    return first.done ? '' : first.value.segment;
  }
  return [...s][0] || '';
}

function firstEmojiOrDefault(str, fallback = '⭐') {
  return takeFirstEmoji(str) || fallback;
}
