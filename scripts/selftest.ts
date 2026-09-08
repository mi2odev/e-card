/**
 * Self-test for everything in the game that can be checked without a phone:
 * the rules, the money maths, the wire codec, and a whole online match played
 * between two independent copies of the app over a real socket.
 *
 *     npm run selftest
 *
 * The two "devices" are separate module graphs (see scripts/loader.mjs), so
 * neither can cheat by reaching into the other's store — exactly the property
 * the redaction in src/net/snapshot.ts is there to guarantee.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolvePath(HERE, '..');
const PORT = 8799;
const ROOM = 'AB4K';

let failures = 0;
let checks = 0;

function check(cond: boolean, label: string, detail?: unknown) {
  checks++;
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const eq = (a: unknown, b: unknown, label: string) =>
  check(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for a condition the network is expected to satisfy shortly. */
async function until(cond: () => boolean, label: string, ms = 4000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (cond()) return check(true, label);
    await sleep(20);
  }
  check(false, `${label} (timed out after ${ms}ms)`);
}

/* ------------------------------------------------------------------ rules */

async function testRules() {
  console.log('\nRules and money');
  const logic = await import('../src/game/logic.ts');
  const {
    emperorPlayer,
    resolveTurn,
    freshHands,
    setNumber,
    isSwapGame,
    clampStake,
    stakeBounds,
    normalizeMinStake,
    normalizeBankroll,
    payoutPreview,
    stakeStep,
  } = logic;

  eq(
    [1, 3, 4, 6, 7, 9, 10, 12].map((g) => emperorPlayer('emperor', g)),
    ['p1', 'p1', 'p2', 'p2', 'p1', 'p1', 'p2', 'p2'],
    'sides swap every 3 games',
  );
  eq([1, 4, 7, 10].map(setNumber), [1, 2, 3, 4], 'set numbering');
  eq([1, 2, 3, 4, 7].map(isSwapGame), [false, false, false, true, true], 'swap games flagged');

  const hands = freshHands();
  eq(hands.emp.map((c) => c.t).sort().join(''), 'CCCCE', 'emperor hand is 1 emperor + 4 citizens');
  eq(hands.slv.map((c) => c.t).sort().join(''), 'CCCCS', 'slave hand is 1 slave + 4 citizens');
  eq(new Set([...hands.emp, ...hands.slv].map((c) => c.id)).size, 10, 'every card id is unique');

  const banks = { p1: 100, p2: 100 };
  const base = { resolvedStart: 'emperor' as const, game: 1, turn: 1, stake: 20, stakesOn: true, banks };
  eq(resolveTurn({ ...base, empCard: 'C', slvCard: 'C' }).draw, true, 'citizen v citizen draws');
  const empWin = resolveTurn({ ...base, empCard: 'E', slvCard: 'C' });
  eq(empWin.draw === false && [empWin.winner, empWin.paid], ['p1', 20], 'emperor beats citizen for 1x');
  const upset = resolveTurn({ ...base, empCard: 'E', slvCard: 'S' });
  eq(upset.draw === false && [upset.winner, upset.paid], ['p2', 100], 'slave fells emperor for 5x, capped at the bankroll');
  eq(upset.draw === false && upset.capped, false, 'a payout that exactly empties the loser is not "capped"');
  const overCap = resolveTurn({ ...base, empCard: 'E', slvCard: 'S', stake: 30 });
  eq(overCap.draw === false && [overCap.paid, overCap.capped], [100, true], 'a payout beyond the bankroll is capped and reported');
  const small = resolveTurn({ ...base, empCard: 'E', slvCard: 'S', stake: 10 });
  eq(small.draw === false && [small.paid, small.capped], [50, false], 'an affordable 5x is paid in full');
  const citizenWin = resolveTurn({ ...base, empCard: 'C', slvCard: 'S' });
  eq(citizenWin.draw === false && citizenWin.winner, 'p1', 'citizen tramples slave');
  const noStakes = resolveTurn({ ...base, empCard: 'E', slvCard: 'S', stakesOn: false });
  eq(noStakes.draw === false && noStakes.paid, 0, 'stakes off pays nothing');

  // Money selection
  eq(normalizeBankroll(7), 10, 'bankroll floors at the minimum');
  eq(normalizeBankroll(12.6), 13, 'bankroll rounds to whole points');
  eq(normalizeMinStake(400, 500), 250, 'table minimum never exceeds half the purse');
  eq(stakeBounds(100, 25), { min: 25, max: 100 }, 'stake bounds honour the table minimum');
  eq(stakeBounds(10, 25), { min: 10, max: 10 }, 'a broke player pushes what is left');
  eq(clampStake(999, 100, 25), 100, 'stake clamps to the bankroll');
  eq(clampStake(1, 100, 25), 25, 'stake clamps up to the minimum');
  eq([50, 500, 2000, 5000].map(stakeStep), [5, 10, 25, 100], 'nudge size scales with the purse');
  eq(payoutPreview(20, { p1: 100, p2: 30 }, 'p1'), { emperor: 20, slave: 100 }, 'payout preview caps at the loser bankroll');
}

