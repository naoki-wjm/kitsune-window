import './style.css';
import { createStage } from './engine/stage.js';
import { createBubbleManager } from './engine/bubble.js';
import { createScenarioPlayer } from './engine/scenario.js';
import { selectTalk, nextTalkInterval, getTimeSlot } from './engine/trigger.js';

// 背景画像なし: 不透明グラデーション
const BG_GRADIENTS = {
  deep_night: 'linear-gradient(180deg, #050510 0%, #0a0a1a 30%, #0f1528 60%, #111830 100%)',
  morning:    'linear-gradient(180deg, #2a2050 0%, #5a4080 25%, #b08098 55%, #e0b0a0 80%, #f0d0c0 100%)',
  noon:       'linear-gradient(180deg, #4080c0 0%, #60a0d8 30%, #90c8e8 60%, #c8e4f4 100%)',
  afternoon:  'linear-gradient(180deg, #5090c8 0%, #70a8d0 30%, #90c0d8 55%, #d0dcc0 85%, #e8e0c8 100%)',
  evening:    'linear-gradient(180deg, #1a1040 0%, #502858 25%, #a04050 55%, #d87040 80%, #e8a050 100%)',
  night:      'linear-gradient(180deg, #0a0a20 0%, #101838 30%, #182850 60%, #1e3468 100%)',
};

// 背景画像あり: 半透明グラデーション（画像が透けて見える）
const BG_GRADIENTS_OVERLAY = {
  deep_night: 'linear-gradient(180deg, rgba(5,5,16,0.85) 0%, rgba(10,10,26,0.8) 30%, rgba(15,21,40,0.75) 60%, rgba(17,24,48,0.7) 100%)',
  morning:    'linear-gradient(180deg, rgba(42,32,80,0.6) 0%, rgba(90,64,128,0.5) 25%, rgba(176,128,152,0.4) 55%, rgba(224,176,160,0.3) 80%, rgba(240,208,192,0.25) 100%)',
  noon:       'linear-gradient(180deg, rgba(64,128,192,0.3) 0%, rgba(96,160,216,0.25) 30%, rgba(144,200,232,0.2) 60%, rgba(200,228,244,0.15) 100%)',
  afternoon:  'linear-gradient(180deg, rgba(80,144,200,0.45) 0%, rgba(112,168,208,0.4) 30%, rgba(144,192,216,0.35) 55%, rgba(208,220,192,0.3) 85%, rgba(232,224,200,0.25) 100%)',
  evening:    'linear-gradient(180deg, rgba(26,16,64,0.7) 0%, rgba(80,40,88,0.6) 25%, rgba(160,64,80,0.5) 55%, rgba(216,112,64,0.4) 80%, rgba(232,160,80,0.35) 100%)',
  night:      'linear-gradient(180deg, rgba(10,10,32,0.8) 0%, rgba(16,24,56,0.75) 30%, rgba(24,40,80,0.7) 60%, rgba(30,52,104,0.65) 100%)',
};

// manifest.json からトークデータを読み込む
async function loadTalks(world) {
  const manifestRes = await fetch(`/worlds/${world}/manifest.json`);
  const manifest = await manifestRes.json();

  const allTalks = [];
  for (const file of manifest) {
    const res = await fetch(`/worlds/${world}/scenario/${file}`);
    const data = await res.json();
    if (Array.isArray(data)) allTalks.push(...data);
  }
  return allTalks;
}

