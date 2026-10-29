// 野球ピンボールの自動確認（playwright-core + インストール済み Chrome）
// 使い方: node tools/e2e.mjs
//   playwright-core が見つからない場合は PLAYWRIGHT_CORE=<playwright-core のフォルダ> を指定する
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'index.html')).href;
const shots = process.env.SHOTS || path.join(here, '..', 'shots');
fs.mkdirSync(shots, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let fails = 0;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'NG  '} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await pw.chromium.launch({ executablePath: CHROME, headless: true });
async function openPage(vp = { width: 420, height: 860 }, opts = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url);
  return { page, ctx, errors };
}

// ---- 0. 独立実装で進塁ルールを全通り検算 ----
function refAdvance(bases, type) {
  // 走者を「何塁にいるか」の数値で持ち、進む数だけ足す別実装
  const n = { single: 1, double: 2, triple: 3, hr: 4 }[type];
  const runners = [1, 2, 3].filter((b, i) => bases[i]);
  let runs = 0; const out = [false, false, false];
  const move = type === 'triple' || type === 'hr' ? 4 : n; // 三塁打・本塁打は走者全員が生還
  for (const r of runners) { const to = r + move; if (to >= 4) runs++; else out[to - 1] = true; }
  if (n >= 4) runs++; else out[n - 1] = true;
  return { bases: out, runs };
}