/* ------------------------------------------- the anime's round and turn shape */

async function testAnimeShape() {
  console.log('\nRound shape and placing order');
  const { PLAYS_PER_GAME, firstPlacer, isFinalPlay, resolveTurn, emperorPlayer } = await import('../src/game/logic.ts');

  eq(PLAYS_PER_GAME, 3, 'a round is three plays');
  eq([1, 2, 3].map(isFinalPlay), [false, false, true], 'only the third play ends the round outright');

  // Round 1 opens with the Emperor side; the opener alternates every play and
  // again at the top of each round.
  eq([1, 2, 3].map((t) => firstPlacer(1, t)), ['emp', 'slv', 'emp'], 'round 1 places E, S, E');
  eq([1, 2, 3].map((t) => firstPlacer(2, t)), ['slv', 'emp', 'slv'], 'round 2 opens with the Slave side');
  eq([1, 2, 3].map((t) => firstPlacer(3, t)), ['emp', 'slv', 'emp'], 'round 3 opens with the Emperor side again');
  eq(
    Array.from({ length: 12 }, (_, i) => firstPlacer(i + 1, 1)),
    ['emp', 'slv', 'emp', 'slv', 'emp', 'slv', 'emp', 'slv', 'emp', 'slv', 'emp', 'slv'],
    'the round opener alternates across all twelve rounds',
  );

  const banks = { p1: 100, p2: 100 };
  const base = { resolvedStart: 'emperor' as const, game: 1, stake: 20, stakesOn: true, banks };
  const early = resolveTurn({ ...base, turn: 1, empCard: 'C', slvCard: 'C' });
  eq(early.draw === true && early.final, false, 'a drawn first play keeps the round alive');
  const last = resolveTurn({ ...base, turn: 3, empCard: 'C', slvCard: 'C' });
  eq(last.draw === true && last.final, true, 'a drawn third play spends the round');

  // Each side holds 6 rounds of each role across the match.
  const empRounds = Array.from({ length: 12 }, (_, i) => emperorPlayer('emperor', i + 1));
  eq(empRounds.filter((p) => p === 'p1').length, 6, 'each player holds the Emperor side six times');
}

/* ------------------------------------------ a round played out in the store */

