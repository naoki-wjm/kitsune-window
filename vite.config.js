import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync, writeFileSync, existsSync } from 'fs';
import talksCompilerPlugin from './vite-plugin-talks.js';
import pwaManifestPlugin from './vite-plugin-pwa-manifest.js';

/**
 * scenario/ フォルダ内の .json ファイルを走査して manifest.json を自動生成する。
 * dev 起動時・ビルド時に実行され、ファイル追加時も自動で再生成される。
 */
function scenarioManifestPlugin() {
  const worldsDir = resolve(__dirname, 'public/worlds');

  function generateManifests() {
    if (!existsSync(worldsDir)) return;
    for (const world of readdirSync(worldsDir, { withFileTypes: true })) {
      if (!world.isDirectory()) continue;
      const scenarioDir = resolve(worldsDir, world.name, 'scenario');
      if (!existsSync(scenarioDir)) continue;

      const files = readdirSync(scenarioDir)
        .filter(f => f.endsWith('.json'))
        .sort();
      const manifestPath = resolve(worldsDir, world.name, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(files, null, 2) + '\n');
    }
  }

  return {
    name: 'scenario-manifest',
    buildStart() {
      generateManifests();
    },
    configureServer(server) {
      // dev サーバー起動時に生成
      generateManifests();
      // scenario/ 内のファイル変更を監視して再生成
      server.watcher.on('all', (event, path) => {
        if (path.includes('/scenario/') && path.endsWith('.json')) {
          generateManifests();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [talksCompilerPlugin(), scenarioManifestPlugin(), pwaManifestPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});
