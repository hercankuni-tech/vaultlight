// VAULTLIGHT screenshot harness. Serves game/ locally, launches headless Chrome with a throwaway
// profile, drives the page's own demo scripts (so every frame is a real render of the game's
// code), captures PNGs over the Chrome DevTools Protocol and writes JPEGs sized for the gate:
// 1280x720, whole JPEG, well under the 256 KiB cap. Deterministic — every state from a fixed seed.
//
// Standard library only. Run: node tools/shoot.mjs

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, statSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { createServer } from 'node:http';

const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:');
const GAME_ROOT = join(HERE, '..', 'game');
const SHOTS_DIR = join(HERE, '..', 'screenshots');
// Raw PNGs land outside screenshots/ — the gate allows at most 4 files in there.
const RAW_DIR = join(HERE, '..', '..', 'scratch-shots');

const CHROME_CANDIDATES = [
  process.env.VAULTLIGHT_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const findChrome = () => CHROME_CANDIDATES.find((p) => { try { return statSync(p).isFile(); } catch { return false; } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- static server (same-origin, offline) ---------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function startServer(root, port = 8099) {
  const server = createServer(async (req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    try {
      const body = readFileSync(join(root, rel.replace(/^\/+/, '')));
      const ext = rel.slice(rel.lastIndexOf('.')).toLowerCase();
      res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('nope');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${port}` }));
  });
}

// --- minimal WebSocket over raw TCP (text frames only, unmasked replies ignored) --------
function wsConnect(url) {
  const u = new URL(url);
  const key = Buffer.from(Array.from({ length: 16 }, () => (Math.random() * 255) | 0)).toString('base64');
  return new Promise((resolve, reject) => {
    const sock = createConnection({ host: u.hostname, port: Number(u.port) });
    sock.write([
      `GET ${u.pathname}${u.search} HTTP/1.1`, `Host: ${u.host}`, 'Upgrade: websocket', 'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13', '', '',
    ].join('\r\n'));
    let buf = Buffer.alloc(0);
    let ready = false;
    const handlers = new Map();
    let id = 0;

    const sendFrame = (text) => {
      const p = Buffer.from(text);
      const head = p.length < 126
        ? Buffer.from([0x81, 0x80 | p.length])
        : p.length < 65536
          ? Buffer.from([0x81, 0xFE, (p.length >> 8) & 255, p.length & 255])
          : Buffer.from([0x81, 0xFF, 0, 0, 0, 0, (p.length >> 24) & 255, (p.length >> 16) & 255, (p.length >> 8) & 255, p.length & 255]);
      const mask = Buffer.from(Array.from({ length: 4 }, () => (Math.random() * 255) | 0));
      const masked = Buffer.from(p.map((b, i) => b ^ mask[i % 4]));
      sock.write(Buffer.concat([head, mask, masked]));
    };

    const pump = () => {
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (op === 0x1) {
          try {
            const msg = JSON.parse(payload.toString());
            if (msg.id && handlers.has(msg.id)) { handlers.get(msg.id)(msg); handlers.delete(msg.id); }
          } catch { /* ignore non-json frames */ }
        }
      }
    };

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!ready) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) return;
        buf = buf.subarray(idx + 4);
        ready = true;
        pump();
        resolve({
          call(method, params = {}, sid = null) {
            return new Promise((res, rej) => {
              const mid = ++id;
              const timer = setTimeout(() => rej(new Error(`CDP timeout: ${method}`)), 15000);
              handlers.set(mid, (msg) => { clearTimeout(timer); msg.error ? rej(new Error(`${method}: ${JSON.stringify(msg.error)}`)) : res(msg.result); });
              sendFrame(JSON.stringify({ id: mid, method, params, ...(sid ? { sessionId: sid } : {}) }));
            });
          },
          close: () => sock.destroy(),
        });
      } else pump();
    });
    sock.on('error', reject);
  });
}

// --- launch chrome ----------------------------------------------------------------------
async function launch() {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome found (set VAULTLIGHT_CHROME)');
  const profile = mkdtempSync(join(tmpdir(), 'vaultlight-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--hide-scrollbars', '--window-size=1280,720', `--user-data-dir=${profile}`, '--remote-debugging-port=9223',
    '--remote-allow-origins=*',
  ];
  const proc = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  await sleep(1800);
  return { proc, profile };
}

const DEMOS = [
  { file: '1-start.jpg', script: '1-start', label: 'cover: the gallery read' },
  { file: '2-play.jpg', script: '2-play', label: 'mid-run: hauling under the alarm' },
  { file: '3-end.jpg', script: '3-end', label: 'getaway: clean escape' },
];

async function main() {
  const { server, url } = await startServer(GAME_ROOT, 8099);
  const { proc, profile } = await launch();
  try {
    const list = await fetch('http://127.0.0.1:9223/json/version').then((r) => r.json());
    const ws = await wsConnect(list.webSocketDebuggerUrl);
    const { targetId } = await ws.call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await ws.call('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params = {}) => ws.call(method, params, sessionId);

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${url}/index.html` });
    await sleep(2200);

    for (const shot of DEMOS) {
      const st = await send('Runtime.evaluate', {
        expression: `(() => { const s = window.__vaultlight.demo(${JSON.stringify(shot.script)}); return {phase:s.phase, alarm:Math.round(s.alarm), loot:s.lootTaken, guards:s.guards.length, cams:s.cams.length}; })()`,
        returnByValue: true,
      });
      console.log(`[demo] ${shot.file} ${shot.label} ->`, JSON.stringify(st.result.value));
      const data = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const png = Buffer.from(data.data, 'base64');
      const jpeg = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
      const out = Buffer.from(jpeg.data, 'base64');
      writeFileSync(join(SHOTS_DIR, shot.file), out);
      mkdirSync(RAW_DIR, { recursive: true });
      writeFileSync(join(RAW_DIR, `raw-${shot.script}.png`), png);
      console.log(`[shot] ${shot.file} ${out.length} bytes (png ${png.length})`);
    }
    ws.close();
    console.log('done');
  } finally {
    proc.kill();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
