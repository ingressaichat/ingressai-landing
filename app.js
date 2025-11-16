// app.js — IngressAI landing
// v=2025-11-16-a
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ========= Config / API base =========
  const metaApi = document.querySelector('meta[name="ingressai-api"]');
  let API = (metaApi && metaApi.content) || '';

  try {
    const url = new URL(window.location.href);
    const override = url.searchParams.get('api');
    if (override) API = override;
  } catch (e) {
    // ignore
  }

  if (!API) {
    console.warn('[ingressai] API base não encontrada');
  }
  API = API.replace(/\/+$/, '');
  const API_ROOT = API.replace(/\/api$/, '').replace(/\/+$/, '');

  const state = {
    events: [],
    city: 'all',
    query: '',
  };

  const elList = $('#lista-eventos');
  const elChips = $('#filtro-cidades');
  const elSearch = $('#busca-eventos');
  const elApiDiag = $('#d-api');
  const elHealthDiag = $('#d-health');
  const elEvDiag = $('#d-ev2');
  const elAuthIndicator = $('#auth-indicator');
  const elSheet = $('#sheet');
  const elSheetBody = $('#sheet-body');
  const elSheetBackdrop = $('#sheet-backdrop');
  const elSheetClose = $('#sheet-close');
  const elDrawer = $('#drawer');
  const elDrawerBackdrop = $('#drawer-backdrop');
  const elDrawerToggle = $('#drawer-toggle');
  const elDrawerClose = $('#drawer-close');
  const elDrawerCreate = $('#drawer-create');
  const elReqForm = $('#req-form');
  const elReqSend = $('#req-send');
  const elReqHint = $('#req-hint');
  const elOrgValidator = $('#org-validator');

  // ========= Helpers =========
  function fmtMoneyBR(v) {
    if (!isFinite(v)) return 'R$ 0,00';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function normalizeImageUrl(raw) {
    if (!raw) return null;
    // já absoluta?
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = API_ROOT || '';
    const path = raw.startsWith('/') ? raw : '/' + raw;
    return base + path;
  }

  function getEventImage(ev) {
    const img =
      ev.image ||
      ev.imageUrl ||
      ev.cover ||
      ev.coverUrl ||
      ev.mediaUrl ||
      ev.banner;
    return normalizeImageUrl(img);
  }

  async function fetchJson(path) {
    const url = API + path;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} em ${path} — ${text}`);
    }
    return res.json();
  }

  function setAuth(online) {
    if (!elAuthIndicator) return;
    if (online) {
      elAuthIndicator.textContent = 'online';
      elAuthIndicator.classList.remove('off');
      elAuthIndicator.classList.add('on');
    } else {
      elAuthIndicator.textContent = 'offline';
      elAuthIndicator.classList.remove('on');
      elAuthIndicator.classList.add('off');
    }
  }

  // ========= Drawer =========
  function openDrawer() {
    if (!elDrawer) return;
    elDrawer.classList.add('is-open');
    elDrawerBackdrop && elDrawerBackdrop.classList.add('is-open');
    elDrawer.setAttribute('aria-hidden', 'false');
    elDrawerToggle && elDrawerToggle.setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    if (!elDrawer) return;
    elDrawer.classList.remove('is-open');
    elDrawerBackdrop && elDrawerBackdrop.classList.remove('is-open');
    elDrawer.setAttribute('aria-hidden', 'true');
    elDrawerToggle && elDrawerToggle.setAttribute('aria-expanded', 'false');
  }

  // ========= Sheet =========
  function openSheet(contentNode) {
    if (!elSheet || !elSheetBody) return;
    elSheetBody.innerHTML = '';
    if (contentNode) elSheetBody.appendChild(contentNode);
    elSheet.classList.add('is-open');
    elSheetBackdrop && elSheetBackdrop.classList.add('is-open');
    elSheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    if (!elSheet) return;
    elSheet.classList.remove('is-open');
    elSheetBackdrop && elSheetBackdrop.classList.remove('is-open');
    elSheet.setAttribute('aria-hidden', 'true');
    elSheetBody && (elSheetBody.innerHTML = '');
  }

  // ========= Render vitrine =========
  function renderChips() {
    if (!elChips) return;
    elChips.innerHTML = '';

    const btnAll = document.createElement('button');
    btnAll.type = 'button';
    btnAll.className = 'chip';
    btnAll.textContent = 'Todas';
    btnAll.setAttribute('role', 'tab');
    btnAll.dataset.city = 'all';
    btnAll.setAttribute('aria-selected', state.city === 'all' ? 'true' : 'false');
    btnAll.addEventListener('click', () => {
      state.city = 'all';
      renderChips();
      renderCards();
    });
    elChips.appendChild(btnAll);

    const cities = Array.from(
      new Set(
        state.events
          .map((e) => (e.city || e.cidade || e.location || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    cities.forEach((city) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip';
      btn.textContent = city;
      btn.dataset.city = city;
      btn.setAttribute('role', 'tab');
      btn.setAttribute(
        'aria-selected',
        state.city === city ? 'true' : 'false'
      );
      btn.addEventListener('click', () => {
        state.city = city;
        renderChips();
        renderCards();
      });
      elChips.appendChild(btn);
    });
  }

  function buildStatus(ev) {
    const statusLine = document.createElement('div');
    statusLine.className = 'status-line';

    const dot = document.createElement('span');
    dot.className = 'status-dot';
    statusLine.appendChild(dot);

    const span = document.createElement('span');
    let label = ev.statusLabel || ev.status || 'Disponível';
    label = String(label || '').trim() || 'Disponível';
    span.textContent = label;

    if (/esgotad/i.test(label)) {
      statusLine.classList.add('status--sold');
    } else if (/últimos|pouco/i.test(label)) {
      statusLine.classList.add('status--low');
    } else {
      statusLine.classList.add('status--soon');
    }

    statusLine.appendChild(span);
    return statusLine;
  }

  function buildSheetContent(ev, imgUrl) {
    const wrap = document.createElement('div');

    if (imgUrl) {
      const media = document.createElement('figure');
      media.className = 'sheet-media';
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = `Imagem do evento ${ev.title || ev.name || ''}`;
      img.loading = 'lazy';
      media.appendChild(img);
      wrap.appendChild(media);
    }

    const h3 = document.createElement('h3');
    h3.textContent = ev.title || ev.name || 'Evento';
    wrap.appendChild(h3);

    const city = ev.city || ev.cidade;
    const pMeta = document.createElement('p');
    pMeta.className = 'subtle';
    const bits = [];
    if (city) bits.push(city);
    if (ev.venue) bits.push(ev.venue);
    if (ev.dateLabel) bits.push(ev.dateLabel);
    pMeta.textContent = bits.join(' • ');
    wrap.appendChild(pMeta);

    const p = document.createElement('p');
    p.textContent =
      ev.description ||
      ev.desc ||
      'Ingressos emitidos direto no seu WhatsApp, com QR Code antifraude e repasse via Pix.';
    wrap.appendChild(p);

    const btn = document.createElement('a');
    btn.className = 'btn btn--secondary btn--sm';
    btn.href = `https://wa.me/${encodeURIComponent(
      (ev.whatsapp || '5534999992747').replace(/[^\d]/g, '')
    )}?text=${encodeURIComponent(
      `ingressai:start ev=${ev.id || ev.slug || ev.code || ''} qty=1 autopay=1`
    )}`;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.textContent = 'Comprar pelo WhatsApp';
    wrap.appendChild(btn);

    return wrap;
  }

  function renderCards() {
    if (!elList) return;
    elList.innerHTML = '';

    let evs = state.events.slice();

    if (state.city !== 'all') {
      evs = evs.filter((ev) => {
        const city = (ev.city || ev.cidade || '').trim();
        return city.toLowerCase() === state.city.toLowerCase();
      });
    }

    if (state.query) {
      const q = state.query.toLowerCase();
      evs = evs.filter((ev) => {
        const title = (ev.title || ev.name || '').toLowerCase();
        const city = (ev.city || ev.cidade || '').toLowerCase();
        return title.includes(q) || city.includes(q);
      });
    }

    if (!evs.length) {
      const msg = document.createElement('p');
      msg.className = 'subtle';
      msg.textContent = 'Nenhum evento encontrado com esses filtros.';
      elList.appendChild(msg);
      elEvDiag && (elEvDiag.textContent = '0');
      return;
    }

    elEvDiag && (elEvDiag.textContent = String(evs.length));

    evs.forEach((ev) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.tabIndex = 0;

      const header = document.createElement('div');
      header.className = 'card-header';

      const left = document.createElement('div');

      const cityEl = document.createElement('div');
      cityEl.className = 'card-city';
      cityEl.textContent = ev.city || ev.cidade || '–';
      left.appendChild(cityEl);

      const titleEl = document.createElement('div');
      titleEl.className = 'card-title';
      titleEl.textContent = ev.title || ev.name || 'Evento';
      left.appendChild(titleEl);

      left.appendChild(buildStatus(ev));
      header.appendChild(left);
      card.appendChild(header);

      // MEDIA COM <img>
      const media = document.createElement('div');
      media.className = 'card-media';

      const imgUrl = getEventImage(ev);
      if (imgUrl) {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = `Imagem do evento ${ev.title || ev.name || ''}`;
        img.loading = 'lazy';
        media.appendChild(img);
      }

      card.appendChild(media);

      card.addEventListener('click', () => {
        openSheet(buildSheetContent(ev, imgUrl));
      });
      card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openSheet(buildSheetContent(ev, imgUrl));
        }
      });

      elList.appendChild(card);
    });
  }

  // ========= Calculadora =========
  function setupCalc() {
    const priceInput = $('#calc-price');
    const priceRange = $('#calc-price-range');
    const qtyInput = $('#calc-qty-n');
    const qtyRange = $('#calc-qty');

    const baseUnitEl = $('#calc-base-unit');
    const feeOrgEl = $('#calc-fee-org');
    const grossEl = $('#calc-gross');
    const netEl = $('#calc-net');

    const manualFeeUnitEl = $('#manual-fee-unit');
    const manualFeeTotalEl = $('#manual-fee-total');
    const manualNetTotalEl = $('#manual-net-total');
    const manualNetUnitEl = $('#manual-net-unit');

    if (!priceInput || !priceRange || !qtyInput || !qtyRange) return;

    function parseBRL(str) {
      if (!str) return 0;
      const clean = String(str)
        .replace(/[^\d,.-]/g, '')
        .replace('.', '')
        .replace(',', '.');
      const v = parseFloat(clean);
      return isFinite(v) ? v : 0;
    }

    function syncFromPriceInput() {
      const v = parseBRL(priceInput.value);
      if (!isFinite(v)) return;
      const clamped = Math.min(Math.max(v, 5), 500);
      priceRange.value = String(clamped.toFixed(0));
      priceInput.value = fmtMoneyBR(clamped);
      recalc();
    }

    function syncFromPriceRange() {
      const v = parseFloat(priceRange.value || '0');
      priceInput.value = fmtMoneyBR(v);
      recalc();
    }

    function syncFromQtyInput() {
      let v = parseInt(qtyInput.value || '0', 10);
      if (!isFinite(v)) v = 0;
      v = Math.min(Math.max(v, 0), 10000);
      qtyInput.value = String(v);
      qtyRange.value = String(Math.min(v, 1000));
      recalc();
    }

    function syncFromQtyRange() {
      const v = parseInt(qtyRange.value || '0', 10);
      qtyInput.value = String(v);
      recalc();
    }

    function recalc() {
      const price = parseBRL(priceInput.value);
      const qty = parseInt(qtyInput.value || '0', 10) || 0;

      const gross = price * qty;
      const feeOrg = gross * 0.03;
      const net = gross - feeOrg;

      baseUnitEl && (baseUnitEl.textContent = fmtMoneyBR(price));
      feeOrgEl && (feeOrgEl.textContent = fmtMoneyBR(feeOrg));
      grossEl && (grossEl.textContent = fmtMoneyBR(gross));
      netEl && (netEl.textContent = fmtMoneyBR(net));

      const manualFeeUnit = price * 0.015;
      const manualFeeTotal = manualFeeUnit * qty;
      const manualNetTotal = gross - manualFeeTotal;
      const manualNetUnit = qty ? manualNetTotal / qty : 0;

      manualFeeUnitEl &&
        (manualFeeUnitEl.textContent = fmtMoneyBR(manualFeeUnit));
      manualFeeTotalEl &&
        (manualFeeTotalEl.textContent = fmtMoneyBR(manualFeeTotal));
      manualNetTotalEl &&
        (manualNetTotalEl.textContent = fmtMoneyBR(manualNetTotal));
      manualNetUnitEl &&
        (manualNetUnitEl.textContent = fmtMoneyBR(manualNetUnit));
    }

    priceInput.addEventListener('blur', syncFromPriceInput);
    priceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        syncFromPriceInput();
      }
    });
    priceRange.addEventListener('input', syncFromPriceRange);

    qtyInput.addEventListener('input', syncFromQtyInput);
    qtyRange.addEventListener('input', syncFromQtyRange);

    // dicas
    $$('.i-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('aria-controls');
        if (!id) return;
        const tip = document.getElementById(id);
        if (!tip) return;
        const open = tip.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    // inicial
    syncFromPriceRange();
    syncFromQtyRange();
  }

  // ========= Solicitação de criação =========
  async function handleRequestCreate() {
    if (!elReqForm) return;
    const phone = $('#req-phone');
    const title = $('#req-title');
    const name = $('#req-name');
    const city = $('#req-city');
    const catBtnOn = $(
      '.chip-opt[aria-checked="true"][data-value]'
    );

    const phoneVal = phone.value.replace(/[^\d]/g, '');
    const titleVal = (title.value || '').trim();
    const nameVal = (name.value || '').trim();
    const cityVal = (city.value || '').trim();
    const catVal = catBtnOn ? catBtnOn.dataset.value : 'atleticas';

    if (!phoneVal || phoneVal.length < 10) {
      elReqHint.textContent = 'Informe um WhatsApp válido (com DDD).';
      return;
    }
    if (!titleVal || !cityVal) {
      elReqHint.textContent = 'Preencha, no mínimo, nome do evento e cidade.';
      return;
    }

    elReqHint.textContent = 'Enviando...';

    const payload = {
      phone: phoneVal,
      title: titleVal,
      name: nameVal,
      city: cityVal,
      category: catVal,
      source: 'landing',
    };

    let ok = false;
    try {
      // rota principal
      const res = await fetch(API + '/organizers/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        ok = true;
      } else if (res.status === 404) {
        // backcompat
        const res2 = await fetch(API + '/org/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        ok = res2.ok;
      }
    } catch (e) {
      console.error(e);
    }

    if (ok) {
      elReqHint.textContent =
        'Pronto! Confirme a mensagem que vai chegar no seu WhatsApp.';
      try {
        elReqForm.reset();
      } catch (e) {
        // ignore
      }
    } else {
      elReqHint.textContent =
        'Não consegui enviar agora. Tente novamente em alguns minutos.';
    }
  }

  function setupRequestForm() {
    if (!elReqForm || !elReqSend) return;
    elReqSend.addEventListener('click', (e) => {
      e.preventDefault();
      handleRequestCreate();
    });

    // chips categoria
    $$('.chip-opt[data-value]').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.chip-opt[data-value]').forEach((b) =>
          b.setAttribute('aria-checked', 'false')
        );
        btn.setAttribute('aria-checked', 'true');
      });
    });
  }

  // ========= Health & validator link =========
  async function initHealth() {
    elApiDiag && (elApiDiag.textContent = API || '–');

    if (!API) {
      setAuth(false);
      elHealthDiag && (elHealthDiag.textContent = '–');
      return;
    }

    try {
      const res = await fetch(API + '/health', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({}));
      const status =
        data.status || data.state || (data.ok ? 'ok' : 'online');
      elHealthDiag && (elHealthDiag.textContent = String(status));
      setAuth(true);
    } catch (e) {
      console.warn('[ingressai] health fail', e);
      elHealthDiag && (elHealthDiag.textContent = 'off');
      setAuth(false);
    }

    // link do validador
    if (elOrgValidator && API_ROOT) {
      const url = API_ROOT + '/app/validator.html';
      elOrgValidator.href = url;
      elOrgValidator.target = '_blank';
      elOrgValidator.rel = 'noopener noreferrer';
    }
  }

  // ========= Eventos (vitrine) =========
  async function initEvents() {
    if (!API) return;
    try {
      const data = await fetchJson('/events/vitrine');
      const events = Array.isArray(data)
        ? data
        : Array.isArray(data.events)
        ? data.events
        : [];
      state.events = events;
      renderChips();
      renderCards();
    } catch (e) {
      console.error('[ingressai] erro carregando vitrine', e);
      if (elList) {
        elList.innerHTML =
          '<p class="subtle">Não consegui carregar os eventos agora. Tente recarregar a página em alguns instantes.</p>';
      }
      elEvDiag && (elEvDiag.textContent = '–');
    }
  }

  function initSearch() {
    if (!elSearch) return;
    elSearch.addEventListener('input', () => {
      state.query = (elSearch.value || '').trim();
      renderCards();
    });
  }

  // ========= Bootstrap =========
  function initDrawer() {
    if (elDrawerToggle) {
      elDrawerToggle.addEventListener('click', openDrawer);
    }
    if (elDrawerClose) {
      elDrawerClose.addEventListener('click', closeDrawer);
    }
    if (elDrawerBackdrop) {
      elDrawerBackdrop.addEventListener('click', closeDrawer);
    }
    if (elDrawerCreate) {
      elDrawerCreate.addEventListener('click', () => {
        closeDrawer();
        const orgSection = $('#organizadores');
        if (orgSection) {
          orgSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }

  function initSheet() {
    if (elSheetBackdrop) {
      elSheetBackdrop.addEventListener('click', closeSheet);
    }
    if (elSheetClose) {
      elSheetClose.addEventListener('click', closeSheet);
    }
  }

  // run
  document.addEventListener('DOMContentLoaded', () => {
    initDrawer();
    initSheet();
    initSearch();
    setupCalc();
    setupRequestForm();
    initHealth();
    initEvents();
  });
})();
