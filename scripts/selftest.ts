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

  eq(PLAYS_PER_GAME, 5, 'a round is five plays — every card in hand');
  eq(
    [1, 2, 3, 4, 5].map(isFinalPlay),
    [false, false, false, false, true],
    'only the fifth play ends the round outright',
  );

  // Round 1 opens with the Emperor side; the opener alternates every play and
  // again at the top of each round.
  eq([1, 2, 3, 4, 5].map((t) => firstPlacer(1, t)), ['emp', 'slv', 'emp', 'slv', 'emp'], 'round 1 places E, S, E, S, E');
  eq([1, 2, 3, 4, 5].map((t) => firstPlacer(2, t)), ['slv', 'emp', 'slv', 'emp', 'slv'], 'round 2 opens with the Slave side');
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
  const third = resolveTurn({ ...base, turn: 3, empCard: 'C', slvCard: 'C' });
  eq(third.draw === true && third.final, false, 'and so does a drawn third — the round does not stop there');
  const last = resolveTurn({ ...base, turn: 5, empCard: 'C', slvCard: 'C' });
  eq(last.draw === true && last.final, true, 'only a drawn fifth play would spend the round');

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

  // --- a third draw does not end it either: the round runs to the last card
  g().submitPick('emp', citizen('emp'));
  g().submitPick('slv', citizen('slv'));
  eq(g().result?.draw, true, 'play 3 is drawn as well');
  eq(finish(), 'handoff', 'and the round carries on past it');
  eq(g().turn, 4, 'into a fourth play');

  g().submitPick('slv', citizen('slv'));
  g().submitPick('emp', citizen('emp'));
  eq(g().result?.draw, true, 'play 4 is drawn too');
  finish();
  eq(g().turn, 5, 'and on to the fifth');
  eq(g().hands!.emp.map((c) => c.t), ['E'], 'the Emperor side is down to its Emperor');
  eq(g().hands!.slv.map((c) => c.t), ['S'], 'and the Slave side to its Slave');

  // --- so the last play is always Emperor against Slave, and the Slave takes it
  const banksBefore = [g().p1pts, g().p2pts];
  eq(g().picker, firstPlacer(1, 5), 'the Emperor side opens the last play');
  g().submitPick('emp', special('emp'));
  g().submitPick('slv', special('slv'));
  const forced = g().result;
  eq(forced?.draw, false, 'the fifth play cannot be drawn — it decides the round');
  eq(forced?.draw === false && forced.winSide, 'slv', 'an Emperor that never struck is struck down');
  eq(forced?.draw === false && forced.mult, 5, 'and the Slave side collects five times the wager');
  eq(finish(), 'scoreboard', 'the round is over');
  eq(banksBefore, [100, 100], 'nothing had moved before the last play');
  eq([g().p1pts, g().p2pts], [0, 200], 'and stalling costs the Emperor side everything it had');
  eq([g().p1w, g().p2w], [0, 1], 'the round goes to the Slave side');
  eq(g().history.length, 1, 'the round is on the record');
  eq(g().game, 2, 'the match moves to round 2');
  eq(g().hands!.emp.length, 0, 'every card was played');

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
  eq(parseHandshake('GET /?room=AB4K HTTP/1.1\r\nUpgrade: websocket\r\n'), null, 'a partial request is not yet a handshake');

  // Server frames are unmasked; feed one back through the decoder in odd slices.
  const decoder = new FrameDecoder();
  const payloads = ['hi', 'y'.repeat(300), '\u{1F3B4}'.repeat(40000)];
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

    // A browser visit to a phone-hosted table answers too, so the same
    // reachability check works whether a phone or a computer is serving.
    const page = await fetch(`http://127.0.0.1:${PORT + 1}/`);
    const pageBody = await page.text();
    eq(page.status, 200, 'a browser visit to a phone-hosted table is answered');
    check(pageBody.includes(ROOM), 'and shows the code to join with', pageBody.slice(0, 120));

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