async function testRoundPlay() {
  console.log('\nPlaying a round');
  const { useGame } = await import('../src/store/useGame.ts?device=c');
  const { firstPlacer } = await import('../src/game/logic.ts?device=c');

  const g = () => useGame.getState();
  const citizen = (side: 'emp' | 'slv') => g().hands![side].findIndex((c) => c.t === 'C');
  const special = (side: 'emp' | 'slv') => g().hands![side].findIndex((c) => c.t !== 'C');
  /** Stand in for the reveal animation finishing, then move the match on. */
  const finish = () => {
    useGame.setState({ rev: 4 });
    return g().continueReveal();
  };

  g().setStartingBankroll(100);
  g().setMinStake(0);
  g().beginMatch();
  g().deal();

  // --- the placing order is enforced, not merely displayed
  eq(g().picker, firstPlacer(1, 1), 'round 1 play 1 opens with the Emperor side');
  eq(g().submitPick('slv', citizen('slv')), 'noop', 'the answering side cannot place out of turn');
  eq(g().picks.slv, null, 'the out-of-turn card stays in hand');
  eq(g().submitPick('emp', citizen('emp')), 'waiting', 'the opening side places');
  eq(g().picker, 'slv', 'the turn passes to the answering side');
  eq(g().submitPick('emp', citizen('emp')), 'noop', 'the opener cannot place twice');
  eq(g().submitPick('slv', citizen('slv')), 'reveal', 'the answer resolves the play');

  // --- a drawn play does not end the round, and the opener flips
  const drawn = g().result;
  eq(drawn?.draw === true && drawn.final, false, 'a drawn first play leaves the round open');
  eq(finish(), 'handoff', 'a drawn play sends the device on rather than ending the round');
  eq(g().turn, 2, 'the round moves to its second play');
  eq(g().picker, firstPlacer(1, 2), 'the Slave side opens play 2');
  eq(g().hands!.emp.length, 4, 'the drawn cards are gone from hand');

  // --- second draw
  g().submitPick('slv', citizen('slv'));
  g().submitPick('emp', citizen('emp'));
  eq(g().result?.draw, true, 'play 2 is drawn too');
  finish();
  eq(g().turn, 3, 'the round moves to its third play');
  eq(g().picker, firstPlacer(1, 3), 'the Emperor side opens play 3');

  // --- third draw spends the round: nobody wins, no money moves
  const banksBefore = [g().p1pts, g().p2pts];
  g().submitPick('emp', citizen('emp'));
  g().submitPick('slv', citizen('slv'));
  const spent = g().result;
  eq(spent?.draw === true && spent.final, true, 'a drawn third play spends the round');
  eq(finish(), 'scoreboard', 'the spent round is over, not continued');
  eq([g().p1pts, g().p2pts], banksBefore, 'a spent round moves no money');
  eq([g().p1w, g().p2w], [0, 0], 'a spent round is a win for neither');
  eq(g().history, [{ g: 1, winner: null, winSide: null, paid: 0 }], 'the spent round is still on the record');
  eq(g().game, 2, 'the match moves to round 2');
  eq(g().hands!.emp.length, 2, 'two of the five cards were never revealed');

  // --- a decisive play ends the round at once, whatever the play number
  g().deal();
  eq(g().picker, firstPlacer(2, 1), 'round 2 opens with the Slave side');
  g().submitPick('slv', citizen('slv'));
  g().submitPick('emp', special('emp'));
  const decisive = g().result;
  eq(decisive?.draw, false, 'Emperor against Citizen is decisive');
  eq(decisive?.draw === false && decisive.winSide, 'emp', 'the Emperor side takes it');
  finish();
  eq(g().game, 3, 'a decided round ends immediately');
  eq(g().history.length, 2, 'both rounds are recorded');
}

/* ------------------------------------------------------------ leaving a match */

async function testLeaving() {
  console.log('\nLeaving a match');
  const { useGame } = await import('../src/store/useGame.ts?device=d');
  const g = () => useGame.getState();

  g().setStartingBankroll(100);
  g().beginMatch();
  g().deal();
  eq([g().inMatch, g().phase], [true, 'select'], 'a match is under way');

  g().endMatch();
  eq(g().inMatch, false, 'walking away ends the match');
  eq(g().phase, 'idle', 'and clears the phase, so the router stops steering');
  eq(g().result, null, 'no half-resolved play is left behind');

  // The title screen must not be able to bounce back into a dead match.
  eq(g().netRole, 'off', 'no session is left running');
}

/* --------------------------------------------------------------- protocol */

async function testProtocol() {
  console.log('\nProtocol');
  const { decode, encode, makeRoomCode, normalizeRoomCode, isCompleteRoomCode } = await import('../src/net/protocol.ts');

  eq(decode(encode({ t: 'ping', ts: 7 })), { t: 'ping', ts: 7 }, 'message round-trip');
  eq(decode('not json'), null, 'garbage is dropped, not thrown');
  eq(decode('{"t":"evil"}'), null, 'unknown message types are dropped');
  eq(decode('{"no":"tag"}'), null, 'untagged objects are dropped');

  const codes = Array.from({ length: 400 }, () => makeRoomCode());
  eq(codes.every((c) => c.length === 4), true, 'room codes are four characters');
  eq(codes.some((c) => /[IO01]/.test(c)), false, 'room codes avoid look-alike characters');
  eq(normalizeRoomCode('a b-4k!zzz'), 'AB4K', 'typed codes are cleaned up');
  eq(isCompleteRoomCode('AB4'), false, 'short codes are rejected');
}

