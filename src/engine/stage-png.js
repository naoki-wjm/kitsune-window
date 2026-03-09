/**
 * PNG ステージ — DOM画像重ね合わせ + CSS吹き出し + 呼吸アニメーション
 *
 * 最軽量版。Three.js も PixiJS も不要。
 * ベース画像 + オーバーレイ（表情差分・口パク）を DOM で合成する。
 *
 * キャラ定義は2形式をサポート:
 *   1枚モード: { base, mouth?, blink?, expressions? }
 *   向き別モード: { bases: { left: {...}, right: {...}, ... } }
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
    if (def.bases) {
      // 向き別モード
      CHARACTER_DEFS[id] = { multiBase: true, bases: {} };
      for (const [dir, dirDef] of Object.entries(def.bases)) {
        CHARACTER_DEFS[id].bases[dir] = buildSingleDef(dirDef, BASE);
      }
    } else {
      // 1枚モード
      CHARACTER_DEFS[id] = { multiBase: false, single: buildSingleDef(def, BASE) };
    }
  }

  /** 単一向きの定義を正規化 */
  function buildSingleDef(def, base) {
    const d = {
      base: `${base}${def.base}`,
      mouth: def.mouth ? `${base}${def.mouth}` : null,
      blink: (def.blink || []).map(p => p ? `${base}${p}` : null),
      blinkFrameMs: def.blinkFrameMs || 90,
      expressions: {},
    };
    for (const [exprName, overlays] of Object.entries(def.expressions || {})) {
      d.expressions[exprName] = overlays.map(p => `${base}${p}`);
    }
    return d;
  }

  /** キャラ定義から向きに対応する定義を取得（フォールバック付き） */
  function getDirectionDef(charDef, base) {
    if (!charDef.multiBase) return charDef.single;
    const bases = charDef.bases;
    if (bases[base]) return bases[base];
    // フォールバック: center → 最初に定義された向き
    if (bases.center) return bases.center;
    const keys = Object.keys(bases);
    return keys.length > 0 ? bases[keys[0]] : null;
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
    const slotEl = document.createElement('div');
    slotEl.className = `slot slot-${pos}`;

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'bubble';
    bubbleEl.style.visibility = 'hidden';

    slotEl.appendChild(bubbleEl);
    overlayEl.appendChild(slotEl);

    const charContainer = document.createElement('div');
    charContainer.className = `png-char png-char-${pos}`;
    charContainer.style.position = 'absolute';
    charContainer.style.bottom = '0';
    charContainer.style.height = '80%';
    charContainer.style.display = 'none';
    charContainer.style.alignItems = 'flex-end';
    charContainer.style.justifyContent = 'center';
    switch (pos) {
      case 'left':   charContainer.style.left = '5%';  charContainer.style.width = '45%'; break;
      case 'center': charContainer.style.left = '50%'; charContainer.style.transform = 'translateX(-50%)'; charContainer.style.width = '45%'; break;
      case 'right':  charContainer.style.right = '5%'; charContainer.style.width = '45%'; break;
    }
    charLayer.appendChild(charContainer);

    slots[pos] = {
      element: slotEl,
      bubbleEl,
      charContainer,
      character: null,
      base: null,
      expression: null,
      baseImg: null,
      mouthImg: null,
      blinkImg: null,
      blinkTimer: null,
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

  // --- キャラ表示 ---
  function buildCharacterDOM(container, dirDef, expression) {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'png-char-wrapper breathing';
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-block';
    wrapper.style.maxWidth = '100%';
    wrapper.style.maxHeight = '100%';

    const baseImg = document.createElement('img');
    baseImg.src = dirDef.base;
    baseImg.className = 'png-base';
    baseImg.style.display = 'block';
    baseImg.style.width = 'auto';
    baseImg.style.height = 'auto';
    baseImg.style.maxHeight = '80vh';
    baseImg.style.maxWidth = '100%';
    wrapper.appendChild(baseImg);

    const overlayImgs = [];
    const exprOverlays = dirDef.expressions[expression || 'normal'] || [];
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

    let mouthImg = null;
    if (dirDef.mouth) {
      mouthImg = document.createElement('img');
      mouthImg.src = dirDef.mouth;
      mouthImg.className = 'png-mouth';
      mouthImg.style.position = 'absolute';
      mouthImg.style.top = '0';
      mouthImg.style.left = '0';
      mouthImg.style.width = '100%';
      mouthImg.style.height = 'auto';
      mouthImg.style.opacity = '0';
      wrapper.appendChild(mouthImg);
    }

    let blinkImg = null;
    if (dirDef.blink && dirDef.blink.length > 0) {
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

  /** スロットの表示を向きに合わせて全再構築する（向き変更・新規登場用） */
  function rebuildSlot(slot) {
    const charDef = CHARACTER_DEFS[slot.character];
    if (!charDef) return;
    const dirDef = getDirectionDef(charDef, slot.base || 'center');
    if (!dirDef) return;

    stopBlink(slot);
    const wasVisible = slot.charContainer.style.display !== 'none';
    const { baseImg, mouthImg, overlayImgs, blinkImg } = buildCharacterDOM(
      slot.charContainer, dirDef, slot.expression
    );
    slot.baseImg = baseImg;
    slot.mouthImg = mouthImg;
    slot.blinkImg = blinkImg;
    slot.overlayImgs = overlayImgs;
    startBlink(slot, dirDef);
    if (wasVisible) {
      slot.charContainer.style.display = 'flex';
      slot.charContainer.style.opacity = '1';
    }
  }

  /** 表情オーバーレイだけを差し替える（DOM全再構築より軽量） */
  function updateExpression(slot) {
    const charDef = CHARACTER_DEFS[slot.character];
    if (!charDef) return;
    const dirDef = getDirectionDef(charDef, slot.base || 'center');
    if (!dirDef) return;

    const wrapper = slot.charContainer.querySelector('.png-char-wrapper');
    if (!wrapper) return;

    // 既存オーバーレイを除去
    for (const img of slot.overlayImgs) img.remove();
    slot.overlayImgs = [];

    // 新しいオーバーレイを挿入（瞬き画像の前に）
    const exprOverlays = dirDef.expressions[slot.expression || 'normal'] || [];
    const insertBefore = slot.blinkImg || null;
    for (const src of exprOverlays) {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'png-overlay';
      img.style.position = 'absolute';
      img.style.top = '0';
      img.style.left = '0';
      img.style.width = '100%';
      img.style.height = 'auto';
      wrapper.insertBefore(img, insertBefore);
      slot.overlayImgs.push(img);
    }
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

        slot.character = character;
        slot.base = base || 'center';
        slot.expression = expression || 'normal';

        const dirDef = getDirectionDef(charDef, slot.base);
        if (!dirDef) return;

        const { baseImg, mouthImg, overlayImgs, blinkImg } = buildCharacterDOM(
          slot.charContainer, dirDef, slot.expression
        );
        slot.baseImg = baseImg;
        slot.mouthImg = mouthImg;
        slot.blinkImg = blinkImg;
        slot.overlayImgs = overlayImgs;
        startBlink(slot, dirDef);

        // フェードイン
        if (isInstant) {
          slot.charContainer.style.display = 'flex';
          slot.charContainer.style.opacity = '1';
        } else {
          slot.charContainer.style.display = 'flex';
          slot.charContainer.style.opacity = '0';
          await fadeElement(slot.charContainer, 0, 1);
        }
        return;
      }

      // 既存キャラの向き変更
      if (base && base !== slot.base) {
        slot.base = base;
        rebuildSlot(slot);
      }

      // 既存キャラの表情変更
      if (expression && expression !== slot.expression) {
        slot.expression = expression;
        updateExpression(slot);
      }
    },

    setExpression(pos, name) {
      const slot = slots[pos];
      if (!slot?.character) return;
      if (name === slot.expression) return;
      slot.expression = name;
      updateExpression(slot);
    },

    setBase(pos, base) {
      const slot = slots[pos];
      if (!slot?.character) return;
      if (base === slot.base) return;
      slot.base = base;
      rebuildSlot(slot);
    },

    /** 左右反転（worldConfig.allowFlip が true の場合のみ使用想定） */
    setFlip(pos, flipped) {
      const slot = slots[pos];
      if (!slot?.character) return;
      slot.flipped = flipped;
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

  function startBlink(slot, dirDef) {
    if (!dirDef.blink || dirDef.blink.length === 0 || !slot.blinkImg) return;
    stopBlink(slot);

    function scheduleNext() {
      const interval = 2000 + Math.random() * 4000;
      slot.blinkTimer = setTimeout(() => {
        playBlinkSequence(slot, dirDef);
        scheduleNext();
      }, interval);
    }
    scheduleNext();
  }

  function playBlinkSequence(slot, dirDef) {
    const frames = dirDef.blink;
    const frameMs = dirDef.blinkFrameMs;
    let i = 0;

    function nextFrame() {
      if (i >= frames.length) {
        slot.blinkImg.style.display = 'none';
        return;
      }
      const src = frames[i];
      if (src) {
        slot.blinkImg.src = src;
        slot.blinkImg.style.display = 'block';
      } else {
        slot.blinkImg.style.display = 'none';
      }
      i++;
      setTimeout(nextFrame, frameMs);
    }
    nextFrame();
  }

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
