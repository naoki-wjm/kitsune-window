/**
 * トリガー選択 — 時間帯×条件でトークを選ぶ
 */

const used = new Set();

export function getTimeSlot() {
  const hour = new Date().getHours();
  if (hour < 5) return 'deep_night';
  if (hour < 10) return 'morning';
  if (hour < 14) return 'noon';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

// 抽選落ち方式: マッチしたら当選率%で判定、外れたら次のレベルへ
const levels = [
  { rate: 80, filter: (t, ts, date, month, dow) => t.trigger === `${ts}×${date}` },
  { rate: 70, filter: (t, ts, date, month, dow) => t.trigger === `${ts}×m${month}` },
  { rate: 60, filter: (t, ts, date, month, dow) => t.trigger === `${ts}×dow${dow}` },
  { rate: 55, filter: (t, ts, date, month, dow) => t.trigger === date },
  { rate: 30, filter: (t, ts, date, month, dow) => t.trigger === `m${month}` },
  { rate: 25, filter: (t, ts, date, month, dow) => t.trigger === ts },
];

export function selectTalk(talks) {
  const now = new Date();
  const timeSlot = getTimeSlot();
  const month = now.getMonth() + 1;
  const date = `${month}/${now.getDate()}`;
  const dow = now.getDay();

  // 各レベルを上から判定、マッチしたら当選率で抽選
  for (const { rate, filter } of levels) {
    const matched = talks.filter(t => filter(t, timeSlot, date, month, dow));
    if (matched.length > 0 && Math.random() * 100 < rate) {
      return pickRandom(matched);
    }
  }

  // 最終受け皿: any トーク
  const pool = talks.filter(t => t.trigger === 'any');
  if (pool.length > 0) return pickRandom(pool);

  return null;
}

function pickRandom(candidates) {
  const fresh = candidates.filter(t => !used.has(t.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  used.add(picked.id);
  return picked;
}

export function nextTalkInterval() {
  const base = 60 * 1000; // 1分
  const jitter = (Math.random() * 30 - 15) * 1000; // ±15秒
  return base + jitter;
}
