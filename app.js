// app.js — IngressAI landing
// v=2025-12-08-b
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

  function onlyDigits(s) {
    return String(s || '').replace(/[^\d]/g, '');
  }

  function getEventId(ev) {
    return (
      ev.id ||
      ev.slug ||
      ev.code ||
      ev.uid ||
      ev.shortCode ||
      ev._id ||
      ''
    );
  }

  function getEventOwnerPhone(ev) {
    return onlyDigits(
      ev.ownerPhone ||
        ev.owner_phone ||
        ev.owner ||
        ev.organizerPhone ||
        ev.organizer ||
        ev.owner_id ||
        ''
    );
  }

  function buildWhatsAppUrl(ev) {
    const phone = onlyDigits(ev.whatsapp || '5534999992747') || '5534999992747';
    const id = getEventId(ev) || '';
    const text = `ingressai:start ev=${id} qty=1 autopay=1`;
    return `https://wa.me/${encodeURIComponent(
      phone
    )}?text=${encodeURIComponent(text)}`;
  }

  function buildEventShareUrl(ev) {
    // base "limpa" (sem fragmento) para compartilhar
    const href = window.location.href;
    let basePath = window.location.pathname || '/';
    if (!basePath.startsWith('/')) basePath = '/' + basePath;
    const base = window.location.origin + basePath;
    const url = new URL(base, href);

    // preserva override de API (útil em staging / testes)
    try {
      const current = new URL(href);
      const apiOverride = current.searchParams.get('api');
      if (apiOverride) {
        url.searchParams.set('api', apiOverride);
      }
    } catch {
      // ignore
    }

    const evId = getEventId(ev);
    if (evId) url.searchParams.set('ev', evId);

    const ownerPhone = getEventOwnerPhone(ev);
    if (ownerPhone) url.searchParams.set('org', ownerPhone);

    // ancora direto na vitrine
    url.hash = 'vitrine';

    return url.toString();
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

  function getEventDescription(ev) {
    return (
      ev.description ||
      ev.desc ||
      ev.subtitle ||
      ev.shortDescription ||
      ev.resumo ||
      ''
    );
  }

  function getEventPrice(ev) {
    const candidates = [
      ev.price,
      ev.basePrice,
      ev.ticketPrice,
      ev.minPrice,
      ev.amount,
      ev.valor,
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (isFinite(n) && n > 0) return n;
    }
    return null;
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

    const batchLabelRaw =
      ev.batchLabel ||
      ev.loteLabel ||
      ev.ticketBatchLabel ||
      ev.ticketBatch ||
      ev.loteNome ||
      ev.lote ||
      '';

    // tenta extrair número do lote
    let batchNumber = null;
    // campos numéricos diretos
    const numCandidates = [
      ev.batchNumber,
      ev.loteNumber,
      ev.loteNumero,
      ev.batch,
      ev.lote,
    ];
    for (const c of numCandidates) {
      if (batchNumber != null) break;
      const n = Number(String(c).replace(/[^\d]/g, ''));
      if (isFinite(n) && n > 0) {
        batchNumber = n;
      }
    }
    // se ainda não rolou, tenta achar número dentro do label
    if (batchNumber == null && batchLabelRaw) {
      const m = String(batchLabelRaw).match(/(\d+)/);
      if (m) {
        const n = Number(m[1]);
        if (isFinite(n) && n > 0) batchNumber = n;
      }
    }

    let label;
    if (batchNumber != null) {
      label = `Lote ${batchNumber}`;
    } else {
      label =
        batchLabelRaw ||
        ev.statusLabel ||
        ev.status ||
        'Disponível';
    }
    label = String(label || '').trim() || 'Disponível';
    span.textContent = label;

    // cor pela regra dos lotes: 1 verde, 2 amarelo, 3+ vermelho
    if (batchNumber === 1) {
      statusLine.classList.add('status--soon');
    } else if (batchNumber === 2) {
      statusLine.classList.add('status--low');
    } else if (batchNumber >= 3) {
      statusLine.classList.add('status--sold');
    } else {
      // fallback: heurística pelo texto
      if (/esgotad/i.test(label)) {
        statusLine.classList.add('status--sold');
      } else if (/últimos|pouco|lote/i.test(label)) {
        statusLine.classList.add('status--low');
      } else {
        statusLine.classList.add('status--soon');
      }
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

    // Preço minimalista (só no expandido)
    const price = getEventPrice(ev);
    if (price != null) {
      const priceRow = document.createElement('p');
      priceRow.className = 'subtle';
      const strong = document.createElement('strong');
      strong.textContent = 'R$:';
      const span = document.createElement('span');
      // tira "R$" do fmtMoneyBR pra não ficar duplicado
      span.textContent =
        ' ' + fmtMoneyBR(price).replace(/^R\$\s?/, '');
      priceRow.appendChild(strong);
      priceRow.appendChild(span);
      wrap.appendChild(priceRow);
    }

    // Descrição só aqui (no sheet)
    const desc = getEventDescription(ev);
    const p = document.createElement('p');
    p.textContent =
      desc ||
      'Ingressos emitidos direto no seu WhatsApp, com QR Code antifraude e repasse via Pix.';
    wrap.appendChild(p);

    // Ações minimalistas: Comprar + Compartilhar
    const btnRow = document.createElement('div');
    btnRow.className = 'sheet-actions';

    const waUrl = buildWhatsAppUrl(ev);
    const shareUrl = buildEventShareUrl(ev);

    const buyBtn = document.createElement('a');
    buyBtn.className = 'sheet-btn sheet-btn--primary';
    buyBtn.href = waUrl;
    buyBtn.target = '_blank';
    buyBtn.rel = 'noopener noreferrer';
    buyBtn.innerHTML =
      '<span>Comprar no WhatsApp</span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M5 12h11M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '</svg>';
    btnRow.appendChild(buyBtn);

    const shareLink = document.createElement('button');
    shareLink.type = 'button';
    shareLink.className = 'sheet-btn sheet-btn--ghost';
    shareLink.innerHTML =
      '<span>Compartilhar evento</span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<path d="M8 9l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<path d="M12 5v11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '</svg>';

    shareLink.addEventListener('click', async () => {
      const shareText = ev.title
        ? `Ingressos para ${ev.title} na IngressAI`
        : 'Evento na IngressAI';
      try {
        if (navigator.share) {
          await navigator.share({
            title: ev.title || 'Evento',
            text: shareText,
            url: shareUrl,
          });
          return;
        }
      } catch {
        // usuário cancelou o share: ignora e cai pro fallback
      }
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copiado para compartilhar ✅');
      } catch {
        window.prompt('Copie o link do evento:', shareUrl);
      }
    });

    btnRow.appendChild(shareLink);
    wrap.appendChild(btnRow);

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

      // MEDIA EM CIMA
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

      // BLOCO DE TEXTO (sem descrição, só cidade/título/lote)
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

      // status / lote
      left.appendChild(buildStatus(ev));
      header.appendChild(left);
      card.appendChild(header);

      // Clique abre o sheet (com descrição + preço)
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

  // ========= deep-link org/ev =========
  function applyUrlFilters() {
    let url;
    try {
      url = new URL(window.location.href);
    } catch {
      return;
    }

    const evParam = url.searchParams.get('ev') || url.searchParams.get('event');
    const orgParam =
      url.searchParams.get('org') ||
      url.searchParams.get('owner') ||
      url.searchParams.get('phone');

    // filtro por organizador: mostra só eventos desse dono
    if (orgParam) {
      const target = onlyDigits(orgParam);
      if (target) {
        const filtered = state.events.filter((ev) => {
          const owner = getEventOwnerPhone(ev);
          return owner && owner === target;
        });
        if (filtered.length) {
          state.events = filtered;
        }
      }
    }

    // link direto para evento específico
    if (evParam) {
      const idTarget = String(evParam || '').toLowerCase();
      let foundEv = null;
      let foundIdx = -1;

      state.events.forEach((ev, idx) => {
        const candidates = [
          ev.id,
          ev.slug,
          ev.code,
          ev.uid,
          ev.shortCode,
          ev._id,
        ]
          .map((x) => String(x || '').toLowerCase())
          .filter(Boolean);
        if (foundEv) return;
        if (candidates.includes(idTarget)) {
          foundEv = ev;
          foundIdx = idx;
        }
      });

      if (foundEv && foundIdx >= 0) {
        // joga o evento pra primeira posição (melhora conversão)
        state.events.splice(foundIdx, 1);
        state.events.unshift(foundEv);

        const city = (foundEv.city || foundEv.cidade || '').trim();
        if (city) {
          state.city = city;
        }

        // abre o sheet automaticamente depois do primeiro render
        setTimeout(() => {
          const imgUrl = getEventImage(foundEv);
          openSheet(buildSheetContent(foundEv, imgUrl));
        }, 600);
      }
    }
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
    const catBtnOn = $('.chip-opt[aria-checked="true"][data-value]');

    const phoneVal = (phone.value || '').replace(/[^\d]/g, '');
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

    const payload = {
      phone: phoneVal,
      title: titleVal,
      name: nameVal,
      city: cityVal,
      category: catVal,
      source: 'landing',
    };

    elReqHint.textContent = 'Enviando...';
    if (elReqSend) elReqSend.disabled = true;

    let ok = false;
    try {
      // 1) rota padrão atual do backend
      const res = await fetch(API + '/org/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        ok = true;
      } else if (res.status === 404) {
        // 2) fallback para rota nova, caso exista no futuro
        const res2 = await fetch(API + '/organizers/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        ok = res2.ok;
      }
    } catch (e) {
      console.error('[ingressai] erro ao enviar request org', e);
    } finally {
      if (elReqSend) elReqSend.disabled = false;
    }

    if (ok) {
      elReqHint.textContent =
        'Pronto! Você vai receber uma mensagem oficial da IngressAI no WhatsApp para confirmar sua solicitação.';
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

      // aplica filtros vindos do link (?org= / ?ev=)
      applyUrlFilters();

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
          // só mostra quando o usuário pede pelo ícone
          orgSection.hidden = false;
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