{
  const { page, ctx, errors } = await openPage();
  // ---- 進塁ルール：全 8 通りの塁状況 × 4 種類 ----
  const all = await page.evaluate(() => {
    const out = [];
    for (let m = 0; m < 8; m++) for (const t of ['single', 'double', 'triple', 'hr']) {
      const b = [!!(m & 1), !!(m & 2), !!(m & 4)];
      out.push({ b, t, r: window.__game.advance(b, t) });
    }
    return out;
  });
  const bad = all.filter(x => { const e = refAdvance(x.b, x.t); return e.runs !== x.r.runs || e.bases.join() !== x.r.bases.join(); });
  check('進塁ルール：32通りを別実装と照合', bad.length === 0, bad.length ? JSON.stringify(bad[0]) : '32/32 一致');

  // ---- 1&2. 物理で当てて → 打撃結果 → 進塁 → 得点 まで ----
  await page.evaluate(() => { __game.seed(1); __game.manual(true); __game.start(); __game.step(0.5); __game.clearTimers(); });
  async function shoot(type, bases) {
    return page.evaluate(([type, bases]) => {
      const g = __game, c = g.circles.find(c => c.type === type);
      g.placeBall(365, 170, 0, 0, 'none'); g.step(0.7); // 打撃どうしの最短間隔（resultGap）を空ける
      g.setBases(bases); g.drainEvents();
      for (const k of g.circles) k.cool = 0;
      const before = g.state().score;
            // 3B は下にひさしがあるので上から落とす。ほかは真下から打ち上げる
      if (type === 'triple') g.placeBall(c.x, c.y - c.r - 22, 0, 150, 'field');
      else g.placeBall(c.x, c.y + c.r + 40, 0, -700, 'field');
      g.step(0.12, 1 / 120);
      const ev = g.drainEvents().filter(e => e.kind === 'hit');
      const s = g.state();
      return { ev, before, after: s.score, bases: s.bases, hud: s.hud, last: s.last };
    }, [type, bases]);
  }
  let r = await shoot('single', [false, false, true]);
  check('連鎖：三塁走者ありでヒットに当てる → 1点', r.ev.length === 1 && r.ev[0].result === 'single' && r.after - r.before === 1 && r.bases.join() === 'true,false,false' && r.hud.score === String(r.after),
    `打撃=${r.ev.map(e => e.result)} 得点+${r.after - r.before} 塁=${r.bases} HUD得点=${r.hud.score} 直近=${r.hud.last}`);
  r = await shoot('single', [true, false, false]);
  check('一塁走者ありでヒット → 一・二塁、得点なし', r.ev[0]?.result === 'single' && r.after === r.before && r.bases.join() === 'true,true,false', `塁=${r.bases} 得点+${r.after - r.before}`);
  r = await shoot('double', [true, false, false]);
  check('一塁走者ありで二塁打 → 二・三塁、得点なし', r.ev[0]?.result === 'double' && r.after === r.before && r.bases.join() === 'false,true,true', `塁=${r.bases} 得点+${r.after - r.before}`);
  r = await shoot('double', [true, true, true]);
  check('満塁で二塁打 → 2点、二・三塁', r.ev[0]?.result === 'double' && r.after - r.before === 2 && r.bases.join() === 'false,true,true', `塁=${r.bases} 得点+${r.after - r.before}`);
  r = await shoot('triple', [true, true, false]);
  check('一・二塁で三塁打 → 2点、三塁', r.ev[0]?.result === 'triple' && r.after - r.before === 2 && r.bases.join() === 'false,false,true', `塁=${r.bases} 得点+${r.after - r.before}`);
  r = await shoot('hr', [true, true, true]);
  check('満塁で本塁打 → 4点（グランドスラム）、塁は空', r.ev[0]?.result === 'hr' && r.after - r.before === 4 && r.bases.join() === 'false,false,false', `塁=${r.bases} 得点+${r.after - r.before} HUD直近=${r.hud.last}`);
  await page.evaluate(() => { __game.placeBall(365, 170, 0, 0, 'none'); __game.step(0.7); __game.setBases([true, true, true]); __game.drainEvents(); for (const k of __game.circles) k.cool = 0;
    const c = __game.circles.find(c => c.type === 'hr'); __game.placeBall(c.x, c.y + c.r + 40, 0, -700, 'field'); __game.step(0.1, 1 / 120); });
  await page.screenshot({ path: path.join(shots, 'grandslam.png') });
  const hudBases = await page.evaluate(() => { __game.setBases([true, false, true]); return __game.state().hud.bases; });
  check('ダイヤモンド表示が塁の状態と一致', hudBases.join() === 'true,false,true', `HUD=${hudBases}`);

  // ---- 3. アウトと終了：3回落とす ----
  const outs = await page.evaluate(() => {
    const g = __game, log = [];
    g.start(); g.step(0.5);
    for (let i = 0; i < 3; i++) {
      g.clearTimers();
      g.placeBall(185, 660, 0, 300, 'field');
      g.step(0.5);
      const s = g.state(); log.push({ outs: s.outs, hudOut: s.hud.outText, dots: s.hud.dots, last: s.last });
      if (i < 2) g.step(1.5); // 次のボールが自動で再セットされる
      else g.step(2.0);
    }
    const s = g.state();
    return { log, phase: s.phase, final: document.getElementById('finalScore').textContent,
      overlayShown: !document.getElementById('overlay').classList.contains('hide') && !document.getElementById('resultCard').hidden,
      breakdown: document.getElementById('breakdown').innerText };
  });
  check('落下ごとにアウトが1つずつ増え、表示も更新', outs.log.map(l => l.outs).join() === '1,2,3' && outs.log[0].hudOut === 'あと2アウト' && outs.log[2].dots === 3,
    outs.log.map(l => `${l.outs}アウト/${l.hudOut}/直近=${l.last}`).join(' → '));
  check('3アウトで試合終了・最終スコアと内訳を表示', outs.phase === 'over' && outs.overlayShown && /点/.test(outs.final) && /本塁打/.test(outs.breakdown),
    `${outs.final} / ${outs.breakdown.replace(/\s+/g, ' ')}`);
  await page.screenshot({ path: path.join(shots, 'result.png') });

  // ---- 7. リスタート ----
  await page.evaluate(() => { __game.setBases([true, true, false]); });
  await page.click('#restartBtn');
  const rs = await page.evaluate(() => __game.state());
  check('リスタートでスコア・アウト・走者・内訳が初期化', rs.phase === 'play' && rs.score === 0 && rs.outs === 0 && rs.bases.every(b => !b) &&
    Object.values(rs.counts).every(v => v === 0) && rs.hud.score === '0' && rs.hud.dots === 0 && rs.hud.bases.every(b => !b) && rs.hud.outText === 'あと3アウト' && rs.last === '—',
    `score=${rs.score} outs=${rs.outs} bases=${rs.bases} counts=${JSON.stringify(rs.counts)} HUD=${rs.hud.outText}`);

  // ---- 8. 出現・レーン落下・勝手に命中しない ----
  const spawn = await page.evaluate(() => {
    const g = __game; g.manual(true); g.start(); g.drainEvents();
    const path = [];
    let spawned = null;
    for (let i = 0; i < 120; i++) { // 2秒間を 1/60 秒ずつ
      g.step(1 / 60);
      const s = g.state();
      if (s.ball.state !== 'none') { path.push([s.ball.x, s.ball.y]); if (!spawned) spawned = [s.ball.x, s.ball.y]; }
    }
    const ev = g.drainEvents();
    return { path, spawned, hits: ev.filter(e => e.kind === 'hit').length, spawnEv: ev.find(e => e.kind === 'spawn'), onPlunger: g.state() };
  });
  const p = spawn.path;
  const inLane = p.every(([x, y]) => x > 350 + 9 - 0.5 && x < 380 - 9 + 0.5 && y > 20 + 9 && y < 700);
  const monotonic = p.slice(1, 25).every(([, y], i) => y >= p[i][1] - 0.01);
  const fallDist = p.length ? Math.max(...p.map(q => q[1])) - spawn.spawnEv.y : 0;
  check('出現位置が盤面の壁の内側（発射レーン内）', spawn.spawnEv && spawn.spawnEv.x > 359 && spawn.spawnEv.x < 371 && spawn.spawnEv.y > 29 && spawn.spawnEv.y < 691,
    `出現=(${spawn.spawnEv?.x},${spawn.spawnEv?.y}) レーンx=350〜380 天井y=20`);
  check('出現後、レーン内を目に見えて落ちてプランジャーで止まる', inLane && monotonic && fallDist > 450 && spawn.onPlunger.ball.y > 660,
    `落下距離=${fallDist.toFixed(0)}px 最終y=${spawn.onPlunger.ball.y.toFixed(1)} 全点レーン内=${inLane}`);
  check('出現直後の落下でターゲットに命中しない', spawn.hits === 0, `命中=${spawn.hits}`);
  // 落下途中の画面を撮る（実際に描画されているか）
  await page.evaluate(() => { const g = __game; g.start(); g.step(0.3 + 0.2); });
  await page.screenshot({ path: path.join(shots, 'spawn-falling.png') });
  // ボールの位置の画素が白いか（盤面の中に見えているか）
  const visible = await page.evaluate(() => {
    const g = __game, s = g.state(), cv = document.getElementById('cv');
    const r = cv.getBoundingClientRect(), k = cv.width / 400;
    const px = cv.getContext('2d').getImageData(Math.round(s.ball.x * k), Math.round(s.ball.y * k), 1, 1).data;
    return { y: s.ball.y, px: [...px], cssBox: [r.left, r.top, r.width, r.height] };
  });
  check('落下中のボールが盤面に描画されている（画素が白）', visible.px[0] > 200 && visible.px[1] > 200 && visible.px[2] > 200, `y=${visible.y.toFixed(0)} 画素=${visible.px}`);

  // フリッパー先端の間隔
  const gap = await page.evaluate(() => {
    const g = __game, C = g.CFG, res = {};
    for (const mode of ['rest', 'up']) {
      const [L, R] = g.flippers.map(f => { const a = f[mode]; return [f.px + Math.cos(a) * C.flipLen, f.py + Math.sin(a) * C.flipLen]; });
      res[mode] = Math.hypot(L[0] - R[0], L[1] - R[1]) - 2 * C.flipR1;
    }
    res.dia = 2 * C.ballR; return res;
  });
  check('フリッパー先端どうしの隙間がボール直径より十分広い（1.4倍以上）', gap.rest >= 1.4 * gap.dia && gap.up >= 1.4 * gap.dia, `静止時=${gap.rest.toFixed(1)}px 上げ時=${gap.up.toFixed(1)}px 直径=${gap.dia}px`);
  // 中央付近にボールを落として、挟まらずに落ちるか（フリッパー状態 4 通り × 横位置 15 通り）
  const trap = await page.evaluate(() => {
    const g = __game, out = [];
    for (const [l, r] of [[0, 0], [1, 1], [1, 0], [0, 1]]) for (let x = 150; x <= 220; x += 5) {
      g.start(); g.step(0.1); g.clearTimers(); g.press('L', !!l); g.press('R', !!r); g.step(0.2);
      g.placeBall(x, 540, 0, 0, 'field'); g.drainEvents();
      let t = 0, done = false;
      while (t < 6 && !done) { g.step(0.05); t += 0.05; const s = g.state(); if (s.outs > 0) done = 'drain'; }
      const s = g.state();
      out.push({ l, r, x, res: done || 'still', y: s.ball.y, nudges: s.stats.nudges, t });
      g.press('L', false); g.press('R', false);
    }
    return out;
  });
  // フリッパーを両方上げたまま→上に乗る（キャッチ）のは正常操作。押していない時は必ず落ちること
  const restCases = trap.filter(t => !t.l && !t.r);
  const stuck = trap.filter(t => t.res === 'still' && !(t.l || t.r));
  const heldStill = trap.filter(t => t.res === 'still' && (t.l || t.r));
  check('中央付近に落としたボールがフリッパー先端に挟まらない', stuck.length === 0 && restCases.every(t => t.nudges === 0),
    `押さない時 ${restCases.filter(t => t.res === 'drain').length}/${restCases.length} が落下（平均${(restCases.reduce((a, t) => a + t.t, 0) / restCases.length).toFixed(2)}秒）、片方/両方を押したまま ${trap.length - restCases.length - heldStill.length}/${trap.length - restCases.length} が落下、残りはフリッパー上に保持`);

  check('ページの JavaScript エラーなし', errors.length === 0, errors.join(' / '));
  await ctx.close();
}

