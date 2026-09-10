/**
 * Everything the app has to say about a link, and how it is meant to read.
 *
 * These used to be single strings, and they had grown into paragraphs — set in
 * the same 10 px all-caps letter-spaced line as the word CONNECTED, with an IP
 * address and the odd word of native error in the middle of them. Long enough
 * to be worth reading and set so as to be unreadable, which is the worst of
 * both.
 *
 * So a notice is three parts, and each is written for where it appears:
 *
 *   say   what happened, in a few words. The headline, and the only part a
 *         one-line banner has room for, so it has to stand on its own.
 *   fix   what to do about it, in ordinary sentences. Set in body type, not
 *         shouted, because this is the part with something to teach.
 *   tech  the machine's own words — an address, a port, a native error. True
 *         and useless to most people, so it is folded away behind a tap and
 *         waiting when it is the only thing that will do.
 *
 * Keeping them here rather than beside the code that raises them means the
 * whole of what a player can be told is one file to read, and to translate.
 */

export type Notice = {
  say: string;
  fix?: string;
  tech?: string;
};

/** A notice with nothing but a headline — for the short, self-evident ones. */
export const says = (say: string): Notice => ({ say });

const where = (address: string, port: number) => `${address}:${port}`;

/* --------------------------------------------------------------- dialling */

export const NOTICE = {
  /** A dial that landed nowhere. Either end could be at fault, so neither is blamed. */
  nothingAnswered: (address: string, port: number): Notice => ({
    say: 'NOTHING ANSWERED',
    fix: `Check that both phones are on the same Wi-Fi, and that this address is the one the other phone is showing. Opening it in this phone's browser will say whether it can be reached at all.`,
    tech: `http://${where(address, port)}`,
  }),

  /** The host in relay mode, reaching for a relay that is not running. */
  noRelay: (address: string, port: number): Notice => ({
    say: 'NO RELAY THERE',
    fix: `Nothing is relaying at that address. The relay starts with \`npm start\` on the computer the app is loaded from — leave it running, and use the same address on both phones.`,
    tech: where(address, port),
  }),

  /** Nowhere to find a table on a network one of the phones is making. */
  noHotspotTable: (tried: string[], port: number): Notice => ({
    say: 'NO TABLE ON THIS HOTSPOT',
    fix: `Join the other phone's hotspot in Wi-Fi settings, and check that it has pressed OPEN THE TABLE. The phone sharing the hotspot is the one that opens it.`,
    tech: tried.length ? `tried ${tried.join(', ')} · port ${port}` : `port ${port}`,
  }),

  /* ---------------------------------------------------------- serving */

  /**
   * There is no in-app server in this copy at all.
   *
   * Expo Go is the usual reason and was once the only one named, which reads as
   * nonsense on a phone that downloaded the app and sends the player off to
   * build something they are already running.
   */
  cannotServe: (): Notice => ({
    say: 'THIS PHONE CANNOT OPEN A TABLE',
    fix: `It has no way to open a port. In Expo Go that is normal — a phone can join a table there but not serve one. In a downloaded app it means the build went out without the part that does it.`,
  }),

  /** This copy can serve and this time could not. Nearly always the last table. */
  portTaken: (why: string, port: number): Notice => ({
    say: 'THE PORT IS ALREADY TAKEN',
    fix: `Something else on this phone is using port ${port} — usually the table it opened a minute ago, still letting go. Give it a moment and try again.`,
    tech: why,
  }),

  /** A fault on a table people are already sitting at. */
  servingFailed: (why: string): Notice => ({
    say: 'THE TABLE STOPPED SERVING',
    fix: `Something went wrong with the connection on this phone. Opening the table again is usually enough.`,
    tech: why,
  }),

  /** Expo Go, on plain Wi-Fi, with no address to reach a relay on. */
  needsRelayAddress: (): Notice => ({
    say: 'THIS PHONE CANNOT OPEN A TABLE',
    fix: `It cannot open a port, so a computer has to sit between the two phones. Enter the address of one running the relay — \`npm start\` starts it for you.`,
  }),

  /* ------------------------------------------------------------ the table */

  /** Nobody is hosting the code the guest typed. */
  noSuchTable: (code: string): Notice => ({
    say: `NO TABLE ON CODE ${code}`,
    fix: `Check the four characters against the other phone, and that it has pressed OPEN THE TABLE.`,
  }),

  /** They have played together before, so the code is not in doubt. */
  notBackYet: (code: string): Notice => ({
    say: 'THIS SEAT IS HELD',
    fix: `The other phone is not back at table ${code} yet. Nothing is lost — the match is waiting exactly as it was.`,
  }),

  versionMismatch: (): Notice => ({
    say: 'THE TWO PHONES DISAGREE',
    fix: `They are running different versions of the game and cannot play together. Update them both to the same one.`,
  }),

  /* ------------------------------------------------------- the other phone */

  linkDropped: (): Notice => ({
    say: 'THE LINK DROPPED',
    fix: `Taking the seat back. The match is safe — the phone that opened the table is still holding all of it.`,
  }),

  stillTrying: (): Notice => ({ say: 'NOTHING HAS ANSWERED YET' }),

  gaveUp: (): Notice => ({
    say: 'COULD NOT GET BACK TO THE TABLE',
    fix: `The match is still here. Try again when the other phone is back on the network.`,
  }),

  goneQuiet: (): Notice => ({
    say: 'THE OTHER PHONE HAS GONE QUIET',
    fix: `It has said nothing for a while — locked, or off the network. The seat is being kept for it.`,
  }),

  challengerLeft: (): Notice => ({
    say: 'THE CHALLENGER LEFT',
    fix: `The seat is open again. Anyone with the code can take it, including the phone that just left.`,
  }),

  tableClosed: (reason?: string): Notice => ({
    say: 'THE TABLE CLOSED',
    fix: reason?.trim() ? reason.trim() : `The phone that opened it has left.`,
  }),

  /* --------------------------------------------------------- going wrong */

  /** Nothing else fits: whatever the platform said, said plainly. */
  unexpected: (why: string): Notice => ({
    say: 'SOMETHING WENT WRONG',
    fix: `The connection could not be made, and the reason is not one the game knows how to explain.`,
    tech: why,
  }),
} as const;

/** What a hotspot guest is doing while it looks. Not a fault — a state. */
export const lookingForHotspot = (sweep: number): Notice => ({
  say: 'LOOKING FOR THE OTHER PHONE',
  fix:
    sweep > 1
      ? `Nothing yet. It keeps looking — the other phone may still be opening its table.`
      : `Dialling the addresses a phone sharing a hotspot can be at.`,
});