/* ------------------------------------------------ a table on a phone's hotspot */

/**
 * No router: one phone shares its connection and serves the table on the little
 * network that makes. The host cannot read its own address off that interface,
 * and nobody types one — the guest works out where the host has to be and dials
 * every candidate at once.
 */
async function testHotspot() {
  console.log('\nA table on a phone hotspot');
  const { hotspotTargets, HOTSPOT_GATEWAYS } = await import('../src/net/discover.ts');

  eq(hotspotTargets('172.20.10.4')[0], '172.20.10.1', 'an iPhone hotspot guest looks at the gateway first');
  eq(hotspotTargets('192.168.43.132')[0], '192.168.43.1', 'and so does an Android one');
  eq(hotspotTargets('10.0.1.77')[0], '10.0.1.1', 'whatever range the phone handed out');
  eq(hotspotTargets(''), HOTSPOT_GATEWAYS, 'a phone that cannot say where it is falls back to the usual ones');
  check(
    !hotspotTargets('192.168.43.1').includes('192.168.43.1'),
    'and never dials itself',
    hotspotTargets('192.168.43.1'),
  );
  check(
    hotspotTargets('192.168.5.9').includes('192.168.5.254'),
    'the far end of the range is worth a try too',
    hotspotTargets('192.168.5.9'),
  );

  const nodeNet = await import('node:net');
  const { attachHostConnection } = await import('../src/net/ws/hostServer.ts');
  const { firstAnswering } = await import('../src/net/wifi.ts');
  const port = PORT + 12;

  // Stand in for the sharing phone: the same one-room server it runs.
  const server = nodeNet.createServer((sock) => {
    let conn: { send: (t: string) => void } | null = null;
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
        },
        onText: (t) => {
          if (JSON.parse(t).t === 'hello') conn?.send(JSON.stringify({ t: 'welcome', v: 1, name: 'Kaiji' }));
        },
        onClose: () => {},
      },
    );
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));

  try {
    // 127.0.0.2 is a real address that refuses the connection — the wrong guess
    // a phone always makes at least one of.
    const found = await firstAnswering(['127.0.0.2', '127.0.0.1'], port, ROOM, 4000);
    eq(found?.address, '127.0.0.1', 'the search keeps the address that answers');
    found?.socket.close();

    const wrongRoom = await firstAnswering(['127.0.0.1'], port, 'ZZZZ', 2500);
    check(wrongRoom === null, 'something listening on the wrong room code is not our table');

    const G = {
      session: await import('../src/net/session.ts?device=hs'),
      game: await import('../src/store/useGame.ts?device=hs'),
      net: await import('../src/store/useNet.ts?device=hs'),
    };
    await G.session.startSession({
      kind: 'wifi',
      role: 'guest',
      hotspot: true,
      code: ROOM,
      address: '127.0.0.1',
      port,
      name: 'Tonegawa',
    });
    await until(() => G.net.useNet.getState().status === 'connected', 'a hotspot guest sits down with nothing typed');
    eq(G.net.useNet.getState().info?.mode, 'hotspot', 'and the lobby is told what kind of table it is');
    check(
      (G.net.useNet.getState().info?.hint ?? '').includes('127.0.0.1'),
      'naming where it found the phone that is sharing',
      G.net.useNet.getState().info?.hint,
    );
    await until(() => G.game.useGame.getState().p1 === 'Kaiji', 'and the table introduces itself');

    G.session.stopSession();
    await sleep(150);
  } finally {
    server.close();
  }

  await testHotspotBeforeTheTableOpens();
  await testHotspotCannotShare();
  await testLeavingMidSearch();
}

/**
 * A search can be running for a good while, and the player can walk away from
 * the table in the middle of it. What is left dialling then is dialling for
 * nobody — and anything it has to say is about a table that no longer exists,
 * so it must not reach the store either. Left to itself it put the title screen
 * back into "connecting" a moment after the player had left.
 */
