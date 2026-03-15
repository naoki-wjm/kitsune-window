/**
 * vite-plugin-talks — talks/ テキストから scenario/ JSON を自動生成
 *
 * public/worlds/{world}/talks/ にテキストファイルを配置すると、
 * ビルド時・dev時に scenario/*.json を自動生成する。
 *
 * 構成:
 *   talks/define.txt     — 世界観定義（キャラ・表情・向き・配置）
 *   talks/morning.txt    — シナリオ（ファイル名がそのままJSONファイル名になる）
 *   talks/*.txt          — 複数ファイル対応
 *
 * scenarioManifestPlugin より前に登録すること。
 */

import { resolve, basename } from 'path';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

// ===== defineパーサー =====
function parseDefine(text) {
  const define = {
    characters: {},
    expressions: {},
    directions: {},
    positions: {},
  };

  const sectionMap = {
    'キャラクター定義': 'characters',
    '表情定義': 'expressions',
    '向き定義': 'directions',
    '配置定義': 'positions',
  };

  let currentSection = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const sectionMatch = trimmed.match(/^【(.+?)】$/);
    if (sectionMatch) {
      const key = sectionMap[sectionMatch[1]];
      if (key) currentSection = key;
      continue;
    }

    if (currentSection) {
      const kvMatch = trimmed.match(/^(.+?)\s*[:：]\s*(.+)$/);
      if (kvMatch) {
        define[currentSection][kvMatch[1].trim()] = kvMatch[2].trim();
      }
    }
  }

  return define;
}

// ===== トリガー変換 =====
const TIME_SLOTS = {
  '深夜': 'deep_night',
  '朝': 'morning',
  '昼': 'noon',
  '午後': 'afternoon',
  '夕方': 'evening',
  '夜': 'night',
};

const DOW_MAP = {
  '日曜日': 'dow0', '月曜日': 'dow1', '火曜日': 'dow2',
  '水曜日': 'dow3', '木曜日': 'dow4', '金曜日': 'dow5', '土曜日': 'dow6',
};

function convertTrigger(triggerJa) {
  if (triggerJa.includes('・')) {
    return triggerJa.split('・').map(p => convertSingleTrigger(p.trim())).join('×');
  }
  return convertSingleTrigger(triggerJa);
}

function convertSingleTrigger(t) {
  if (t === '条件なし') return 'any';
  if (TIME_SLOTS[t]) return TIME_SLOTS[t];
  if (DOW_MAP[t]) return DOW_MAP[t];
  const monthMatch = t.match(/^(\d{1,2})月$/);
  if (monthMatch) return `m${monthMatch[1]}`;
  const dateMatch = t.match(/^\d{1,2}\/\d{1,2}$/);
  if (dateMatch) return t;
  return t;
}

