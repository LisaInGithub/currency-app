(() => {
  const CURRENCIES = {
    TWD: { name: '新台幣', flag: '🇹🇼' },
    MNT: { name: '蒙圖', flag: '🇲🇳' },
    USD: { name: '美金', flag: '🇺🇸' },
    KRW: { name: '韓元', flag: '🇰🇷' },
  };
  const CODES = Object.keys(CURRENCIES);
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
  const LS_FAVORITES = 'cc_favorites';
  const LS_RECENTS = 'cc_recents';
  const LS_FROM = 'cc_from';
  const LS_TO = 'cc_to';
  const LS_RATE_HISTORY = 'cc_rate_history';

  const HISTORY_MAX_DAYS = 30;
  const RECENTS_MAX = 5;

  const $ = (id) => document.getElementById(id);

  const els = {
    statusBadge: $('statusBadge'),
    statusDot: $('statusDot'),
    statusText: $('statusText'),
    offlineBanner: $('offlineBanner'),
    fromRow: $('fromRow'),
    fromFlag: $('fromFlag'),
    fromCode: $('fromCode'),
    fromName: $('fromName'),
    fromAmount: $('fromAmount'),
    toRow: $('toRow'),
    toFlag: $('toFlag'),
    toCode: $('toCode'),
    toName: $('toName'),
    toAmount: $('toAmount'),
    swapBtn: $('swapBtn'),
    rateLine: $('rateLine'),
    calcToolbar: $('calcToolbar'),
    quickAmounts: $('quickAmounts'),
    trendDelta: $('trendDelta'),
    trendCaption: $('trendCaption'),
    sparklineLine: $('sparklineLine'),
    sparklineFill: $('sparklineFill'),
    recentChips: $('recentChips'),
    favoriteList: $('favoriteList'),
    lastUpdated: $('lastUpdated'),
    scrollRoot: $('scrollRoot'),
    tabBar: $('tabBar'),
    pickerOverlay: $('pickerOverlay'),
    pickerSheet: $('pickerSheet'),
    pickerTitle: $('pickerTitle'),
    pickerList: $('pickerList'),
    pickerClose: $('pickerClose'),
    settingsOverlay: $('settingsOverlay'),
    settingsClose: $('settingsClose'),
    manualTWD: $('manualTWD'),
    manualMNT: $('manualMNT'),
    manualKRW: $('manualKRW'),
    manualSave: $('manualSave'),
    manualReset: $('manualReset'),
    installToast: $('installToast'),
    installBtn: $('installBtn'),
    installDismiss: $('installDismiss'),
  };

  let liveRates = null;
  let liveTime = null;
  let manualRates = null;
  let manualOn = false;
  let fromCurrency = 'TWD';
  let toCurrency = 'USD';
  let fromAmount = 1000;
  let favorites = new Set();
  let recents = [];
  let pickerSide = null;
  let swapRotation = 0;

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

  function formatRate(n) {
    if (!isFinite(n)) return '0';
    const digits = Math.abs(n) < 10 ? 4 : 2;
    return n.toLocaleString('en-US', { maximumFractionDigits: digits });
  }

  // Small recursive-descent parser for +-*/() so the amount field can double
  // as a calculator (e.g. "120+35*2") without using eval().
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

  // ---------- Converter ----------

  function renderCurrencyMeta() {
    const from = CURRENCIES[fromCurrency];
    const to = CURRENCIES[toCurrency];
    els.fromFlag.textContent = from.flag;
    els.fromCode.textContent = fromCurrency;
    els.fromName.textContent = from.name;
    els.toFlag.textContent = to.flag;
    els.toCode.textContent = toCurrency;
    els.toName.textContent = to.name;
  }

  function renderConversion() {
    const rates = currentRates();
    const amountUSD = fromAmount / rates[fromCurrency];
    const toValue = amountUSD * rates[toCurrency];
    els.toAmount.textContent = formatNumber(toValue);
    const unitRate = rates[toCurrency] / rates[fromCurrency];
    els.rateLine.textContent = `1 ${fromCurrency} = ${formatRate(unitRate)} ${toCurrency}`;
  }

  function renderQuickAmounts() {
    els.quickAmounts.innerHTML = '';
    QUICK_AMOUNTS[fromCurrency].forEach((amt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = formatNumber(amt);
      btn.addEventListener('click', () => {
        fromAmount = amt;
        els.fromAmount.value = formatNumber(amt);
        renderConversion();
      });
      els.quickAmounts.appendChild(btn);
    });
  }

  function renderStatus() {
    els.statusBadge.classList.remove('manual', 'offline');
    if (manualOn) {
      els.statusBadge.classList.add('manual');
      els.statusText.textContent = '手動匯率';
    } else if (liveRates) {
      els.statusText.textContent = '即時匯率';
    } else {
      els.statusBadge.classList.add('offline');
      els.statusText.textContent = '預設參考匯率';
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

  // ---------- Recently used & favorites ----------

  function addRecent(code) {
    recents = [code, ...recents.filter((c) => c !== code)].slice(0, RECENTS_MAX);
    localStorage.setItem(LS_RECENTS, JSON.stringify(recents));
  }

  function renderRecents() {
    els.recentChips.innerHTML = '';
    const list = recents.filter((c) => c !== toCurrency);
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'chip-row-empty';
      empty.textContent = '切換過的貨幣會顯示在這裡';
      els.recentChips.appendChild(empty);
      return;
    }
    list.forEach((code) => {
      const info = CURRENCIES[code];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.innerHTML = `<span class="chip-flag">${info.flag}</span>${code}`;
      chip.addEventListener('click', () => setToCurrency(code));
      els.recentChips.appendChild(chip);
    });
  }

  function starIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';
  }

  function toggleFavorite(code) {
    if (favorites.has(code)) favorites.delete(code);
    else favorites.add(code);
    localStorage.setItem(LS_FAVORITES, JSON.stringify([...favorites]));
    renderFavorites();
    if (pickerSide) renderPickerList();
  }

  function renderFavorites() {
    els.favoriteList.innerHTML = '';
    const rates = currentRates();
    const amountUSD = fromAmount / rates[fromCurrency];
    const list = CODES.filter((c) => favorites.has(c) && c !== fromCurrency);

    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'chip-row-empty';
      empty.textContent = '在貨幣選單中點選星星，收藏常用貨幣';
      els.favoriteList.appendChild(empty);
      return;
    }

    list.forEach((code) => {
      const info = CURRENCIES[code];
      const row = document.createElement('div');
      row.className = 'favorite-row';

      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'favorite-row-main';
      const value = amountUSD * rates[code];
      main.innerHTML = `
        <span class="currency-avatar">${info.flag}</span>
        <span class="currency-meta">
          <span class="currency-code">${code}</span>
          <span class="currency-name">${info.name}</span>
        </span>`;
      main.addEventListener('click', () => setToCurrency(code));

      const valueEl = document.createElement('span');
      valueEl.className = 'favorite-row-value';
      valueEl.textContent = formatNumber(value);

      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'star-btn active';
      star.innerHTML = starIconSvg();
      star.setAttribute('aria-label', '取消收藏');
      star.addEventListener('click', () => toggleFavorite(code));

      row.appendChild(main);
      row.appendChild(valueEl);
      row.appendChild(star);
      els.favoriteList.appendChild(row);
    });
  }

  // ---------- Rate history & sparkline ----------

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(LS_RATE_HISTORY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function recordHistorySnapshot(rates, t) {
    let hist = loadHistory();
    const day = new Date(t).toISOString().slice(0, 10);
    const idx = hist.findIndex((h) => h.day === day);
    const entry = { day, t, rates };
    if (idx >= 0) hist[idx] = entry;
    else hist.push(entry);
    hist = hist.filter((h) => t - h.t < 1000 * 60 * 60 * 24 * HISTORY_MAX_DAYS);
    hist.sort((a, b) => a.t - b.t);
    localStorage.setItem(LS_RATE_HISTORY, JSON.stringify(hist));
  }

  function shortDate(day) {
    const d = new Date(`${day}T00:00:00`);
    return d.toLocaleDateString('zh-Hant-TW', { month: 'numeric', day: 'numeric' });
  }

  function renderSparkline() {
    const hist = loadHistory();
    const points = hist
      .map((h) => ({ day: h.day, rate: h.rates[toCurrency] / h.rates[fromCurrency] }))
      .filter((p) => isFinite(p.rate) && p.rate > 0);

    els.trendDelta.classList.remove('up', 'down');

    if (points.length < 2) {
      els.sparklineLine.setAttribute('points', '');
      els.sparklineFill.setAttribute('points', '');
      els.trendDelta.textContent = '累積中';
      els.trendCaption.textContent = '持續使用旅行貨幣，即可累積屬於你的匯率走勢';
      return;
    }

    const W = 300;
    const H = 72;
    const PAD = 6;
    const values = points.map((p) => p.rate);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || max * 0.01 || 1;

    const coords = points.map((p, i) => {
      const x = points.length === 1 ? 0 : (i / (points.length - 1)) * W;
      const y = PAD + (1 - (p.rate - min) / span) * (H - PAD * 2);
      return [x, y];
    });

    const linePoints = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    els.sparklineLine.setAttribute('points', linePoints);

    const fillPoints = `0,${H} ${linePoints} ${W},${H}`;
    els.sparklineFill.setAttribute('points', fillPoints);

    const first = points[0].rate;
    const last = points[points.length - 1].rate;
    const deltaPct = ((last - first) / first) * 100;
    const sign = deltaPct > 0 ? '+' : '';
    els.trendDelta.textContent = `${sign}${deltaPct.toFixed(1)}%`;
    els.trendDelta.classList.add(deltaPct >= 0 ? 'up' : 'down');

    els.trendCaption.textContent = `${shortDate(points[0].day)} – ${shortDate(points[points.length - 1].day)}`;
  }

  // ---------- Rendering orchestration ----------

  function renderAll() {
    renderCurrencyMeta();
    renderConversion();
    renderQuickAmounts();
    renderStatus();
    renderRecents();
    renderFavorites();
    renderSparkline();
  }

  function setToCurrency(code) {
    if (code === toCurrency) return;
    if (code === fromCurrency) fromCurrency = toCurrency;
    addRecent(toCurrency);
    toCurrency = code;
    persistPair();
    renderAll();
  }

  function persistPair() {
    localStorage.setItem(LS_FROM, fromCurrency);
    localStorage.setItem(LS_TO, toCurrency);
  }

  function swapCurrencies() {
    const rates = currentRates();
    const amountUSD = fromAmount / rates[fromCurrency];
    const newFromAmount = amountUSD * rates[toCurrency];
    [fromCurrency, toCurrency] = [toCurrency, fromCurrency];
    fromAmount = newFromAmount;
    els.fromAmount.value = formatNumber(newFromAmount);
    persistPair();
    swapRotation += 180;
    els.swapBtn.style.transform = `translateY(-50%) rotate(${swapRotation}deg)`;
    renderAll();
  }

  // ---------- Amount input ----------

  function previewFromAmount(raw) {
    const val = parseFloat(String(raw).replace(/,/g, ''));
    fromAmount = isFinite(val) ? val : 0;
    renderConversion();
  }

  function commitFromExpression() {
    const result = parseExpression(els.fromAmount.value);
    if (!isFinite(result)) return;
    fromAmount = result;
    els.fromAmount.value = formatNumber(result);
    renderConversion();
  }

  els.fromAmount.addEventListener('input', () => previewFromAmount(els.fromAmount.value));
  els.fromAmount.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitFromExpression();
      els.fromAmount.blur();
    }
  });
  els.fromAmount.addEventListener('blur', commitFromExpression);

  els.calcToolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-op]');
    if (!btn) return;
    const op = btn.dataset.op;
    if (op === 'C') {
      els.fromAmount.value = '';
      previewFromAmount('');
    } else if (op === '=') {
      commitFromExpression();
    } else {
      els.fromAmount.value = (els.fromAmount.value || '') + op;
      previewFromAmount(els.fromAmount.value);
    }
    els.fromAmount.focus();
  });

  els.swapBtn.addEventListener('click', swapCurrencies);

  // ---------- Currency picker sheet ----------

  function openPicker(side) {
    pickerSide = side;
    els.pickerTitle.textContent = side === 'from' ? '選擇起始貨幣' : '選擇目標貨幣';
    renderPickerList();
    els.pickerOverlay.classList.remove('hidden');
  }

  function closePicker() {
    pickerSide = null;
    els.pickerOverlay.classList.add('hidden');
  }

  function renderPickerList() {
    els.pickerList.innerHTML = '';
    const activeCode = pickerSide === 'from' ? fromCurrency : toCurrency;
    CODES.forEach((code) => {
      const info = CURRENCIES[code];
      const item = document.createElement('div');
      item.className = 'picker-item' + (code === activeCode ? ' selected' : '');

      const main = document.createElement('button');
      main.type = 'button';
      main.style.cssText = 'display:flex;align-items:center;gap:12px;flex:1;min-width:0;background:none;border:none;padding:0;cursor:pointer;text-align:left;color:inherit;';
      main.innerHTML = `
        <span class="currency-avatar">${info.flag}</span>
        <span class="currency-meta">
          <span class="currency-code">${code}</span>
          <span class="currency-name">${info.name}</span>
        </span>
        <svg class="picker-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4 10-10"/></svg>`;
      main.addEventListener('click', () => {
        if (pickerSide === 'from') {
          if (code === toCurrency) toCurrency = fromCurrency;
          fromCurrency = code;
        } else {
          if (code === fromCurrency) fromCurrency = toCurrency;
          if (code !== toCurrency) addRecent(toCurrency);
          toCurrency = code;
        }
        persistPair();
        closePicker();
        renderAll();
      });

      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'picker-star' + (favorites.has(code) ? ' active' : '');
      star.innerHTML = starIconSvg();
      star.setAttribute('aria-label', favorites.has(code) ? '取消收藏' : '收藏');
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(code);
      });

      item.appendChild(main);
      item.appendChild(star);
      els.pickerList.appendChild(item);
    });
  }

  els.fromRow.addEventListener('click', () => openPicker('from'));
  els.toRow.addEventListener('click', () => openPicker('to'));
  els.pickerClose.addEventListener('click', closePicker);
  els.pickerOverlay.addEventListener('click', (e) => {
    if (e.target === els.pickerOverlay) closePicker();
  });

  // ---------- Settings sheet ----------

  function openSettings() {
    const rates = currentRates();
    els.manualTWD.value = rates.TWD ? rates.TWD.toFixed(2) : '';
    els.manualMNT.value = rates.MNT ? rates.MNT.toFixed(2) : '';
    els.manualKRW.value = rates.KRW ? rates.KRW.toFixed(2) : '';
    els.settingsOverlay.classList.remove('hidden');
  }

  function closeSettings() {
    els.settingsOverlay.classList.add('hidden');
    setActiveTab('convert');
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
    closeSettings();
    renderAll();
  }

  function resetManualRates() {
    manualOn = false;
    localStorage.setItem(LS_MANUAL_ON, '0');
    closeSettings();
    renderAll();
  }

  els.settingsClose.addEventListener('click', closeSettings);
  els.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === els.settingsOverlay) closeSettings();
  });
  els.manualSave.addEventListener('click', saveManualRates);
  els.manualReset.addEventListener('click', resetManualRates);

  // ---------- Tab bar ----------

  function setActiveTab(tab) {
    els.tabBar.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
  }

  els.tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === 'settings') {
      setActiveTab('settings');
      openSettings();
      return;
    }
    setActiveTab(tab);
    const target = tab === 'favorites' ? $('favoriteSection') : els.scrollRoot;
    target.scrollIntoView({ behavior: 'smooth', block: tab === 'favorites' ? 'start' : 'start' });
  });

  // ---------- Persisted state ----------

  function loadStoredState() {
    try {
      const rates = JSON.parse(localStorage.getItem(LS_LIVE_RATES) || 'null');
      const time = localStorage.getItem(LS_LIVE_TIME);
      if (rates) { liveRates = rates; liveTime = time; }
      const mRates = JSON.parse(localStorage.getItem(LS_MANUAL_RATES) || 'null');
      if (mRates) manualRates = mRates;
      manualOn = localStorage.getItem(LS_MANUAL_ON) === '1';

      const favs = JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]');
      favorites = new Set(favs.filter((c) => CODES.includes(c)));

      const rec = JSON.parse(localStorage.getItem(LS_RECENTS) || '[]');
      recents = rec.filter((c) => CODES.includes(c));

      const storedFrom = localStorage.getItem(LS_FROM);
      const storedTo = localStorage.getItem(LS_TO);
      if (storedFrom && CODES.includes(storedFrom)) fromCurrency = storedFrom;
      if (storedTo && CODES.includes(storedTo) && storedTo !== fromCurrency) toCurrency = storedTo;
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
      CODES.forEach((c) => {
        if (c !== 'USD' && data.rates && typeof data.rates[c] === 'number') {
          rates[c] = data.rates[c];
        }
      });
      if (Object.keys(rates).length < CODES.length) throw new Error('missing currency');
      liveRates = rates;
      liveTime = Date.now();
      localStorage.setItem(LS_LIVE_RATES, JSON.stringify(rates));
      localStorage.setItem(LS_LIVE_TIME, String(liveTime));
      recordHistorySnapshot(rates, liveTime);
    } catch (e) {
      // network unavailable or API error — keep whatever was loaded from cache
    } finally {
      renderAll();
    }
  }

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
  els.fromAmount.value = formatNumber(fromAmount);
  renderAll();
  fetchLiveRates();
})();