async function testLeavingMidSearch() {
  const nodeNet = await import('node:net');
  const port = PORT + 17;

  let dials = 0;
  const sink = nodeNet.createServer((sock) => {
    dials++;
    sock.destroy();
  });
  await new Promise<void>((r) => sink.listen(port, '127.0.0.1', r));

  const G = {
    session: await import('../src/net/session.ts?device=hs4'),
    net: await import('../src/store/useNet.ts?device=hs4'),
  };

  try {
    void G.session.startSession({
      kind: 'wifi',
      role: 'guest',
      hotspot: true,
      code: ROOM,
      address: '127.0.0.1',
      port,
      name: 'Tonegawa',
    });
    await until(() => dials > 0, 'a search that is looking is really dialling');

    G.session.stopSession();
    const dialledBefore = dials;
    await sleep(2500);

    eq(dials, dialledBefore, 'and stops the moment the player leaves the table');
    eq(G.net.useNet.getState().status, 'idle', 'the search it abandoned never speaks again');
    check(!G.net.useNet.getState().active, 'and the table stays left', G.net.useNet.getState().active);
  } finally {
    sink.close();
  }
}

/**
 * A copy with no way to open a port cannot serve a hotspot table, and no amount
 * of dialling will change that — so it is said once, plainly, and the phone is
 * not left looking like it is getting somewhere. It must also not tell a phone
 * that downloaded the app that it is running Expo Go.
 */
async function testHotspotCannotShare() {
  const G = {
    session: await import('../src/net/session.ts?device=hs3'),
    net: await import('../src/store/useNet.ts?device=hs3'),
  };
  try {
    await G.session.startSession({
      kind: 'wifi',
      role: 'host',
      hotspot: true,
      code: ROOM,
      address: '',
      port: PORT + 16,
      name: 'Kaiji',
    });
    const net = () => G.net.useNet.getState();
    await until(() => net().status === 'error', 'a copy that cannot open a port says so');
    check(!net().retrying, 'and does not sit there dialling something that cannot work', {
      retrying: net().retrying,
      attempt: net().attempt,
    });
    check(
      net().detail.includes('DOWNLOADED'),
      'telling a downloaded app what it means there, not only what Expo Go means',
      net().detail,
    );
  } finally {
    G.session.stopSession();
    await sleep(100);
  }
}

/**
 * The guest presses JOIN first — which is the usual way round, since the phone
 * that is not setting anything up is the phone that is ready sooner. Nothing on
 * this screen can be typed or corrected, so the only answer to "nobody answered"
 * is to ask again until the other phone is open.
 */
async function testHotspotBeforeTheTableOpens() {
  const nodeNet = await import('node:net');
  const { attachHostConnection } = await import('../src/net/ws/hostServer.ts');
  const port = PORT + 13;

  const server = nodeNet.createServer((sock) => {
    let conn: { send: (t: string) => void } | null = null;
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
        },
        onText: (t) => {
          if (JSON.parse(t).t === 'hello') conn?.send(JSON.stringify({ t: 'welcome', v: 1, name: 'Kaiji' }));
        },
        onClose: () => {},
      },
    );
  });

  const G = {
    session: await import('../src/net/session.ts?device=hs2'),
    net: await import('../src/store/useNet.ts?device=hs2'),
  };

  try {
    void G.session.startSession({
      kind: 'wifi',
      role: 'guest',
      hotspot: true,
      code: ROOM,
      address: '127.0.0.1',
      port,
      name: 'Tonegawa',
    });
    await sleep(400);
    eq(G.net.useNet.getState().status, 'connecting', 'a guest that finds nothing is still looking, not failed');

    // The other player finally presses OPEN THE TABLE.
    await sleep(7000);
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
    await until(
      () => G.net.useNet.getState().status === 'connected',
      'and sits down when the table opens, without being asked again',
      20_000,
    );
  } finally {
    G.session.stopSession();
    await sleep(150);
    server.close();
  }
}

