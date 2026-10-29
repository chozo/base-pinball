// 公開用ファイルを dist/base-pinball/ に書き出す（index.html と public/ の中身）
// 使い方: node tools/build-dist.mjs
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'base-pinball');
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
console.log(fs.readdirSync(out).map(f => `dist/base-pinball/${f}`).join('\n'));
