/**
 * PNG ステージ — DOM画像重ね合わせ + CSS吹き出し + 呼吸アニメーション
 *
 * 最軽量版。Three.js も PixiJS も不要。
 * ベース画像 + オーバーレイ（表情差分・口パク）を DOM で合成する。
 *
 * 共通インターフェース:
 *   slots, setCharacter(), setExpression(), setBase(), setLipSync(),
 *   getModel(), onFrame(), clear()
 */

const POSITIONS = ['left', 'center', 'right'];
const FADE_DURATION = 1500; // ms

export async function createPNGStage(containerEl, worldConfig) {
  const BASE = import.meta.env.BASE_URL || '/';

  // worldConfig.characters からキャラ定義を構築
  const CHARACTER_DEFS = {};
  for (const [id, def] of Object.entries(worldConfig.characters || {})) {
    CHARACTER_DEFS[id] = {
      base: `${BASE}${def.base}`,
      mouth: def.mouth ? `${BASE}${def.mouth}` : null,
      blink: (def.blink || []).map(p => p ? `${BASE}${p}` : null),
      blinkFrameMs: def.blinkFrameMs || 90,
      expressions: {},
    };
    for (const [exprName, overlays] of Object.entries(def.expressions || {})) {
      CHARACTER_DEFS[id].expressions[exprName] = overlays.map(p => `${BASE}${p}`);
    }
  }

  // --- キャラ描画レイヤー ---
  const charLayer = document.createElement('div');
  charLayer.className = 'kitsune-char-layer';
  charLayer.style.position = 'absolute';
  charLayer.style.top = '0';
  charLayer.style.left = '0';
  charLayer.style.width = '100%';
  charLayer.style.height = '100%';
  charLayer.style.zIndex = '1';
  charLayer.style.pointerEvents = 'none';
  charLayer.style.display = 'flex';
  charLayer.style.alignItems = 'flex-end';
  charLayer.style.justifyContent = 'center';
  containerEl.appendChild(charLayer);

  // --- CSS DOM（吹き出しレイヤー） ---
  const overlayEl = document.createElement('div');
  overlayEl.className = 'kitsune-overlay';
  overlayEl.style.position = 'absolute';
  overlayEl.style.top = '0';
  overlayEl.style.left = '0';
  overlayEl.style.width = '100%';
  overlayEl.style.height = '100%';
  overlayEl.style.zIndex = '2';
  overlayEl.style.pointerEvents = 'none';
  containerEl.appendChild(overlayEl);

  // --- 呼吸アニメーション用CSS注入 ---
  injectBreathingCSS();

  // --- スロット管理 ---
  const slots = {};

  for (const pos of POSITIONS) {
    // 吹き出し用スロット
    const slotEl = document.createElement('div');
    slotEl.className = `slot slot-${pos}`;

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble';
    bubbleEl.style.visibility = 'hidden';

    slotEl.appendChild(bubbleEl);
    overlayEl.appendChild(slotEl);

    // キャラ表示用コンテナ
    const charContainer = document.createElement('div');
    charContainer.className = `png-char png-char-${pos}`;
    charContainer.style.position = 'absolute';
    charContainer.style.bottom = '0';
    charContainer.style.height = '55%';
    charContainer.style.display = 'none';
    // スロット位置
    switch (pos) {
      case 'left':   charContainer.style.left = '5%';  break;
      case 'center': charContainer.style.left = '50%'; charContainer.style.transform = 'translateX(-50%)'; break;
      case 'right':  charContainer.style.right = '5%'; break;
    }
    charLayer.appendChild(charContainer);

    slots[pos] = {
      element: slotEl,
      bubbleEl,
      charContainer,
      character: null,
      base: null,
      expression: null,
      // DOM要素
      baseImg: null,
      mouthImg: null,
      blinkImg: null,     // 瞬き用オーバーレイ
      blinkTimer: null,   // 瞬き間隔タイマー
      overlayImgs: [],
    };
  }

  // --- フレームコールバック ---
  const frameCallbacks = [];
  let animRunning = false;

  function startAnimLoop() {
    if (animRunning) return;
    animRunning = true;
    function tick() {
      for (const cb of frameCallbacks) cb();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // --- 画像プリロード ---
  function preloadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // --- キャラ表示 ---
  function buildCharacterDOM(container, charDef, expression) {
    // コンテナをクリア
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'png-char-wrapper breathing';
    wrapper.style.position = 'relative';
    wrapper.style.height = '100%';
    wrapper.style.display = 'inline-block'; // ベース画像の幅に合わせる

    // ベース画像（wrapper のサイズ基準）
    const baseImg = document.createElement('img');
    baseImg.src = charDef.base;
    baseImg.className = 'png-base';
    baseImg.style.height = '100%';
    baseImg.style.width = 'auto';
    baseImg.style.display = 'block';
    wrapper.appendChild(baseImg);

    // 口パクオーバーレイ（左上揃え、幅をベースに合わせる）
    let mouthImg = null;
    if (charDef.mouth) {
      mouthImg = document.createElement('img');
      mouthImg.src = charDef.mouth;
      mouthImg.className = 'png-mouth';
      mouthImg.style.position = 'absolute';
      mouthImg.style.top = '0';
      mouthImg.style.left = '0';
      mouthImg.style.width = '100%';
      mouthImg.style.height = 'auto';
      mouthImg.style.opacity = '0'; // デフォルトは閉口
      wrapper.appendChild(mouthImg);
    }

    // 表情オーバーレイ（左上揃え、幅をベースに合わせる）
    const overlayImgs = [];
    const exprOverlays = charDef.expressions[expression || 'normal'] || [];
    for (const src of exprOverlays) {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'png-overlay';
      img.style.position = 'absolute';
      img.style.top = '0';
      img.style.left = '0';
      img.style.width = '100%';
      img.style.height = 'auto';
      wrapper.appendChild(img);
      overlayImgs.push(img);
    }

    // 瞬き用オーバーレイ（非表示で待機）
    let blinkImg = null;
    if (charDef.blink && charDef.blink.length > 0) {
      blinkImg = document.createElement('img');
      blinkImg.className = 'png-blink';
      blinkImg.style.position = 'absolute';
      blinkImg.style.top = '0';
      blinkImg.style.left = '0';
      blinkImg.style.width = '100%';
      blinkImg.style.height = 'auto';
      blinkImg.style.display = 'none';
      wrapper.appendChild(blinkImg);
    }

    container.appendChild(wrapper);
    return { baseImg, mouthImg, overlayImgs, blinkImg };
  }

  // --- 公開インターフェース ---
  return {
    slots,

    async setCharacter(pos, { character, base, expression, transition }) {
      const slot = slots[pos];
      if (!slot) return;

      const isInstant = transition === 'instant';

      // 退場
      if (character === 'empty') {
        stopBlink(slot);
        if (!isInstant) {
          await fadeElement(slot.charContainer, 1, 0);
        }
        slot.charContainer.style.display = 'none';
        slot.charContainer.innerHTML = '';
        slot.character = null;
        slot.base = null;
        slot.expression = null;
        slot.baseImg = null;
        slot.mouthImg = null;
        slot.blinkImg = null;
        slot.overlayImgs = [];
        return;
      }

      const isNewCharacter = character && character !== slot.character;

      if (isNewCharacter) {
        const charDef = CHARACTER_DEFS[character];
        if (!charDef) {
          console.warn(`Unknown character: ${character}`);
          return;
        }

        // 同キャラが別スロットにいたら除去
        for (const p of POSITIONS) {
          if (slots[p].character === character && p !== pos) {
            stopBlink(slots[p]);
            slots[p].charContainer.style.display = 'none';
            slots[p].charContainer.innerHTML = '';
            slots[p].character = null;
            slots[p].base = null;
            slots[p].expression = null;
            slots[p].baseImg = null;
            slots[p].mouthImg = null;
            slots[p].blinkImg = null;
            slots[p].overlayImgs = [];
          }
        }

        const { baseImg, mouthImg, overlayImgs, blinkImg } = buildCharacterDOM(
          slot.charContainer, charDef, expression
        );
        slot.baseImg = baseImg;
        slot.mouthImg = mouthImg;
        slot.blinkImg = blinkImg;
        slot.overlayImgs = overlayImgs;
        slot.character = character;
        slot.expression = expression || 'normal';

        // 瞬き開始
        startBlink(slot, charDef);

        // 向き（記録のみ）
        if (base) {
          slot.base = base;
        }

        // フェードイン
        if (isInstant) {
          slot.charContainer.style.display = 'block';
          slot.charContainer.style.opacity = '1';
        } else {
          slot.charContainer.style.display = 'block';
          slot.charContainer.style.opacity = '0';
          await fadeElement(slot.charContainer, 0, 1);
        }
      }

      // 向き更新（PNGでは描き分け前提、ここでは記録のみ）
      if (base && !isNewCharacter) {
        slot.base = base;
      }

      // 表情更新
      if (expression && !isNewCharacter) {
        const charDef = CHARACTER_DEFS[slot.character];
        if (charDef) {
          slot.expression = expression;
          // オーバーレイを差し替え
          const wrapper = slot.charContainer.querySelector('.png-char-wrapper');
          if (wrapper) {
            // 既存のオーバーレイを除去
            for (const img of slot.overlayImgs) img.remove();
            slot.overlayImgs = [];

            const exprOverlays = charDef.expressions[expression] || [];
            for (const src of exprOverlays) {
              const img = document.createElement('img');
              img.src = src;
              img.className = 'png-overlay';
              img.style.position = 'absolute';
              img.style.top = '0';
              img.style.left = '0';
              img.style.width = '100%';
              img.style.height = 'auto';
              wrapper.appendChild(img);
              slot.overlayImgs.push(img);
            }
          }
        }
      }
    },

    setExpression(pos, name) {
      const slot = slots[pos];
      if (!slot?.character) return;
      // setCharacter のexpressionパスを再利用
      this.setCharacter(pos, {
        character: slot.character,
        expression: name,
        transition: 'instant',
      });
    },

    setBase(pos, base) {
      const slot = slots[pos];
      if (!slot?.character) return;
      slot.base = base;
      // PNGでは向きは描き分け前提（反転はsetFlipで別途）
    },

    /** 左右反転（worldConfig.allowFlip が true の場合のみ使用想定） */
    setFlip(pos, flipped) {
      const slot = slots[pos];
      if (!slot?.character) return;
      slot.flipped = flipped;
      // center は translateX(-50%) を保持する必要がある
      const base = pos === 'center' ? 'translateX(-50%)' : '';
      slot.charContainer.style.transform = flipped ? `${base} scaleX(-1)` : base;
    },

    /** 口パク (0-1): 0.5以上で口を開く */
    setLipSync(pos, value) {
      const slot = slots[pos];
      if (!slot?.mouthImg) return;
      slot.mouthImg.style.opacity = value > 0.4 ? '1' : '0';
    },

    onFrame(callback) {
      frameCallbacks.push(callback);
      startAnimLoop();
    },

    getModel(pos) {
      return slots[pos]?.baseImg || null;
    },

    clear() {
      for (const pos of POSITIONS) {
        const slot = slots[pos];
        stopBlink(slot);
        slot.charContainer.style.display = 'none';
        slot.charContainer.innerHTML = '';
        slot.character = null;
        slot.base = null;
        slot.expression = null;
        slot.baseImg = null;
        slot.mouthImg = null;
        slot.blinkImg = null;
        slot.overlayImgs = [];
      }
    }
  };

  // --- 瞬きアニメーション ---

  /** 瞬きを開始（ランダム間隔で繰り返す） */
  function startBlink(slot, charDef) {
    if (!charDef.blink || charDef.blink.length === 0 || !slot.blinkImg) return;
    stopBlink(slot);

    function scheduleNext() {
      // 2〜6秒のランダム間隔
      const interval = 2000 + Math.random() * 4000;
      slot.blinkTimer = setTimeout(() => {
        playBlinkSequence(slot, charDef);
        scheduleNext();
      }, interval);
    }
    scheduleNext();
  }

  /** 瞬きシーケンスを1回再生 */
  function playBlinkSequence(slot, charDef) {
    const frames = charDef.blink;
    const frameMs = charDef.blinkFrameMs;
    let i = 0;

    function nextFrame() {
      if (i >= frames.length) {
        // シーケンス終了 → 非表示に戻す
        slot.blinkImg.style.display = 'none';
        return;
      }

      const src = frames[i];
      if (src) {
        slot.blinkImg.src = src;
        slot.blinkImg.style.display = 'block';
      } else {
        // null = 元に戻す
        slot.blinkImg.style.display = 'none';
      }

      i++;
      setTimeout(nextFrame, frameMs);
    }
    nextFrame();
  }

  /** 瞬きタイマーを停止 */
  function stopBlink(slot) {
    if (slot.blinkTimer) {
      clearTimeout(slot.blinkTimer);
      slot.blinkTimer = null;
    }
    if (slot.blinkImg) {
      slot.blinkImg.style.display = 'none';
    }
  }
}

// --- フェードアニメーション ---

function fadeElement(el, from, to) {
  return new Promise(resolve => {
    el.style.opacity = String(from);
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / FADE_DURATION, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      el.style.opacity = String(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

// --- 呼吸アニメーションCSS ---

function injectBreathingCSS() {
  if (document.getElementById('kitsune-breathing-css')) return;
  const style = document.createElement('style');
  style.id = 'kitsune-breathing-css';
  style.textContent = `
    @keyframes kitsune-breathing {
      0%, 100% { transform: scaleY(1) translateY(0); }
      50% { transform: scaleY(1.003) translateY(-0.15%); }
    }
    .png-char-wrapper.breathing {
      animation: kitsune-breathing 4s ease-in-out infinite;
      transform-origin: bottom center;
    }
  `;
  document.head.appendChild(style);
}
