#!/usr/bin/env node
/**
 * 将 package.json 中的 version 同步到各静态资源文件。
 * 发版：npm version patch|minor|major（会自动执行本脚本）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

if (!version || typeof version !== 'string') {
  console.error('package.json 缺少有效的 version 字段');
  process.exit(1);
}

function updateFile(relPath, transform) {
  const filePath = path.join(root, relPath);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.warn(`未改动: ${relPath}`);
    return;
  }
  fs.writeFileSync(filePath, after);
  console.log(`已更新: ${relPath}`);
}

updateFile('data.js', content =>
  content.replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${version}';`)
);

updateFile('sw.js', content =>
  content.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${version}';`)
);

updateFile('index.html', content =>
  content.replace(/\?v=[^"']+/g, `?v=${version}`)
);

console.log(`版本已同步为 ${version}`);
