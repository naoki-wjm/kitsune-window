/**
 * 狐の窓 — 埋め込み用エントリポイント
 *
 * 使い方:
 *   <div class="kitsune-window" id="kitsune-window"></div>
 *   <script type="module">
 *     import("https://your-site.vercel.app/embed.js").then(() => {
 *       KitsuneWindow.init({
 *         world: "example",
 *         container: document.getElementById("kitsune-window")
 *       });
 *     });
 *   </script>
 */

const BG_GRADIENTS = {
  deep_night: 'linear-gradient(180deg, #050510 0%, #0a0a1a 30%, #0f1528 60%, #111830 100%)',
  morning:    'linear-gradient(180deg, #2a2050 0%, #5a4080 25%, #b08098 55%, #e0b0a0 80%, #f0d0c0 100%)',
  noon:       'linear-gradient(180deg, #4080c0 0%, #60a0d8 30%, #90c8e8 60%, #c8e4f4 100%)',
  afternoon:  'linear-gradient(180deg, #5090c8 0%, #70a8d0 30%, #90c0d8 55%, #d0dcc0 85%, #e8e0c8 100%)',
  evening:    'linear-gradient(180deg, #1a1040 0%, #502858 25%, #a04050 55%, #d87040 80%, #e8a050 100%)',
  night:      'linear-gradient(180deg, #0a0a20 0%, #101838 30%, #182850 60%, #1e3468 100%)',
};

const BG_GRADIENTS_OVERLAY = {
  deep_night: 'linear-gradient(180deg, rgba(5,5,16,0.85) 0%, rgba(10,10,26,0.8) 30%, rgba(15,21,40,0.75) 60%, rgba(17,24,48,0.7) 100%)',
  morning:    'linear-gradient(180deg, rgba(42,32,80,0.6) 0%, rgba(90,64,128,0.5) 25%, rgba(176,128,152,0.4) 55%, rgba(224,176,160,0.3) 80%, rgba(240,208,192,0.25) 100%)',
  noon:       'linear-gradient(180deg, rgba(64,128,192,0.3) 0%, rgba(96,160,216,0.25) 30%, rgba(144,200,232,0.2) 60%, rgba(200,228,244,0.15) 100%)',
  afternoon:  'linear-gradient(180deg, rgba(80,144,200,0.45) 0%, rgba(112,168,208,0.4) 30%, rgba(144,192,216,0.35) 55%, rgba(208,220,192,0.3) 85%, rgba(232,224,200,0.25) 100%)',
  evening:    'linear-gradient(180deg, rgba(26,16,64,0.7) 0%, rgba(80,40,88,0.6) 25%, rgba(160,64,80,0.5) 55%, rgba(216,112,64,0.4) 80%, rgba(232,160,80,0.35) 100%)',
  night:      'linear-gradient(180deg, rgba(10,10,32,0.8) 0%, rgba(16,24,56,0.75) 30%, rgba(24,40,80,0.7) 60%, rgba(30,52,104,0.65) 100%)',
};

// 埋め込み用CSS注入
function injectStyles() {
  if (document.getElementById('kitsune-window-styles')) return;
  const style = document.createElement('style');
  style.id = 'kitsune-window-styles';
  style.textContent = `
    .kitsune-window {
      position: relative;
      width: 100%;
      height: 250px;
      overflow: hidden;
      pointer-events: none;
      border: 1px solid var(--pl-accent, #493759);
      border-radius: 8px;
      margin: 1em 0;
    }
    @media all and (min-width: 641px) {
      .kitsune-window {
        height: 400px;
      }
    }
    .kitsune-window .kitsune-stage {
      position: relative;
      width: 100%;
      height: 100%;
    }
    .kitsune-window .kitsune-overlay {
      display: flex;
      align-items: stretch;
    }
    .kitsune-window .slot {
      flex: 1;
      position: relative;
      height: 100%;
    }
    .kitsune-window .bubble {
      position: absolute;
      bottom: 56%;
      left: 50%;
      transform: translateX(-50%);
      max-width: 340px;
      min-width: 80px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.92);
      color: #1a1a2e;
      border-radius: 12px;
      font-family: "Zen Maru Gothic", "Hiragino Kaku Gothic ProN", sans-serif;
      font-size: 0.85rem;
      line-height: 1.7;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
      word-break: normal;
      pointer-events: auto;
    }
    .kitsune-window .bubble::after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid rgba(255, 255, 255, 0.92);
    }
    .kitsune-window .kitsune-credit {
      position: absolute;
      bottom: 4px;
      right: 8px;
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.5);
      pointer-events: auto;
      z-index: 3;
    }
    .kitsune-window .kitsune-credit a {
      color: inherit;
      text-decoration: none;
    }
    .kitsune-window .kitsune-credit a:hover {
      color: rgba(255, 255, 255, 0.8);
    }
  `;
  document.head.appendChild(style);
}

