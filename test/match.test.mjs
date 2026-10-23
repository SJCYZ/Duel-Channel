// A match's start: a seat whose connection comes late — after STARTING SOON would have ended — is waited for (up to
// connectMax) and plays from the first round; before, the match went on without it and, with no one connected when the
// rounds began, closed at once (the full-match test failing on a slow runner).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

test('a seat connecting late still plays from the first round', { timeout: 60000 }, async () => {
  Object.assign(process.env, { DUEL_SHOW_MS: '100', DUEL_BET_MS: '300', DUEL_RESULT_MS: '50', DUEL_RANK_MS: '50' });
  const { Match } = await import('../server/game.mjs');
  const m = new Match({ id: 'late-1', mode: 'multiOperationMatch', humans: [{ name: 'late', avatar: null }], npcFill: true });
  const got = [];
  // a client's socket: it answers loading with ready
  const ws = Object.assign(new EventEmitter(), {
    readyState: 1,
    send(s) { const j = JSON.parse(s); got.push(j.t); if (j.t === 'phase' && j.name === 'loading') setImmediate(() => ws.emit('message', JSON.stringify({ t: 'ready' }))); if (j.t === 'round') setImmediate(() => ws.emit('message', JSON.stringify({ t: 'round.ready', r: j.r }))); if (j.t === 'battle') setImmediate(() => ws.emit('message', JSON.stringify({ t: 'watched' }))); },
    ping() {},
    close() { ws.readyState = 3; },
  });
  const run = m.run();
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(m.phase, 'wait', 'the match waits for its seat to connect');
  m.attach(ws, m.tokens()[0].token);
  for (let i = 0; i < 100 && !got.includes('round'); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(got.includes('round'), `no round after a late connection: ${got.join(' ')}`);
  // leaving ends it after this round
  ws.emit('message', JSON.stringify({ t: 'leave' }));
  await run;
  assert.ok(m.done);
});

// A match whose only viewer drops: it waits before the next round for them to come back (the page retries for
// maxRetryTimeInBattle), instead of closing at once while the page is still reconnecting.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, ms = 15000) {
  const end = Date.now() + ms;
  while (!f()) { if (Date.now() > end) throw new Error('timed out'); await sleep(50); }
}
// a client's socket: it keeps what it is sent and answers loading with ready
function socket({ autoPong = true } = {}) {
  const ws = Object.assign(new EventEmitter(), {
    readyState: 1, got: [], pings: 0,
    send(s) { const j = JSON.parse(s); ws.got.push(j); if (j.t === 'phase' && j.name === 'loading') setImmediate(() => ws.emit('message', JSON.stringify({ t: 'ready' }))); if (j.t === 'round') setImmediate(() => ws.emit('message', JSON.stringify({ t: 'round.ready', r: j.r }))); if (j.t === 'battle') setImmediate(() => ws.emit('message', JSON.stringify({ t: 'watched' }))); },
    ping() { ws.pings++; if (autoPong) setImmediate(() => ws.emit('pong')); },
    close() { ws.readyState = 3; },
    terminate() { ws.readyState = 3; setImmediate(() => ws.emit('close')); },
    lastSeq() { return Math.max(-1, ...ws.got.filter((j) => Number.isInteger(j.seq)).map((j) => j.seq)); },
  });
  return ws;
}
async function soloMatch(id, rejoinMs) {
  Object.assign(process.env, { DUEL_SHOW_MS: '100', DUEL_BET_MS: '300', DUEL_RESULT_MS: '50', DUEL_RANK_MS: '50', DUEL_REJOIN_MS: String(rejoinMs) });
  const { Match } = await import('../server/game.mjs');
  const logs = [];
  const m = new Match({ id, mode: 'multiOperationMatch', humans: [{ name: 'solo', avatar: null }], npcFill: true, log: (l) => logs.push(l) });
  const run = m.run(), tok = m.tokens()[0].token, a = socket();
  m.attach(a, tok);
  await until(() => a.got.some((j) => j.t === 'round'));
  return { m, run, tok, a, logs };
}

test('the only viewer drops during a round: the match waits for them and goes on when they are back', { timeout: 60000 }, async () => {
  const { m, run, tok, a, logs } = await soloMatch('drop-back', 5000);
  a.emit('close');
  await until(() => logs.some((l) => /every viewer dropped/.test(l)));
  await sleep(800);
  assert.equal(m.done, false, 'the match waits for its viewer');
  const b = socket();
  m.attach(b, tok, a.lastSeq());
  await until(() => b.got.some((j) => j.t === 'round'));
  assert.ok(!logs.some((l) => /no one left/.test(l)), logs.join('\n'));
  b.emit('message', JSON.stringify({ t: 'leave' }));
  await run;
  assert.ok(m.done);
});

