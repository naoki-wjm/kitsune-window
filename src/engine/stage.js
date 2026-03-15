/**
 * ステージ振り分け — world.json の type に応じて適切なステージを生成
 *
 * 共通インターフェース:
 *   slots, setCharacter(), setExpression(), setBase(), setLipSync(),
 *   getModel(), onFrame(), clear()
 *
 * キャラクター素材のパス解決:
 *   worlds/{world}/characters/ を優先し、なければ共有プール（characters/）にフォールバック
 */

export async function createStage(containerEl, worldConfig, worldName) {
  const type = worldConfig?.type || 'live2d';

  // キャラクターパスの解決（ワールド内 → 共有プール）
  const resolved = worldName
    ? await resolveCharacterPaths(worldConfig, worldName)
    : worldConfig;

  switch (type) {
    case 'live2d': {
      const { createLive2DStage } = await import('./stage-live2d.js');
      return createLive2DStage(containerEl, resolved);
    }
    case 'vrm': {
      const { createVRMStage } = await import('./stage-vrm.js');
      return createVRMStage(containerEl, resolved);
    }
    case 'png': {
      const { createPNGStage } = await import('./stage-png.js');
      return createPNGStage(containerEl, resolved);
    }
    default:
      throw new Error(`Unknown stage type: ${type}`);
  }
}

/**
 * キャラクターパスを解決する。
 *
 * デフォルト: ワールド内配置を前提とし、全パスに worlds/{world}/ をプレフィックス。
 * sharedCharacters: true の場合のみ HEAD リクエストでワールド内の存在を確認し、
 * なければ共有プール（characters/）にフォールバックする。
 *
 * キャラ定義に path フィールドがあれば各素材パスに自動プレフィックスする。
 */
async function resolveCharacterPaths(worldConfig, worldName) {
  const BASE = import.meta.env.BASE_URL || '/';
  const resolved = JSON.parse(JSON.stringify(worldConfig));
  const useSharedPool = resolved.sharedCharacters === true;

  for (const [id, def] of Object.entries(resolved.characters || {})) {
    // path プレフィックスの展開
    applyPathPrefix(def);

    if (useSharedPool) {
      // 共有キャラプール有効: HEAD リクエストでワールド内を確認
      const primaryPath = def.model || def.base || getPrimaryPathFromBases(def);
      if (!primaryPath) continue;

      const worldLocalUrl = `${BASE}worlds/${worldName}/${primaryPath}`;
      let useWorldLocal = false;
      try {
        const res = await fetch(worldLocalUrl, { method: 'HEAD' });
        // SPA フォールバック対策: text/html が返ったら実ファイルではない
        const ct = res.headers.get('content-type') || '';
        useWorldLocal = res.ok && !ct.includes('text/html');
      } catch {
        // ネットワークエラー等 → 共有プールにフォールバック
      }

      if (useWorldLocal) {
        const prefix = `worlds/${worldName}/`;
        prefixAllPaths(def, prefix);
      }
    } else {
      // デフォルト: ワールド内配置を前提
      const prefix = `worlds/${worldName}/`;
      prefixAllPaths(def, prefix);
    }
  }

  return resolved;
}

/** キャラ定義の path フィールドを各素材パスに展開する */
function applyPathPrefix(def) {
  const p = def.path;
  if (!p) return;
  delete def.path;

  if (def.bases) {
    // 向き別モード: 各向きに再帰適用（向き側に独自の path がなければ親の path を使う）
    for (const [dir, dirDef] of Object.entries(def.bases)) {
      if (!dirDef.path) dirDef.path = p;
      applyPathPrefix(dirDef);
    }
    return;
  }

  // 1枚モード / 単一向き
  if (def.model) def.model = p + def.model;
  if (def.base) def.base = p + def.base;
  if (def.mouth) def.mouth = p + def.mouth;
  if (def.blink) {
    def.blink = def.blink.map(v => v ? p + v : v);
  }
  if (def.expressionBlink) {
    for (const [expr, frames] of Object.entries(def.expressionBlink)) {
      def.expressionBlink[expr] = frames.map(v => v ? p + v : v);
    }
  }
  if (def.expressionMouth) {
    for (const [expr, path] of Object.entries(def.expressionMouth)) {
      def.expressionMouth[expr] = p + path;
    }
  }
  if (def.expressions) {
    for (const [expr, overlays] of Object.entries(def.expressions)) {
      def.expressions[expr] = overlays.map(v => p + v);
    }
  }
}

/** bases 形式から主要パスを取得（HEAD確認用） */
function getPrimaryPathFromBases(def) {
  if (!def.bases) return null;
  const first = Object.values(def.bases)[0];
  return first?.base || null;
}

/** 全素材パスにプレフィックスを付与（ワールド内配置用） */
function prefixAllPaths(def, prefix) {
  if (def.model) def.model = prefix + def.model;
  if (def.base) def.base = prefix + def.base;
  if (def.mouth) def.mouth = prefix + def.mouth;
  if (def.blink) {
    def.blink = def.blink.map(v => v ? prefix + v : v);
  }
  if (def.expressionBlink) {
    for (const [expr, frames] of Object.entries(def.expressionBlink)) {
      def.expressionBlink[expr] = frames.map(v => v ? prefix + v : v);
    }
  }
  if (def.expressionMouth) {
    for (const [expr, path] of Object.entries(def.expressionMouth)) {
      def.expressionMouth[expr] = prefix + path;
    }
  }
  if (def.expressions) {
    for (const [expr, overlays] of Object.entries(def.expressions)) {
      def.expressions[expr] = overlays.map(v => prefix + v);
    }
  }
  if (def.bases) {
    for (const dirDef of Object.values(def.bases)) {
      prefixAllPaths(dirDef, prefix);
    }
  }
}