/* ------------------------------------------------------------ ws + chunks */

async function testWire() {
  console.log('\nWire codecs');
  const { createHash } = await import('node:crypto');
  const frames = await import('../src/net/ws/frames.ts');
  const { FrameDecoder, acceptKey, base64, encodeText, sha1, utf8Decode, utf8Encode, parseHandshake } = frames;
  const { ChunkAssembler, decodeChunk, encodeChunk, splitMessage } = await import('../src/net/ble/chunks.ts');

  eq(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=', 'RFC 6455 handshake key');
  for (const sample of ['', 'abc', 'the slave fells the emperor', '日本語 🎴', 'x'.repeat(5000)]) {
    eq(
      base64(sha1(utf8Encode(sample))),
      createHash('sha1').update(Buffer.from(sample, 'utf8')).digest('base64'),
      `sha1 matches node crypto (${sample.length} chars)`,
    );
    eq(utf8Decode(utf8Encode(sample)), sample, `utf8 round-trip (${sample.length} chars)`);
  }
  eq(parseHandshake('GET /?room=AB4K HTTP/1.1\r\nUpgrade: websocket\r\n'), null, 'a partial request is not yet a handshake');

  // Server frames are unmasked; feed one back through the decoder in odd slices.
  const decoder = new FrameDecoder();
  const payloads = ['hi', 'y'.repeat(300), '🎴'.repeat(40000)];
  const stream = payloads.map((t) => encodeText(t));
  const flat = new Uint8Array(stream.reduce((n, f) => n + f.length, 0));
  let at = 0;
  for (const f of stream) {
    flat.set(f, at);
    at += f.length;
  }
  const out: string[] = [];
  for (let i = 0; i < flat.length; i += 7) {
    for (const f of decoder.push(flat.subarray(i, i + 7))) out.push(utf8Decode(f.payload));
  }
  eq(out, payloads, 'frames survive being split across arbitrary chunks');

  for (const msg of ['x', '🎴'.repeat(400), 'ünïcødé ✦ '.repeat(200)]) {
    const assembler = new ChunkAssembler();
    let done: string | null = null;
    for (const c of splitMessage(9, msg)) done = assembler.push(decodeChunk(encodeChunk(c))) ?? done;
    eq(done, msg, `BLE chunking round-trip (${msg.length} chars)`);
  }
  const assembler = new ChunkAssembler();
  assembler.push(splitMessage(1, 'z'.repeat(600))[0]);
  eq(
    splitMessage(2, 'a fresh message').map((c) => assembler.push(c)).filter(Boolean)[0],
    'a fresh message',
    'an abandoned message cannot bleed into the next one',
  );
}

/* ---------------------------------------------- the in-app (direct) server */

/**
 * The same server the host phone runs in a development build, driven here over
 * node:net and dialled by a real WebSocket client — so the handshake, the room
 * check and the framing are all exercised for real.
 */
async function testDirectHost() {
  console.log('\nDirect host server');
  const net = await import('node:net');
  const { attachHostConnection, roomOf } = await import('../src/net/ws/hostServer.ts');

  eq(roomOf('/?room=ab4k&role=guest'), 'AB4K', 'the room code is read off the request');
  eq(roomOf('/'), '', 'a request with no room yields none');

  const inbox: string[] = [];
  let closed = 0;
  let conn: { send: (t: string) => void; close: (r?: string) => void } | null = null;

  const server = net.createServer((sock) => {
    attachHostConnection(
      {
        write: (b) => sock.write(Buffer.from(b)),
        destroy: () => sock.destroy(),
        onData: (cb) => sock.on('data', (d) => cb(new Uint8Array(d))),
        onClose: (cb) => sock.on('close', cb),
        onError: (cb) => sock.on('error', cb),
      },
      ROOM,
      {
        onOpen: (c) => {
          conn = c;
          c.send(JSON.stringify({ t: 'welcome', v: 1, name: 'Kaiji' }));
        },
        onText: (t) => inbox.push(t),
        onClose: () => {
          closed++;
        },
      },
    );
  });

  await new Promise<void>((r) => server.listen(PORT + 1, '127.0.0.1', r));
  try {
    await new Promise<void>((resolve) => {
      const wrong = new WebSocket(`ws://127.0.0.1:${PORT + 1}/?room=ZZZZ&role=guest`);
      wrong.onerror = () => {
        check(true, 'a wrong room code is turned away at the handshake');
        resolve();
      };
      wrong.onopen = () => {
        check(false, 'a wrong room code is turned away at the handshake');
        resolve();
      };
    });

    const ws = new WebSocket(`ws://127.0.0.1:${PORT + 1}/?room=${ROOM}&role=guest`);
    const seen: string[] = [];
    ws.onmessage = (e) => seen.push(String(e.data));
    await new Promise<void>((r) => {
      ws.onopen = () => r();
    });
    check(true, 'a real WebSocket client completes the upgrade');

    ws.send(JSON.stringify({ t: 'hello', v: 1, name: 'Tonegawa' }));
    ws.send('🎴 a multi-byte frame');
    ws.send('w'.repeat(150000));
    await sleep(250);
    eq(inbox.length, 3, 'every frame arrives');
    eq(JSON.parse(inbox[0]).name, 'Tonegawa', 'a JSON message survives the trip');
    eq(inbox[1], '🎴 a multi-byte frame', 'so does a multi-byte one');
    eq(inbox[2].length, 150000, 'and a large one');
    eq(seen.length === 1 && JSON.parse(seen[0]).t, 'welcome', 'the server can talk back');

    conn!.close('done');
    await sleep(150);
    check(closed === 1, 'the close is reported exactly once');
  } finally {
    server.close();
  }
}

/* --------------------------------------------------------------- snapshot */

async function testRedaction() {
  console.log('\nSnapshot redaction');
  const { makeSnapshot, isHidden } = await import('../src/net/snapshot.ts');
  const { useGame } = await import('../src/store/useGame.ts');

  const g = useGame.getState();
  g.setStartingBankroll(500);
  g.beginMatch();
  useGame.getState().deal();

  const forGuest = makeSnapshot(useGame.getState(), 'p2');
  const real = useGame.getState().hands!;

  // Game 1 with resolvedStart 'emperor': p1 holds Emperor, so the guest is Slave.
  eq(forGuest.hands!.slv.map((c) => c.t), real.slv.map((c) => c.t), 'the guest is sent its own hand');
  eq(forGuest.hands!.emp.length, 5, 'the opponent hand keeps its length');
  eq(forGuest.hands!.emp.every(isHidden), true, 'every opponent card is a placeholder');
  eq(
    forGuest.hands!.emp.some((c) => real.emp.some((r) => r.id === c.id)),
    false,
    'no opponent card id leaks',
  );

  useGame.getState().submitPick('emp', real.emp.findIndex((c) => c.t === 'E'));
  const midTurn = makeSnapshot(useGame.getState(), 'p2');
  eq(midTurn.picks.emp !== null && isHidden(midTurn.picks.emp), true, 'the played card stays hidden before the reveal');
  eq(midTurn.picks.emp?.t, 'C', 'the hidden card does not carry its real face');

  useGame.getState().submitPick('slv', 0);
  const resolved = makeSnapshot(useGame.getState(), 'p2');
  eq(resolved.picks.emp?.t, 'E', 'once the turn resolves both cards are shown');
  eq(makeSnapshot(useGame.getState(), 'p1').hands!.emp.every(isHidden), false, 'the host sees its own hand unredacted');
}

/* ----------------------------------------------------- a whole online match */

async function testOnlineMatch() {
  console.log('\nOnline match over a real socket');

  const relay = spawn('node', [resolvePath(ROOT, 'server/relay.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  relay.stderr.on('data', (d) => console.error('relay:', String(d).trim()));
  await sleep(500);

  try {
    // Two separate module graphs: neither device can see the other's store.
    const A = {
      session: await import('../src/net/session.ts?device=a'),
      game: await import('../src/store/useGame.ts?device=a'),
      net: await import('../src/store/useNet.ts?device=a'),
      actions: await import('../src/net/actions.ts?device=a'),
      snapshot: await import('../src/net/snapshot.ts?device=a'),
    };
    const B = {
      session: await import('../src/net/session.ts?device=b'),
      game: await import('../src/store/useGame.ts?device=b'),
      net: await import('../src/store/useNet.ts?device=b'),
      actions: await import('../src/net/actions.ts?device=b'),
      snapshot: await import('../src/net/snapshot.ts?device=b'),
    };
    check(A.game.useGame !== B.game.useGame, 'the two devices have independent stores');

    const host = () => A.game.useGame.getState();
    const guest = () => B.game.useGame.getState();

    const common = { kind: 'wifi' as const, code: ROOM, address: '127.0.0.1', port: PORT };
    await A.session.startSession({ ...common, role: 'host', name: 'Kaiji' });
    await sleep(150);
    await B.session.startSession({ ...common, role: 'guest', name: 'Tonegawa' });

    await until(() => A.net.useNet.getState().peerHere, 'host sees the challenger arrive');
    await until(() => B.net.useNet.getState().peerHere, 'guest is seated');
    await until(() => host().p2 === 'Tonegawa', 'host learns the guest name');
    await until(() => guest().p1 === 'Kaiji', 'guest learns the host name');
    eq([host().seat, guest().seat], ['p1', 'p2'], 'seats are assigned');

    // Terms are the host's to set.
    host().setStartingBankroll(500);
    host().setMinStake(25);
    host().beginMatch();
    await until(() => guest().phase === 'scoreboard', 'the guest follows into the match');
    eq([guest().p1pts, guest().p2pts], [500, 500], 'the guest sees the agreed purse');
    eq(guest().settings.minStake, 25, 'the guest sees the table minimum');

    // Game 1: the host holds Emperor, so the guest is the Slave and names the wager.
    B.actions.netSetStake(120);
    await until(() => host().stake === 120, 'the guest can name the wager as the Slave side');
    A.actions.netSetStake(999);
    await sleep(150);
    eq(host().stake, 120, 'the Emperor side cannot move the wager');

    B.actions.netDeal();
    await until(() => guest().phase === 'select' && !!guest().hands, 'the deal reaches both phones');

    const hostHand = host().hands!;
    eq(guest().hands!.emp.every(B.snapshot.isHidden), true, 'the guest never receives the host hand');
    eq(guest().hands!.slv.map((c) => c.t).sort().join(''), 'CCCCS', 'the guest holds a real Slave hand');

    // Round 1 opens with the Emperor side, which the host holds — the guest has
    // to wait its turn even though its own hand is right there on screen.
    eq(guest().picker, 'emp', 'the guest is told the Emperor side places first');
    B.actions.netPick(guest().hands!.slv.findIndex((c) => c.t === 'S'));
    await sleep(200);
    eq(host().picks.slv, null, 'a card played out of turn is refused over the wire');
    eq(guest().picks.slv, null, 'and the guest still holds it');

    // Host plays the Emperor; guest answers with its Slave — the 5x upset.
    A.actions.netPick(hostHand.emp.findIndex((c) => c.t === 'E'));
    await until(() => guest().picks.emp !== null, 'the guest is told the host has locked in');
    await until(() => guest().picker === 'slv', 'and that it is now the guest turn to answer');
    eq(B.snapshot.isHidden(guest().picks.emp), true, 'but not which card it was');

    B.actions.netPick(guest().hands!.slv.findIndex((c) => c.t === 'S'));
    await until(() => guest().phase === 'reveal', 'both phones move to the reveal');
    eq(guest().picks.emp?.t, 'E', 'the cards are shown once the turn resolves');
    eq(host().result?.draw, false, 'the turn is decisive');

    B.actions.netAdvance();
    await until(() => host().game === 2, 'the match advances a game');
    await until(() => guest().game === 2, 'the guest advances with it');
    eq([host().p1pts, host().p2pts], [0, 1000], 'the slave upset cleans the emperor out');
    eq([guest().p1pts, guest().p2pts], [0, 1000], 'the guest tally matches the host');
    eq(guest().history.length, 1, 'the game is recorded in the history strip');

    // Game 2 is still in the first block, so the guest keeps the Slave side and
    // its winnings become the new ceiling on the wager.
    eq(A.game.stakeRange(host()), { min: 25, max: 1000 }, 'the wager ceiling follows the Slave side purse');
    eq(A.game.sidePlayerNow(host(), 'slv'), 'p2', 'sides have not swapped yet at game 2');

    // A guest cannot move money on its own — its store is overwritten by the host.
    B.game.useGame.setState({ p2pts: 999999 });
    B.actions.netSetStake(0);
    await until(() => guest().p2pts === 1000, 'a guest that rewrites its own bank is corrected by the host');

    A.session.stopSession('done');
    B.session.stopSession('done');
    await sleep(150);
    eq(host().netRole, 'off', 'leaving the table ends the session');
    eq(guest().netRole, 'off', 'both sides stand down');
    eq([guest().p1, guest().p2], ['Tonegawa', ''], 'the guest gets its own name back');
  } finally {
    relay.kill();
  }
}

/* ------------------------------------------- what happens when nothing is there */

async function testUnreachable() {
  console.log('\nA relay that is not there');
  const relay = spawn('node', [resolvePath(ROOT, 'server/relay.js')], {
    env: { ...process.env, PORT: String(PORT + 2) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await sleep(500);

  try {
    // Opening the relay address in a browser answers, so a player can test
    // reachability from the phone itself.
    const res = await fetch(`http://127.0.0.1:${PORT + 2}/`);
    const body = await res.text();
    eq(res.status, 200, 'a plain browser visit to the relay is answered');
    check(body.includes('RELAY'), 'and says the relay is running');
    check(body.includes(`127.0.0.1:${PORT + 2}`), 'echoing the address that worked', body.slice(0, 120));
  } finally {
    relay.kill();
  }

  // A guest asking for a room nobody hosts — the mistyped-code case.
  const relay2 = spawn('node', [resolvePath(ROOT, 'server/relay.js')], {
    env: { ...process.env, PORT: String(PORT + 4) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await sleep(500);
  try {
    const W = {
      session: await import('../src/net/session.ts?device=w'),
      net: await import('../src/store/useNet.ts?device=w'),
    };
    await W.session.startSession({
      kind: 'wifi',
      role: 'guest',
      code: 'Q8A2',
      address: '127.0.0.1',
      port: PORT + 4,
      name: 'Challenger',
    });
    await until(
      () => W.net.useNet.getState().detail.includes('NO TABLE OPEN ON CODE Q8A2'),
      'a code nobody is hosting is called out by name',
    );
    check(
      !W.net.useNet.getState().detail.includes('LEFT THE TABLE'),
      'and is not mistaken for a phone leaving',
      W.net.useNet.getState().detail,
    );
    W.session.stopSession();
  } finally {
    relay2.kill();
  }

  // Now dial a port with nothing on it at all.
  const E = {
    session: await import('../src/net/session.ts?device=e'),
    net: await import('../src/store/useNet.ts?device=e'),
  };
  await E.session.startSession({
    kind: 'wifi',
    role: 'guest',
    code: ROOM,
    address: '127.0.0.1',
    port: PORT + 3,
    name: 'Nobody',
  });
  await until(() => E.net.useNet.getState().status === 'error', 'a dial that lands nowhere reports an error');
  const detail = E.net.useNet.getState().detail;
  check(detail.includes(`127.0.0.1:${PORT + 3}`), 'naming the address it could not reach', detail);
  check(detail.includes('SAME WI-FI'), 'and what to check about it', detail);
  check(
    !detail.includes('LEFT THE TABLE'),
    'never blaming a phone that was never connected',
    detail,
  );
  E.session.stopSession();
}

/* -------------------------------------------------------------------- run */

console.log('E-CARD self-test');
await testRules();
await testAnimeShape();
await testRoundPlay();
await testLeaving();
await testProtocol();
await testWire();
await testDirectHost();
await testRedaction();
await testOnlineMatch();
await testUnreachable();

console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
