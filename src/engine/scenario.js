/**
 * シナリオプレイヤー — JSON scenesを逐次実行する
 */

export function createScenarioPlayer(stage, bubbleManager) {
  let playing = false;

  /** 一文字送りの完了を待つ */
  function waitForTypewriter() {
    return new Promise(resolve => {
      const check = () => {
        if (bubbleManager.isIdle()) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  return {
    get isPlaying() { return playing; },

    /**
     * 1つのトーク（scenes配列）を再生する
     */
    async play(talk) {
      if (playing) return;
      playing = true;

      bubbleManager.clearAll();

      for (const cmd of talk.scenes) {
        if (!playing) break;

        // ウェイトコマンド
        if (cmd.wait != null) {
          await new Promise(r => setTimeout(r, cmd.wait));
          continue;
        }

        // キャラクター表示・更新
        if (cmd.position) {
          // キャラ変更がある場合
          if (cmd.character) {
            await stage.setCharacter(cmd.position, {
              character: cmd.character,
              base: cmd.base,
              expression: cmd.expression,
              transition: cmd.transition
            });
          } else {
            // 表情・向きのみ変更（キャラ省略時）
            const slot = stage.slots[cmd.position];
            if (slot && slot.character) {
              if (cmd.base) stage.setBase(cmd.position, cmd.base);
              if (cmd.expression) stage.setExpression(cmd.position, cmd.expression);
            }
          }

          // セリフがあれば吹き出し表示
          if (cmd.text) {
            bubbleManager.show(cmd.position, cmd.text);
            // 一文字送り完了を待つ
            await waitForTypewriter();
          }
        }
      }

      // トーク終了後、10秒タイマー開始
      bubbleManager.scheduleAllClear();
      playing = false;
    },

    /** 再生を中断する */
    stop() {
      playing = false;
      bubbleManager.clearAll();
      stage.clear();
    }
  };
}
