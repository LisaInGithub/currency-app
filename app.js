(() => {
  const CURRENCIES = {
    TWD: { name: '新台幣', flag: '🇹🇼' },
    MNT: { name: '蒙圖', flag: '🇲🇳' },
    USD: { name: '美金', flag: '🇺🇸' },
    JPY: { name: '日圓', flag: '🇯🇵' },
    KRW: { name: '韓元', flag: '🇰🇷' },
    CNY: { name: '人民幣', flag: '🇨🇳' },
    HKD: { name: '港幣', flag: '🇭🇰' },
    EUR: { name: '歐元', flag: '🇪🇺' },
    GBP: { name: '英鎊', flag: '🇬🇧' },
    THB: { name: '泰銖', flag: '🇹🇭' },
    VND: { name: '越南盾', flag: '🇻🇳' },
    SGD: { name: '新加坡幣', flag: '🇸🇬' },
    MYR: { name: '馬來西亞令吉', flag: '🇲🇾' },
    PHP: { name: '菲律賓披索', flag: '🇵🇭' },
    IDR: { name: '印尼盾', flag: '🇮🇩' },
    AUD: { name: '澳幣', flag: '🇦🇺' },
    CAD: { name: '加幣', flag: '🇨🇦' },
    NZD: { name: '紐西蘭幣', flag: '🇳🇿' },
  };
  const CODES = Object.keys(CURRENCIES);
  const DEFAULT_SELECTED = ['TWD', 'MNT', 'USD', 'KRW'];
  const MAX_SELECTED = 5;
  const API_URL = 'https://open.er-api.com/v6/latest/USD';

  // Last-resort seed used only if there is no network AND no cache yet.
  const FALLBACK_RATES = {
    USD: 1, TWD: 32.3, MNT: 3600, JPY: 155, KRW: 1480, CNY: 7.2, HKD: 7.8,
    EUR: 0.92, GBP: 0.78, THB: 36, VND: 25450, SGD: 1.34, MYR: 4.7, PHP: 58,
    IDR: 16200, AUD: 1.52, CAD: 1.37, NZD: 1.65,
  };

  const QUICK_AMOUNTS = {
    TWD: [100, 500, 1000, 5000],
    MNT: [1000, 5000, 10000, 50000],
    USD: [10, 50, 100, 500],
    JPY: [1000, 5000, 10000, 50000],
    KRW: [1000, 10000, 50000, 100000],
    CNY: [100, 500, 1000, 5000],
    HKD: [100, 500, 1000, 5000],
    EUR: [10, 50, 100, 500],
    GBP: [10, 50, 100, 500],
    THB: [100, 500, 1000, 5000],
    VND: [50000, 100000, 500000, 1000000],
    SGD: [10, 50, 100, 500],
    MYR: [50, 100, 500, 1000],
    PHP: [100, 500, 1000, 5000],
    IDR: [50000, 100000, 500000, 1000000],
    AUD: [10, 50, 100, 500],
    CAD: [10, 50, 100, 500],
    NZD: [10, 50, 100, 500],
  };

  const LS_LIVE_RATES = 'cc_live_rates';
  const LS_LIVE_TIME = 'cc_live_time';
  const LS_MANUAL_RATES = 'cc_manual_rates';
  const LS_MANUAL_ON = 'cc_manual_on';
  const LS_INSTALL_DISMISSED = 'cc_install_dismissed';
  const LS_SELECTED = 'cc_selected_currencies';
  const LS_ACTIVE = 'cc_active_currency';
  const LS_RATE_HISTORY = 'cc_rate_history';
  const LS_THEME = 'cc_theme';

  const HISTORY_MAX_DAYS = 30;

  const $ = (id) => document.getElementById(id);

  const els = {
    navSubtitle: $('navSubtitle'),
    statusBadge: $('statusBadge'),
    statusText: $('statusText'),
    offlineBanner: $('offlineBanner'),
    cardList: $('cardList'),
    manageBtn: $('manageBtn'),
    keypadSheet: $('keypadSheet'),
    keypadLabel: $('keypadLabel'),
    keypadDone: $('keypadDone'),
    keypad: $('keypad'),
    quickAmounts: $('quickAmounts'),
    trendLabel: $('trendLabel'),
    trendDelta: $('trendDelta'),
    trendCaption: $('trendCaption'),
    sparklineLine: $('sparklineLine'),
    sparklineFill: $('sparklineFill'),
    lastUpdated: $('lastUpdated'),
    scrollRoot: $('scrollRoot'),
    tabBar: $('tabBar'),
    manageOverlay: $('manageOverlay'),
    manageCount: $('manageCount'),
    pickerList: $('pickerList'),
    manageClose: $('manageClose'),
    settingsOverlay: $('settingsOverlay'),
    settingsClose: $('settingsClose'),
    manualRows: $('manualRows'),
    manualSave: $('manualSave'),
    manualReset: $('manualReset'),
    installToast: $('installToast'),
    installBtn: $('installBtn'),
    installDismiss: $('installDismiss'),
    themeToggle: $('themeToggle'),
  };

  let liveRates = null;
  let liveTime = null;
  let manualRates = null;
  let manualOn = false;
  let selected = [...DEFAULT_SELECTED];
  let activeCurrency = 'TWD';
  let activeAmount = 1000;
  // When true, the next digit/decimal keypress replaces the field's
  // current value outright instead of appending to it — set whenever a
  // card is freshly selected or a value was just committed, so typing
  // a new number doesn't glue onto the old one.
  let pendingReplace = true;

  function currentRates() {
    const merged = { ...FALLBACK_RATES };
    if (liveRates) Object.assign(merged, liveRates);
    if (manualOn && manualRates) Object.assign(merged, manualRates);
    return merged;
  }

  function formatNumber(n) {
    if (!isFinite(n)) return '0';
    const abs = Math.abs(n);
    const digits = abs > 0 && abs < 10 ? 2 : 0;
    return n.toLocaleString('en-US', { maximumFractionDigits: digits });
  }

  // Large amounts (e.g. MNT/VND/IDR conversions) can run to 8-9 digits —
  // shrink the font so they stay inside the card instead of clipping.
  function fitAmountText(input) {
    const digits = (input.value.match(/[0-9]/g) || []).length;
    let size = 28;
    if (digits >= 11) size = 15;
    else if (digits >= 9) size = 18;
    else if (digits >= 7) size = 22;
    else if (digits >= 6) size = 25;
    input.style.fontSize = `${size}px`;
  }

  function setAmountValue(input, text) {
    if (!input) return;
    input.value = text;
    fitAmountText(input);
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

  // ---------- Card list ----------

  function orderedSelected() {
    // `selected` is itself the user's display order (drag-reorderable),
    // not filtered through CODES — insertion/drag order is authoritative.
    return selected;
  }

  function buildCards() {
    // The keypad sheet gets moved inline into #cardList (see
    // openKeypadSheet) — detach it first or innerHTML='' would destroy
    // it outright. .remove() is a safe no-op if it's already elsewhere.
    els.keypadSheet.remove();

    els.cardList.innerHTML = '';
    orderedSelected().forEach((code) => {
      const info = CURRENCIES[code];
      const card = document.createElement('section');
      card.className = 'card currency-card';
      card.dataset.currency = code;
      card.innerHTML = `
        <span class="currency-avatar">${info.flag}</span>
        <span class="currency-meta">
          <span class="currency-code">${code}</span>
          <span class="currency-name">${info.name}</span>
        </span>
        <input class="amount-input" type="text" inputmode="none" autocomplete="off" readonly placeholder="0" data-currency="${code}" aria-label="${info.name}金額">
        <button class="drag-handle" type="button" tabindex="-1" aria-label="拖曳調整順序">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10M7 12h10M7 16h10"/></svg>
        </button>`;
      els.cardList.appendChild(card);
    });

    // Give it a home in the document again regardless of open/hidden
    // state, so it's never left orphaned outside the DOM.
    const activeCard = els.cardList.querySelector(`.currency-card[data-currency="${activeCurrency}"]`);
    if (activeCard) activeCard.insertAdjacentElement('afterend', els.keypadSheet);
    else els.cardList.appendChild(els.keypadSheet);
  }

  // ---------- Drag to reorder ----------

  const GAP = 9; // must match .card-list gap in style.css
  let drag = null;

  function beginDrag(handle, pointerId, clientY) {
    // The keypad sheet, when open, is wedged inline between two cards —
    // its extra height would throw off the uniform slot-spacing math
    // below. Close it first so the list is just cards again.
    if (!els.keypadSheet.classList.contains('hidden')) closeKeypadSheet();

    const card = handle.closest('.currency-card');
    const order = orderedSelected();
    const index = order.indexOf(card.dataset.currency);
    if (index === -1) return;

    const siblingEls = {};
    order.forEach((code) => {
      siblingEls[code] = els.cardList.querySelector(`.currency-card[data-currency="${code}"]`);
    });

    els.cardList.style.minHeight = `${els.cardList.offsetHeight}px`;
    card.classList.add('dragging');
    card.style.position = 'absolute';
    card.style.left = '0';
    card.style.right = '0';
    card.style.top = `${card.offsetTop}px`;
    card.style.zIndex = '50';
    card.style.transform = 'translateY(0px)';
    handle.setPointerCapture(pointerId);

    drag = {
      pointerId,
      card,
      handle,
      order: [...order],
      siblingEls,
      index,
      startY: clientY,
      pendingY: clientY,
      rafId: 0,
      slot: card.offsetHeight + GAP,
      targetIndex: index,
    };
  }

  function applyDragFrame() {
    if (!drag) return;
    drag.rafId = 0;
    const deltaY = drag.pendingY - drag.startY;
    drag.card.style.transform = `translateY(${deltaY}px)`;

    const shift = Math.round(deltaY / drag.slot);
    const targetIndex = Math.min(Math.max(drag.index + shift, 0), drag.order.length - 1);
    if (targetIndex === drag.targetIndex) return;
    drag.targetIndex = targetIndex;

    drag.order.forEach((code, i) => {
      if (code === drag.card.dataset.currency) return;
      const sibling = drag.siblingEls[code];
      if (!sibling) return;
      let offset = 0;
      if (drag.targetIndex > drag.index && i > drag.index && i <= drag.targetIndex) offset = -drag.slot;
      else if (drag.targetIndex < drag.index && i >= drag.targetIndex && i < drag.index) offset = drag.slot;
      sibling.style.transform = offset ? `translateY(${offset}px)` : '';
    });
  }

  function updateDrag(clientY) {
    if (!drag) return;
    drag.pendingY = clientY;
    if (!drag.rafId) drag.rafId = requestAnimationFrame(applyDragFrame);
  }

  function endDrag() {
    if (!drag) return;
    if (drag.rafId) cancelAnimationFrame(drag.rafId);
    const finalOrder = [...drag.order];
    const [moved] = finalOrder.splice(drag.index, 1);
    finalOrder.splice(drag.targetIndex, 0, moved);

    els.cardList.querySelectorAll('.currency-card').forEach((card) => {
      card.classList.remove('dragging');
      card.style.position = '';
      card.style.left = '';
      card.style.right = '';
      card.style.top = '';
      card.style.zIndex = '';
      card.style.transform = '';
    });
    els.cardList.style.minHeight = '';

    if (finalOrder.join() !== selected.join()) {
      selected = finalOrder;
      persistSelected();
    }
    drag = null;
    buildCards();
    setAmountValue(activeInput(), formatNumber(activeAmount));
    renderConversions();
  }

  els.cardList.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    beginDrag(handle, e.pointerId, e.clientY);
  });

  els.cardList.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    updateDrag(e.clientY);
  });

  ['pointerup', 'pointercancel'].forEach((evt) => {
    els.cardList.addEventListener(evt, (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      endDrag();
    });
  });

  function renderConversions() {
    const rates = currentRates();
    const amountUSD = activeAmount / rates[activeCurrency];
    els.cardList.querySelectorAll('.currency-card').forEach((card) => {
      const code = card.dataset.currency;
      card.classList.toggle('active', code === activeCurrency);
      if (code === activeCurrency) return;
      const input = card.querySelector('.amount-input');
      setAmountValue(input, formatNumber(amountUSD * rates[code]));
    });
  }

  function renderQuickAmounts() {
    els.quickAmounts.innerHTML = '';
    (QUICK_AMOUNTS[activeCurrency] || [10, 50, 100, 500]).forEach((amt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = formatNumber(amt);
      btn.addEventListener('click', () => {
        activeAmount = amt;
        setAmountValue(els.cardList.querySelector(`.amount-input[data-currency="${activeCurrency}"]`), formatNumber(amt));
        renderConversions();
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

  function renderSubtitle() {
    els.navSubtitle.textContent = orderedSelected().map((c) => CURRENCIES[c].name).join('・');
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
    els.trendLabel.textContent = `匯率趨勢 · ${activeCurrency}`;
    els.trendDelta.classList.remove('up', 'down');

    if (activeCurrency === 'USD') {
      els.sparklineLine.setAttribute('points', '');
      els.sparklineFill.setAttribute('points', '');
      els.trendDelta.textContent = '基準貨幣';
      els.trendCaption.textContent = '美金是所有匯率的計算基準，沒有走勢可顯示';
      return;
    }

    const hist = loadHistory();
    const points = hist
      .map((h) => ({ day: h.day, rate: h.rates[activeCurrency] }))
      .filter((p) => isFinite(p.rate) && p.rate > 0);

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

    els.trendCaption.textContent = `1 USD = ? ${activeCurrency} · ${shortDate(points[0].day)} – ${shortDate(points[points.length - 1].day)}`;
  }

  // ---------- Rendering orchestration ----------

  function renderAll() {
    renderConversions();
    renderQuickAmounts();
    renderStatus();
    renderSubtitle();
    renderSparkline();
  }

  function persistSelected() {
    localStorage.setItem(LS_SELECTED, JSON.stringify(selected));
  }

  function persistActive() {
    localStorage.setItem(LS_ACTIVE, activeCurrency);
  }

  // ---------- Amount input (event delegation, cards are rebuilt on demand) ----------

  function activeInput() {
    return els.cardList.querySelector(`.amount-input[data-currency="${activeCurrency}"]`);
  }

  function previewActiveAmount(raw) {
    const val = parseFloat(String(raw).replace(/,/g, ''));
    activeAmount = isFinite(val) ? val : 0;
    const input = activeInput();
    if (input) fitAmountText(input);
    renderConversions();
  }

  function commitActiveExpression() {
    const input = activeInput();
    if (!input) return;
    const result = parseExpression(input.value);
    if (!isFinite(result)) return;
    activeAmount = result;
    setAmountValue(input, formatNumber(result));
    renderConversions();
    pendingReplace = true;
  }

  // The keypad docks inline directly under whichever card is being
  // edited (moved there in the DOM), rather than a fixed spot — but the
  // floating tab bar can still end up on top of it depending on scroll
  // position, so nudge the page to keep it clear either direction.
  function ensureKeypadVisible() {
    requestAnimationFrame(() => {
      const rect = els.keypadSheet.getBoundingClientRect();
      const barRect = els.tabBar.getBoundingClientRect();
      const bottomOverlap = rect.bottom - barRect.top;
      if (bottomOverlap > 0) {
        window.scrollBy({ top: bottomOverlap + 16, behavior: 'smooth' });
      } else if (rect.top < 12) {
        window.scrollBy({ top: rect.top - 12, behavior: 'smooth' });
      }
    });
  }

  function openKeypadSheet() {
    const activeCard = els.cardList.querySelector(`.currency-card[data-currency="${activeCurrency}"]`);
    if (activeCard) activeCard.insertAdjacentElement('afterend', els.keypadSheet);
    els.keypadLabel.textContent = `${activeCurrency} · ${CURRENCIES[activeCurrency].name}`;
    els.keypadSheet.classList.remove('hidden');
    pendingReplace = true;
    ensureKeypadVisible();
  }

  function closeKeypadSheet() {
    commitActiveExpression();
    const input = activeInput();
    if (input) input.blur();
    els.keypadSheet.classList.add('hidden');
  }

  els.keypadDone.addEventListener('click', closeKeypadSheet);

  els.cardList.addEventListener('focusin', (e) => {
    const input = e.target.closest('.amount-input');
    if (!input) return;
    const newCode = input.dataset.currency;
    if (newCode !== activeCurrency) {
      // The field's displayed value is already the correctly converted
      // amount for its currency (set by the previous renderConversions
      // call) — carry that over as the new baseline instead of
      // reinterpreting the old raw number in the new currency.
      const val = parseFloat(String(input.value).replace(/,/g, ''));
      if (isFinite(val)) activeAmount = val;
      activeCurrency = newCode;
      persistActive();
    }
    renderQuickAmounts();
    renderConversions();
    renderSparkline();
    openKeypadSheet();
  });

  els.cardList.addEventListener('input', (e) => {
    const input = e.target.closest('.amount-input');
    if (!input) return;
    previewActiveAmount(input.value);
  });

  els.cardList.addEventListener('keydown', (e) => {
    const input = e.target.closest('.amount-input');
    if (!input || e.key !== 'Enter') return;
    e.preventDefault();
    commitActiveExpression();
    input.blur();
  });

  els.cardList.addEventListener('focusout', (e) => {
    const input = e.target.closest('.amount-input');
    if (!input || input.dataset.currency !== activeCurrency) return;
    commitActiveExpression();
  });

  // Prevent the keypad buttons from stealing focus away from the amount
  // field they're editing (avoids a blur/refocus flicker on every tap).
  els.keypad.addEventListener('pointerdown', (e) => e.preventDefault());

  els.keypad.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-key]');
    if (!btn) return;
    const input = activeInput();
    if (!input) return;
    const key = btn.dataset.key;
    if (key === 'C') {
      input.value = '';
      previewActiveAmount('');
      pendingReplace = false;
    } else if (key === '=') {
      commitActiveExpression();
    } else if (key === 'back') {
      input.value = input.value.slice(0, -1);
      previewActiveAmount(input.value);
      pendingReplace = false;
    } else {
      // A fresh digit/decimal replaces the shown value outright (it's
      // effectively pre-selected); an operator continues the expression
      // from it instead, same as a normal calculator.
      const isDigitOrDot = key === '.' || (key.length === 1 && key >= '0' && key <= '9');
      input.value = (pendingReplace && isDigitOrDot) ? key : (input.value || '') + key;
      pendingReplace = false;
      previewActiveAmount(input.value);
    }
    input.focus();
  });

  // ---------- Manage currencies sheet ----------

  function openManage() {
    renderManageList();
    els.manageOverlay.classList.remove('hidden');
  }

  function closeManage() {
    els.manageOverlay.classList.add('hidden');
    setActiveTab('convert');
  }

  function renderManageList() {
    els.manageCount.textContent = `已選 ${selected.length} / ${MAX_SELECTED} 種貨幣，首頁會依序顯示`;
    els.pickerList.innerHTML = '';
    CODES.forEach((code) => {
      const info = CURRENCIES[code];
      const isSelected = selected.includes(code);
      const atLimit = !isSelected && selected.length >= MAX_SELECTED;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'picker-item' + (isSelected ? ' selected' : '') + (atLimit ? ' disabled' : '');
      item.innerHTML = `
        <span class="currency-avatar">${info.flag}</span>
        <span class="currency-meta">
          <span class="currency-code">${code}</span>
          <span class="currency-name">${info.name}</span>
        </span>
        <svg class="picker-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4 10-10"/></svg>`;
      item.addEventListener('click', () => toggleSelected(code));
      els.pickerList.appendChild(item);
    });
  }

  function toggleSelected(code) {
    if (selected.includes(code)) {
      if (selected.length <= 1) return;
      const wasActive = activeCurrency === code;
      const amountUSD = wasActive ? activeAmount / currentRates()[code] : null;
      selected = selected.filter((c) => c !== code);
      if (wasActive) {
        activeCurrency = orderedSelected()[0];
        activeAmount = amountUSD * currentRates()[activeCurrency];
        persistActive();
      }
    } else {
      if (selected.length >= MAX_SELECTED) return;
      selected = [...selected, code];
    }
    persistSelected();
    buildCards();
    setAmountValue(activeInput(), formatNumber(activeAmount));
    renderAll();
    renderManageList();
  }

  els.manageBtn.addEventListener('click', openManage);
  els.manageClose.addEventListener('click', closeManage);
  els.manageOverlay.addEventListener('click', (e) => {
    if (e.target === els.manageOverlay) closeManage();
  });

  // ---------- Settings sheet ----------

  function openSettings() {
    const rates = currentRates();
    els.manualRows.innerHTML = '';
    orderedSelected().filter((c) => c !== 'USD').forEach((code) => {
      const info = CURRENCIES[code];
      const row = document.createElement('div');
      row.className = 'manual-row';
      row.innerHTML = `
        <label for="manual_${code}">1 USD = <span class="unit">${code}</span></label>
        <input id="manual_${code}" type="text" inputmode="decimal" autocomplete="off" value="${rates[code] ? rates[code].toFixed(2) : ''}">`;
      els.manualRows.appendChild(row);
    });
    if (!els.manualRows.children.length) {
      const hint = document.createElement('p');
      hint.className = 'settings-hint';
      hint.textContent = '目前只選擇了美金，沒有其他幣別可以設定手動匯率。';
      els.manualRows.appendChild(hint);
    }
    els.settingsOverlay.classList.remove('hidden');
  }

  function closeSettings() {
    els.settingsOverlay.classList.add('hidden');
    setActiveTab('convert');
  }

  function saveManualRates() {
    const codes = orderedSelected().filter((c) => c !== 'USD');
    const values = {};
    for (const code of codes) {
      const input = $(`manual_${code}`);
      const v = parseFloat(input.value);
      if (!isFinite(v) || v <= 0) {
        alert('請輸入大於 0 的數字');
        return;
      }
      values[code] = v;
    }
    manualRates = { ...(manualRates || {}), USD: 1, ...values };
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
    if (tab === 'manage') {
      setActiveTab('manage');
      openManage();
      return;
    }
    if (tab === 'settings') {
      setActiveTab('settings');
      openSettings();
      return;
    }
    setActiveTab(tab);
    els.scrollRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

      const sel = JSON.parse(localStorage.getItem(LS_SELECTED) || 'null');
      if (Array.isArray(sel) && sel.length) {
        const filtered = sel.filter((c) => CODES.includes(c)).slice(0, MAX_SELECTED);
        if (filtered.length) selected = filtered;
      }

      const storedActive = localStorage.getItem(LS_ACTIVE);
      if (storedActive && selected.includes(storedActive)) activeCurrency = storedActive;
      else activeCurrency = orderedSelected()[0];
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

  // ---------- Theme (light/dark toggle, overrides the system default) ----------

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function initTheme() {
    const stored = localStorage.getItem(LS_THEME);
    if (stored === 'dark' || stored === 'light') applyTheme(stored);
  }

  els.themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(LS_THEME, next);
  });

  // --- init ---
  initTheme();
  loadStoredState();
  buildCards();
  setAmountValue(activeInput(), formatNumber(activeAmount));
  renderAll();
  fetchLiveRates();
})();
