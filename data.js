// ====== 宝贝信息默认值（首次使用或未设置时） ======
const DEFAULT_CHILD_NAME = '宝贝';
const DEFAULT_CHILD_AVATAR = '👧';
// 头像：0-12 岁男孩女孩 + 十二生肖
const AVATAR_OPTIONS = [
  '👶', '👦', '👧', '🧒',
  '🐭', '🐮', '🐯', '🐰', '🐲', '🐍', '🐴', '🐑', '🐵', '🐔', '🐶', '🐷'
];

// ====== 可自由修改的任务和奖励 ======
const TASKS = [
  { id: 'wash',    emoji: '🧼', name: '自己洗手',   pts: 2 },
  { id: 'eat',     emoji: '🍚', name: '自己吃饭',   pts: 5 },
  { id: 'veggie',  emoji: '🥬', name: '吃蔬菜',     pts: 4 },
  { id: 'brush',   emoji: '🪥', name: '认真刷牙',   pts: 3 },
  { id: 'dress',   emoji: '👕', name: '自己穿衣服', pts: 5 },
  { id: 'shoes',   emoji: '👟', name: '自己穿鞋',   pts: 3 },
  { id: 'tidy',    emoji: '🧸', name: '收拾玩具',   pts: 4 },
  { id: 'sleep',   emoji: '😴', name: '乖乖睡觉',   pts: 4 },
  { id: 'jump',    emoji: '🤽', name: '勇敢跳水',   pts: 10 },
  { id: 'dive',    emoji: '🌊', name: '勇敢潜水',   pts: 10 },
  { id: 'learn',   emoji: '📚', name: '认真学习',   pts: 5 },
];
const REWARDS = [
  { id: 'cartoon', emoji: '📺', name: '看动画片15分钟', pts: 10 },
  { id: 'snack',   emoji: '🍪', name: '小零食一份',     pts: 8 },
  { id: 'icecream',emoji: '🍦', name: '冰淇淋一个',     pts: 15 },
  { id: 'toy',     emoji: '🚗', name: '小玩具一个',     pts: 30 },
  { id: 'park',    emoji: '🎡', name: '去游乐场玩',     pts: 50 },
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

const FAMILY = ENV === 'dev' ? 'mybaby-dev' : 'mybaby';

const KEY = 'kid_points_data_v1_' + ENV;
const SORT_KEY = 'kid_points_sort_v1_' + ENV;
const SORT_MODES = ['default', 'pts-asc', 'pts-desc'];
const SORT_LABELS = { default: '默认', 'pts-asc': '分数从低到高', 'pts-desc': '分数从高到低' };

const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];

const CLEAR_STEPS = [
  {
    icon: 'clear-format',
    title: '确定要清空吗？',
    msg: '将清空当前所有积分和记录。',
    step: '第 1 步 / 共 2 步',
    btn: '继续',
    danger: false
  },
  {
    icon: 'caution',
    title: '再次确认清空',
    msg: '清空后无法恢复，真的要全部清空吗？',
    step: '第 2 步 / 共 2 步',
    btn: '确认全部清空',
    danger: true
  }
];
