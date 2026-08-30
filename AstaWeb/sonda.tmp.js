/** Sonda voce: verifica la barra voce sulla pagina banditore dal vivo (server già atteso su 8090). Uso: PIN=xxxx node sonda-voce.js */
const puppeteer = require('puppeteer-core');

(async () => {
  const pin = process.env.PIN;
  if (!pin) throw new Error('manca PIN');
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-first-run', '--disable-gpu'],
  });
  const p = await b.newPage();
  const errori = [];
  p.on('pageerror', (e) => errori.push('PAGEERROR: ' + e.message));
  await p.goto('http://localhost:8090/banditore', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#pin');
  await p.type('#pin', pin);
  await p.click('#vai');
  await p.waitForFunction(() => document.body.innerText.includes('preparazione'), { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 1200));

  const info = await p.evaluate(() => {
    const voci = window.speechSynthesis ? speechSynthesis.getVoices().filter((v) => (v.lang || '').toLowerCase().startsWith('it')) : [];
    return {
      barraVoce: !!document.querySelector('.barra-voce'),
      selectPresente: !!document.getElementById('voce-select'),
      opzioniNelSelect: document.getElementById('voce-select') ? document.getElementById('voce-select').options.length : 0,
      sliderPresente: !!document.getElementById('voce-velocita'),
      bottoneProva: !!document.getElementById('prova-voce'),
      vociItaliane: voci.map((v) => v.name),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  console.log('errori pagina:', errori.length ? errori : 'nessuno');
  await b.close();
})().catch((e) => { console.error('FALLITO:', e.message); process.exit(1); });