test('the only viewer drops and is not back in time: the match closes', { timeout: 60000 }, async () => {
  const { m, run, a, logs } = await soloMatch('drop-gone', 600);
  a.emit('close');
  await run;
  assert.ok(m.done);
  const waited = logs.findIndex((l) => /every viewer dropped/.test(l)), closed = logs.findIndex((l) => /no one left, closing/.test(l));
  assert.ok(waited >= 0 && closed > waited, logs.join('\n'));
});

test('the only viewer leaves: the match ends without waiting', { timeout: 60000 }, async () => {
  const { m, run, a, logs } = await soloMatch('left', 30000);
  a.emit('message', JSON.stringify({ t: 'leave' }));
  const t0 = Date.now();
  await run;
  assert.ok(m.done);
  assert.ok(!logs.some((l) => /every viewer dropped/.test(l)), logs.join('\n'));
  assert.ok(Date.now() - t0 < 15000, 'no 30 s wait for a viewer who left');
});

test('out seats do not block the initial loading barrier', { timeout: 5000 }, async () => {
  const { Match } = await import('../server/game.mjs');
  const m = new Match({ id: 'out-barrier', mode: 'multiOperationMatch', humans: [{ name: 'ready', avatar: null }, { name: 'out', avatar: null }, { name: 'dropped', avatar: null }], npcFill: false });
  const [ready, out, dropped] = m.players;
  ready.connected = true; ready.ready = true;
  out.connected = true; out.out = true;
  dropped.connected = false;
  assert.equal(await m.waitHumans((p) => p.ready, 20), true, 'out and disconnected seats are excluded from the loading barrier');
});

test('out and disconnected seats do not block round preparation', { timeout: 5000 }, async () => {
  Object.assign(process.env, { DUEL_BET_MS: '10', DUEL_RESULT_MS: '1', DUEL_RANK_MS: '1' });
  const { Match, SIM } = await import('../server/game.mjs');
  const m = new Match({ id: 'out-round-barrier', mode: 'multiOperationMatch', humans: [{ name: 'ready', avatar: null }, { name: 'out', avatar: null }, { name: 'dropped', avatar: null }], npcFill: false });
  const [ready, out, dropped] = m.players;
  const ws = socket();
  m.attach(ws, ready.token);
  const playing = m.playRound(SIM.roundTable('multiOperationMatch')[0][0], 1);
  await until(() => m.phase === 'prepare');
  ready.roundReady = 1;
  out.connected = true; out.out = true;
  dropped.connected = false;
  await sleep(200);
  const enteredBet = ws.got.some((msg) => msg.t === 'round.start');
  ready.left = true; out.left = true; dropped.left = true;
  await playing;
  assert.ok(enteredBet, 'the connected eligible player is released from the barrier');
});

test('two heartbeat interruptions eliminate the seat and reconnect as a spectator', { timeout: 10000 }, async () => {
  Object.assign(process.env, { DUEL_HEARTBEAT_MS: '100', DUEL_SHOW_MS: '10', DUEL_BET_MS: '1000', DUEL_RESULT_MS: '1', DUEL_RANK_MS: '1' });
  const { Match } = await import('../server/game.mjs');
  const m = new Match({ id: 'heartbeat-out', mode: 'multiOperationMatch', humans: [{ name: 'unstable', avatar: null }, { name: 'stable', avatar: null }], npcFill: false });
  const token = m.tokens()[0].token, seat = m.players[0], first = socket({ autoPong: false });
  const stable = socket();
  m.attach(stable, m.tokens()[1].token);
  const run = m.run();
  try {
    m.attach(first, token);
    await until(() => first.pings > 0, 3000);
    await until(() => seat.interruptions === 1, 3000);
    assert.equal(seat.out, false, 'the first interruption leaves the player eligible');

    const second = socket({ autoPong: false });
    m.attach(second, token);
    await until(() => second.pings > 0, 3000);
    await until(() => seat.out, 3000);
    assert.equal(seat.interruptions, 2);
    assert.equal(seat.connected, false);

    const rejoined = socket();
    m.attach(rejoined, token);
    assert.equal(rejoined.got.find((msg) => msg.t === 'hello')?.role, 'spectator');
  } finally {
    seat.left = true; m.players[1].left = true;
    if (seat.ws) { seat.ws.readyState = 3; seat.ws.emit?.('close'); }
    stable.readyState = 3; stable.emit('close');
    await run;
  }
});