const BASE_URL = import.meta.env.BASE_URL || '/';

/** Cubism Core を動的に読み込む */
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

async function init(options = {}) {
  const container = options.container;
  const world = options.world || 'example';

  if (!container) {
    console.error('[狐の窓] container が指定されていません');
    return;
  }

  injectStyles();

  // world.json を読み込み
  const worldRes = await fetch(`${BASE_URL}worlds/${world}/world.json`);
  const worldConfig = await worldRes.json();

  // Cubism Core は Live2D の場合のみ読み込む
  if (worldConfig.type === 'live2d') {
    await loadCubismCore();
  }

  // エンジンを動的に import
  const { createStage } = await import('./engine/stage.js');
  const { createBubbleManager } = await import('./engine/bubble.js');
  const { createScenarioPlayer } = await import('./engine/scenario.js');
  const { selectTalk, nextTalkInterval, getTimeSlot } = await import('./engine/trigger.js');

  // ステージ用のdivを作成
  const stageEl = document.createElement('div');
  stageEl.className = 'kitsune-stage';
  container.appendChild(stageEl);

  // クレジット表示（world.json の credit フィールドから）
  if (worldConfig.credit) {
    const creditEl = document.createElement('div');
    creditEl.className = 'kitsune-credit';
    creditEl.innerHTML = worldConfig.credit;
    container.appendChild(creditEl);
  }

  const stage = await createStage(stageEl, worldConfig, world);
  const bubbleManager = createBubbleManager(stage);
  const player = createScenarioPlayer(stage, bubbleManager);

  // 時間帯背景
  const bgConfig = worldConfig.background;
  const bgImageUrl = bgConfig?.image ? `${BASE_URL}worlds/${world}/${bgConfig.image}` : null;
  const bgColor = bgConfig?.color || null;
  const bgMode = bgConfig?.mode || 'outdoor';

  function updateBackground() {
    const slot = getTimeSlot();
    if (bgMode === 'indoor' && bgImageUrl) {
      const gradient = BG_GRADIENTS[slot] || BG_GRADIENTS.night;
      stageEl.style.background = `url("${bgImageUrl}") center/cover no-repeat, ${gradient}`;
    } else if (bgImageUrl) {
      const overlay = BG_GRADIENTS_OVERLAY[slot] || BG_GRADIENTS_OVERLAY.night;
      stageEl.style.background = `${overlay}, url("${bgImageUrl}") center/cover no-repeat`;
      if (bgColor) stageEl.style.backgroundColor = bgColor;
    } else if (bgColor) {
      stageEl.style.background = bgColor;
    } else {
      stageEl.style.background = BG_GRADIENTS[slot] || BG_GRADIENTS.night;
    }
  }
  updateBackground();
  setInterval(updateBackground, 60 * 1000);

  // トークデータをfetchで読み込み
  const manifestRes = await fetch(`${BASE_URL}worlds/${world}/manifest.json`);
  const manifest = await manifestRes.json();

  const allTalks = [];
  for (const file of manifest) {
    const res = await fetch(`${BASE_URL}worlds/${world}/scenario/${file}`);
    const data = await res.json();
    if (Array.isArray(data)) allTalks.push(...data);
  }

  console.log(`[狐の窓] トーク読み込み完了: ${allTalks.length}件 (world: ${world})`);

  // トーク再生ループ
  async function playNext() {
    const talk = selectTalk(allTalks);
    if (talk) {
      await player.play(talk);
    }
    setTimeout(playNext, nextTalkInterval());
  }

  playNext();
}

// グローバルに公開
window.KitsuneWindow = { init };

export { init };
