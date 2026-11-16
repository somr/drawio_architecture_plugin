// usage: node cdp.mjs '<js expression>'  — evaluates in the DrawIO page, prints JSON result
const expr = process.argv[2];
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
const msg = await new Promise(r => ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) r(m); });
const res = msg.result;
if (res.exceptionDetails) { console.log('EXCEPTION', JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails)); process.exit(1); }
console.log(JSON.stringify(res.result.value, null, 1));
ws.close();
