# 野球ピンボール

ピンボールの物理アクションに、野球の出塁・進塁・得点ルールを組み合わせたブラウザゲームです。3アウトで1試合終了（時間制限なし）。

## 遊び方

公開版: https://game.chozo.net/base-pinball/

手元では `index.html` をブラウザで開くだけで遊べます（外部ライブラリなし・オフライン可）。favicon は `public/` にあるため、`index.html` を直接開いたときは表示されません。

| 操作 | PC | スマホ |
|---|---|---|
| 左フリッパー | `Z` / `←` | 左下のボタン（盤面の左半分タップでも可） |
| 右フリッパー | `/` / `→` | 右下のボタン（盤面の右半分タップでも可） |
| 発射 | `Space`（`↓` `Enter` も可）を長押し → 離す | 中央の「発射」を長押し → 離す |

- ターゲットに当てると打撃結果: ヒット（青×2）・2B 二塁打（緑×1、HRポケットの左隣）・3B 三塁打（橙×1、HRポケットの右隣の小さな的。下と右側をひさしで守っていて、上や左から回り込まないと当たらない）・HR 本塁打（赤×1、中央奥の屋根つきポケット内）
- 打撃結果・得点・アウトの知らせは、ボールが見やすいよう盤面の外（上のステータス行）に出します。塁上の走者と得点は、盤面中央のダイヤモンドにも表示します
- 走者がホームに帰ると1点。ボールを下中央に落とすと1アウト。3アウトで試合終了
- 発射しないまま8秒たつと自動で発射します

## 音

- 効果音と BGM は、すべて Web Audio で合成しています（音源ファイルなし）。
- BGM は「球審ジャッジ」（chozo）と同じ応援風の自作曲です（トランペット・太鼓・メガホン・観客のざわめき。後半は三三七拍子）。150BPM・8小節（12.8秒）を最初に一度だけ合成してループ再生します。
- 試合開始で流れ、試合終了で止まります。右上の 🔊 ボタンで効果音と BGM をまとめて消せます。タブを隠すと音を止めます。
- BGM の音量は `index.html` の `BGM_VOL`（いまは 0.09）です。


- ヒット: 打者は一塁、全走者1つ進塁
- 二塁打: 打者は二塁、全走者2つ進塁
- 三塁打: 打者は三塁、全走者生還
- 本塁打: 打者と全走者生還

## 調整値

`index.html` の `CFG`（重力、反発、フリッパー速度、発射力、自動発射秒数、ターゲットの弾き・再判定間隔など）にまとめています。

フリッパーはバットの形です（根元にグリップエンド、赤いグリップテープ、先が太い芯）。太さは `CFG.batProfile`（根元からの位置と半径の組）で決め、表示と当たり判定の両方に同じ値を使います。太くすると左右のフリッパーの間が狭くなるので、e2e の隙間チェック（ボール直径の1.4倍以上）で確かめます。

## 確認

```sh
# playwright-core と、インストール済みの Google Chrome を使う
PLAYWRIGHT_CORE=<playwright-core のフォルダ> node tools/e2e.mjs
```

進塁ルールの全通り照合、試合終了コメントの境目、BGM の再生・消音・停止、物理で当てて得点するまでの連鎖、3アウト終了、リスタート、出現位置とレーン落下、フリッパー先端での球詰まり、無操作・連打・狙い打ちの多試合シミュレーション、各画面サイズでのはみ出しを確認します。スクリーンショットは `shots/`（`SHOTS` で変更可）に出力します。

テスト用の入口として `window.__game`（状態取得、手動ステップ、ボール配置、塁の設定など）があります。

## ファイル構成

```text
index.html            ゲーム本体（HTML・CSS・JavaScript）
public/favicon.svg    ファビコン（野球ボール）
public/ogp.png        SNS共有用の画像（1200×630）
tools/e2e.mjs         自動確認
tools/build-dist.mjs  公開用ファイルを dist/base-pinball/ に書き出す（index.html と public/ の中身）
tools/ogp/make-ogp.mjs  OGP画像を作る
tools/promo/          告知動画の撮影道具と台本
package.json          npm スクリプト（e2e / build / ogp / promo）
```

