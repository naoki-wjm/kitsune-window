# 狐の窓 — Kitsune Window

創作世界をブラウザ越しに覗き見する仕組み。

時刻・季節・年中行事に連動してキャラクターが生活しており、URLを開くたびに「今日のその世界」が見える。

- **プル型** — プッシュ通知なし、会いに行く体験
- **ログイン不要** — URLを開けば今日も居る
- **PWA対応** — ホーム画面に追加してお気に入りの窓に
- **3種類のステージ** — PNG立ち絵・Live2D・VRM、好きな形式で

## クイックスタート

```bash
# 1. このテンプレートから新しいリポジトリを作成（GitHub の "Use this template"）

# 2. クローンして依存をインストール
git clone https://github.com/your-name/your-window.git
cd your-window
npm install

# 3. 開発サーバーを起動（サンプルワールドが動く）
npm run dev
```

ブラウザで `http://localhost:5173` を開くと、サンプルキャラ3人の掛け合いが見られます。

## 自分の世界を作る

### 1. ワールドフォルダを作成

`public/worlds/example/` をコピーして、自分の世界観名にリネームします。

```
public/worlds/myworld/
├── world.json          ← ステージ種別・キャラ定義
├── characters/         ← キャラ素材（このワールド専用）
├── scenario/           ← シナリオJSON
├── manifest.json       ← 読み込むシナリオファイルの一覧
└── define.txt          ← 里々記法の日→英変換テーブル
```

### 2. world.json を編集

ステージの種類（`type`）とキャラクターを定義します。

**PNG立ち絵**（最軽量、ライブラリ不要）:
```json
{
  "type": "png",
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

**Live2D**:
```json
{
  "type": "live2d",
  "credit": "Live2D model: <a href=\"https://example.com\">作者名</a>",
  "characters": {
    "mychar": { "model": "characters/mychar/mychar.model3.json" }
  }
}
```

**VRM**（VRoid Studio 等で作成）:
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

里々ライク記法で日本語のままトークを書けます。

```
【朝】
中：キャラA：右向き：笑顔：おはよう！
待機：2000
右：キャラB：左向き：通常：……おはよう。
```

`tools/converter.html` を開いて、define.txt とトーク文を貼り付ければ JSON に変換されます。
出力された JSON を `scenario/` に保存し、`manifest.json` にファイル名を追加してください。

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
│           ├── characters/
│           ├── scenario/
│           ├── manifest.json
│           └── define.txt
├── src/
│   ├── engine/              ← エンジン本体（触らなくてOK）
│   ├── main.js              ← メインエントリポイント
│   ├── embed.js             ← 埋め込み用エントリポイント
│   └── style.css
└── tools/
    └── converter.html       ← 里々記法 → JSON 変換ツール
```

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

## ライセンス

MIT

## 謝辞

「狐の窓」は[伺か](https://ja.wikipedia.org/wiki/%E4%BC%BA%E3%81%8B)（デスクトップマスコット）の思想に影響を受けています。
