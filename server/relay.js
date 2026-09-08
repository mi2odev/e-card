#!/usr/bin/env node
/**
 * E-Card LAN relay — pairs two phones by room code so they can play over Wi-Fi.
 *
 *   node server/relay.js            (or: npm run relay)
 *
 * Zero dependencies, no internet, no state kept after a room empties. It exists
 * only because an app running inside Expo Go cannot open a listening port; with
 * a development build the host phone serves the room itself and this is not
 * needed at all.
 *
 * Protocol: a client connects to
 *     ws://<this machine>:8787/?room=ABCD&role=host|guest
 * and every text frame it sends is forwarded verbatim to the other member of the
 * room. Each side is told {"t":"peer","state":"joined"|"left"} as the room fills
 * and empties.
 */

'use strict';

const net = require('node:net');
const os = require('node:os');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8787);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME_BYTES = 1 << 20;
const IDLE_ROOM_MS = 10 * 60 * 1000;

/** roomCode -> { host: Client|null, guest: Client|null, touched: number } */
const rooms = new Map();

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

/* ------------------------------------------------------------ ws framing */

function encodeFrame(payload, opcode = 0x1) {
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/** Pulls whole frames out of a growing buffer. Returns the unconsumed tail. */
function readFrames(buf, sink) {
  let off = 0;
  for (;;) {
    if (buf.length - off < 2) break;
    const fin = (buf[off] & 0x80) !== 0;
    const opcode = buf[off] & 0x0f;
    const masked = (buf[off + 1] & 0x80) !== 0;
    let len = buf[off + 1] & 0x7f;
    let p = off + 2;
    if (len === 126) {
      if (buf.length - p < 2) break;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (buf.length - p < 8) break;
      const big = buf.readBigUInt64BE(p);
      if (big > BigInt(MAX_FRAME_BYTES)) throw new Error('frame too large');
      len = Number(big);
      p += 8;
    }
    if (len > MAX_FRAME_BYTES) throw new Error('frame too large');
    if (buf.length - p < (masked ? 4 : 0) + len) break;
    let payload;
    if (masked) {
      const mask = buf.subarray(p, p + 4);
      p += 4;
      payload = Buffer.alloc(len);
      for (let i = 0; i < len; i++) payload[i] = buf[p + i] ^ mask[i & 3];
    } else {
      payload = buf.subarray(p, p + len);
    }
    p += len;
    off = p;
    sink({ fin, opcode, payload });
  }
  return buf.subarray(off);
}

/* --------------------------------------------------------------- clients */

function roomOf(pathname) {
  const q = pathname.indexOf('?');
  if (q < 0) return { room: '', role: '' };
  const params = new URLSearchParams(pathname.slice(q + 1));
  return {
    room: String(params.get('room') || '').toUpperCase(),
    role: String(params.get('role') || '').toLowerCase(),
  };
}

function makeClient(socket) {
  return {
    socket,
    room: '',
    role: '',
    send(text) {
      if (!socket.destroyed) socket.write(encodeFrame(Buffer.from(text, 'utf8')));
    },
    close() {
      try {
        if (!socket.destroyed) socket.write(encodeFrame(Buffer.from([0x03, 0xe8]), 0x8));
      } catch {}
      socket.destroy();
    },
  };
}

function peerOf(client) {
  const room = rooms.get(client.room);
  if (!room) return null;
  return client.role === 'host' ? room.guest : room.host;
}

function leave(client) {
  const room = rooms.get(client.room);
  if (!room) return;
  if (room[client.role] === client) room[client.role] = null;
  const other = client.role === 'host' ? room.guest : room.host;
  if (other) other.send(JSON.stringify({ t: 'peer', state: 'left' }));
  if (!room.host && !room.guest) {
    rooms.delete(client.room);
    log(`room ${client.room} closed`);
  }
}

const server = net.createServer((socket) => {
  socket.setNoDelay(true);
  const client = makeClient(socket);
  let upgraded = false;
  let buf = Buffer.alloc(0);

  const bail = (code, reason) => {
    socket.end(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  };

  const health = (sock) => {
    const body =
      '<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">' +
      '<body style="background:#04100a;color:#efe5c8;font:16px/1.6 system-ui;text-align:center;padding:14vh 24px">' +
      `<h1 style="color:#f2cf6f;letter-spacing:3px">E&#8209;CARD RELAY</h1><p>It is running, and this phone can reach it.</p>` +
      `<p style="color:#8f8568;font-size:13px">Enter this whole address in the app:<br><b style="color:#e9c86e">${
        headersHost || `this machine:${PORT}`
      }</b></p></body>`;
    sock.end(
      'HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
    );
  };
  let headersHost = '';

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    if (!upgraded) {
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) {
        if (buf.length > 8192) bail(431, 'Request Header Fields Too Large');
        return;
      }
      const head = buf.subarray(0, end).toString('utf8').split('\r\n');
      buf = buf.subarray(end + 4);

      const m = /^GET\s+(\S+)\s+HTTP\/1\.1$/i.exec(head[0] || '');
      if (!m) return bail(400, 'Bad Request');
      const headers = new Map(
        head.slice(1).map((line) => {
          const i = line.indexOf(':');
          return [line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()];
        }),
      );
      headersHost = headers.get('host') || '';
      const key = headers.get('sec-websocket-key');
      if (!key || (headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
        // A plain browser visit. Answer it, so opening this address on a phone is
        // a one-tap test of "can this phone actually reach the relay?" — which
        // separates a firewall or a wrong network from a problem in the app.
        return health(socket);
      }

      const { room, role } = roomOf(m[1]);
      if (!room || (role !== 'host' && role !== 'guest')) return bail(400, 'Bad Request');

      const slot = rooms.get(room) || { host: null, guest: null, touched: Date.now() };
      if (slot[role]) {
        log(`room ${room}: ${role} seat already taken`);
        return bail(409, 'Seat Taken');
      }

      const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
      );

      client.room = room;
      client.role = role;
      slot[role] = client;
      slot.touched = Date.now();
      rooms.set(room, slot);
      upgraded = true;
      log(`room ${room}: ${role} joined`);

      const other = peerOf(client);
      if (other) {
        other.send(JSON.stringify({ t: 'peer', state: 'joined' }));
        client.send(JSON.stringify({ t: 'peer', state: 'joined' }));
      }
    }

    try {
      buf = readFrames(buf, ({ opcode, payload }) => {
        if (opcode === 0x8) return client.close();
        if (opcode === 0x9) return socket.write(encodeFrame(payload, 0xa));
        if (opcode === 0xa) return;
        const slot = rooms.get(client.room);
        if (slot) slot.touched = Date.now();
        const other = peerOf(client);
        if (other) other.send(payload.toString('utf8'));
      });
    } catch (e) {
      log('dropping client:', e.message);
      client.close();
    }
  });

  socket.on('error', () => socket.destroy());
  socket.on('close', () => {
    if (upgraded) {
      log(`room ${client.room}: ${client.role} left`);
      leave(client);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touched > IDLE_ROOM_MS && !room.host && !room.guest) rooms.delete(code);
  }
}, 60_000).unref();

server.on('error', (e) => {
  console.error(`\nCould not listen on port ${PORT}: ${e.message}`);
  if (e.code === 'EADDRINUSE') console.error('Another relay may already be running. Try PORT=8788 node server/relay.js');
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

  console.log('\n  E-CARD relay is up.\n');
  if (addresses.length) {
    console.log('  On both phones, enter this address:\n');
    for (const a of addresses) console.log(`      ${a}:${PORT}`);
  } else {
    console.log(`  Listening on port ${PORT} (no LAN address found).`);
  }
  console.log('\n  Both phones must be on this same Wi-Fi. Ctrl-C to stop.\n');
});
