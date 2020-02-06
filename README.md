# node-static-gen

WEBサイト制作時の副産物である静的サイトジェネレータ。
各ページのコンテンツはExcelファイルで管理し、レイアウトファイルなどをもとに自動生成するプログラム。
また、開発用サーバーを実装しており、ファイル変更時に再生成とライブリロードが行われる。
WEBサイトひな形生成や開発用サーバー起動は全て、コマンドライン及び設定ファイルで管理できる。

## Usage

```shell
$ npm install
$ docker-compose up -d
$ node gen new [your app name]
$ node gen dev [your app name]
```

## Commandline

WEBサイトひな形生成
```shell
node gen new [your app name]
```

開発用サーバー起動
```shell
node gen dev [your app name]
```

リリース用資産生成
```shell
node gen build [your app name]
```

## config.js

```js
module.exports = (() => {
  return {
    // リリース用資産生成
    dist: 'XXXXX',
    
    // 対象外ファイル指定
    ignore: [
      'config.js',
      'dist',
      :
    ],
    
    // 出力設定
    handle: [
      {
        include: [ '.pages' ],
        exclude: [],
        handler: 'generate',
      },
      {
        include: [ '**.js' ],
        exclude: [ '**.min.js' ],
        handler: [ 'js-minify' ],
        charset: 'utf-8',
      },
      {
        include: [ '**.css'],
        exclude: [ '**.min.css' ],
        handler: [ 'css-minify' ],
        charset: 'utf-8',
      },
      {
        include: [ '**.scss' ],
        exclude: [],
        handler: [ 'scss-compile', 'css-minify' ],
        charset: 'utf-8',
        replace: path => path.replace(/\.scss$/, '.css'),
      },
      :
    ]
  };
```

## TODO

* Excelの初期フォーマットを整える
* Excel内で変数を利用できるように修正
* CDNのリソースをローカルにキャッシュする機能を追加
* サイトマップの自動生成
* バグ：pages.xlsx更新時、URLを変更した場合に元のファイルが削除されない