## OGP画像

`public/ogp.png` は `node tools/ogp/make-ogp.mjs` で作ります（playwright-core とインストール済みの Chrome を使用）。確認用の入口 `window.__game` でターゲットに当てて得点を入れ、走者がいる場面を撮って、タイトル・遊び方・公開URLと重ねます。乱数の種を固定しているので、毎回同じ絵になります。

`index.html` の OGP の URL は `https://game.chozo.net/base-pinball/` を前提にしています。

## 告知動画

```sh
npm install            # 初回のみ（playwright-core・ffmpeg-static）
npm run promo          # 全コマを撮って ../video/ に書き出す
PROMO_EVERY=15 npm run promo      # 15コマおきに撮って構成だけ確認（一覧画像 ../video/base-pinball-promo-preview.jpg）
PROMO_ENCODE_ONLY=1 npm run promo # 撮り直さず音と MP4 だけ作り直す
```

- 出力: `../video/base-pinball-promo.mp4`（縦型 1080×1920・30fps・約29秒・-14 LUFS）、`-promo-cover.jpg`（表紙）、`-promo-sheet.jpg`（2秒おきの一覧）。動画はリポジトリに含めない。
- 台本は `tools/promo/scenario.js`、見た目は `tools/promo/promo.css`。撮影道具（`record.mjs`・`stage.js`）は promo-video スキルのものをそのまま使う。
- 構成: フリッパーでボールを弾いて三塁打 → タイトル → 実際のプレイ（二塁打 → 単調な区間は切る → ヒット・三塁打 → 2打席連続ホームラン）→ 満塁ホームラン（スロー）→ エンドカード。
- 最初の場面と満塁ホームランは、ボールの置き場所だけ決めて（フリッパーで弾くとそのターゲットに当たる場所を探して選んだ）、あとは物理に任せる。
- 本編は実際の物理のまま、確認用の入口 `__game.bot`（球がフリッパーに近づいたら打ち、発射も自動）で遊ばせる。ゲームの乱数を種 192 で固定しているので、毎回同じ展開になる。
- 音はゲームの効果音と BGM（球審ジャッジと同じ応援曲）をそのまま書き出す（`__game.audio`）。動画の BGM はゲームより少し大きめ（`PROMO_BGM_VOL`）。
- ゲームの物理や配置を変えると展開が変わるので、種を選び直す（台本の `PLAY_SEED`）。

## ビルド

```sh
node tools/build-dist.mjs   # dist/base-pinball/ に index.html・favicon.svg・ogp.png を書き出す
```

## 公開

- 公開URL: https://game.chozo.net/base-pinball/
- GitHub: https://github.com/chozo/base-pinball
- スマホの実機で、音（BGM・効果音）・操作・表示を確認済み（2026-10-30）
- ゲーム一覧: https://game.chozo.net/info/base-pinball/
- Cloudflare Workers の静的アセットとして配信します（Worker 名 `base-pinball`、ルート `game.chozo.net/base-pinball` と `game.chozo.net/base-pinball/*`、workers.dev なし）。

```sh
npm install
npm run deploy   # dist/base-pinball/ を作り直してから wrangler deploy
```

## ライセンス

[MIT License](./LICENSE)（Copyright (c) 2026 chozo）です。改変・再配布・商用利用ができます。利用するときは、著作権表示とライセンス文を残してください。

画像・音・フォントの外部素材は使っていません（盤面・効果音・BGM はすべてコードで生成）。BGM は同じ作者のゲーム「球審ジャッジ」（MIT License）の曲を合成するコードを移したものです。

「野球ピンボール（chozo）」「chozo」の名前やロゴを、作者が関わっているように見える形で使わないでください。
