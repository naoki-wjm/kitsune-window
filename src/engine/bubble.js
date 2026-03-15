/**
 * 吹き出し管理 — CSS吹き出し + 一文字送り + 口パク連動
 *
 * stage の共通インターフェース (setLipSync, onFrame) を使用。
 * Live2D / VRM / PNG いずれのステージでも動作する。
 */

const CHAR_INTERVAL = 70; // ms per character

export function createBubbleManager(stage) {
  const typewriters = {}; // position -> current interval ID
  let clearTimer = null;

  // 口パク状態: position -> boolean（セリフ表示中か）
  const lipSyncState = {};

  // 口パク制御（共通インターフェース経由）
  let mouthPhase = 0;
  stage.onFrame(() => {
    mouthPhase += 0.135;
    for (const pos of Object.keys(lipSyncState)) {
      if (lipSyncState[pos]) {
        const value = (Math.sin(mouthPhase * 3.5) + 1) / 2 * 0.8 + 0.1;
        stage.setLipSync(pos, value);
      } else {
        stage.setLipSync(pos, 0);
      }
    }
  });

  return {
    /**
     * 指定positionに吹き出しを表示（一文字送り）
     */
    show(position, text) {
      const slot = stage.slots[position];
      if (!slot) return;

      // 既存の一文字送りを停止
      if (typewriters[position]) {
        clearInterval(typewriters[position]);
        typewriters[position] = null;
      }

      // クリアタイマーをリセット
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }

      const bubbleEl = slot.bubbleEl;
      bubbleEl.textContent = '';
      bubbleEl.style.visibility = 'visible';
      bubbleEl.style.opacity = '1';

      const chars = [];
      for (const ch of text) {
        chars.push(ch);
      }

      // 口パク開始
      lipSyncState[position] = true;

      let index = 0;
      typewriters[position] = setInterval(() => {
        if (index < chars.length) {
          const ch = chars[index];
          if (ch === '\n') {
            bubbleEl.appendChild(document.createElement('br'));
          } else {
            bubbleEl.appendChild(document.createTextNode(ch));
          }
          index++;
        } else {
          clearInterval(typewriters[position]);
          typewriters[position] = null;
          lipSyncState[position] = false;
        }
      }, CHAR_INTERVAL);
    },

    /** トーク終了後10秒で全吹き出しをフェードアウト */
    scheduleAllClear() {
      if (clearTimer) {
        clearTimeout(clearTimer);
      }
      clearTimer = setTimeout(() => {
        for (const pos of Object.keys(stage.slots)) {
          const slot = stage.slots[pos];
          slot.bubbleEl.style.transition = 'opacity 500ms ease';
          slot.bubbleEl.style.opacity = '0';
          setTimeout(() => {
            slot.bubbleEl.style.visibility = 'hidden';
            slot.bubbleEl.textContent = '';
            slot.bubbleEl.style.transition = '';
          }, 500);
        }
        clearTimer = null;
      }, 10000);
    },

    /** 即座に全吹き出しをクリア */
    clearAll() {
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
      for (const pos of Object.keys(typewriters)) {
        if (typewriters[pos]) {
          clearInterval(typewriters[pos]);
          typewriters[pos] = null;
        }
      }
      for (const pos of Object.keys(stage.slots)) {
        const slot = stage.slots[pos];
        slot.bubbleEl.style.visibility = 'hidden';
        slot.bubbleEl.textContent = '';
        slot.bubbleEl.style.opacity = '1';
        lipSyncState[pos] = false;
      }
    },

    /** 一文字送りが全position完了しているか */
    isIdle() {
      return Object.values(typewriters).every(id => id === null || id === undefined);
    }
  };
}