/* --------------------------------------------- a table served by the phone */

/**
 * What a built app does that Expo Go cannot: open a port and serve the table
 * itself, on the Wi-Fi or on a hotspot. The native halves are stood in for, so
 * the driver runs exactly the code a phone runs.
 */
async function testServedByThisPhone() {
  console.log('\nA table served by the phone itself');
  const nodeNet = await import('node:net');

  const fakeTcp = {
    createServer(handler: (s: unknown) => void) {
      const srv = nodeNet.createServer((sock) => {
        handler({
          on: (ev: string, cb: (a?: unknown) => void) => sock.on(ev, cb),
          write: (b: Uint8Array) => sock.write(Buffer.from(b)),
          destroy: () => sock.destroy(),
        });
      });
      return {
        listen: (o: { port: number; host: string }, cb?: () => void) => srv.listen(o.port, o.host, cb),
        on: (ev: string, cb: (a?: unknown) => void) => srv.on(ev, cb),
        close: () => srv.close(),
      };
    },
  };
  const shim = (name: string) => {
    if (name === 'react-native-tcp-socket') return fakeTcp;
    if (name === 'react-native') return { NativeModules: { TcpSockets: {} } };
    if (name === 'expo-network') return { getIpAddressAsync: async () => '192.168.1.34' };
    throw new Error(`no module ${name}`);
  };
  (globalThis as { require?: unknown }).require = shim;

  try {
    const { wifiDriver, wifiHostsItself } = await import('../src/net/wifi.ts?device=serve');
    check(wifiHostsItself(), 'a build with the native half says it can serve');

    // The screen that opened the table may have asked for this phone's address
    // before the Wi-Fi had settled, and the other player has to type it in.
    const openPort = PORT + 15;
    const served = await wifiDriver.host(
      { code: ROOM, address: '', port: openPort },
      { onStatus: () => {}, onMessage: () => {} },
    );
    eq(served.info.mode, 'direct', 'a Wi-Fi table is served by the phone itself');
    eq(
      served.info.hint,
      `192.168.1.34:${openPort}`,
      'and a host given no address of its own goes and finds one to read out',
    );
    served.close();
    await sleep(100);

    // A port already held — the table this phone opened a minute ago — is not
    // the same thing as a build that cannot serve at all.
    const takenPort = PORT + 14;
    const squatter = nodeNet.createServer(() => {});
    await new Promise<void>((r) => squatter.listen(takenPort, '0.0.0.0', r));
    try {
      let said = '';
      await wifiDriver.host(
        { code: ROOM, address: '', port: takenPort, hotspot: true },
        { onStatus: (s, d) => { if (s === 'error') said = d ?? ''; }, onMessage: () => {} },
      );
      check(said.includes(`PORT ${takenPort}`), 'a port it could not open is named', said);
      check(said.includes('ALREADY IN USE'), 'along with why it could not', said);
      check(!said.includes('EXPO GO'), 'and Expo Go is not blamed for a build that has the port', said);
    } finally {
      squatter.close();
    }
  } finally {
    delete (globalThis as { require?: unknown }).require;
  }
}

/* ------------------------------------------------ coming back to the table */

/**
 * The floor is pulled out from under a match in progress — the relay is killed,
 * which takes both sockets with it — and then put back. Neither phone should
 * lose the match, and neither player should have to do anything about it.
 */
