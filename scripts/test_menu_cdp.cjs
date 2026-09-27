const { spawn } = require('child_process');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const proc = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9225', '--user-data-dir=C:\\Temp\\test_cdp_9225', 'about:blank']);

setTimeout(async () => {
  try {
    const list = await (await fetch('http://127.0.0.1:9225/json/list')).json();
    const page = list.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const msgId = id++;
        const handler = (e) => {
          const res = JSON.parse(e.data);
          if (res.id === msgId) {
            ws.removeEventListener('message', handler);
            resolve(res.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    ws.onopen = async () => {
      console.log('WS connected. Navigating to https://timbk.io.vn...');
      await send('Page.enable');
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: 'https://timbk.io.vn' });
      await new Promise(r => setTimeout(r, 4500));

      // Test Desktop Menus: Lộ Trình, Phòng Thi, Công Cụ
      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          const buttons = Array.from(document.querySelectorAll('header button, nav button')).map(b => ({
            text: b.textContent.replace(/\\s+/g, ' ').trim(),
            rect: b.getBoundingClientRect()
          }));
          return { buttons };
        })()`,
        returnByValue: true
      });
      console.log('Found buttons:', JSON.stringify(res.result.value, null, 2));

      // Now click 'Lộ Trình' button
      const clickLoTrinh = await send('Runtime.evaluate', {
        expression: `(async () => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lộ Trình'));
          if (!btn) return { found: false, error: 'Button not found' };
          btn.click();
          await new Promise(r => setTimeout(r, 200));
          const dropdowns = Array.from(document.querySelectorAll('.absolute.left-0')).map(d => ({
            visible: d.offsetHeight > 0,
            text: d.textContent.replace(/\\s+/g, ' ').trim(),
            height: d.offsetHeight,
            width: d.offsetWidth,
            links: Array.from(d.querySelectorAll('a')).map(a => ({ href: a.getAttribute('href'), text: a.textContent.replace(/\\s+/g, ' ').trim() }))
          }));
          return { found: true, dropdowns };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('Click Lộ Trình result:', JSON.stringify(clickLoTrinh.result.value, null, 2));

      // Now click 'Phòng Thi'
      const clickPhongThi = await send('Runtime.evaluate', {
        expression: `(async () => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Phòng Thi'));
          if (!btn) return { found: false, error: 'Button not found' };
          btn.click();
          await new Promise(r => setTimeout(r, 200));
          const dropdowns = Array.from(document.querySelectorAll('.absolute.left-0')).map(d => ({
            visible: d.offsetHeight > 0,
            text: d.textContent.replace(/\\s+/g, ' ').trim(),
            height: d.offsetHeight,
            width: d.offsetWidth,
            links: Array.from(d.querySelectorAll('a')).map(a => ({ href: a.getAttribute('href'), text: a.textContent.replace(/\\s+/g, ' ').trim() }))
          }));
          return { found: true, dropdowns };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('Click Phòng Thi result:', JSON.stringify(clickPhongThi.result.value, null, 2));

      // Now click 'Công Cụ'
      const clickCongCu = await send('Runtime.evaluate', {
        expression: `(async () => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Công Cụ'));
          if (!btn) return { found: false, error: 'Button not found' };
          btn.click();
          await new Promise(r => setTimeout(r, 200));
          const dropdowns = Array.from(document.querySelectorAll('.absolute.left-0')).map(d => ({
            visible: d.offsetHeight > 0,
            text: d.textContent.replace(/\\s+/g, ' ').trim(),
            height: d.offsetHeight,
            width: d.offsetWidth,
            links: Array.from(d.querySelectorAll('a')).map(a => ({ href: a.getAttribute('href'), text: a.textContent.replace(/\\s+/g, ' ').trim() }))
          }));
          return { found: true, dropdowns };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('Click Công Cụ result:', JSON.stringify(clickCongCu.result.value, null, 2));

      // Test clicking /tools link from Công Cụ dropdown
      const clickToolsLink = await send('Runtime.evaluate', {
        expression: `(async () => {
          const link = Array.from(document.querySelectorAll('a')).find(a => a.getAttribute('href') === '/tools');
          if (!link) return { found: false, error: '/tools link not found' };
          link.click();
          await new Promise(r => setTimeout(r, 1000));
          return { found: true, url: window.location.href, title: document.title };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('Click /tools link result:', JSON.stringify(clickToolsLink.result.value, null, 2));

      // Test clicking /?tab=primary from Lộ Trình
      const clickPrimaryTab = await send('Runtime.evaluate', {
        expression: `(async () => {
          // Open Lộ Trình again
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lộ Trình'));
          btn.click();
          await new Promise(r => setTimeout(r, 200));
          const link = Array.from(document.querySelectorAll('a')).find(a => a.getAttribute('href') === '/?tab=primary');
          if (!link) return { found: false, error: '/?tab=primary link not found' };
          link.click();
          await new Promise(r => setTimeout(r, 1000));
          return { found: true, url: window.location.href, hash: window.location.search };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      console.log('Click /?tab=primary link result:', JSON.stringify(clickPrimaryTab.result.value, null, 2));

      proc.kill();
      process.exit(0);
    };
  } catch (err) {
    console.error('Error:', err);
    proc.kill();
    process.exit(1);
  }
}, 1500);
