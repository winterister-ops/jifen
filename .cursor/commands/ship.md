# Ship

把当前改动提交、推送到 GitHub，并部署到 Firebase Hosting。

执行以下步骤：

1. 先看 `git status` 和 `git diff`，确认本次改动内容。
2. 如改了 `.js` / `.html` / `.css`，先跑 `npm test`（系统 Chrome）。仅改 README / 许可 / 注释可跳过并说明。
3. 用 `npm version patch --no-git-tag-version` 升一个 patch 版本（会自动同步 `data.js`、`sw.js`、`index.html`），让 PWA 缓存刷新。
4. `git add -A`，用简洁的中文/英文 commit message 提交，message 末尾带上新版本号，例如 `(0.0.84)`。
5. `git push origin main`。
6. `npx -y firebase-tools@latest deploy --only hosting --non-interactive` 部署到 Firebase Hosting。
7. 最后用中文简要说明：版本号、commit、Hosting URL。
