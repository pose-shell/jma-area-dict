# JMA Area Dict

気象庁の地域コード（市町村まで）と、天気予報JSON（forecast / overview_forecast）の構造を学ぶための辞書サイトです。  
コード検索 → 対応する予報（office）解決 → 実データを取得して JSON Pointer で参照位置を確認、までを一気に辿れます。

## できること

- 地域コードを検索（コード/名称、階層の確認）
- 市町村コードから予報取得用の `office` コードを自動解決
- `forecast` / `overview_forecast` をその場で取得し、JSONツリーで閲覧
- ツリーをクリックすると JSON Pointer を生成し、Selected（該当部分）を表示
- よく使う JSON Pointer を Paths からワンクリックで Playground に適用

## ページ構成

- Home：概要
- Codes：地域コード辞書（検索、階層、office解決、Playground導線）
- Playground：forecast / overview を実取得、ツリー閲覧、pointer生成、Selected表示
- Paths：よく使うpointerの一覧（Playgroundへ遷移＋自動適用）
- Notes：出典・免責・注意事項

## 使い方（おすすめ導線）

1. `Codes` で市町村名またはコード（例：`2920900` 生駒市）を検索  
2. 詳細の `office` を確認し、`Playground` を開く  
3. ツリーのノードをクリックして pointer を確認（Selectedに該当部分が出ます）  
4. `Paths` から定番pointerを押して、構造の理解を進める

## 公開URL（GitHub Pages）

- Site: https://pose-shell.github.io/jma-area-dict/

## 技術

- 静的サイト（HTML / CSS / Vanilla JS）
- Hosting: GitHub Pages
- データ取得：Fetch API
- area.json は localStorage にキャッシュ（TTLあり）

## データ出典

出典：気象庁ホームページ  
利用している主なデータ：

- 地域コード定数：`https://www.jma.go.jp/bosai/common/const/area.json`
- 天気予報：`https://www.jma.go.jp/bosai/forecast/data/forecast/{office}.json`
- 天気概況：`https://www.jma.go.jp/bosai/forecast/data/overview_forecast/{office}.json`

## 注意事項（免責・変更リスク）

- 本サイトは学習目的で、取得したJSONを整形・抽出して表示します。
- 情報の正確性・完全性を保証しません。利用による損害について責任を負いません。
- 気象庁側の仕様変更等により、予告なくURL・内容が変わる可能性があります。

詳細は `Notes`（notes.html）を参照してください。

## 開発

ローカルでの確認（例：Python）

```bash
python -m http.server 8000
