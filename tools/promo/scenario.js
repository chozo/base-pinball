// 野球ピンボールの告知動画の台本（縦型 1080×1920・約30秒）
// 本編は実際の物理のまま、__game.bot（球が近づいたらフリッパーを打つ自動操作）で遊ばせる。
// 種 173 は「二塁打（3.6秒）… 二塁打 → ヒット → 3ランホームラン → ホームラン（61〜65秒）」になる展開（ゲームの乱数は __game.seed で固定）。
// 間の約55秒は撮らずに飛ばす。
// 最初の場面と満塁ホームランは、ボールの置き場所だけ決めて、あとは物理とフリッパーの自動操作に任せる
// （置き場所は、フリッパーで弾いてそのターゲットに当たるものを探して選んだ）。
// 自動操作の区間は、1コマあたりのゲーム時間が 1/60 秒の倍数になる速さ（0.5・1・2倍）だけを使う（物理の刻みを変えないため）

export const config = {
  slug: 'base-pinball',
  url: 'https://game.chozo.net/base-pinball', // エンドカードで1行に収まるよう末尾の / なし
  orientation: 'portrait',
  game: { width: 390, height: 693 },
  music: false, // ゲームの BGM（球審ジャッジと同じ応援曲）を使う
};

const PLAY_SEED = 173;
const HIT_FX = {
  single: ['ヒット！', '#93c5fd'],
  double: ['ツーベース！', '#86efac'],
  triple: ['スリーベース！', '#fcd34d'],
  hr: ['ホームラン！！', '#fca5a5'],
};

export default async function scenario(p) {
  let hrCount = 0, quiet = false; // quiet の間はゲームの出来事に合わせた演出を出さない
  p.on('hit', (e) => {
    if (quiet) return;
    if (e.result === 'hr' && hrCount === 1) { // 2本目は字幕だけにする（文字を重ねない）
      hrCount++; p.flash({ strength: 0.7 }); p.shake(14, 0.4);
      p.caption('2打席連続\nホームラン！', { y: 0.16, size: 56, dur: 2.0 });
      p.fx(`+${e.runs}点`, { y: 0.45, size: 60, color: '#ffffff', dur: 1.0, rot: 4 });
      return;
    }
    const [text, color] = HIT_FX[e.result];
    p.fx(text, { y: 0.36, size: 62, color, dur: 1.1 });
    if (e.runs > 0) p.fx(`+${e.runs}点`, { y: 0.47, size: 60, color: '#ffffff', dur: 1.0, rot: 4 });
    if (e.result === 'hr') { hrCount++; p.flash({ strength: 0.7 }); p.shake(14, 0.4); }
    else if (e.result === 'triple') p.shake(8, 0.25);
  });
  const flipped = (s) => s.flippers.some((f) => f.pressed);
  const hitNow = (s, ev) => ev.some((e) => e.type === 'hit');
  // ボールを置いて、自動操作のフリッパーで弾かせる
  async function setShot(x, y, vx) {
    await p.call('bot', false);
    await p.call('bot', true, 1);
    await p.eval((_, win) => { for (const k of win.__game.circles) k.cool = 0; });
    await p.call('placeBall', x, y, vx, 0, 'field');
  }

  // ---- 0〜3秒 つかみ: 落ちてきたボールをフリッパーで弾く ----
  await p.call('seed', 3);
  await p.call('start');
  await p.skip(0.7);
  await p.call('clearTimers');
  await setShot(150, 470, 120); // → 左フリッパーで弾いてスリーベースに当たる
  await p.call('audio.resync');
  p.zoom(1.4, 0.01, { x: 0.5, y: 0.8 });
  await p.until(flipped, { max: 1.5 });
  p.fx('パシッ！', { x: 0.36, y: 0.6, size: 60, color: '#ffffff', dur: 0.7 });
  p.zoom(1, 0.5, { x: 0.5, y: 0.5 });
  await p.until(hitNow, { max: 2 });
  quiet = true; // 跳ね返ったボールがほかのターゲットに当たっても文字を重ねない
  await p.wait(1.0);
  await p.call('bot', false);
  await p.call('placeBall', 365, 170, 0, 0, 'none'); // タイトルの間はボールを止める
  await p.call('clearTimers');

  // ---- 3〜6.5秒 タイトル ----
  p.title({ title: '野球\nピンボール', sub: 'ピンボールで\n打って、走って、点を取る！', dur: 3.4 });
  await p.wait(3.6);
  quiet = false;

  // ---- 6.5〜20秒 実際のプレイ ----
  await p.call('seed', PLAY_SEED);
  await p.call('start');
  await p.call('bot', true, PLAY_SEED);
  await p.call('audio.resync');
  p.caption('ターゲットに当てて\n塁に出よう！', { y: 0.16, dur: 2.6 });
  await p.until((s) => s.time >= 4.6, { max: 6 });           // 二塁打まで
  // 間は切る（飛ばしている間の出来事に演出を付けない）
  p.flash({ strength: 0.5, dur: 0.2 });
  quiet = true;
  await p.skip(59.5 - (await p.state()).time);
  quiet = false;
  await p.call('audio.resync');
  p.caption('長打で走者を\nかえせ！', { y: 0.16, dur: 2.2 });
  await p.until((s) => s.time >= 63.2, { max: 5 });          // 二塁打 → ヒット
  // 1本目のホームランをスローで
  p.zoom(1.3, 0.3, { x: 0.5, y: 0.25 });
  p.speed(0.5);
  await p.until(() => hrCount >= 1, { max: 4 });
  await p.wait(0.4);
  p.speed(1); p.zoom(1, 0.3);
  await p.until(() => hrCount >= 2, { max: 4 });
  quiet = true;
  await p.wait(2.2);

  // ---- 20〜26秒 クライマックス: 満塁ホームラン ----
  p.flash({ strength: 0.5, dur: 0.2 });
  await p.call('setBases', [true, true, true]);
  await setShot(220, 520, 0); // → 右フリッパーで弾いて HR ポケットに入る
  p.caption('満塁のチャンス！', { y: 0.16, size: 54, dur: 1.4 });
  await p.until(flipped, { max: 1 });
  p.zoom(1.3, 0.35, { x: 0.5, y: 0.25 });
  p.speed(0.5);
  await p.until(hitNow, { max: 3 });
  p.fx('満塁ホームラン！', { y: 0.32, size: 56, color: '#fde047', dur: 1.8 });
  p.fx('+4点', { y: 0.45, size: 64, color: '#ffffff', dur: 1.6, rot: 4 });
  p.flash(); p.shake(16, 0.45);
  await p.wait(0.8);
  p.speed(1); p.zoom(1, 0.4);
  await p.wait(1.4);

  // ---- 26〜28秒 問いかけ ----
  const s = await p.state();
  console.log(`  本編の得点: ${s.score}点`);
  p.caption('3アウトまでに\n何点取れる？', { y: 0.16, size: 52, dur: 2.6 });
  await p.wait(2.8);

  // ---- 28〜31秒 エンドカード ----
  await p.call('bot', false);
  p.endCard({ title: '⚾\n野球\nピンボール', sub: 'スマホでもPCでも', cta: '今すぐ遊べる！' });
  await p.wait(4.0);
}
