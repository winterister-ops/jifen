// ====== 应用版本（单一来源 package.json，发版：npm version patch） ======
const APP_VERSION = '0.0.56';

// ====== 宝贝信息默认值（首次使用或未设置时） ======
const DEFAULT_CHILD_NAME = '宝贝';
const DEFAULT_CHILD_AVATAR = '👧';
// 头像：0-12 岁男孩女孩 + 十二生肖
const AVATAR_OPTIONS = [
  '👶', '👦', '👧', '🧒',
  '🐭', '🐮', '🐯', '🐰', '🐲', '🐍', '🐴', '🐑', '🐵', '🐔', '🐶', '🐷'
];

// ====== 系统预设任务和奖励（不可删除，可改分值/emoji/名称/启用状态） ======
const DEFAULT_TASKS = [
  { id: 'wash',    emoji: '🧼', name: '自己洗手',   pts: 2,  enabled: true, preset: true },
  { id: 'eat',     emoji: '🍚', name: '自己吃饭',   pts: 5,  enabled: true, preset: true },
  { id: 'veggie',  emoji: '🥬', name: '吃蔬菜',     pts: 4,  enabled: true, preset: true },
  { id: 'brush',   emoji: '🪥', name: '认真刷牙',   pts: 3,  enabled: true, preset: true },
  { id: 'dress',   emoji: '👕', name: '自己穿衣服', pts: 5,  enabled: true, preset: true },
  { id: 'shoes',   emoji: '👟', name: '自己穿鞋',   pts: 3,  enabled: true, preset: true },
  { id: 'tidy',    emoji: '🧸', name: '收拾玩具',   pts: 4,  enabled: true, preset: true },
  { id: 'sleep',   emoji: '😴', name: '按时睡觉',   pts: 4,  enabled: true, preset: true },
  { id: 'polite',  emoji: '🙏', name: '讲礼貌',     pts: 2,  enabled: true, preset: true },
  { id: 'jump',    emoji: '🤽', name: '勇敢跳水',   pts: 10, enabled: true, preset: true },
  { id: 'dive',    emoji: '🌊', name: '勇敢潜水',   pts: 10, enabled: true, preset: true },
  { id: 'learn',   emoji: '📚', name: '认真学习',   pts: 5,  enabled: true, preset: true },
  { id: 'photo',   emoji: '📷', name: '配合摄影',   pts: 50, enabled: true, preset: true },
];
const DEFAULT_REWARDS = [
  { id: 'cartoon',  emoji: '📺', name: '看动画片15分钟', pts: 10, enabled: true, preset: true },
  { id: 'snack',    emoji: '🍪', name: '小零食一份',     pts: 8,  enabled: true, preset: true },
  { id: 'icecream', emoji: '🍦', name: '冰淇淋一个',     pts: 15, enabled: true, preset: true },
  { id: 'toy',      emoji: '🚗', name: '小玩具一个',     pts: 30, enabled: true, preset: true },
  { id: 'park',     emoji: '🎡', name: '去游乐场玩',     pts: 50, enabled: true, preset: true },
];

// 任务/奖励编辑时的 emoji 候选
const CATALOG_EMOJI_OPTIONS = [
  '🧼', '🍚', '🥬', '🪥', '👕', '👟', '🧸', '😴', '🙏', '🤽', '🌊', '📚', '📷',
  '📺', '🍪', '🍦', '🚗', '🎡', '⭐', '🎁', '🎮', '📖', '🎨', '🏃', '💪', '🌟',
  '🎯', '🏆', '❤️', '🎵', '🛁', '🧹', '🐶', '🌈', '✨', '🎂', '🍎', '🥛', '🛏️'
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

// ====== 云数据与本地缓存（按登录用户 uid 隔离）======
// 数据存在 users/<uid>/data，<uid> 必须等于登录账号的 uid（数据库规则要求）。
// 新账号在 Firebase Console → Authentication → Add user 创建，不支持前端自助注册。
const STORAGE_PREFIX = 'kid_points_v1_' + ENV + '_';

// 同一任务赚积分后的冷却时间（毫秒），防误触连点
const EARN_COOLDOWN_MS = 60 * 1000;

const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];
