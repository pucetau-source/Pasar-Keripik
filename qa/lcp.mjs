// CDP-driven cold-load measurement (QA artifact). Usage: node qa/lcp.mjs <url> [runs]
import { spawn } from 'node:child_process';
import os from 'node:os'; import path from 'node:path'; import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:3055/'; const runs = Number(process.argv[3] || 5);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-chrome-'));
const port = 9333;
const p = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--disable-gpu', '--window-size=1366,768', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
const t = targets.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); const events = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else events.push(d); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const res = [];
for (let r = 0; r < runs; r++) {
  events.length = 0;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lcp=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});` });
  await send('Page.navigate', { url });
  await sleep(4000);
  const ev = await send('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({lcp:window.__lcp,fcp:(performance.getEntriesByType('paint').find(p=>p.name==='first-contentful-paint')||{}).startTime,rows:document.querySelectorAll('tbody tr').length,cls:0})` });
  const o = JSON.parse(ev.result.result.value);
  let bytes = 0, js = 0, css = 0; const urls = new Map();
  for (const e of events) { if (e.method === 'Network.requestWillBeSent') urls.set(e.params.requestId, e.params.request.url); if (e.method === 'Network.loadingFinished') { const u = urls.get(e.params.requestId) || ''; bytes += e.params.encodedDataLength; if (u.endsWith('.js')) js += e.params.encodedDataLength; if (u.endsWith('.css')) css += e.params.encodedDataLength; } }
  res.push({ ...o, transferKB: +(bytes / 1024).toFixed(1), jsKB: +(js / 1024).toFixed(1), cssKB: +(css / 1024).toFixed(1) });
}
console.log(JSON.stringify(res)); ws.close(); p.kill(); await sleep(500); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
process.exit(0);
