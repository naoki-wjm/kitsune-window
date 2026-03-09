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

export function selectTalk(talks) {
  const now = new Date();
  const timeSlot = getTimeSlot();
  const month = now.getMonth() + 1;
  const date = `${month}/${now.getDate()}`;
  const dow = now.getDay();

  // 高優先度トリガー（マッチしたらそれだけから選ぶ）
  const highPriority = [
    t => t.trigger === `${timeSlot}×${date}`,
    t => t.trigger === `${timeSlot}×m${month}`,
    t => t.trigger === `${timeSlot}×dow${dow}`,
    t => t.trigger === date,
    t => t.trigger === `m${month}`,
  ];

  for (const pred of highPriority) {
    const matched = talks.filter(pred);
    if (matched.length > 0) return pickRandom(matched);
  }

  // 通常選択: 時間帯トーク + any トークを合わせてランダム
  const pool = talks.filter(t => t.trigger === timeSlot || t.trigger === 'any');
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
