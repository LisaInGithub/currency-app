(() => {
  const CURRENCIES = ['TWD', 'MNT', 'USD', 'KRW'];
  const API_URL = 'https://open.er-api.com/v6/latest/USD';

  // Last-resort seed used only if there is no network AND no cache yet.
  const FALLBACK_RATES = { USD: 1, TWD: 32.3, MNT: 3600, KRW: 1480 };

  const QUICK_AMOUNTS = {
    TWD: [100, 500, 1000, 5000],
    MNT: [1000, 5000, 10000, 50000],
    USD: [10, 50, 100, 500],
    KRW: [1000, 10000, 50000, 100000],
  };

  const LS_LIVE_RATES = 'cc_live_rates';
  const LS_LIVE_TIME = 'cc_live_time';
  const LS_MANUAL_RATES = 'cc_manual_rates';
  const LS_MANUAL_ON = 'cc_manual_on';
  const LS_INSTALL_DISMISSED = 'cc_install_dismissed';

  const els = {
    statusBadge: document.getElementById('statusBadge'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    offlineBanner: document.getElementById('offlineBanner'),
    quickAmounts: document.getElementById('quickAmounts'),
    manualToggle: document.getElementById('manualToggle'),
    manualPanel: document.getElementById('manualPanel'),
    manualTWD: document.getElementById('manualTWD'),
    manualMNT: document.getElementById('manualMNT'),
    manualKRW: document.getElementById('manualKRW'),
    manualSave: document.getElementById('manualSave'),
    manualReset: document.getElementById('manualReset'),
    lastUpdated: document.getElementById('lastUpdated'),
    installToast: document.getElementById('installToast'),
    installBtn: document.getElementById('installBtn'),
    installDismiss: document.getElementById('installDismiss'),
    calcToolbar: document.getElementById('calcToolbar'),
  };

  const inputs = {};
  CURRENCIES.forEach((c) => {
    inputs[c] = document.querySelector(`.card-input[data-currency="${c}"]`);
  });
  const cards = {};
  CURRENCIES.forEach((c) => {
    cards[c] = document.querySelector(`.card[data-currency="${c}"]`);
  });

  let liveRates = null;
  let liveTime = null;
  let manualRates = null;
  let manualOn = false;
  let activeCurrency = 'TWD';
  let activeAmount = 1000;

  function currentRates() {
    if (manualOn && manualRates) return manualRates;
    if (liveRates) return liveRates;
    return FALLBACK_RATES;
  }

  function formatNumber(n) {
    if (!isFinite(n)) return '0';
    const abs = Math.abs(n);
    const digits = abs > 0 && abs < 10 ? 2 : 0;
    return n.toLocaleString('en-US', { maximumFractionDigits: digits });
  }

  // Small recursive-descent parser for +-*/() so the amount fields can
  // double as a calculator (e.g. "120+35*2") without using eval().
  function parseExpression(expr) {
    const cleaned = String(expr).replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
    if (!cleaned || !/^[0-9+\-*/.()]+$/.test(cleaned)) return NaN;
    let pos = 0;
    const peek = () => cleaned[pos];
    function parseExpr() {
      let v = parseTerm();
      while (peek() === '+' || peek() === '-') {
        const op = cleaned[pos++];
        const rhs = parseTerm();
        v = op === '+' ? v + rhs : v - rhs;
      }
      return v;
    }
    function parseTerm() {
      let v = parseFactor();
      while (peek() === '*' || peek() === '/') {
        const op = cleaned[pos++];
        const rhs = parseFactor();
        v = op === '*' ? v * rhs : v / rhs;
      }
      return v;
    }
    function parseFactor() {
      if (peek() === '-') { pos++; return -parseFactor(); }
      if (peek() === '+') { pos++; return parseFactor(); }
      if (peek() === '(') {
        pos++;
        const v = parseExpr();
        if (peek() === ')') pos++;
        return v;
      }
      const start = pos;
      while (pos < cleaned.length && /[0-9.]/.test(cleaned[pos])) pos++;
      if (start === pos) return NaN;
      return parseFloat(cleaned.slice(start, pos));
    }
    const result = parseExpr();
    if (pos !== cleaned.length) return NaN;
    return result;
  }

  function renderConversions() {
    const rates = currentRates();
    const base = activeCurrency;
    const amountUSD = activeAmount / rates[base];
    CURRENCIES.forEach((c) => {
      cards[c].classList.toggle('active', c === base);
      if (c === base) return;
      const value = amountUSD * rates[c];
      inputs[c].value = formatNumber(value);
    });
  }

  function renderQuickAmounts() {
    els.quickAmounts.innerHTML = '';
    QUICK_AMOUNTS[activeCurrency].forEach((amt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = formatNumber(amt);
      btn.addEventListener('click', () => {
        activeAmount = amt;
        inputs[activeCurrency].value = formatNumber(amt);
        renderConversions();
      });
      els.quickAmounts.appendChild(btn);
    });
  }

  function renderStatus() {
    els.statusBadge.classList.remove('manual', 'offline');
    if (manualOn) {
      els.statusBadge.classList.add('manual');
      els.statusText.textContent = '✏️ 手動匯率';
    } else if (liveRates) {
      els.statusText.textContent = '🟢 即時匯率';
    } else {
      els.statusBadge.classList.add('offline');
      els.statusText.textContent = '📦 預設參考匯率';
    }

    const showOffline = !manualOn && !liveRates;
    els.offlineBanner.classList.toggle('hidden', !showOffline);

    if (liveTime) {
      const d = new Date(liveTime);
      const stamp = d.toLocaleString('zh-Hant-TW', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      els.lastUpdated.textContent = `上次即時更新：${stamp}`;
    } else {
      els.lastUpdated.textContent = '尚未取得即時匯率';
    }
  }

  function renderAll() {
    renderStatus();
    renderQuickAmounts();
    renderConversions();
  }

  function loadStoredState() {
    try {
      const rates = JSON.parse(localStorage.getItem(LS_LIVE_RATES) || 'null');
      const time = localStorage.getItem(LS_LIVE_TIME);
      if (rates) { liveRates = rates; liveTime = time; }
      const mRates = JSON.parse(localStorage.getItem(LS_MANUAL_RATES) || 'null');
      if (mRates) manualRates = mRates;
      manualOn = localStorage.getItem(LS_MANUAL_ON) === '1';
    } catch (e) { /* corrupted storage, ignore and start fresh */ }
  }

  async function fetchLiveRates() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(API_URL, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      const rates = { USD: 1 };
      CURRENCIES.forEach((c) => {
        if (c !== 'USD' && data.rates && typeof data.rates[c] === 'number') {
          rates[c] = data.rates[c];
        }
      });
      if (Object.keys(rates).length < CURRENCIES.length) throw new Error('missing currency');
      liveRates = rates;
      liveTime = Date.now();
      localStorage.setItem(LS_LIVE_RATES, JSON.stringify(rates));
      localStorage.setItem(LS_LIVE_TIME, String(liveTime));
    } catch (e) {
      // network unavailable or API error — keep whatever was loaded from cache
    } finally {
      renderAll();
    }
  }

  function openManualPanel() {
    const rates = currentRates();
    els.manualTWD.value = rates.TWD ? rates.TWD.toFixed(2) : '';
    els.manualMNT.value = rates.MNT ? rates.MNT.toFixed(2) : '';
    els.manualKRW.value = rates.KRW ? rates.KRW.toFixed(2) : '';
    els.manualPanel.classList.remove('hidden');
  }

  function saveManualRates() {
    const twd = parseFloat(els.manualTWD.value);
    const mnt = parseFloat(els.manualMNT.value);
    const krw = parseFloat(els.manualKRW.value);
    if (![twd, mnt, krw].every((v) => isFinite(v) && v > 0)) {
      alert('請輸入三個大於 0 的數字');
      return;
    }
    manualRates = { USD: 1, TWD: twd, MNT: mnt, KRW: krw };
    manualOn = true;
    localStorage.setItem(LS_MANUAL_RATES, JSON.stringify(manualRates));
    localStorage.setItem(LS_MANUAL_ON, '1');
    els.manualPanel.classList.add('hidden');
    renderAll();
  }

  function resetManualRates() {
    manualOn = false;
    localStorage.setItem(LS_MANUAL_ON, '0');
    els.manualPanel.classList.add('hidden');
    renderAll();
  }

  // While typing (including a half-finished expression like "120+3"), preview
  // using the numeric prefix only; the full expression is resolved on commit.
  function previewActiveInput(c, raw) {
    activeCurrency = c;
    const val = parseFloat(String(raw).replace(/,/g, ''));
    activeAmount = isFinite(val) ? val : 0;
    cards[c].classList.add('active');
    Object.keys(cards).forEach((k) => { if (k !== c) cards[k].classList.remove('active'); });
    const rates = currentRates();
    const amountUSD = activeAmount / rates[activeCurrency];
    CURRENCIES.forEach((k) => {
      if (k === c) return;
      inputs[k].value = formatNumber(amountUSD * rates[k]);
    });
  }

  function commitActiveExpression() {
    const el = inputs[activeCurrency];
    const result = parseExpression(el.value);
    if (!isFinite(result)) return;
    activeAmount = result;
    el.value = formatNumber(result);
    renderConversions();
  }

  CURRENCIES.forEach((c) => {
    inputs[c].addEventListener('focus', () => {
      activeCurrency = c;
      renderQuickAmounts();
      renderConversions();
    });
    inputs[c].addEventListener('input', () => {
      previewActiveInput(c, inputs[c].value);
    });
    inputs[c].addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        activeCurrency = c;
        commitActiveExpression();
      }
    });
    inputs[c].addEventListener('blur', () => {
      if (activeCurrency === c) commitActiveExpression();
    });
  });

  els.calcToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-op]');
    if (!btn) return;
    const op = btn.dataset.op;
    const el = inputs[activeCurrency];
    if (op === 'C') {
      el.value = '';
      previewActiveInput(activeCurrency, '');
    } else if (op === '=') {
      commitActiveExpression();
    } else {
      el.value = (el.value || '') + op;
      previewActiveInput(activeCurrency, el.value);
    }
    el.focus();
  });

  els.manualToggle.addEventListener('click', () => {
    if (els.manualPanel.classList.contains('hidden')) openManualPanel();
    else els.manualPanel.classList.add('hidden');
  });
  els.manualSave.addEventListener('click', saveManualRates);
  els.manualReset.addEventListener('click', resetManualRates);

  // --- PWA install prompt ---
  let deferredInstallEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallEvent = e;
    if (localStorage.getItem(LS_INSTALL_DISMISSED) !== '1') {
      els.installToast.classList.remove('hidden');
    }
  });
  els.installBtn.addEventListener('click', async () => {
    els.installToast.classList.add('hidden');
    if (deferredInstallEvent) {
      deferredInstallEvent.prompt();
      await deferredInstallEvent.userChoice;
      deferredInstallEvent = null;
    }
  });
  els.installDismiss.addEventListener('click', () => {
    els.installToast.classList.add('hidden');
    localStorage.setItem(LS_INSTALL_DISMISSED, '1');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }

  // --- init ---
  loadStoredState();
  inputs[activeCurrency].value = formatNumber(activeAmount);
  renderAll();
  fetchLiveRates();
})();
