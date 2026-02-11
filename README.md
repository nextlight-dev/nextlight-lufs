# LUFS Meter

ブラウザ上で動作する音声ラウドネス測定ツールです。ITU-R BS.1770-4 / EBU R 128 規格に準拠した LUFS 測定をクライアントサイドで実行し、配信・納品向けの音声品質チェックを行えます。

**Live Demo:** https://nextlight-dev.github.io/nextlight-lufs/

## 機能

### シングル測定

音声ファイルをドラッグ&ドロップまたはクリックで選択すると、以下の指標を即座に測定・表示します。

| 指標 | 単位 | 説明 |
|------|------|------|
| **Integrated Loudness** | LUFS | 楽曲全体の平均的な音の大きさ。配信では -14〜-7 LUFS が一般的 |
| **True Peak** | dBTP | 瞬間的な音量の最大値。0 dBTP を超えると音割れの原因に。-1 dBTP 以下が安全 |
| **Loudness Range (LRA)** | LU | 曲中の音量差の幅（10〜95パーセンタイル）。値が大きいほどダイナミクスが広い |
| **Head / Tail Silence** | 秒 | 冒頭・末尾の無音区間の長さ |
| **Duration** | -- | 楽曲の長さ |
| **Zero Start / End** | -- | 先頭・末尾のサンプル値がゼロか。非ゼロだとプチッとノイズの原因 |
| **Clipping** | samples | 0 dBFS に張り付いたサンプル数。0 が理想 |
| **Stereo Correlation** | -- | L/R の相関（ステレオファイルのみ）。1.0=モノラル、0付近=広いステレオ、負=位相問題あり |

### 判定バナー（Verdict）

測定結果を自動で判定し、色分けされたバナーで表示します。

- **問題なし（緑）** — 配信の基準を満たしている
- **注意（黄）** — Integrated Loudness が高い/低い、True Peak の余裕が少ない、無音区間が長い、など
- **要確認（赤）** — True Peak が 0 dBTP 超過、クリッピング検出、ステレオ相関が負、など

### オーディオプレーヤー

測定後、ブラウザ内で音声を再生できます。再生位置はラウドネスグラフ上のプレイヘッドとリアルタイムに同期します。

### ラウドネスグラフ

Chart.js による折れ線グラフで、時間軸に沿ったラウドネスの変化を可視化します。

- **紫線** — Momentary Loudness（400ms 窓）
- **ピンク線** — Short-term Loudness（3s 窓）
- Y 軸: -20〜0 LUFS
- ホバーで各ポイントの LUFS 値をツールチップ表示

### 一括測定（バッチ）

最大 **50 ファイル** を一括でドロップし、比較テーブルで結果を確認できます。各ファイルの Integrated / True Peak / LRA / Duration / Silence / Zero Start/End / Clipping / Stereo Correlation を一覧表示し、値は色分けされます。

## 対応フォーマット

- WAV
- MP3
- FLAC
- OGG
- AAC

※ Web Audio API でデコード可能なすべてのフォーマットに対応します。

## 技術仕様

### 測定アルゴリズム

ITU-R BS.1770-4 規格に基づく K-weighting フィルタとゲーティングによるラウドネス測定を実装しています。

1. **K-weighting フィルタ** — 2 段の IIR バイクアッドフィルタ（Stage 1: ハイシェルフ、Stage 2: RLB ハイパス）を各チャンネルに適用
2. **Momentary Loudness** — 400ms ブロック、100ms ホップで算出
3. **Short-term Loudness** — 3s ブロック、1s ホップで算出
4. **Integrated Loudness** — EBU R 128 ゲーティング（絶対ゲート -70 LUFS → 相対ゲート -10 dB）
5. **True Peak** — 全チャンネルの最大絶対振幅を dB 変換
6. **Loudness Range (LRA)** — Short-term 値の 10〜95 パーセンタイル幅
7. **チャンネル重み付け** — L, R, C = 1.0 / Ls, Rs = 1.41（ITU-R BS.1770 準拠）

### サンプルレート

音声デコード時に **48kHz** に固定（`AudioContext({ sampleRate: 48000 })`）し、K-weighting フィルタ係数との整合性を確保しています。44.1kHz 用の係数も内蔵しています。

### 検出しきい値

| 項目 | しきい値 |
|------|----------|
| 無音判定 | 0.001（≒ -60 dBFS） |
| クリッピング | 0.9999（≒ 0 dBFS） |
| ゼロスタート/エンド | 0.001 |

### 技術スタック

- **Vite** (v7) — ビルドツール・開発サーバー
- **Chart.js** (v4) — ラウドネスグラフ描画
- **Web Audio API** — 音声デコード・再生
- **Vanilla JavaScript** — フレームワーク不使用、軽量な実装
- **GitHub Pages** — ホスティング
- **GitHub Actions** — CI/CD 自動デプロイ

## プロジェクト構成

```
nextlight-lufs/
├── src/
│   ├── lufs.js          # LUFS 測定アルゴリズム（ITU-R BS.1770-4）
│   └── main.js          # UI ロジック・イベントハンドラ・チャート描画
├── index.html           # メイン HTML（スタイル含む）
├── vite.config.js       # Vite 設定（base path, output dir）
├── package.json         # 依存関係・スクリプト
└── .github/
    └── workflows/
        └── deploy.yml   # GitHub Pages 自動デプロイ
```

## セットアップ

### 必要環境

- Node.js v20 以上
- npm

### インストール

```bash
git clone https://github.com/nextlight-dev/nextlight-lufs.git
cd nextlight-lufs
npm install
```

### 開発

```bash
npm run dev
```

ブラウザで `http://localhost:5173/nextlight-lufs/` が開きます。

### ビルド

```bash
npm run build
```

`dist/` ディレクトリに本番用ファイルが出力されます。

### プレビュー

```bash
npm run preview
```

ビルド済みファイルをローカルで確認できます。

## デプロイ

`main` ブランチへの push で GitHub Actions が自動的にビルド・デプロイを実行します。

1. `npm ci` で依存関係をインストール
2. `npm run build` で本番ビルド
3. `dist/` を GitHub Pages にアップロード・公開

## 判定基準の詳細

### Integrated Loudness

| 値 | 判定 | 色 |
|----|------|----|
| -9 〜 -7 LUFS | Pass | 緑 |
| -11 〜 -5 LUFS | Warn | 黄 |
| 上記以外 | Fail | 赤 |

### True Peak

| 値 | 判定 | 色 |
|----|------|----|
| ≤ -1 dBTP | Pass | 緑 |
| -1 〜 0 dBTP | Warn | 黄 |
| > 0 dBTP | Fail | 赤 |

### Stereo Correlation

| 値 | 判定 | 色 |
|----|------|----|
| ≥ 0.3 | Pass | 緑 |
| 0 〜 0.3 | Warn | 黄 |
| < 0（負） | Fail | 赤 |

### Verdict で警告が出る条件

- Integrated Loudness > -5 LUFS（高すぎ：配信時に音量が下げられる）
- Integrated Loudness < -11 LUFS（低すぎ：音が小さく聞こえる可能性）
- True Peak > 0 dBTP（音割れの危険）
- True Peak > -1 dBTP（余裕が少ない）
- クリッピング検出（0 dBFS に張り付いたサンプルあり）
- ステレオ相関が負（モノラル再生時に音が消える可能性）
- 先頭/末尾のサンプルが非ゼロ（プチッとノイズの原因）
- 冒頭の無音 > 1 秒
- 末尾の無音 > 3 秒

## ライセンス

ISC