// ===== シナリオパーサー =====
function parseScenario(text, define) {
  const talks = [];
  let currentTrigger = null;
  let currentScenes = [];
  const errors = [];
  let lineNum = 0;

  function flushTalk() {
    if (currentTrigger && currentScenes.length > 0) {
      talks.push({ trigger: currentTrigger, scenes: currentScenes });
    }
    currentScenes = [];
  }

  for (const line of text.split('\n')) {
    lineNum++;
    // 継続行（全角スペースで始まる）— trim より先に判定
    if (line.startsWith('　') && currentScenes.length > 0) {
      const lastCmd = currentScenes[currentScenes.length - 1];
      if (lastCmd && lastCmd.text != null) {
        // 全角スペースのみの行は空行として扱う
        const content = line.trim().replace(/^\u3000+$/, '');
        lastCmd.text += '\n' + content;
        continue;
      }
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // コメント行
    if (trimmed.startsWith('//')) continue;

    // トリガーヘッダ
    const triggerMatch = trimmed.match(/^【(.+?)】$/);
    if (triggerMatch) {
      flushTalk();
      currentTrigger = convertTrigger(triggerMatch[1]);
      continue;
    }

    if (!currentTrigger) {
      errors.push(`${lineNum}行目: トリガー（【】）の前にコマンドがあります`);
      continue;
    }

    // 待機コマンド
    const waitMatch = trimmed.match(/^待機\s*[:：]\s*(\d+)$/);
    if (waitMatch) {
      currentScenes.push({ wait: parseInt(waitMatch[1]) });
      continue;
    }

    // キャラクターコマンド
    const parts = trimmed.split(/[:：]/);
    if (parts.length < 4) {
      errors.push(`${lineNum}行目: 書式エラー`);
      continue;
    }

    const posJa = parts[0].trim();
    const charJa = parts[1].trim();
    const dirJa = parts[2].trim();
    const exprJa = parts[3].trim();
    const textContent = parts.slice(4).join('：').trim();

    const command = {};

    // 配置
    const posEn = define.positions[posJa];
    if (!posEn) {
      errors.push(`${lineNum}行目: 未定義の配置「${posJa}」`);
      continue;
    }
    command.position = posEn;

    // キャラ
    if (charJa) {
      let charName = charJa;
      let instant = false;
      if (charName.startsWith('即・')) {
        instant = true;
        charName = charName.slice(2);
      }
      if (charName === '退場') {
        command.character = 'empty';
      } else {
        const charEn = define.characters[charName];
        if (!charEn) {
          errors.push(`${lineNum}行目: 未定義のキャラクター「${charName}」`);
          continue;
        }
        command.character = charEn;
      }
      if (instant) command.transition = 'instant';
    }

    // 向き
    if (dirJa) {
      const dirEn = define.directions[dirJa];
      if (!dirEn) {
        errors.push(`${lineNum}行目: 未定義の向き「${dirJa}」`);
        continue;
      }
      command.base = dirEn;
    }

    // 表情
    if (exprJa) {
      const exprEn = define.expressions[exprJa];
      if (!exprEn) {
        errors.push(`${lineNum}行目: 未定義の表情「${exprJa}」`);
        continue;
      }
      command.expression = exprEn;
    }

    // セリフ
    if (textContent) command.text = textContent;

    currentScenes.push(command);
  }

  flushTalk();
  return { talks, errors };
}

// ===== ID付与 =====
function assignIds(talks) {
  const counter = {};
  for (const talk of talks) {
    const trigger = talk.trigger;
    counter[trigger] = (counter[trigger] || 0) + 1;
    talk.id = `${trigger}_${String(counter[trigger]).padStart(3, '0')}`;
  }
  return talks;
}

// ===== プラグイン本体 =====
export default function talksCompilerPlugin() {
  let worldsDir;

  function compileTalks() {
    if (!existsSync(worldsDir)) return;
    let totalFiles = 0;

    for (const world of readdirSync(worldsDir, { withFileTypes: true })) {
      if (!world.isDirectory()) continue;
      const talksDir = resolve(worldsDir, world.name, 'talks');
      if (!existsSync(talksDir)) continue;

      // define.txt を読む
      const definePath = resolve(talksDir, 'define.txt');
      if (!existsSync(definePath)) {
        console.warn(`[talks] ${world.name}: define.txt が見つかりません、スキップ`);
        continue;
      }
      const define = parseDefine(readFileSync(definePath, 'utf-8'));

      // scenario/ ディレクトリ確保
      const scenarioDir = resolve(worldsDir, world.name, 'scenario');
      if (!existsSync(scenarioDir)) mkdirSync(scenarioDir, { recursive: true });

      // talks/*.txt を変換
      const txtFiles = readdirSync(talksDir)
        .filter(f => f.endsWith('.txt') && f !== 'define.txt')
        .sort();

      for (const txtFile of txtFiles) {
        const text = readFileSync(resolve(talksDir, txtFile), 'utf-8');
        const { talks, errors } = parseScenario(text, define);

        if (errors.length > 0) {
          console.warn(`[talks] ${world.name}/${txtFile}:`);
          for (const e of errors) console.warn(`  ${e}`);
        }

        if (talks.length > 0) {
          const result = assignIds(talks);
          const jsonName = basename(txtFile, '.txt') + '.json';
          const outPath = resolve(scenarioDir, jsonName);
          writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
          totalFiles++;
        }
      }
    }

    if (totalFiles > 0) {
      console.log(`[talks] ${totalFiles} ファイル生成`);
    }
  }

  return {
    name: 'talks-compiler',
    buildStart() {
      worldsDir = resolve(process.cwd(), 'public/worlds');
      compileTalks();
    },
    configureServer(server) {
      worldsDir = resolve(process.cwd(), 'public/worlds');
      compileTalks();
      // talks/ 内のファイル変更を監視
      server.watcher.on('all', (event, path) => {
        if (path.includes('/talks/') && path.endsWith('.txt')) {
          compileTalks();
        }
      });
    },
  };
}