// ---- 4 & 5. 無操作 / フリッパー連打で多数試合 ----
async function simulate(mode, games) {
  const { page, ctx } = await openPage();
  const res = await page.evaluate(([mode, games]) => {
    const g = __game, out = [];
    g.manual(true);
    for (let s = 0; s < games; s++) {
      g.seed(1000 + s); g.start();
      let t = 0, phase = 0, minX = 1e9, maxX = -1e9, minY = 1e9;
      let rs = (s * 2654435761) >>> 0; const r = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 4294967296);
      let hold = 0;
      let holdL = 0, holdR = 0;
      while (g.state().phase === 'play' && t < 900) {
        const st = g.state(), bl = st.ball; phase++;
        // 発射：無操作以外は、適当な長さで押しては離す（試合ごとに違う長さ）
        if (mode !== 'idle' && bl.state === 'lane') { if (!st.charging) { g.chargeStart(); hold = r() * 1.2; } else if ((hold -= 0.04) <= 0) g.chargeRelease(); }
        // 連打：0.08秒ごとに 左だけ→両方→右だけ→両方… を休まず続ける（毎秒約12回）
        if (mode === 'mash') { const k = Math.floor(phase / 2) % 4; g.press('L', k === 0 || k === 2); g.press('R', k === 1 || k === 2); }
        // 比較用：球がフリッパーに近づいたら打つ（8割の確率で反応、0.2秒で離す）
        if (mode === 'skill') {
          const nearL = bl.x < 185 && bl.x > 90 && bl.y > 560 && bl.y < 640, nearR = bl.x >= 185 && bl.x < 280 && bl.y > 560 && bl.y < 640;
          if (nearL && holdL <= 0 && r() < 0.8) holdL = 0.2; if (nearR && holdR <= 0 && r() < 0.8) holdR = 0.2;
          holdL -= 0.04; holdR -= 0.04; g.press('L', holdL > 0); g.press('R', holdR > 0);
        }
        g.step(0.04, 1 / 60); t += 0.04;
        const b = g.state().ball;
        if (b.state !== 'none') { minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); minY = Math.min(minY, b.y); }
      }
      g.press('L', false); g.press('R', false);
      const st = g.state();
      out.push({ score: st.score, phase: st.phase, t: +t.toFixed(1), counts: st.counts, stats: st.stats, minX, maxX, minY });
    }
    return out;
  }, [mode, games]);
  await ctx.close();
  return res;
}
function summarize(list) {
  const sc = list.map(r => r.score).sort((a, b) => a - b);
  const sum = k => list.reduce((a, r) => a + r.counts[k], 0);
  return {
    avg: (sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(2), median: sc[Math.floor(sc.length / 2)], max: sc[sc.length - 1],
    ended: list.filter(r => r.phase === 'over').length, n: list.length,
    avgTime: (list.reduce((a, r) => a + r.t, 0) / list.length).toFixed(1), maxTime: Math.max(...list.map(r => r.t)),
    escapes: list.reduce((a, r) => a + r.stats.escapes, 0), nudges: list.reduce((a, r) => a + r.stats.nudges, 0),
    auto: list.reduce((a, r) => a + r.stats.autoLaunches, 0),
    hits: { single: sum('single'), double: sum('double'), triple: sum('triple'), hr: sum('hr') },
    bounds: [Math.min(...list.map(r => r.minX)).toFixed(1), Math.max(...list.map(r => r.maxX)).toFixed(1), Math.min(...list.map(r => r.minY)).toFixed(1)],
  };
}
const N = +(process.env.GAMES || 40);
const idle = summarize(await simulate('idle', N));
check('無操作：全試合が3アウトで終わる（自動発射→落下）', idle.ended === idle.n && idle.auto >= 3 * idle.n,
  `${idle.ended}/${idle.n}試合終了 平均${idle.avgTime}秒 自動発射${idle.auto}回`);
check('無操作：勝手に高得点にならない', +idle.avg <= 2 && idle.max <= 6,
  `平均${idle.avg}点 中央値${idle.median} 最高${idle.max} 打撃内訳=${JSON.stringify(idle.hits)}`);
const mash = summarize(await simulate('mash', N));
check('連打：ボールが盤外に消えない', mash.escapes === 0 && idle.escapes === 0,
  `脱出${mash.escapes}回 ボールの到達範囲 x=${mash.bounds[0]}〜${mash.bounds[1]} 最上部y=${mash.bounds[2]}（壁は x=20〜380, y=20）`);
const skill = summarize(await simulate('skill', N));
check('連打：それだけで勝てない（試合は必ず終わり、狙って打つ方が明らかに有利）', mash.ended === mash.n && +mash.avg < +skill.avg * 0.5 && skill.escapes === 0,
  `連打 ${mash.ended}/${mash.n}試合終了 平均${mash.avg}点（最高${mash.max}）平均${mash.avgTime}秒 打撃内訳=${JSON.stringify(mash.hits)} 詰まり救済${mash.nudges}回 ／ 狙い打ち 平均${skill.avg}点（最高${skill.max}）平均${skill.avgTime}秒 打撃内訳=${JSON.stringify(skill.hits)}`);

// ---- 6. スマホ幅 ----
for (const vp of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  const { page, ctx, errors } = await openPage(vp, vp.width < 800 ? { isMobile: true, hasTouch: true } : {});
  await page.click('#startBtn');
  await page.waitForTimeout(300);
  const boxes = await page.evaluate(() => {
    const ids = ['score', 'outDots', 'outText', 'diamondSvg', 'last', 'cv', 'btnL', 'btnLaunch', 'btnR', 'status'];
    return Object.fromEntries(ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [id, [r.left, r.top, r.right, r.bottom]]; }));
  });
  const outside = Object.entries(boxes).filter(([, [l, t, r, b]]) => l < -0.5 || t < -0.5 || r > vp.width + 0.5 || b > vp.height + 0.5 || r - l < 1);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  const cvW = boxes.cv[2] - boxes.cv[0];
  check(`画面 ${vp.width}×${vp.height}：HUD・盤面・ボタンが切れずに収まる`, outside.length === 0 && scrollW <= vp.width && errors.length === 0,
    outside.length ? '外: ' + outside.map(o => o[0]).join(',') : `盤面 ${cvW.toFixed(0)}×${(boxes.cv[3] - boxes.cv[1]).toFixed(0)}px、ボタン高さ ${(boxes.btnL[3] - boxes.btnL[1]).toFixed(0)}px`);
  // タッチでフリッパーが動くか（スマホ幅のみ）
  if (vp.width < 800) {
    const c = boxes.btnL;
    await page.touchscreen.tap((c[0] + c[2]) / 2, (c[1] + c[3]) / 2).catch(() => {});
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, `vp-${vp.width}x${vp.height}.png`) });
  await ctx.close();
}

