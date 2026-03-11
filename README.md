# 狐の窓 — Kitsune Window

創作世界をブラウザ越しに覗き見する仕組み。

時刻・季節・年中行事に連動してキャラクターが生活しており、URLを開くたびに「今日のその世界」が見える。

- **プル型** — プッシュ通知なし、会いに行く体験
- **ログイン不要** — URLを開けば今日も居る
- **PWA対応** — ホーム画面に追加してお気に入りの窓に
- **3種類のステージ** — PNG立ち絵（推奨）・Live2D・VRM から選択

**📖 [解説サイト（狐の窓 ガイド）](https://dreams.parallel.jp/kitsune-window/)** — セットアップからトークの書き方まで、図解付きで解説しています。

## クイックスタート

```bash
# 1. このリポジトリを fork して、クローン
git clone https://github.com/your-name/kitsune-window.git
cd kitsune-window
npm install

# 2. 開発サーバーを起動（サンプルワールドが動く）
npm run dev
```

> fork しておくと、エンジンの更新を `git pull` で取り込めます。

ブラウザで `http://localhost:5173` を開くと、サンプルキャラ3人の掛け合いが見られます。

## 自分の世界を作る

### 1. ワールドフォルダを作成

`public/worlds/example/` をコピーして、自分の世界観名にリネームします。

```
public/worlds/myworld/
├── world.json          ← ステージ種別・キャラ定義
├── characters/         ← キャラ素材（このワールド専用）
├── scenario/           ← シナリオJSON（ここに置くだけで自動認識）
└── define.txt          ← 簡易トーク記法の日→英変換テーブル
```

### 2. world.json を編集

ステージの種類（`type`）、キャラクター、背景を定義します。

> **PNG がおすすめです。** ライブラリ不要で最も軽量、サンプルワールドもこの形式です。
> Live2D と VRM は実験的サポートです（表情制御やファイルサイズ等に未解決の課題があります）。

**PNG立ち絵**（推奨。最軽量、ライブラリ不要）:
```json
{
  "type": "png",
  "background": {
    "image": "bg.png",
    "color": "#1a1a2e"
  },
  "characters": {
    "mychar": {
      "base": "characters/mychar/base.png",
      "expressions": {
        "normal": [],
        "smile": ["characters/mychar/smile.png"]
      }
    }
  }
}
```

`path` を使うと素材パスのプレフィックスを省略できます:
```json
{
  "type": "png",
  "characters": {
    "mychar": {
      "path": "characters/mychar/",
      "base": "base.png",
      "expressions": {
        "normal": [],
        "smile": ["smile.png"]
      }
    }
  }
}
```

左右で素材が異なるキャラ（和服・オッドアイ等）は、向き別に定義できます。`path` は向き別モードでも使えます（各向きに独自の `path` がなければ親の `path` が適用されます）:
```json
{
  "type": "png",
  "characters": {
    "mychar": {
      "path": "characters/mychar/",
      "bases": {
        "left": {
          "base": "left.png",
          "expressions": { "normal": [], "smile": ["left_smile.png"] }
        },
        "right": {
          "base": "right.png",
          "expressions": { "normal": [], "smile": ["right_smile.png"] }
        }
      }
    }
  }
}
```

> `tools/png-define.html` を使えば、画像をドラッグ&ドロップしながら定義JSONを組み立てられます。

**Live2D**（実験的。Cubism Core を外部CDNから読み込みます）:
```json
{
  "type": "live2d",
  "credit": "Live2D model: <a href=\"https://example.com\">作者名</a>",
  "characters": {
    "mychar": { "model": "characters/mychar/mychar.model3.json" }
  }
}
```

**VRM**（実験的。ファイルサイズが大きく、表情・ポーズに制約があります）:
```json
{
  "type": "vrm",
  "camera": "talk",
  "characters": {
    "mychar": { "model": "characters/mychar/mychar.vrm" }
  }
}
```

### 3. キャラ素材を配置

`worlds/myworld/characters/` にキャラ素材を配置します。

### 4. トークを書く

簡易トーク記法で日本語のままトークを書けます。

```
【朝】
中：キャラA：右向き：笑顔：おはよう！
待機：2000
右：キャラB：左向き：通常：……おはよう。
```

`tools/converter.html` を開いて、define.txt とトーク文を貼り付ければ JSON に変換されます。
出力された JSON を `scenario/` に保存してください。

### 5. デフォルトワールドを変更

`src/main.js` の `'example'` を自分のワールド名に変更します。

```js
const world = new URLSearchParams(location.search).get('world') || 'myworld';
```

### 6. デプロイ

Vercel にリポジトリを接続すれば自動デプロイされます。

## ワールド切り替え

URLパラメータでワールドを切り替えられます。

```
https://your-site.vercel.app/?world=myworld
```

## 外部サイトへの埋め込み

```html
<div class="kitsune-window" id="kitsune-window"></div>
<script type="module">
  import("https://your-site.vercel.app/embed.js").then(() => {
    KitsuneWindow.init({
      world: "myworld",
      container: document.getElementById("kitsune-window")
    });
  });
</script>
```

## ディレクトリ構成

```
kitsune-window/
├── public/
│   ├── characters/          ← 共有キャラプール（複数ワールドから参照可能）
│   └── worlds/
│       └── example/         ← サンプルワールド（コピーして使う）
│           ├── world.json
│           ├── bg.png          ← 背景画像（任意）
│           ├── characters/
│           ├── scenario/
│           └── define.txt
├── src/
│   ├── engine/              ← エンジン本体（触らなくてOK）
│   ├── main.js              ← メインエントリポイント
│   ├── embed.js             ← 埋め込み用エントリポイント
│   └── style.css
└── tools/
    ├── converter.html       ← 簡易トーク記法 → JSON 変換ツール
    └── png-define.html      ← PNGキャラ定義ツール（GUI）
```

## 背景

`world.json` の `background` プロパティで背景をカスタマイズできます。

| プロパティ | 説明 |
|---|---|
| `background.image` | 背景画像ファイル（ワールドフォルダからの相対パス） |
| `background.color` | 背景色。画像読み込み前のフォールバックとしても機能します |
| `background.mode` | `"outdoor"`（デフォルト）または `"indoor"` |

- `background` を省略 → 従来通り時間帯グラデーションのみ
- `color` のみ指定 → グラデーションなしの単色背景

### 野外モード（デフォルト）

背景画像の上に時間帯の半透明グラデーションが重なります。風景写真やイラストに時間の移ろいを加えるのに向いています。

### 屋内モード

```json
{
  "background": {
    "image": "room.png",
    "mode": "indoor"
  }
}
```

室内の背景画像（透過PNG）を下に置き、透明部分から時間帯グラデーション（空）が透けて見えます。窓のある部屋など、屋内の世界観に向いています。

## トリガー（時間帯）

トークは時間帯に応じて自動選択されます。

| トリガー名 | 時間帯 |
|---|---|
| `deep_night` | 0:00 - 4:59 |
| `morning` | 5:00 - 9:59 |
| `noon` | 10:00 - 13:59 |
| `afternoon` | 14:00 - 17:59 |
| `evening` | 18:00 - 21:59 |
| `night` | 22:00 - 23:59 |
| `any` | いつでも（条件なし） |

特定日（`7/7`）・月（`7月`）・曜日（`土曜日`）との組み合わせも可能です。

`?timeslot=morning` のようにURLパラメータを付けると、時間帯を強制指定できます（背景の見え方の確認に便利です）。

## ライセンス

MIT

## 謝辞

「狐の窓」は[伺か](https://ja.wikipedia.org/wiki/%E4%BC%BA%E3%81%8B)（デスクトップマスコット）の思想に影響を受けています。