async function testComingBack() {
  console.log('\nComing back after a drop');
  const port = PORT + 6;
  let relay = spawn('node', [resolvePath(ROOT, 'server/relay.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await sleep(500);

  try {
    const A = {
      session: await import('../src/net/session.ts?device=ra'),
      game: await import('../src/store/useGame.ts?device=ra'),
      net: await import('../src/store/useNet.ts?device=ra'),
      actions: await import('../src/net/actions.ts?device=ra'),
    };
    const B = {
      session: await import('../src/net/session.ts?device=rb'),
      game: await import('../src/store/useGame.ts?device=rb'),
      net: await import('../src/store/useNet.ts?device=rb'),
      actions: await import('../src/net/actions.ts?device=rb'),
    };
    const host = () => A.game.useGame.getState();
    const guest = () => B.game.useGame.getState();
    const hostNet = () => A.net.useNet.getState();
    const guestNet = () => B.net.useNet.getState();

    const common = { kind: 'wifi' as const, code: ROOM, address: '127.0.0.1', port };
    await A.session.startSession({ ...common, role: 'host', name: 'Kaiji' });
    await sleep(150);
    await B.session.startSession({ ...common, role: 'guest', name: 'Tonegawa' });
    await until(() => hostNet().peerHere && guestNet().peerHere, 'the two phones are at the table');

    host().setStartingBankroll(500);
    host().beginMatch();
    await until(() => guest().phase === 'scoreboard', 'the match is under way');
    B.actions.netSetStake(100);
    await until(() => host().stake === 100, 'the wager is named');
    B.actions.netDeal();
    await until(() => guest().phase === 'select' && !!guest().hands, 'the cards are dealt');
    const handBefore = guest().hands!.slv.map((c) => c.id);

    // The relay dies mid-round, taking both sockets with it.
    relay.kill('SIGKILL');
    await until(() => guestNet().retrying || hostNet().retrying, 'a link that drops is dialled again, not mourned');
    eq(guest().phase, 'select', 'and the match stays on screen while it dials');
    eq(guest().hands!.slv.map((c) => c.id), handBefore, 'nobody loses their hand over it');

    relay = spawn('node', [resolvePath(ROOT, 'server/relay.js')], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    await until(() => hostNet().peerHere && guestNet().peerHere, 'both phones find the table again', 25000);
    eq([guestNet().retrying, hostNet().retrying], [false, false], 'and stop dialling once they are back');
    eq(host().p2, 'Tonegawa', 'the host still knows who came back');
    eq(guest().p1, 'Kaiji', 'and the guest who it is playing');
    eq(guest().hands!.slv.map((c) => c.id), handBefore, 'the guest holds the hand it was dealt');

    // The round carries on from exactly where it stopped.
    A.actions.netPick(host().hands!.emp.findIndex((c) => c.t === 'C'));
    await until(() => guest().picker === 'slv', 'play carries on where it left off');
    B.actions.netPick(guest().hands!.slv.findIndex((c) => c.t === 'C'));
    await until(() => host().phase === 'reveal' && guest().phase === 'reveal', 'and both phones resolve the play');

    /* ---------------------------------------- leaving on purpose, then coming back */

    console.log('\nTaking the seat again');
    B.actions.netAdvance();
    await until(() => guest().turn === 2 || guest().game === 2, 'the match moves on');

    B.session.stopSession('THE OTHER PLAYER LEFT THE TABLE');
    await sleep(200);
    eq(guest().netRole, 'off', 'the guest is off the table');
    eq(guestNet().resume?.code, ROOM, 'but the table it left is remembered');
    eq(guestNet().resume?.inMatch, true, 'along with the fact a match was on it');
    await until(() => !hostNet().peerHere, 'the host is told the seat is empty');
    eq(hostNet().status, 'waiting', 'and holds the table open rather than closing it');
    eq(host().inMatch, true, 'the match is still the host to keep');

    await B.session.resumeSession();
    await until(() => guestNet().peerHere && hostNet().peerHere, 'the seat is taken again', 10000);
    await until(() => guest().phase === host().phase, 'and the board comes back as the host has it');
    eq([guest().p1pts, guest().p2pts], [host().p1pts, host().p2pts], 'with the purses the host has been keeping');
    eq(guest().game, host().game, 'on the round the match had reached');
    eq(guest().p1, 'Kaiji', 'and the host named again');
    eq(guestNet().resume, null, 'the offer to come back is gone once the seat is taken');

    /* ------------------------------------- the phone holding the table walks off */

    console.log('\nWhen the other phone closes the table');
    A.session.stopSession('THE OTHER PLAYER LEFT THE TABLE');
    await until(() => guestNet().status === 'closed', 'the guest is told the table closed');
    eq(guestNet().detail, 'THE OTHER PLAYER LEFT THE TABLE', 'in so many words');
    eq(guestNet().retrying, false, 'and does not sit there dialling a table nobody is holding');
    eq(hostNet().resume?.code, ROOM, 'the host keeps the table to come back to');

    await A.session.resumeSession();
    B.session.retryNow();
    await until(() => guestNet().peerHere && hostNet().peerHere, 'the two are back once it re-opens', 15000);
    await until(() => guest().phase === host().phase, 'on the board the host was keeping');
    eq(host().inMatch, true, 'with the match still running');
    eq([guest().p1pts, guest().p2pts], [host().p1pts, host().p2pts], 'and the purses intact');

    A.session.stopSession('done');
    B.session.stopSession('done');
    await sleep(150);
  } finally {
    relay.kill();
  }
}

/**
 * A phone can stop answering with its socket still wide open — asleep, or off
 * the network in a way nothing downstream has noticed yet. The table has to
 * notice by itself, and it has to notice without throwing the link away.
 */
async function testGoneQuiet() {
  console.log('\nA phone that stops answering');
  const port = PORT + 10;
  const relay = spawn('node', [resolvePath(ROOT, 'server/relay.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await sleep(500);

  try {
    const H = {
      session: await import('../src/net/session.ts?device=rq'),
      net: await import('../src/store/useNet.ts?device=rq'),
    };
    const hostNet = () => H.net.useNet.getState();

    await H.session.startSession({
      kind: 'wifi',
      role: 'host',
      code: ROOM,
      address: '127.0.0.1',
      port,
      name: 'Kaiji',
    });

    // A challenger that sits down and then says nothing at all — not even the
    // pongs the app answers with, since this one is a bare socket.
    const ghost = await new Promise<WebSocket>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=${ROOM}&role=guest`);
      ws.onopen = () => resolve(ws);
    });
    ghost.send(JSON.stringify({ t: 'hello', v: 1, name: 'Tonegawa' }));
    await until(() => hostNet().peerHere, 'the challenger is seated');

    await until(() => !hostNet().peerHere, 'a phone that stops answering is noticed', 25000);
    check(
      hostNet().detail.includes('GONE QUIET'),
      'and is described as quiet rather than gone',
      hostNet().detail,
    );
    eq(hostNet().status, 'connected', 'but the table is not thrown away over it');

    ghost.send(JSON.stringify({ t: 'pong', ts: 1 }));
    await until(() => hostNet().peerHere, 'and the seat fills again the moment it answers');

    ghost.close();
    H.session.stopSession();
    await sleep(150);
  } finally {
    relay.kill();
  }
}

/**
 * A phone that lost Wi-Fi leaves a socket the relay has not yet buried, and it
 * is the same phone that comes back wanting that seat.
 */
async function testWarmSeat() {
  console.log('\nA seat that is still warm');
  const port = PORT + 8;
  const relay = spawn('node', [resolvePath(ROOT, 'server/relay.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await sleep(500);

  const open = (role: string) =>
    new Promise<WebSocket | null>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=${ROOM}&role=${role}`);
      ws.onopen = () => resolve(ws);
      ws.onerror = () => resolve(null);
    });

  try {
    const host = await open('host');
    const seen: string[] = [];
    host!.onmessage = (e) => seen.push(String(e.data));
    const first = await open('guest');
    await sleep(150);

    // The first guest never closes: as far as the relay knows it is still there.
    const second = await open('guest');
    check(second !== null, 'a phone coming back is not turned away from its own seat');
    await sleep(250);

    const states = seen.map((raw) => JSON.parse(raw)).filter((m) => m.t === 'peer').map((m) => m.state);
    eq(states, ['joined', 'joined'], 'and the phone holding the table is never told its challenger left');

    second?.send(JSON.stringify({ t: 'hello', v: 1, name: 'Tonegawa' }));
    await sleep(200);
    check(
      seen.some((raw) => JSON.parse(raw).t === 'hello'),
      'the seat works: the returning phone is heard',
    );
    first?.close();
    second?.close();
    host?.close();
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
  // A dial that lands nowhere is very often a table that is not open yet — the
  // other player is a few seconds behind — so it is tried again rather than
  // written off, and the diagnosis stays on screen while it is.
  await until(() => E.net.useNet.getState().retrying, 'a dial that lands nowhere is tried again, not written off');
  const trying = E.net.useNet.getState().detail;
  check(trying.includes(`127.0.0.1:${PORT + 3}`), 'naming the address it could not reach while it tries', trying);
  check(trying.includes('TRYING AGAIN'), 'and saying that is what it is doing', trying);
  check(
    !trying.includes('LEFT THE TABLE'),
    'never blaming a phone that was never connected',
    trying,
  );

  // And it stops, rather than dialling a wrong address until the battery runs out.
  await until(
    () => E.net.useNet.getState().status === 'error' && !E.net.useNet.getState().retrying,
    'and gives up in the end rather than dialling for ever',
    40_000,
  );
  const detail = E.net.useNet.getState().detail;
  check(detail.includes(`127.0.0.1:${PORT + 3}`), 'still naming the address it could not reach', detail);
  check(detail.includes('SAME WI-FI'), 'and what to check about it', detail);
  E.session.stopSession();
}

/* ------------------------------------------- whoever presses first waits */

/**
 * The commonest way for two phones to fail to meet: the player who is not
 * setting anything up presses their button first, and dials a table that is not
 * open yet. That used to be the end of it — a dial that never landed was read
 * as a wrong address and never repeated.
 */
async function testPressingFirst() {
  console.log('\nWhoever presses first waits');
  const port = PORT + 18;

  const G = {
    session: await import('../src/net/session.ts?device=first-g'),
    net: await import('../src/store/useNet.ts?device=first-g'),
    game: await import('../src/store/useGame.ts?device=first-g'),
  };
  const H = { session: await import('../src/net/session.ts?device=first-h') };

  let relay: ReturnType<typeof spawn> | null = null;
  try {
    // Nothing is running at all: no relay, no table, nobody there.
    void G.session.startSession({
      kind: 'wifi',
      role: 'guest',
      code: ROOM,
      address: '127.0.0.1',
      port,
      name: 'Tonegawa',
    });
    await until(() => G.net.useNet.getState().retrying, 'a guest that is early keeps dialling');
    check(
      G.net.useNet.getState().detail.includes(`127.0.0.1:${port}`),
      'and still says which address it cannot reach',
      G.net.useNet.getState().detail,
    );

    // The other player catches up.
    relay = spawn('node', [resolvePath(ROOT, 'server/relay.js')], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    await sleep(600);
    await H.session.startSession({
      kind: 'wifi',
      role: 'host',
      code: ROOM,
      address: '127.0.0.1',
      port,
      name: 'Kaiji',
    });

    await until(() => G.net.useNet.getState().peerHere, 'and sits down by itself when the table opens', 20_000);
    await until(() => G.game.useGame.getState().p1 === 'Kaiji', 'with nobody having pressed anything again');
  } finally {
    G.session.stopSession();
    H.session.stopSession();
    await sleep(150);
    relay?.kill();
  }
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
await testHotspot();
await testServedByThisPhone();
await testPressingFirst();
await testComingBack();
await testGoneQuiet();
await testWarmSeat();
await testUnreachable();

console.log(`\n${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
