const { expect } = require('@playwright/test');

/** 在页面加载前注入 Firebase 桩，自动以测试用户登录并进入主界面 */
async function gotoLoggedInApp(page, uid = 'test-playwright-user', options = {}) {
  const { skipOnboarding = true } = options;
  await page.route('**/*gstatic.com/firebasejs/**', route => route.abort());

  await page.addInitScript(({ testUid, skipOnboarding }) => {
    window.__testFlags = { skipOnboarding };
    const authInstance = {
      setPersistence: () => Promise.resolve(),
      onAuthStateChanged: (cb) => {
        cb({ uid: testUid, email: 'test@example.com' });
        return () => {};
      },
      signInWithEmailAndPassword: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
      EmailAuthProvider: { credential: () => ({}) },
      sendPasswordResetEmail: () => Promise.resolve(),
      confirmPasswordReset: () => Promise.resolve(),
    };

    const fakeFirestore = (() => {
      const store = { users: {} };
      let writeBlocked = false;

      function userBucket(uid) {
        if (!store.users[uid]) store.users[uid] = { doc: null, history: {} };
        return store.users[uid];
      }

      function rejectIfBlocked() {
        if (!writeBlocked) return null;
        return Promise.reject(new Error('cloud write blocked'));
      }

      function applySet(segments, data, opts) {
        if (segments.length === 2 && segments[0] === 'users') {
          const bucket = userBucket(segments[1]);
          bucket.doc = opts && opts.merge && bucket.doc
            ? { ...bucket.doc, ...data, meta: { ...(bucket.doc.meta || {}), ...(data.meta || {}) } }
            : data;
          return;
        }
        if (segments.length === 4 && segments[2] === 'history') {
          const bucket = userBucket(segments[1]);
          const id = segments[3];
          bucket.history[id] = opts && opts.merge && bucket.history[id]
            ? { ...bucket.history[id], ...data }
            : data;
        }
      }

      function runQuery(segments, state) {
        const bucket = userBucket(segments[1]);
        let rows = Object.entries(bucket.history).map(([id, data]) => ({ id, data }));

        state.filters.forEach(f => {
          rows = rows.filter(({ data }) => {
            const val = data[f.field];
            if (f.op === '==') return val === f.val;
            if (f.op === '>') return val > f.val;
            if (f.op === '>=') return val >= f.val;
            if (f.op === '<=') return val <= f.val;
            return true;
          });
        });

        state.orders.forEach(o => {
          rows.sort((a, b) => {
            const av = a.data[o.field];
            const bv = b.data[o.field];
            if (av === bv) {
              if (o.field === 'ts') {
                const ae = a.data.eid;
                const be = b.data.eid;
                if (ae === be) return 0;
                const tie = ae < be ? -1 : 1;
                return o.dir === 'desc' ? -tie : tie;
              }
              return 0;
            }
            const cmp = av < bv ? -1 : 1;
            return o.dir === 'desc' ? -cmp : cmp;
          });
        });

        if (state.startAfterDoc) {
          const startId = state.startAfterDoc.id;
          const idx = rows.findIndex(r => r.id === startId);
          if (idx >= 0) rows = rows.slice(idx + 1);
        }

        if (state.limitN != null) rows = rows.slice(0, state.limitN);

        const docs = rows.map(({ id, data }) => ({ id, data: () => data }));
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach(fn) { docs.forEach(fn); },
        };
      }

      function docRef(segments) {
        return {
          get: () => {
            const blocked = rejectIfBlocked();
            if (blocked) return blocked;
            if (segments.length === 2) {
              const doc = userBucket(segments[1]).doc;
              return Promise.resolve({ exists: !!doc, data: () => doc });
            }
            if (segments.length === 4) {
              const doc = userBucket(segments[1]).history[segments[3]];
              return Promise.resolve({ exists: !!doc, data: () => doc });
            }
            return Promise.resolve({ exists: false, data: () => null });
          },
          set: (data, opts) => {
            const blocked = rejectIfBlocked();
            if (blocked) return blocked;
            applySet(segments, data, opts);
            return Promise.resolve();
          },
          collection: (name) => collectionRef([...segments, name]),
          onSnapshot: (cb) => {
            const uid = segments[1];
            const notify = () => cb({ data: () => userBucket(uid).doc });
            setTimeout(notify, 0);
            return () => {};
          },
        };
      }

      function makeQuery(segments, state) {
        const api = {
          where: (field, op, val) => {
            state.filters.push({ field, op, val });
            return api;
          },
          orderBy: (field, dir) => {
            state.orders.push({ field, dir: dir || 'asc' });
            return api;
          },
          limit: (n) => {
            state.limitN = n;
            return api;
          },
          startAfter: (doc) => {
            state.startAfterDoc = doc;
            return api;
          },
          get: () => {
            const blocked = rejectIfBlocked();
            if (blocked) return blocked;
            return Promise.resolve(runQuery(segments, state));
          },
        };
        return api;
      }

      function collectionRef(segments) {
        return {
          doc: (id) => docRef([...segments, id]),
          where: (field, op, val) => makeQuery(segments, {
            filters: [{ field, op, val }],
            orders: [],
            limitN: null,
            startAfterDoc: null,
          }),
        };
      }

      return {
        collection: (name) => collectionRef([name]),
        batch: () => {
          const ops = [];
          return {
            set: (ref, data, opts) => { ops.push(() => ref.set(data, opts)); },
            commit: () => {
              const blocked = rejectIfBlocked();
              if (blocked) return blocked;
              ops.forEach(fn => fn());
              return Promise.resolve();
            },
          };
        },
        getUserDoc: (uid) => userBucket(uid).doc,
        getHistory: (uid) => userBucket(uid).history,
        setWriteBlocked: (blocked) => { writeBlocked = !!blocked; },
        isWriteBlocked: () => writeBlocked,
      };
    })();

    window.__testFirestore = fakeFirestore;
    window.firebase = {
      initializeApp: () => {},
      auth: Object.assign(() => authInstance, {
        Auth: { Persistence: { SESSION: 'session' } },
      }),
      firestore: () => fakeFirestore,
    };
  }, { testUid: uid, skipOnboarding });

  await page.goto('/');
  if (skipOnboarding) {
    await expect(page.locator('#mainView')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#scoreNum')).toHaveText('0', { timeout: 5000 });
    return;
  }
  await expect(page.locator('#onboardingView')).toBeVisible({ timeout: 10000 });
}

