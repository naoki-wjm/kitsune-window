/**
 * vite-plugin-pwa-manifest — ワールドごとの PWA manifest を自動生成
 *
 * public/worlds/{world}/world.json を走査し、manifest-{world}.json を生成する。
 * world.json のオプショナルフィールド:
 *   name       — PWA表示名（未指定: ワールドフォルダ名）
 *   shortName  — ホーム画面アイコン下の名前（未指定: name の先頭10文字）
 *   icon       — アイコン画像パス（ワールドフォルダからの相対、未指定: デフォルトアイコン）
 *   themeColor — theme_color / background_color（未指定: #0a0a1a）
 */

import { resolve } from 'path';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';

const DEFAULT_THEME_COLOR = '#0a0a1a';

function buildManifest(worldName, worldConfig) {
  const name = worldConfig.name || worldName;
  const shortName = worldConfig.shortName || name.slice(0, 10);
  const themeColor = worldConfig.themeColor || DEFAULT_THEME_COLOR;

  const icons = [];
  if (worldConfig.icon) {
    icons.push({
      src: `/worlds/${worldName}/${worldConfig.icon}`,
      sizes: '512x512',
      type: 'image/png',
    });
  } else {
    // デフォルトアイコン
    icons.push(
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    );
  }

  return {
    id: `/?world=${worldName}`,
    name,
    short_name: shortName,
    start_url: `/?world=${worldName}`,
    scope: '/',
    display: 'standalone',
    theme_color: themeColor,
    background_color: themeColor,
    icons,
  };
}

export default function pwaManifestPlugin() {
  let worldsDir;

  function generatePwaManifests() {
    if (!existsSync(worldsDir)) return;
    let count = 0;

    for (const entry of readdirSync(worldsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const worldJsonPath = resolve(worldsDir, entry.name, 'world.json');
      if (!existsSync(worldJsonPath)) continue;

      try {
        const worldConfig = JSON.parse(readFileSync(worldJsonPath, 'utf-8'));
        const manifest = buildManifest(entry.name, worldConfig);
        const outPath = resolve(worldsDir, '..', `manifest-${entry.name}.json`);
        writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
        count++;
      } catch (e) {
        console.warn(`[pwa-manifest] ${entry.name}: world.json の読み込みに失敗`, e.message);
      }
    }

    if (count > 0) {
      console.log(`[pwa-manifest] ${count} ワールドの manifest を生成`);
    }
  }

  return {
    name: 'pwa-manifest',
    buildStart() {
      worldsDir = resolve(process.cwd(), 'public/worlds');
      generatePwaManifests();
    },
    configureServer(server) {
      worldsDir = resolve(process.cwd(), 'public/worlds');
      generatePwaManifests();

      // dev サーバーで manifest-{world}.json を動的に返す
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/manifest-(.+)\.json$/);
        if (!match) return next();

        const worldName = match[1];
        const worldJsonPath = resolve(worldsDir, worldName, 'world.json');
        if (!existsSync(worldJsonPath)) return next();

        try {
          const worldConfig = JSON.parse(readFileSync(worldJsonPath, 'utf-8'));
          const manifest = buildManifest(worldName, worldConfig);
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(JSON.stringify(manifest, null, 2));
        } catch {
          next();
        }
      });

      // world.json の変更を監視して再生成
      server.watcher.on('change', (path) => {
        if (path.endsWith('world.json') && path.includes('/worlds/')) {
          generatePwaManifests();
        }
      });
    },
  };
}
