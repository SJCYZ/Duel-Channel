// Final public match summaries shared by all instances through DUEL_LOGS.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { LOGS } from './errors.mjs';

const DIR = join(LOGS, 'matches'), LOCK = join(DIR, '.history-lock'), KEEP = 100;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withLock(fn) {
  await mkdir(DIR, { recursive: true });
  for (;;) {
    try { await mkdir(LOCK); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - (await stat(LOCK)).mtimeMs > 60000) await rm(LOCK, { recursive: true }); }
      catch (err) { if (err.code !== 'ENOENT') throw err; }
      await delay(25);
    }
  }
  try { return await fn(); }
  finally { await rm(LOCK, { recursive: true, force: true }); }
}

const historyFiles = async () => (await readdir(DIR)).filter((name) => /^\d{13}-[0-9a-f-]{36}\.json$/.test(name));
const readEntry = async (name) => {
  try {
    const x = JSON.parse(await readFile(join(DIR, name), 'utf8'));
    if (!x || !/^[0-9a-f-]{36}$/.test(x.id || '') || !['multiOperationMatch', 'multiStandMatch'].includes(x.mode) ||
        !Number.isFinite(Date.parse(x.startedAt)) || !Number.isFinite(Date.parse(x.endedAt)) || !Array.isArray(x.participants)) return null;
    return {
      id: x.id, mode: x.mode, startedAt: x.startedAt, endedAt: x.endedAt,
      durationMs: Number.isFinite(x.durationMs) ? x.durationMs : 0,
      rounds: Number.isFinite(x.rounds) ? x.rounds : 0,
      participants: x.participants.filter((p) => p && typeof p.name === 'string').map((p) => ({
        name: p.name.slice(0, 64),
        ...Object.fromEntries(['rank', 'score', 'outRound', 'streak', 'played', 'change', 'right', 'pass', 'shield', 'shieldAt']
          .filter((key) => Number.isFinite(p[key])).map((key) => [key, p[key]])),
        ...(typeof p.out === 'boolean' ? { out: p.out } : {}),
        ...(p.stats && typeof p.stats === 'object' ? { stats: Object.fromEntries(['all', 'normal', 'skip', 'forced']
          .filter((key) => Number.isFinite(p.stats[key])).map((key) => [key, p.stats[key]])) } : {}),
        ...(typeof p.saved === 'boolean' ? { saved: p.saved } : {}),
      })),
    };
  } catch (e) { return null; }
};

export async function saveMatchHistory(match, finalPlayers) {
  const endedAt = new Date().toISOString(), endedMs = Date.now(), id = randomUUID();
  const ranks = new Map(finalPlayers.slice().sort((a, b) => b.pts - a.pts).map((p, i) => [p.id, i + 1]));
  const record = {
    id, mode: match.mode, startedAt: match.startedAt, endedAt,
    durationMs: Math.max(0, endedMs - Date.parse(match.startedAt)), rounds: match.r,
    participants: finalPlayers.map((p) => ({ name: p.name, rank: p.rank || ranks.get(p.id), score: match.stand ? p.pass : p.pts,
      out: p.out, outRound: p.outRound, streak: p.streak, stats: p.stats, played: p.played, change: p.change, right: p.right,
      ...(match.stand ? { pass: p.pass, shield: p.shield, shieldAt: p.shieldAt, saved: p.saved } : {}) })),
  };
  await withLock(async () => {
    const stamp = Date.parse(endedAt);
    const target = join(DIR, `${String(stamp).padStart(13, '0')}-${id}.json`), temp = join(DIR, `.tmp-${id}`);
    try { await writeFile(temp, JSON.stringify(record), { flag: 'wx' }); await rename(temp, target); }
    catch (e) { await rm(temp, { force: true }); throw e; }
    const files = await historyFiles();
    const ranked = await Promise.all(files.map(async (name) => ({ name, record: await readEntry(name) })));
    ranked.sort((a, b) => (Date.parse(b.record?.endedAt || '') || 0) - (Date.parse(a.record?.endedAt || '') || 0));
    await Promise.all(ranked.slice(KEEP).map(({ name }) => rm(join(DIR, name), { force: true })));
  });
}

export async function readMatchHistory() {
  try {
    const files = await historyFiles();
    const entries = await Promise.all(files.map(readEntry));
    return entries.filter(Boolean).sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt)).slice(0, KEEP);
  } catch (e) { return []; }
}