async function init() {
  const app = document.getElementById('app');
  const world = new URLSearchParams(location.search).get('world') || 'example';
  // world.json を読み込み（DOM構築に frameConfig が必要）
  const worldRes = await fetch(`/worlds/${world}/world.json`);
  const worldConfig = await worldRes.json();

  // --- DOM構築: viewport > canvas > stage ---
  const frameConfig = worldConfig.frame || {};
  const viewport = document.createElement('div');
  viewport.className = 'kitsune-viewport';
  if (frameConfig.tileColor) {
    viewport.style.setProperty('--kitsune-tile-color', frameConfig.tileColor);
  }
  if (frameConfig.tile) {
    viewport.style.backgroundImage = `url("/worlds/${world}/${frameConfig.tile}")`;
    viewport.style.backgroundRepeat = 'repeat';
  }

  const canvas = document.createElement('div');
  canvas.className = 'kitsune-canvas';
  if (frameConfig.color) {
    canvas.style.setProperty('--kitsune-frame-color', frameConfig.color);
  }
  if (frameConfig.width) {
    canvas.style.setProperty('--kitsune-frame-width', frameConfig.width);
  }

  const stageEl = document.createElement('div');
  stageEl.className = 'kitsune-stage';
  stageEl.id = 'stage';

  canvas.appendChild(stageEl);

  // 額縁画像レイヤー（キャンバスの上に重ねる）
  if (frameConfig.image) {
    canvas.style.border = 'none';
    const frameEl = document.createElement('div');
    frameEl.className = 'kitsune-frame';
    frameEl.style.backgroundImage = `url("/worlds/${world}/${frameConfig.image}")`;
    canvas.appendChild(frameEl);
  }

  viewport.appendChild(canvas);
  app.appendChild(viewport);

  // ワールド別 PWA manifest に差し替え
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    manifestLink.href = `/manifest-${world}.json`;
  }

  // ワールドの themeColor を反映
  if (worldConfig.themeColor) {
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = worldConfig.themeColor;
  }

  // Cubism Core は Live2D の場合のみ読み込む
  if (worldConfig.type === 'live2d') {
    await loadCubismCore();
  }

  const stage = await createStage(stageEl, worldConfig, world);
  const bubbleManager = createBubbleManager(stage);
  const player = createScenarioPlayer(stage, bubbleManager);

  // 時間帯背景
  const bgConfig = worldConfig.background;
  const bgImageUrl = bgConfig?.image ? `/worlds/${world}/${bgConfig.image}` : null;
  const bgColor = bgConfig?.color || null;
  const bgMode = bgConfig?.mode || 'outdoor';

  const forceSlot = new URLSearchParams(location.search).get('timeslot');

  function updateBackground() {
    const slot = forceSlot || getTimeSlot();
    if (bgMode === 'indoor' && bgImageUrl) {
      // 屋内モード: 室内画像の透明部分から時間帯グラデーション（空）が透ける
      const gradient = BG_GRADIENTS[slot] || BG_GRADIENTS.night;
      stageEl.style.background = `url("${bgImageUrl}") center/cover no-repeat, ${gradient}`;
    } else if (bgImageUrl) {
      // 野外モード: 背景画像の上に半透明グラデーション
      const overlay = BG_GRADIENTS_OVERLAY[slot] || BG_GRADIENTS_OVERLAY.night;
      stageEl.style.background = `${overlay}, url("${bgImageUrl}") center/cover no-repeat`;
      if (bgColor) stageEl.style.backgroundColor = bgColor;
    } else if (bgColor) {
      // 背景色のみ（グラデーションなし）
      stageEl.style.background = bgColor;
    } else {
      // デフォルト: 時間帯グラデーション
      stageEl.style.background = BG_GRADIENTS[slot] || BG_GRADIENTS.night;
    }
  }
  updateBackground();
  setInterval(updateBackground, 60 * 1000);

  // トークデータ読み込み
  const talks = await loadTalks(world);
  console.log(`トーク読み込み完了: ${talks.length}件`);

  // トーク再生ループ
  async function playNext() {
    const talk = selectTalk(talks);
    if (talk) {
      await player.play(talk);
    }
    setTimeout(playNext, nextTalkInterval());
  }

  playNext();
}

function loadCubismCore() {
  return new Promise((resolve, reject) => {
    if (window.Live2DCubismCore) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Cubism Core の読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

init();

// Service Worker 登録
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
