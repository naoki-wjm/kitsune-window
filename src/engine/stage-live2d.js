/**
 * Live2D ステージ — PixiJS Canvas + CSS吹き出しの二層構成
 *
 * 共通インターフェース:
 *   slots, setCharacter(), setExpression(), setBase(), setLipSync(),
 *   getModel(), onFrame(), clear()
 */

import * as PIXI from 'pixi.js';
import { Live2DModel } from 'pixi-live2d-display-lipsyncpatch/cubism4';

window.PIXI = PIXI;

const POSITIONS = ['left', 'center', 'right'];
const FADE_DURATION = 1500; // ms

// モデルのキャッシュ（同じキャラを再ロードしない）
const modelCache = {};

export async function createLive2DStage(containerEl, worldConfig) {
  const BASE = import.meta.env.BASE_URL || '/';

  // worldConfig.characters からモデルパスと向き・表情・表示比率定義を構築
  const CHARACTER_MODELS = {};
  const CHARACTER_DIRECTIONS = {};
  const CHARACTER_DISPLAY_RATIO = {};
  const CHARACTER_EXPRESSIONS = {};
  for (const [id, def] of Object.entries(worldConfig.characters || {})) {
    CHARACTER_MODELS[id] = `${BASE}${def.model}`;
    if (def.directions) {
      CHARACTER_DIRECTIONS[id] = def.directions;
    }
    if (def.displayRatio != null) {
      CHARACTER_DISPLAY_RATIO[id] = def.displayRatio;
    }
    if (def.expressions) {
      CHARACTER_EXPRESSIONS[id] = def.expressions;
    }
  }

  // --- PixiJS Canvas（キャラ描画レイヤー） ---
  const pixiApp = new PIXI.Application({
    backgroundAlpha: 0,
    resizeTo: containerEl,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  if (pixiApp.init) await pixiApp.init();

  const canvasEl = pixiApp.view;
  canvasEl.style.position = 'absolute';
  canvasEl.style.top = '0';
  canvasEl.style.left = '0';
  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';
  canvasEl.style.zIndex = '1';
  canvasEl.style.pointerEvents = 'none';
  containerEl.appendChild(canvasEl);

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

    slots[pos] = {
      element: slotEl,
      bubbleEl,
      character: null,
      base: null,
      expression: null,
      model: null,
      modelContainer: null,
    };
  }

  // 各スロット用の PIXI.Container を作成
  // フェード時のみ AlphaFilter を適用し、通常時は外す（フィルタの内部フレームバッファによる画質低下を防ぐ）
  for (const pos of POSITIONS) {
    const container = new PIXI.Container();
    container.visible = false;
    pixiApp.stage.addChild(container);
    slots[pos].modelContainer = container;
    slots[pos].fadeFilter = new PIXI.AlphaFilter(1);
  }

  /** フィルタを付けてフェード開始の準備 */
  function applyFilter(slot, alpha) {
    slot.fadeFilter.alpha = alpha;
    slot.modelContainer.filters = [slot.fadeFilter];
    const screen = pixiApp.screen;
    slot.modelContainer.filterArea = new PIXI.Rectangle(
      -screen.width, -screen.height * 2,
      screen.width * 3, screen.height * 3
    );
  }

  /** フィルタを外す（フルクオリティ描画に戻す） */
  function removeFilter(slot) {
    slot.modelContainer.filters = [];
    slot.modelContainer.filterArea = null;
  }

  /** スロットのフェードアニメーション */
  function fadeSlot(slot, from, to) {
    return new Promise(resolve => {
      applyFilter(slot, from);
      const start = performance.now();
      const tick = () => {
        const elapsed = performance.now() - start;
        const t = Math.min(elapsed / FADE_DURATION, 1);
        slot.fadeFilter.alpha = from + (to - from) * easeInOut(t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  function getSlotX(pos) {
    const w = pixiApp.screen.width;
    switch (pos) {
      case 'left':   return w * 0.2;
      case 'center': return w * 0.5;
      case 'right':  return w * 0.8;
    }
  }

  function updateLayout() {
    // PixiJS の内部サイズを先に確定させる
    pixiApp.resize();
    const screen = pixiApp.screen;
    for (const pos of POSITIONS) {
      const slot = slots[pos];
      if (slot.modelContainer) {
        slot.modelContainer.x = getSlotX(pos);
        slot.modelContainer.y = screen.height * 0.85;
        // フィルタ適用中なら filterArea も更新
        if (slot.modelContainer.filters?.length) {
          slot.modelContainer.filterArea = new PIXI.Rectangle(
            -screen.width, -screen.height * 2,
            screen.width * 3, screen.height * 3
          );
        }
        // モデルのスケールも再計算
        if (slot.model) fitModel(slot.model, slot.character);
      }
    }
  }
  updateLayout();
  window.addEventListener('resize', updateLayout);

  async function loadModel(characterName) {
    if (modelCache[characterName]) return modelCache[characterName];
    const modelPath = CHARACTER_MODELS[characterName];
    if (!modelPath) {
      console.warn(`Unknown character: ${characterName}`);
      return null;
    }
    const model = await Live2DModel.from(modelPath, {
      autoHitTest: false,
      autoFocus: false,
      autoUpdate: true,
    });
    modelCache[characterName] = model;
    return model;
  }

  /** viewportの縦横比に応じてキャラの基準高さ比率を算出 */
  function getBaseHeightRatio() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect > 1.5) return 0.70;  // 横長（スマホ横持ち等）
    if (aspect > 1.0) return 0.60;  // やや横長
    return 0.55;                     // 縦長（通常）
  }

  function fitModel(model, characterName) {
    model.scale.set(1);
    const originalHeight = model.height;
    const ratio = CHARACTER_DISPLAY_RATIO[characterName] ?? 1.0;
    const baseRatio = getBaseHeightRatio();
    const targetHeight = pixiApp.screen.height * baseRatio / ratio;
    const scale = targetHeight / originalHeight;
    model.scale.set(scale);
    // アンカーY=ratio で、表示部分の下端がスロット位置に来る
    model.anchor.set(0.5, ratio);
  }

  /** Live2Dパラメータで向きをなめらかに適用 */
  const directionAnimations = {}; // pos -> animation state

  function applyDirection(slot) {
    const model = slot.model;
    if (!model?.internalModel?.coreModel) return;
    const core = model.internalModel.coreModel;
    const dirs = CHARACTER_DIRECTIONS[slot.character];
    const dirDef = dirs?.[slot.base] || null;
    const targetAngleX = dirDef?.AngleX ?? 0;
    const targetBodyAngleX = dirDef?.BodyAngleX ?? 0;

    // 現在値を取得
    const currentAngleX = core.getParameterValueById('ParamAngleX');
    const currentBodyAngleX = core.getParameterValueById('ParamBodyAngleX');

    // 既存のアニメーションがあればキャンセル
    const pos = Object.keys(slots).find(p => slots[p] === slot);
    if (directionAnimations[pos]) {
      directionAnimations[pos].cancelled = true;
    }

    // 差がほぼなければ即適用
    if (Math.abs(currentAngleX - targetAngleX) < 0.5 &&
        Math.abs(currentBodyAngleX - targetBodyAngleX) < 0.5) {
      core.setParameterValueById('ParamAngleX', targetAngleX);
      core.setParameterValueById('ParamBodyAngleX', targetBodyAngleX);
      return;
    }

    const anim = { cancelled: false };
    directionAnimations[pos] = anim;
    const duration = 400; // ms
    const start = performance.now();
    const fromAngleX = currentAngleX;
    const fromBodyAngleX = currentBodyAngleX;

    function tick() {
      if (anim.cancelled) return;
      const t = Math.min((performance.now() - start) / duration, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      core.setParameterValueById('ParamAngleX', fromAngleX + (targetAngleX - fromAngleX) * eased);
      core.setParameterValueById('ParamBodyAngleX', fromBodyAngleX + (targetBodyAngleX - fromBodyAngleX) * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /**
   * 表情を適用する
   * - "normal" → デフォルトにリセット
   * - world.json の expressions に文字列値 → SDK表情名として適用
   * - world.json の expressions にオブジェクト値 → パラメータ直接セット（毎フレーム維持）
   * - world.json に定義なし → SDK表情名としてそのまま試行
   */
  // パラメータ直接セット方式の現在値を毎フレーム適用するためのマップ
  const activeParamOverrides = {}; // pos -> { paramId: value } or null

  function applyExpression(slot) {
    const model = slot.model;
    if (!model) return;
    const name = slot.expression;
    const pos = Object.keys(slots).find(p => slots[p] === slot);

    // "normal" or null → デフォルトにリセット
    if (!name || name === 'normal') {
      resetParamOverrides(pos, model);
      const mgr = model.internalModel?.motionManager?.expressionManager;
      if (mgr) mgr.resetExpression();
      return;
    }

    const exprDefs = CHARACTER_EXPRESSIONS[slot.character];
    const def = exprDefs?.[name];

    if (typeof def === 'string') {
      // SDK表情名として適用（.exp3.json）
      resetParamOverrides(pos, model);
      model.expression(def);
    } else if (typeof def === 'object' && def !== null) {
      // パラメータ直接セット — 前回のオーバーライドをリセットしてから新しいものを登録
      resetParamOverrides(pos, model);
      const mgr = model.internalModel?.motionManager?.expressionManager;
      if (mgr) mgr.resetExpression();
      activeParamOverrides[pos] = def;
    } else {
      // world.json に定義なし → 名前をそのままSDK表情名として試行
      resetParamOverrides(pos, model);
      model.expression(name);
    }
  }

  /** 前回のパラメータオーバーライドを0にリセットしてクリア */
  function resetParamOverrides(pos, model) {
    const prev = activeParamOverrides[pos];
    if (prev && model?.internalModel?.coreModel) {
      const core = model.internalModel.coreModel;
      for (const paramId of Object.keys(prev)) {
        core.setParameterValueById(paramId, 0);
      }
    }
    activeParamOverrides[pos] = null;
  }

  // 毎フレーム: パラメータオーバーライドを適用（SDK更新後に上書き）
  pixiApp.ticker.add(() => {
    for (const pos of POSITIONS) {
      const overrides = activeParamOverrides[pos];
      if (!overrides) continue;
      const model = slots[pos]?.model;
      if (!model?.internalModel?.coreModel) continue;
      const core = model.internalModel.coreModel;
      for (const [paramId, value] of Object.entries(overrides)) {
        core.setParameterValueById(paramId, value);
      }
    }
  });

  return {
    slots,

    async setCharacter(pos, { character, base, expression, transition }) {
      const slot = slots[pos];
      if (!slot) return;

      const isInstant = transition === 'instant';

      // 退場
      if (character === 'empty') {
        if (slot.model) {
          if (isInstant) {
            slot.modelContainer.visible = false;
          } else {
            await fadeSlot(slot, 1, 0);
            slot.modelContainer.visible = false;
          }
          removeFilter(slot);
          slot.modelContainer.removeChild(slot.model);
          slot.model = null;
        }
        slot.character = null;
        slot.base = null;
        slot.expression = null;
        return;
      }

      const isNewCharacter = character && character !== slot.character;

      if (isNewCharacter) {
        if (slot.model) {
          slot.modelContainer.removeChild(slot.model);
          slot.model = null;
        }

        const model = await loadModel(character);
        if (!model) return;

        for (const p of POSITIONS) {
          if (slots[p].model === model && p !== pos) {
            slots[p].modelContainer.removeChild(model);
            slots[p].model = null;
            slots[p].character = null;
            slots[p].base = null;
            slots[p].expression = null;
          }
        }

        fitModel(model, character);
        slot.modelContainer.visible = false;
        slot.modelContainer.addChild(model);
        slot.model = model;
        slot.character = character;
        slot.base = base || 'center';
        applyDirection(slot);
      } else if (base && base !== slot.base) {
        slot.base = base;
        applyDirection(slot);
      }

      if (expression) {
        slot.expression = expression;
        applyExpression(slot);
      }

      if (isNewCharacter && slot.model) {
        if (isInstant) {
          slot.modelContainer.visible = true;
          removeFilter(slot);
        } else {
          slot.modelContainer.visible = true;
          await fadeSlot(slot, 0, 1);
          removeFilter(slot);
        }
      }
    },

    /** 表情を設定 */
    setExpression(pos, name) {
      const slot = slots[pos];
      if (!slot?.character) return;
      slot.expression = name;
      applyExpression(slot);
    },

    /** 向きを設定 */
    setBase(pos, base) {
      const slot = slots[pos];
      if (!slot?.character) return;
      slot.base = base;
      applyDirection(slot);
    },

    /** 口パク値を設定 (0-1) */
    setLipSync(pos, value) {
      const model = slots[pos]?.model;
      if (!model?.internalModel?.coreModel) return;
      model.internalModel.coreModel.setParameterValueById(
        'ParamMouthOpenY', value
      );
    },

    /** フレームコールバック登録 */
    onFrame(callback) {
      pixiApp.ticker.add(callback);
    },

    getModel(pos) {
      return slots[pos]?.model || null;
    },

    clear() {
      for (const pos of POSITIONS) {
        const slot = slots[pos];
        if (slot.model) {
          slot.modelContainer.visible = false;
          removeFilter(slot);
          slot.modelContainer.removeChild(slot.model);
          slot.model = null;
        }
        slot.character = null;
        slot.base = null;
        slot.expression = null;
      }
    }
  };
}

// --- ユーティリティ ---

function easeInOut(t) {
  return t < 0.5
    ? 2 * t * t
    : 1 - (-2 * t + 2) ** 2 / 2;
}
