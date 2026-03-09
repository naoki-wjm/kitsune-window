/**
 * VRM ステージ — Three.js Canvas + CSS吹き出しの二層構成
 *
 * 共通インターフェース:
 *   slots, setCharacter(), setExpression(), setBase(), setLipSync(),
 *   getModel(), onFrame(), clear()
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const POSITIONS = ['left', 'center', 'right'];
const FADE_DURATION = 1500; // ms

// スロットの X 座標（カメラが -Z 側なので左右反転）
const SLOT_X = { left: 0.8, center: 0, right: -0.8 };

// 向き（base）: Y軸回転量
const BASE_ROTATION = {
  left:  -0.5,
  center: 0,
  right:  0.5,
};

// カメラプリセット
const CAMERA_PRESETS = {
  bust: { pos: [0, 1.25, -3.5], look: [0, 1.1, 0] },
  face: { pos: [0, 1.45, -2.0], look: [0, 1.4, 0] },
  full: { pos: [0, 0.9, -5.0],  look: [0, 0.8, 0] },
  wide: { pos: [0, 1.0, -6.0],  look: [0, 0.9, 0] },
  talk: { pos: [0, 1.8, -5.5],  look: [0, 1.2, 0] },
};

const EXPRESSION_NAMES = ['happy', 'sad', 'angry', 'surprised', 'relaxed'];

// モデルのキャッシュ
const vrmCache = {};

export async function createVRMStage(containerEl, worldConfig) {
  const BASE = import.meta.env.BASE_URL || '/';

  // worldConfig.characters からモデルパスを構築
  const CHARACTER_MODELS = {};
  for (const [id, def] of Object.entries(worldConfig.characters || {})) {
    CHARACTER_MODELS[id] = `${BASE}${def.model}`;
  }

  // --- Three.js セットアップ ---
  const width = containerEl.clientWidth;
  const height = containerEl.clientHeight;

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const canvasEl = renderer.domElement;
  canvasEl.style.position = 'absolute';
  canvasEl.style.top = '0';
  canvasEl.style.left = '0';
  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';
  canvasEl.style.zIndex = '1';
  canvasEl.style.pointerEvents = 'none';
  containerEl.appendChild(canvasEl);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(20, width / height, 0.1, 100);

  // カメラプリセット適用
  const preset = CAMERA_PRESETS[worldConfig.camera] || CAMERA_PRESETS.talk;
  camera.position.set(...preset.pos);
  camera.lookAt(new THREE.Vector3(...preset.look));

  // ライティング
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(-1, 2, -3);
  scene.add(dirLight);

  // --- VRMローダー ---
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

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
      vrm: null,
    };
  }

  // --- VRM読み込み ---
  async function loadVRM(id) {
    if (vrmCache[id]) return vrmCache[id];

    const modelPath = CHARACTER_MODELS[id];
    if (!modelPath) {
      console.warn(`Unknown character: ${id}`);
      return null;
    }

    const gltf = await loader.loadAsync(modelPath);
    const vrm = gltf.userData.vrm;

    VRMUtils.removeUnnecessaryJoints(vrm.scene);
    fixTPose(vrm);

    // SpringBone無効化（Tポーズ補正で暴走するため）
    if (vrm.springBoneManager) {
      vrm.springBoneManager.reset();
      vrm.springBoneManager.update = () => {};
    }

    vrmCache[id] = vrm;
    return vrm;
  }

  /** Tポーズ → 自然な立ちポーズに補正 */
  function fixTPose(vrm) {
    const h = vrm.humanoid;
    if (!h) return;

    const leftUpper = h.getNormalizedBoneNode('leftUpperArm');
    const rightUpper = h.getNormalizedBoneNode('rightUpperArm');
    if (leftUpper) leftUpper.rotation.z = 1.2;
    if (rightUpper) rightUpper.rotation.z = -1.2;

    const leftLower = h.getNormalizedBoneNode('leftLowerArm');
    const rightLower = h.getNormalizedBoneNode('rightLowerArm');
    if (leftLower) leftLower.rotation.z = 0.15;
    if (rightLower) rightLower.rotation.z = -0.15;
  }

  // --- フレームコールバック ---
  const frameCallbacks = [];
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // VRM更新
    for (const pos of POSITIONS) {
      const slot = slots[pos];
      if (slot.vrm) slot.vrm.update(delta);
    }

    // 登録コールバック実行
    for (const cb of frameCallbacks) cb();

    renderer.render(scene, camera);
  }
  animate();

  // リサイズ対応
  function handleResize() {
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', handleResize);

  // --- 公開インターフェース ---
  return {
    slots,

    async setCharacter(pos, { character, base, expression, transition }) {
      const slot = slots[pos];
      if (!slot) return;

      const isInstant = transition === 'instant';

      // 退場
      if (character === 'empty') {
        if (slot.vrm) {
          if (!isInstant) {
            await fadeVRM(slot.vrm, 1, 0);
          }
          scene.remove(slot.vrm.scene);
          slot.vrm = null;
        }
        slot.character = null;
        slot.base = null;
        slot.expression = null;
        return;
      }

      const isNewCharacter = character && character !== slot.character;

      if (isNewCharacter) {
        // 既存を除去
        if (slot.vrm) {
          scene.remove(slot.vrm.scene);
          slot.vrm = null;
        }

        const vrm = await loadVRM(character);
        if (!vrm) return;

        // 同キャラが別スロットにいたら除去
        for (const p of POSITIONS) {
          if (slots[p].vrm === vrm && p !== pos) {
            scene.remove(vrm.scene);
            slots[p].vrm = null;
            slots[p].character = null;
            slots[p].base = null;
            slots[p].expression = null;
          }
        }

        vrm.scene.rotation.y = BASE_ROTATION[base || 'center'];
        vrm.scene.position.x = SLOT_X[pos];
        vrm.scene.position.y = 0;

        // フェードイン用の透明度
        setVRMOpacity(vrm, isInstant ? 1 : 0);
        scene.add(vrm.scene);

        slot.vrm = vrm;
        slot.character = character;
        slot.base = base || 'center';

        if (!isInstant) {
          await fadeVRM(vrm, 0, 1);
        }
      }

      // 向き更新
      if (base && slot.vrm) {
        slot.base = base;
        slot.vrm.scene.rotation.y = BASE_ROTATION[base] ?? 0;
      }

      // 表情更新
      if (expression && slot.vrm) {
        slot.expression = expression;
        applyExpression(slot.vrm, expression);
      }
    },

    setExpression(pos, name) {
      const slot = slots[pos];
      if (!slot?.vrm) return;
      slot.expression = name;
      applyExpression(slot.vrm, name);
    },

    setBase(pos, base) {
      const slot = slots[pos];
      if (!slot?.vrm) return;
      slot.base = base;
      slot.vrm.scene.rotation.y = BASE_ROTATION[base] ?? 0;
    },

    setLipSync(pos, value) {
      const slot = slots[pos];
      if (!slot?.vrm?.expressionManager) return;
      slot.vrm.expressionManager.setValue('aa', value);
    },

    onFrame(callback) {
      frameCallbacks.push(callback);
    },

    getModel(pos) {
      return slots[pos]?.vrm || null;
    },

    clear() {
      for (const pos of POSITIONS) {
        const slot = slots[pos];
        if (slot.vrm) {
          scene.remove(slot.vrm.scene);
          slot.vrm = null;
        }
        slot.character = null;
        slot.base = null;
        slot.expression = null;
      }
    }
  };
}

// --- VRM 表情適用 ---

function applyExpression(vrm, name) {
  const em = vrm.expressionManager;
  if (!em) return;
  for (const expr of ['happy', 'sad', 'angry', 'surprised', 'relaxed']) {
    em.setValue(expr, 0);
  }
  if (name && name !== 'neutral') {
    em.setValue(name, 1.0);
  }
}

// --- VRM 透明度制御 ---

function setVRMOpacity(vrm, opacity) {
  vrm.scene.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        mat.transparent = true;
        mat.opacity = opacity;
      }
    }
  });
}

function fadeVRM(vrm, from, to) {
  return new Promise(resolve => {
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(elapsed / FADE_DURATION, 1);
      const eased = t < 0.5
        ? 2 * t * t
        : 1 - (-2 * t + 2) ** 2 / 2;
      setVRMOpacity(vrm, from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}
