// ====== 登录与认证 ======

let currentUser = null;
let pendingResetEmail = '';
let passwordResetCodeFromUrl = null;

(function capturePasswordResetFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');
  if (mode === 'resetPassword' && oobCode) {
    passwordResetCodeFromUrl = oobCode;
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
})();

function hideSplash() {
  const el = document.getElementById('splashView');
  if (el) el.style.display = 'none';
}

function hideAllAuthPanels() {
  ['authLoginPanel', 'authForgotSendPanel', 'authResetPanel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function showAuthShell() {
  hideSplash();
  const authView = document.getElementById('authView');
  const appRoot = document.getElementById('appRoot');
  if (authView) authView.style.display = 'flex';
  if (appRoot) appRoot.style.display = 'none';
}

function showAuthView() {
  showAuthShell();
  showLoginPanel();
}

function showLoginPanel() {
  hideAllAuthPanels();
  const login = document.getElementById('authLoginPanel');
  if (login) login.style.display = '';
  clearAuthMessages();
  setTimeout(() => document.getElementById('emailInput')?.focus(), 200);
}

function showForgotSendPanel() {
  hideAllAuthPanels();
  const panel = document.getElementById('authForgotSendPanel');
  if (panel) panel.style.display = '';
  clearAuthMessages();
  const resetInput = document.getElementById('resetEmailInput');
  const emailInput = document.getElementById('emailInput');
  if (resetInput && pendingResetEmail) {
    resetInput.value = pendingResetEmail;
  } else if (resetInput && emailInput && emailInput.value.trim()) {
    resetInput.value = emailInput.value.trim();
  }
  setTimeout(() => resetInput?.focus(), 100);
}

function showForgotPanel() {
  showAuthShell();
  showForgotSendPanel();
}

function showResetPasswordPanel(email, oobCode) {
  hideAllAuthPanels();
  const panel = document.getElementById('authResetPanel');
  if (panel) panel.style.display = '';
  if (email) pendingResetEmail = email;
  const hint = document.getElementById('resetEmailHint');
  if (hint) {
    hint.textContent = pendingResetEmail
      ? `验证码已发送至 ${pendingResetEmail}，请查收邮件（含垃圾箱）`
      : '请查收邮件中的验证码（含垃圾箱）';
  }
  const codeInput = document.getElementById('resetCodeInput');
  const newInput = document.getElementById('resetNewPasswordInput');
  const confirmInput = document.getElementById('resetConfirmPasswordInput');
  if (codeInput) codeInput.value = oobCode || '';
  if (newInput) newInput.value = '';
  if (confirmInput) confirmInput.value = '';
  clearAuthMessages();
  setTimeout(() => {
    if (oobCode && newInput) newInput.focus();
    else codeInput?.focus();
  }, 100);
}

function clearResetPasswordFields() {
  pendingResetEmail = '';
  ['resetCodeInput', 'resetNewPasswordInput', 'resetConfirmPasswordInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const hint = document.getElementById('resetEmailHint');
  if (hint) hint.textContent = '';
}

function hideAuthView() {
  hideSplash();
  const authView = document.getElementById('authView');
  const appRoot = document.getElementById('appRoot');
  if (authView) authView.style.display = 'none';
  if (appRoot) appRoot.style.display = '';
}

function clearAuthMessages() {
  setAuthError('');
  setAuthSuccess('');
}

function setAuthError(msg) {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? '' : 'none';
  if (msg) setAuthSuccess('');
}

function setAuthSuccess(msg) {
  const el = document.getElementById('authSuccess');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? '' : 'none';
  if (msg) setAuthError('');
}

function authErrorText(err) {
  const code = (err && err.code) || '';
  if (code === 'auth/invalid-email') return '邮箱格式不正确';
  if (code === 'auth/user-not-found') return '该邮箱尚未开通账号';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential'
      || code === 'auth/invalid-login-credentials') return '邮箱或密码不正确';
  if (code === 'auth/too-many-requests') return '尝试次数过多，请稍后再试';
  if (code === 'auth/network-request-failed') return '网络连接失败，请检查网络后重试';
  if (code === 'auth/weak-password') return '密码至少需要 6 位';
  if (code === 'auth/requires-recent-login') return '请重新登录后再修改密码';
  if (code === 'auth/expired-action-code') return '验证码已过期，请重新发送';
  if (code === 'auth/invalid-action-code') return '验证码无效，请检查后重试';
  return '操作失败，请重试';
}

function resetEmailActionSettings() {
  return { url: window.location.origin + window.location.pathname };
}

function submitLogin() {
  const emailInput = document.getElementById('emailInput');
  const passwordInput = document.getElementById('passwordInput');
  const btn = document.getElementById('loginBtn');
  const email = (emailInput ? emailInput.value : '').trim();
  const password = passwordInput ? passwordInput.value : '';
  if (!email) { setAuthError('请输入邮箱'); return; }
  if (!password) { setAuthError('请输入密码'); return; }
  if (!firebaseReady) { setAuthError('云服务未配置，无法登录'); return; }
  clearAuthMessages();
  if (btn) { btn.disabled = true; btn.textContent = '登录中…'; }
  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(() => {
      if (passwordInput) passwordInput.value = '';
    })
    .catch(err => {
      console.warn('登录失败', err);
      setAuthError(authErrorText(err));
    })
    .finally(() => {
      if (btn) { btn.disabled = false; btn.textContent = '登录'; }
    });
}

function submitForgotPassword() {
  const input = document.getElementById('resetEmailInput');
  const btn = document.getElementById('forgotBtn');
  const email = (input ? input.value : '').trim();
  if (!email) { setAuthError('请输入邮箱'); return; }
  if (!firebaseReady) { setAuthError('云服务未配置'); return; }
  clearAuthMessages();
  if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
  firebase.auth().sendPasswordResetEmail(email, resetEmailActionSettings())
    .then(() => {
      pendingResetEmail = email;
      showResetPasswordPanel(email);
      setAuthSuccess('验证码已发送，请查收邮件后填写验证码并设置新密码');
    })
    .catch(err => {
      console.warn('发送验证码失败', err);
      setAuthError(authErrorText(err));
    })
    .finally(() => {
      if (btn) { btn.disabled = false; btn.textContent = '发送验证码'; }
    });
}

function submitResetPassword() {
  const codeInput = document.getElementById('resetCodeInput');
  const newInput = document.getElementById('resetNewPasswordInput');
  const confirmInput = document.getElementById('resetConfirmPasswordInput');
  const btn = document.getElementById('resetPasswordBtn');
  const code = (codeInput ? codeInput.value : '').trim();
  const newPassword = newInput ? newInput.value : '';
  const confirm = confirmInput ? confirmInput.value : '';
  if (!code) { setAuthError('请输入邮件验证码'); return; }
  if (!newPassword) { setAuthError('请输入新密码'); return; }
  if (newPassword.length < 6) { setAuthError('新密码至少需要 6 位'); return; }
  if (newPassword !== confirm) { setAuthError('两次输入的新密码不一致'); return; }
  if (!firebaseReady) { setAuthError('云服务未配置'); return; }
  clearAuthMessages();
  if (btn) { btn.disabled = true; btn.textContent = '重置中…'; }
  firebase.auth().confirmPasswordReset(code, newPassword)
    .then(() => {
      const email = pendingResetEmail;
      clearResetPasswordFields();
      showLoginPanel();
      setAuthSuccess('密码已重置，请使用新密码登录');
      if (email) {
        const emailInput = document.getElementById('emailInput');
        if (emailInput) emailInput.value = email;
      }
    })
    .catch(err => {
      console.warn('重置密码失败', err);
      setAuthError(authErrorText(err));
    })
    .finally(() => {
      if (btn) { btn.disabled = false; btn.textContent = '确认重置密码'; }
    });
}

function openPasswordModal() {
  const errEl = document.getElementById('passwordModalError');
  ['currentPasswordInput', 'newPasswordInput', 'confirmPasswordInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
  document.getElementById('passwordModal').classList.add('show');
  setTimeout(() => document.getElementById('currentPasswordInput')?.focus(), 200);
}

function hidePasswordModal() {
  document.getElementById('passwordModal').classList.remove('show');
}

function setPasswordModalError(msg) {
  const el = document.getElementById('passwordModalError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? '' : 'none';
}

function submitChangePassword() {
  const current = document.getElementById('currentPasswordInput').value;
  const next = document.getElementById('newPasswordInput').value;
  const confirm = document.getElementById('confirmPasswordInput').value;
  const btn = document.getElementById('passwordModalOk');
  if (!current) { setPasswordModalError('请输入当前密码'); return; }
  if (!next) { setPasswordModalError('请输入新密码'); return; }
  if (next.length < 6) { setPasswordModalError('新密码至少需要 6 位'); return; }
  if (next !== confirm) { setPasswordModalError('两次输入的新密码不一致'); return; }
  if (!currentUser || !currentUser.email) {
    setPasswordModalError('请先登录后再修改密码');
    return;
  }
  setPasswordModalError('');
  if (btn) { btn.disabled = true; btn.textContent = '修改中…'; }
  const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, current);
  currentUser.reauthenticateWithCredential(credential)
    .then(() => currentUser.updatePassword(next))
    .then(() => {
      hidePasswordModal();
      popup('密码已修改', '#06d6a0', 'edit', true);
    })
    .catch(err => {
      console.warn('修改密码失败', err);
      setPasswordModalError(authErrorText(err));
    })
    .finally(() => {
      if (btn) { btn.disabled = false; btn.textContent = '确认修改'; }
    });
}

function logoutApp() {
  if (!firebaseReady) return;
  tearDownCloud();
  KEY = null;
  SORT_KEY = null;
  VIBRATION_KEY = null;
  state = defaultState();
  lastDisplayedScore = null;
  showAuthView();
  firebase.auth().signOut().catch(err => console.warn('退出登录失败', err));
}

function onAuthChanged(user) {
  currentUser = user || null;
  if (user) {
    storageKeysForUser(user.uid);
    clearAuthMessages();
    hideAuthView();
    startApp();
  } else {
    tearDownCloud();
    KEY = null;
    SORT_KEY = null;
    VIBRATION_KEY = null;
    state = defaultState();
    lastDisplayedScore = null;
    if (passwordResetCodeFromUrl) {
      const code = passwordResetCodeFromUrl;
      passwordResetCodeFromUrl = null;
      showAuthShell();
      showResetPasswordPanel('', code);
      setAuthSuccess('已从邮件链接获取验证码，请设置新密码');
    } else {
      showAuthView();
    }
  }
}

function initFirebase() {
  if (firebaseConfig.databaseURL) {
    try {
      firebase.initializeApp(firebaseConfig);
      firebaseReady = true;
    } catch (e) {
      console.warn(e);
      firebaseReady = false;
    }
  } else {
    firebaseReady = false;
  }

  if (firebaseReady) {
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION)
      .catch(err => console.warn('设置登录持久化失败', err))
      .finally(() => {
        firebase.auth().onAuthStateChanged(onAuthChanged);
      });
  } else {
    showAuthView();
    setAuthError('云服务未配置，无法登录');
  }
}

initFirebase();
