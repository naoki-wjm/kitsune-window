import './style.css';
import { createStage } from './engine/stage.js';
import { createBubbleManager } from './engine/bubble.js';
import { createScenarioPlayer } from './engine/scenario.js';
import { selectTalk, nextTalkInterval, getTimeSlot } from './engine/trigger.js';

const BG_GRADIENTS = {
  deep_night: 'linear-gradient(180deg, #050510 0%, #0a0a1a 30%, #0f1528 60%, #111830 100%)',
  morning:    'linear-gradient(180deg, #2a2050 0%, #5a4080 25%, #b08098 55%, #e0b0a0 80%, #f0d0c0 100%)',
  noon:       'linear-gradient(180deg, #4080c0 0%, #60a0d8 30%, #90c8e8 60%, #c8e4f4 100%)',
  afternoon:  'linear-gradient(180deg, #5090c8 0%, #70a8d0 30%, #90c0d8 55%, #d0dcc0 85%, #e8e0c8 100%)',
  evening:    'linear-gradient(180deg, #1a1040 0%, #502858 25%, #a04050 55%, #d87040 80%, #e8a050 100%)',
  night:      'linear-gradient(180deg, #0a0a20 0%, #101838 30%, #182850 60%, #1e3468 100%)',
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
  app.innerHTML = '<div class="kitsune-stage" id="stage"></div>';

  const world = new URLSearchParams(location.search).get('world') || 'example';
  const stageEl = document.getElementById('stage');

  // world.json を読み込み
  const worldRes = await fetch(`/worlds/${world}/world.json`);
  const worldConfig = await worldRes.json();

  // Cubism Core は Live2D の場合のみ読み込む
  if (worldConfig.type === 'live2d') {
    await loadCubismCore();
  }

  const stage = await createStage(stageEl, worldConfig, world);
  const bubbleManager = createBubbleManager(stage);
  const player = createScenarioPlayer(stage, bubbleManager);

  // 時間帯背景
  function updateBackground() {
    const slot = getTimeSlot();
    stageEl.style.background = BG_GRADIENTS[slot] || BG_GRADIENTS.night;
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