// ---- 実際のキー入力で1球プレイ（PC） ----
{
  const { page, ctx, errors } = await openPage({ width: 1280, height: 800 });
  await page.keyboard.press('Space'); // タイトルで Space → 開始
  await page.waitForFunction(() => { const b = __game.state().ball; return b.state === 'lane' && b.y > 665 && Math.abs(b.vy) < 1; }, null, { timeout: 15000 });
  const s0 = await page.evaluate(() => __game.state());
  await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
  await page.waitForFunction(() => __game.state().ball.y < 600, null, { timeout: 3000 }).catch(() => {});
  const s1 = await page.evaluate(() => __game.state());
  await page.keyboard.down('KeyZ'); await page.keyboard.down('Slash');
  const s2 = await page.evaluate(() => __game.state().flippers.map(f => f.pressed));
  await page.keyboard.up('KeyZ'); await page.keyboard.up('Slash');
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowRight');
  const s3 = await page.evaluate(() => __game.state().flippers.map(f => f.pressed));
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight');
  check('PCキー操作：Spaceで開始・長押し発射、Z / / と ← / → でフリッパー', s0.phase === 'play' && s0.ball.state === 'lane' && s1.stats.launches === 1 && s1.ball.y < 600 && s2.join() === 'true,true' && s3.join() === 'true,true' && errors.length === 0,
    `発射後のy=${s1.ball.y.toFixed(0)} Z,/=${s2} ←,→=${s3}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, 'pc-play.png') });
  await ctx.close();
}

// ---- 得点ごとの試合終了コメント（境目の点数） ----
{
  const { page, ctx } = await openPage();
  const want = [[0, '完封負け'], [1, '貧打、もっと頑張れ！'], [3, '貧打、もっと頑張れ！'], [4, '2桁得点を目指せ！'], [9, '2桁得点を目指せ！'],
    [10, '2桁！大量得点！'], [19, '2桁！大量得点！'], [20, '打線爆発！'], [29, '打線爆発！'], [30, '打線大爆発！'], [49, '打線大爆発！'],
    [50, '打線ビッグバン！！'], [69, '打線ビッグバン！！'], [70, '伝説の打線！'], [99, '伝説の打線！'], [100, 'AI打線'], [999, 'AI打線']];
  const bad = [];
  for (const [sc, w] of want) { const got = await page.evaluate(s => window.__game.scoreComment(s), sc); if (got !== w) bad.push(`${sc}:${got}`); }
  check('得点ごとの試合終了コメント（境目17か所）', bad.length === 0, bad.join(', '));
  await ctx.close();
}

// ---- BGM（試合中に流れる・消音ボタン・試合終了で止まる・もう一度で再開） ----
{
  const { page, ctx, errors } = await openPage();
  const bgm = () => page.evaluate(() => window.__game.bgmState());
  await page.click('#startBtn');
  await page.waitForFunction(() => window.__game.bgmState().playing, null, { timeout: 8000 });
  await page.waitForTimeout(900);
  const b1 = await bgm();
  await page.click('#mute'); await page.waitForTimeout(600);
  const b2 = await bgm();
  await page.click('#mute'); await page.waitForTimeout(600);
  const b3 = await bgm();
  await page.evaluate(() => {
    const g = __game; g.manual(true);
    for (let i = 0; i < 3; i++) { g.clearTimers(); g.placeBall(185, 660, 0, 300, 'field'); g.step(0.5); g.step(i < 2 ? 1.5 : 2.0); }
  });
  const b4 = await bgm();
  const phase = (await page.evaluate(() => __game.state())).phase;
  await page.click('#restartBtn');
  await page.waitForFunction(() => window.__game.bgmState().playing, null, { timeout: 4000 }).catch(() => {});
  const b5 = await bgm();
  check('BGM：試合開始で流れ、消音ボタンで消え、試合終了で止まり、もう一度で再開',
    b1.ready && Math.abs(b1.loop - 12.8) < 0.01 && Math.abs(b1.gain - 0.09) < 0.01 && b2.gain < 0.005 && Math.abs(b3.gain - 0.09) < 0.01 &&
    phase === 'over' && !b4.playing && b5.playing && errors.length === 0,
    `開始 ${b1.gain.toFixed(3)} / 消音 ${b2.gain.toFixed(4)} / 戻す ${b3.gain.toFixed(3)} / 終了後 ${b4.playing ? '再生中' : '停止'} / もう一度 ${b5.playing ? '再生中' : '停止'} / ループ ${b1.loop.toFixed(1)}秒 ${errors.join('|')}`);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify({ results, idle, mash, skill }, null, 2));
console.log(`\n${fails === 0 ? 'すべて OK' : fails + ' 件 NG'}（スクリーンショット: ${shots}）`);
process.exit(fails ? 1 : 0);
