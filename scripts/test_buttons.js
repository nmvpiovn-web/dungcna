import { spawn } from 'node:child_process';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const proc = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9224', '--user-data-dir=C:\\Temp\\test_cdp_9224', 'about:blank']);

setTimeout(async () => {
  const targets = await (await fetch('http://127.0.0.1:9224/json/list')).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onopen = async () => {
    ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Emulation.setDeviceMetricsOverride', params: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false } }));
    ws.send(JSON.stringify({ id: 3, method: 'Page.navigate', params: { url: 'https://timbk.io.vn/admincp' } }));
    setTimeout(() => {
      ws.send(JSON.stringify({ id: 4, method: 'Runtime.evaluate', params: { expression: 'Array.from(document.querySelectorAll("button")).map(b => b.textContent.trim())', returnByValue: true } }));
    }, 3500);
  };
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.id === 4) {
      console.log('Buttons found:', data.result.result.value);
      proc.kill();
      process.exit(0);
    }
  };
}, 1500);
