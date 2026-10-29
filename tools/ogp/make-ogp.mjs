// OGP画像（public/ogp.png, 1200×630）を作る
// 使い方: node tools/ogp/make-ogp.mjs   （playwright-core が見つからない場合は PLAYWRIGHT_CORE=<フォルダ>）
// 1) ゲームを確認用の入口（window.__game）で進め、得点が入って走者がいる場面を撮る
// 2) その画面を背景・タイトル・遊び方・公開URLと重ねて撮る。乱数の種を固定しているので毎回同じ絵になる
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(root, 'public', 'ogp.png');
const URL_TEXT = 'game.chozo.net/base-pinball';

const browser = await pw.chromium.launch({ executablePath: CHROME, headless: true });

// ---- 1. ゲーム画面 ----
const game = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
await game.goto(pathToFileURL(path.join(root, 'index.html')).href);
await game.evaluate(() => {
  const g = __game;
  g.seed(7); g.manual(true); g.start(); g.step(0.5); g.clearTimers();
  // ターゲットに順に当てて得点を入れる（e2e と同じ当て方）
  const hit = (type, bases) => {
    const c = g.circles.find(k => k.type === type);
    g.placeBall(365, 170, 0, 0, 'none'); g.step(0.7);
    if (bases) g.setBases(bases);
    for (const k of g.circles) k.cool = 0;
    if (type === 'triple') g.placeBall(c.x, c.y - c.r - 22, 0, 150, 'field');
    else g.placeBall(c.x, c.y + c.r + 40, 0, -700, 'field');
    g.step(0.12, 1 / 120);
  };
  hit('hr', [true, true, true]);     // 満塁ホームラン 4点
  hit('double', [true, true, true]); // 2点
  hit('triple', [true, true, false]);// 2点
  hit('hr', [true, false, true]);    // 3点 → 計11点
  g.placeBall(365, 170, 0, 0, 'none'); g.step(1.2);  // 走者の動きと文字の点滅を落ち着かせる
  g.setBases([true, true, false]);
  // バンパーの近くを飛ぶボール
  g.placeBall(232, 300, 260, -520, 'field'); g.step(0.05, 1 / 120);
  g.clearTimers();
});
await game.waitForTimeout(100);
const shot = await game.locator('#app').screenshot();
const st = await game.evaluate(() => __game.state());
console.log(`場面: ${st.score}点・塁 ${st.bases}・ボール (${Math.round(st.ball.x)}, ${Math.round(st.ball.y)})`);
await game.close();

// ---- 2. 合成 ----
const img = `data:image/png;base64,${shot.toString('base64')}`;
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;color:#fff;
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 60px, transparent 60px 120px),
    radial-gradient(ellipse at 30% 40%, #1f6b3f 0%, #12452a 55%, #0b1f14 100%);}
.diamond{position:absolute;left:-120px;top:150px;width:620px;height:620px;transform:rotate(45deg);border:6px solid rgba(255,255,255,.10);border-radius:8px}
.dirt{position:absolute;left:-60px;top:210px;width:500px;height:500px;transform:rotate(45deg);background:rgba(160,110,60,.10);border-radius:10px}
.text{position:absolute;left:72px;top:40px;width:660px}
.badge{display:inline-block;font-size:24px;font-weight:800;color:#0b1f14;background:#facc15;border-radius:999px;padding:6px 20px;letter-spacing:.04em}
h1{font-size:104px;font-weight:900;line-height:1.02;margin-top:18px;letter-spacing:.02em;
  text-shadow:0 6px 0 #0a2a17, 0 10px 30px rgba(0,0,0,.5)}
h1 .y{color:#facc15}
.lead{font-size:36px;font-weight:800;margin-top:18px;line-height:1.3;text-shadow:0 3px 10px rgba(0,0,0,.5)}
.chips{display:flex;gap:12px;margin-top:20px;align-items:center}
.chip{font-size:30px;font-weight:900;padding:6px 20px;border-radius:999px;box-shadow:0 4px 0 rgba(0,0,0,.35)}
.sub{font-size:28px;font-weight:700;color:#d9f2e0;margin-top:6px}
.url{position:absolute;left:72px;bottom:30px;font-size:30px;font-weight:800;color:#fff;background:rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.35);
  border-radius:14px;padding:8px 20px;letter-spacing:.02em}
.phone{position:absolute;right:70px;top:24px;height:582px;transform:rotate(4deg);border-radius:26px;border:6px solid #e8efe9;
  box-shadow:0 20px 50px rgba(0,0,0,.55);background:#0b1f14;overflow:hidden}
.phone img{display:block;height:570px}
.ball{position:absolute;left:340px;top:96px;width:150px;height:150px;transform:rotate(-20deg);filter:drop-shadow(0 12px 18px rgba(0,0,0,.5))}
</style></head><body>
<div class="dirt"></div><div class="diamond"></div>
<div class="phone"><img src="${img}"></div>
<svg class="ball" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#fbfbf7" stroke="#cfcfc4" stroke-width="2"/>
  <path d="M14 10q11 22 0 44M50 10q-11 22 0 44" fill="none" stroke="#e11d48" stroke-width="2.6"/>
  <g stroke="#e11d48" stroke-width="2" stroke-linecap="round">
    ${[16, 22, 28, 34, 40, 46].map(y => { const dx = 2.2 * Math.sin((y - 10) / 44 * Math.PI) * 4.2; return `<path d="M${14 + dx} ${y}l4 -1.5M${14 + dx} ${y}l4 1.5M${50 - dx} ${y}l-4 -1.5M${50 - dx} ${y}l-4 1.5"/>`; }).join('')}
  </g></svg>
<div class="text">
  <span class="badge">ブラウザで遊べるミニゲーム</span>
  <h1>野球<br><span class="y">ピンボール</span></h1>
  <p class="lead">打って、走って、点を取る！</p>
  <p class="sub">3アウトまでに何点取れるか</p>
  <div class="chips">
    <span class="chip" style="background:#3b82f6">ヒット</span>
    <span class="chip" style="background:#16a34a">2B</span>
    <span class="chip" style="background:#f59e0b">3B</span>
    <span class="chip" style="background:#ef4444">HR</span>
  </div>
</div>
<div class="url">${URL_TEXT}</div>
</body></html>`;
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });
await browser.close();
console.log(`書き出し: ${OUT}`);
