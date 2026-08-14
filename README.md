# Klara Works 漫画作品ページ

AstroとPreactで構築した、読み切り漫画作品の静的配信サイトです。漫画画像はCloudflare R2から配信し、作品メタデータはAstro Content Collectionsで管理します。

## Commands

```sh
npm install
npm run check
npm run build
```

R2への画像アップロードと作品YAML生成については、次のコマンドでヘルプを確認できます。

```sh
npm run upload:manga -- --help
```

## License

This project is dual-licensed under the Apache License 2.0 or the MIT License, at your option. See [LICENSE](./LICENSE), [LICENSE-APACHE](./LICENSE-APACHE), and [LICENSE-MIT](./LICENSE-MIT).