async function openSettings(page) {
  await page.locator('.bottom-nav-item[data-nav="settings"]').click();
  await expect(page.locator('#settingsView')).toBeVisible();
}

async function openTaskManage(page) {
  await openSettings(page);
  await page.locator('.menu-item').filter({ hasText: '任务管理' }).click();
  await expect(page.locator('#taskManageView')).toBeVisible();
}

async function openRewardManage(page) {
  await openSettings(page);
  await page.locator('.menu-item').filter({ hasText: '奖励管理' }).click();
  await expect(page.locator('#rewardManageView')).toBeVisible();
}

async function exitManageViews(page) {
  if (await page.locator('#taskManageView').isVisible()) {
    await page.locator('#taskManageView .back-btn').click();
    await expect(page.locator('#settingsView')).toBeVisible();
  } else if (await page.locator('#rewardManageView').isVisible()) {
    await page.locator('#rewardManageView .back-btn').click();
    await expect(page.locator('#settingsView')).toBeVisible();
  }
}

async function goHome(page) {
  await exitManageViews(page);
  await page.locator('.bottom-nav-item[data-nav="tasks"]').click();
  await expect(page.locator('#mainView')).toBeVisible();
}

async function addCatalogItem(page, { type, name, pts }) {
  const viewSel = type === 'rewards' ? '#rewardManageView' : '#taskManageView';
  await page.locator(`${viewSel} .catalog-add-pill`).click();
  await expect(page.locator('#catalogEditModal')).toHaveClass(/show/);
  await page.locator('#catalogNameInput').fill(name);
  await page.locator('#catalogPtsInput').fill(String(pts));
  await page.locator('#catalogEditModal .modal-btn.confirm').click();
  await expect(page.locator('#catalogEditModal')).not.toHaveClass(/show/);
}

async function waitForCloudSync(page) {
  await page.waitForFunction(() => {
    return window.__testFirestore
      && window.__testFirestore.getUserDoc('test-playwright-user')
      && typeof window.__testFirestore.getUserDoc('test-playwright-user').score === 'number';
  }, null, { timeout: 10000 });
}

async function earnTask(page, name) {
  await page.locator('.earn-item').filter({ hasText: name }).click();
}

async function gotoOnboardingApp(page, uid = 'test-playwright-new-user') {
  await gotoLoggedInApp(page, uid, { skipOnboarding: false });
  await expect(page.locator('#obStep-profile')).toHaveClass(/active/);
}

async function completeOnboardingFlow(page, { name = '小星星', avatar = '👦' } = {}) {
  await page.locator('#obNameInput').fill(name);
  await page.locator('.ob-avatar-btn').filter({ hasText: avatar }).click();
  await page.locator('[data-ob-action="ob-profile-next"]').click();
  await expect(page.locator('#obStep-habits')).toHaveClass(/active/);

  await page.locator('[data-ob-action="ob-habits-next"]').click();
  await expect(page.locator('#obStep-rewards')).toHaveClass(/active/);

  await page.locator('[data-ob-action="ob-rewards-done"]').click();
  await expect(page.locator('#obStep-done')).toHaveClass(/active/);

  await page.locator('[data-ob-action="ob-enter-app"]').click();
  await expect(page.locator('#mainView')).toBeVisible();
  await expect(page.locator('#welcomeName')).toHaveText(name);
}

module.exports = {
  gotoLoggedInApp,
  gotoOnboardingApp,
  completeOnboardingFlow,
  openSettings,
  openTaskManage,
  openRewardManage,
  goHome,
  addCatalogItem,
  waitForCloudSync,
  earnTask,
};
