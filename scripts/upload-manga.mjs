#!/usr/bin/env node
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stringify } from 'yaml';

const HELP = `作品画像を Cloudflare R2 へアップロードし、作品 YAML を生成します。

使い方:
  npm run upload:manga -- \\
    --bucket BUCKET --slug sample --title "作品名" \\
    --description "作品の説明" --published-at 2026-08-14 \\
    --pages-dir ./images/pages --cover-1 ./images/cover_01.jpg \\
    [--cover-2 FILE] [--cover-3 FILE] [--cover-4 FILE]

オプション:
  --page-prefix TEXT     ページファイルの接頭辞を限定（省略時は自動判定）
  --description-file FILE 説明をUTF-8テキストファイルから読む
  --yaml FILE            YAML出力先（既定: src/content/works/<slug>.yaml）
  --cache-control VALUE  R2 Cache-Control（既定: public, max-age=31536000, immutable）
  --force                既存YAMLを上書き
  --dry-run              アップロード・YAML書き込みをせず内容だけ確認
  --help                 このヘルプを表示

ページファイルは「任意の接頭辞_連番.拡張子」として検出します。
例: title_001.jpg, title_002.jpg。1始まりの連続番号が必須です。`;

function fail(message) {
  console.error(`エラー: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) fail(`不明な引数です: ${token}`);
    const key = token.slice(2);
    if (['help', 'force', 'dry-run'].includes(key)) result[key] = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--')) fail(`--${key} の値がありません`);
      result[key] = value;
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { console.log(HELP); process.exit(0); }

for (const key of ['bucket', 'slug', 'title', 'pages-dir', 'cover-1']) {
  if (!args[key]) fail(`--${key} は必須です`);
}
if (!args.description && !args['description-file']) fail('--description または --description-file は必須です');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.slug)) fail('--slug は小文字英数字とハイフンのみ使用できます');

const pagesDirectory = resolve(args['pages-dir']);
if (!existsSync(pagesDirectory) || !statSync(pagesDirectory).isDirectory()) fail(`ページディレクトリがありません: ${pagesDirectory}`);

const pagePattern = /^(.*?)_(\d+)\.(jpe?g|png|webp|avif)$/i;
let pages = readdirSync(pagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const match = entry.name.match(pagePattern);
    return match ? { path: join(pagesDirectory, entry.name), prefix: match[1], number: Number(match[2]), extension: match[3].toLowerCase() } : null;
  })
  .filter(Boolean);

if (args['page-prefix']) pages = pages.filter((page) => page.prefix === args['page-prefix']);
if (!pages.length) fail('「<prefix>_<連番>.<画像拡張子>」に一致するページ画像がありません');

const prefixes = new Set(pages.map((page) => page.prefix));
if (prefixes.size > 1) fail(`複数のページ接頭辞があります。--page-prefix で指定してください: ${[...prefixes].join(', ')}`);
const extensions = new Set(pages.map((page) => page.extension));
if (extensions.size > 1) fail(`ページ画像の拡張子が混在しています: ${[...extensions].join(', ')}`);

pages.sort((a, b) => a.number - b.number);
for (let index = 0; index < pages.length; index += 1) {
  if (pages[index].number !== index + 1) fail(`ページ番号に欠番または重複があります（${index + 1} が必要です）`);
}

const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
const coverFields = [
  ['cover-1', 'front'], ['cover-2', 'insideFront'], ['cover-3', 'insideBack'], ['cover-4', 'back'],
];
const covers = {};
const uploads = [];

for (const [option, field] of coverFields) {
  if (!args[option]) continue;
  const path = resolve(args[option]);
  if (!existsSync(path) || !statSync(path).isFile()) fail(`表紙画像がありません: ${path}`);
  const extension = extname(path).slice(1).toLowerCase();
  if (!mimeTypes[extension]) fail(`対応していない表紙画像形式です: ${path}`);
  covers[field] = basename(path);
  uploads.push({ path, key: `${args.slug}/${basename(path)}`, contentType: mimeTypes[extension] });
}

const pageExtension = [...extensions][0];
for (const page of pages) {
  const number = String(page.number).padStart(3, '0');
  uploads.push({ path: page.path, key: `${args.slug}/${args.slug}_${number}.${pageExtension}`, contentType: mimeTypes[pageExtension] });
}

const description = args['description-file']
  ? await import('node:fs').then(({ readFileSync }) => readFileSync(resolve(args['description-file']), 'utf8').trim())
  : args.description;
const publishedAt = args['published-at'] || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) fail('--published-at は YYYY-MM-DD 形式で指定してください');

const metadata = { title: args.title, slug: args.slug, description, covers, publishedAt, pages: pages.length, pageExtension };
const yaml = stringify(metadata, { lineWidth: 0 });
const yamlPath = resolve(args.yaml || `src/content/works/${args.slug}.yaml`);
if (existsSync(yamlPath) && !args.force && !args['dry-run']) fail(`YAMLが既に存在します（上書きするなら --force）: ${yamlPath}`);

console.log(`作品: ${args.title} (${args.slug})`);
console.log(`本文: ${pages.length}ページ / ${pageExtension}`);
console.log(`表紙: ${Object.keys(covers).join(', ')}`);
console.log(`R2: ${args.bucket}/${args.slug}/`);

if (args['dry-run']) {
  for (const upload of uploads) console.log(`[dry-run] ${upload.path} -> ${args.bucket}/${upload.key}`);
  console.log(`\n[dry-run] ${yamlPath}\n${yaml}`);
  process.exit(0);
}

const wrangler = resolve('node_modules/.bin/wrangler');
if (!existsSync(wrangler)) fail('Wranglerがありません。npm install を実行してください');
const cacheControl = args['cache-control'] || 'public, max-age=31536000, immutable';
for (const [index, upload] of uploads.entries()) {
  console.log(`[${index + 1}/${uploads.length}] ${upload.key}`);
  const result = spawnSync(wrangler, [
    'r2', 'object', 'put', `${args.bucket}/${upload.key}`,
    '--file', upload.path, '--content-type', upload.contentType,
    '--cache-control', cacheControl, '--remote', '--force',
  ], {
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_LOG_PATH: `/tmp/manga-r2-upload-${process.pid}.log` },
  });
  if (result.status !== 0) fail(`アップロードに失敗しました: ${upload.key}`);
}

writeFileSync(yamlPath, yaml, { encoding: 'utf8', flag: args.force ? 'w' : 'wx' });
console.log(`YAMLを生成しました: ${yamlPath}`);
