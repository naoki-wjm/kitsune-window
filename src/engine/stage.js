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
 * キャラクターごとにワールド内パスの存在を確認し、あればパスを書き換える。
 * 判定はキャラの主要アセット（model または base）に対する HEAD リクエスト1回のみ。
 * 同一キャラの全アセットは同じ場所にあることを前提とする。
 */
async function resolveCharacterPaths(worldConfig, worldName) {
  const BASE = import.meta.env.BASE_URL || '/';
  const resolved = JSON.parse(JSON.stringify(worldConfig));

  for (const [id, def] of Object.entries(resolved.characters || {})) {
    const primaryPath = def.model || def.base;
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
      if (def.model) def.model = prefix + def.model;
      if (def.base) def.base = prefix + def.base;
      if (def.mouth) def.mouth = prefix + def.mouth;
      if (def.blink) {
        def.blink = def.blink.map(p => p ? prefix + p : p);
      }
      if (def.expressions) {
        for (const [expr, overlays] of Object.entries(def.expressions)) {
          def.expressions[expr] = overlays.map(p => prefix + p);
        }
      }
    }
  }

  return resolved;
}
