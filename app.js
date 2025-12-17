// app.js — IngressAI landing
// v=2025-12-14-featurecards
// - Corrige fechamento de renderChips()
// - Remove referência inválida a `img` em buildSheetContent()
// - Tratamento inteligente de proporção da mídia no card fechado (cover vs contain)

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

  // usado pra restaurar o scroll da página ao fechar o sheet
  let scrollYBeforeSheet = 0;
  // último elemento que abriu o sheet (pra devolver o foco)
  let lastSheetTrigger = null;

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
    raw = String(raw || '').trim();
    // data / blob URIs should be returned as-is
    if (/^data:/i.test(raw) || /^blob:/i.test(raw)) return raw;
    // já absoluta?
    if (/^https?:\/\//i.test(raw)) return raw;
    // protocol-relative (//example.com/path)
    if (/^\/\//.test(raw) && typeof window !== 'undefined') {
      return window.location.protocol + raw;
    }
    const base = API_ROOT || (typeof window !== 'undefined' ? window.location.origin : '');
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
      ev.media ||
      ev.banner ||
      ev.thumb ||
      ev.thumbnail ||
      ev.file;
    return normalizeImageUrl(img);
  }

  function updateMediaFit(mediaEl, imgEl) {
    if (!mediaEl || !imgEl) return;
    const w = imgEl.naturalWidth || 0;
    const h = imgEl.naturalHeight || 0;
    if (!w || !h) return;

    const ratio = h ? w / h : 1;
    const shouldContain = ratio < 0.95 || ratio > 1.85;
    const needsPadding = ratio < 0.78 || ratio > 2.1;

    mediaEl.classList.remove('media-fit-contain', 'media-fit-padded');
    mediaEl.style.removeProperty('--media-ratio');
    if (imgEl && imgEl.style) {
      imgEl.style.objectFit = 'cover';
      imgEl.style.objectPosition = 'center center';
    }

    if (shouldContain) {
      mediaEl.classList.add('media-fit-contain');
      if (needsPadding) mediaEl.classList.add('media-fit-padded');
      const ratioClamped = Math.max(0.45, Math.min(ratio, 2.8));
      mediaEl.style.setProperty('--media-ratio', ratioClamped.toFixed(3));
      if (imgEl && imgEl.style) {
        imgEl.style.objectFit = 'contain';
      }
    }
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
    const qty = 1;
    const eventName = ev.title || ev.name || 'evento';
    const friendly = `Oi! Quero comprar ${qty === 1 ? '1 ingresso' : qty + ' ingressos'} para ${eventName} com a IngressAI.`;
    const autoStart = id
      ? `\ningressai:start ev=${id} qty=${qty} autopay=1`
      : '';
    const text = friendly + autoStart;
    return `https://wa.me/${encodeURIComponent(
      phone
    )}?text=${encodeURIComponent(text)}`;
  }

  function buildEventShareUrl(ev) {
    const href = window.location.href;
    let basePath = window.location.pathname || '/';
    if (!basePath.startsWith('/')) basePath = '/' + basePath;
    const base = window.location.origin + basePath;
    const url = new URL(base, href);

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

  // ========= Scroll lock helpers (sheet) =========
  function lockBodyScroll() {
    scrollYBeforeSheet = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('no-scroll');
    document.body.style.top = `-${scrollYBeforeSheet}px`;
  }

  function unlockBodyScroll() {
    document.body.classList.remove('no-scroll');
    document.body.style.top = '';
    if (typeof scrollYBeforeSheet === 'number') {
      window.scrollTo(0, scrollYBeforeSheet);
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
  function sheetKeyHandler(e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      closeSheet();
    }
  }

  function openSheet(contentNode, triggerEl) {
    if (!elSheet || !elSheetBody) return;
    elSheetBody.innerHTML = '';
    if (contentNode) elSheetBody.appendChild(contentNode);
    elSheet.classList.add('is-open');
    if (elSheetBackdrop) {
      elSheetBackdrop.classList.add('is-open');
      elSheetBackdrop.setAttribute('aria-hidden', 'false');
    }
    elSheet.setAttribute('aria-hidden', 'false');
    elSheetBody.scrollTop = 0;
    lockBodyScroll();

    lastSheetTrigger = triggerEl || null;
    if (lastSheetTrigger && typeof lastSheetTrigger.setAttribute === 'function') {
      lastSheetTrigger.setAttribute('aria-expanded', 'true');
    }
    if (lastSheetTrigger && lastSheetTrigger.classList) {
      try {
        lastSheetTrigger.classList.add('card--open');
      } catch (e) {
        // ignore
      }
    }

    const closeBtn = document.getElementById('sheet-close');
    if (closeBtn) closeBtn.focus();

    document.addEventListener('keydown', sheetKeyHandler);
  }

  function closeSheet() {
    if (!elSheet) return;
    elSheet.classList.remove('is-open');
    if (elSheetBackdrop) {
      elSheetBackdrop.classList.remove('is-open');
      elSheetBackdrop.setAttribute('aria-hidden', 'true');
    }
    elSheet.setAttribute('aria-hidden', 'true');
    if (elSheetBody) elSheetBody.innerHTML = '';
    unlockBodyScroll();

    try {
      if (lastSheetTrigger && lastSheetTrigger.classList) {
        lastSheetTrigger.classList.remove('card--open');
      }
    } catch (e) {
      // ignore
    }

    if (lastSheetTrigger && typeof lastSheetTrigger.focus === 'function') {
      try {
        lastSheetTrigger.focus();
      } catch (e) {
        // ignore
      }
    }
    if (lastSheetTrigger && typeof lastSheetTrigger.setAttribute === 'function') {
      lastSheetTrigger.setAttribute('aria-expanded', 'false');
    }
    lastSheetTrigger = null;
    document.removeEventListener('keydown', sheetKeyHandler);
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
      btn.setAttribute('aria-selected', state.city === city ? 'true' : 'false');
      btn.addEventListener('click', () => {
        state.city = city;
        renderChips();
        renderCards();
      });
      elChips.appendChild(btn);
    });
  }

  // ===== Status / Lote no card =====
  function buildStatus(ev) {
    const statusLine = document.createElement('div');
    statusLine.className = 'status-line';

    const dot = document.createElement('span');
    dot.className = 'status-dot';
    statusLine.appendChild(dot);

    const span = document.createElement('span');

    const lotCandidates = [
      ev.currentLot,
      ev.current_lot,
      ev.lot,
      ev.lote,
      ev.lotNumber,
      ev.lot_number,
      ev.loteNumero,
      ev.lote_numero,
      ev.ticketLot,
      ev.ticket_lot,
    ];

    let batchNumber = null;

    for (const c of lotCandidates) {
      if (c == null) continue;
      const n = Number(String(c).replace(/[^\d]/g, ''));
      if (isFinite(n) && n > 0) {
        batchNumber = n;
        break;
      }
    }

    if (batchNumber == null) {
      const labelCandidates = [
        ev.lotDescription,
        ev.lot_description,
        ev.loteDescricao,
        ev.lote_descricao,
        ev.loteDesc,
        ev.batchLabel,
        ev.loteLabel,
      ];
      for (const raw of labelCandidates) {
        if (!raw) continue;
        const m = String(raw).match(/(\d+)/);
        if (m) {
          const n = Number(m[1]);
          if (isFinite(n) && n > 0) {
            batchNumber = n;
            break;
          }
        }
      }
    }

    if (batchNumber == null) batchNumber = 1;

    const label = `Lote ${batchNumber}`;
    span.textContent = label;

    statusLine.classList.remove('status--soon', 'status--low', 'status--sold');
    if (batchNumber === 1) {
      statusLine.classList.add('status--soon');
    } else if (batchNumber === 2) {
      statusLine.classList.add('status--low');
    } else {
      statusLine.classList.add('status--sold');
    }

    statusLine.appendChild(span);
    return statusLine;
  }

  function buildSheetContent(ev, imgUrl) {
    const wrap = document.createElement('div');

    if (imgUrl) {
      const media = document.createElement('figure');
      media.className = 'sheet-media';
      media.classList.add('skeleton');
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = `Imagem do evento ${ev.title || ev.name || ''}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      const handleLoad = () => {
        media.classList.remove('skeleton');
        updateMediaFit(media, img);
      };
      if (img.complete && img.naturalWidth) {
        handleLoad();
      } else {
        img.addEventListener('load', handleLoad, { once: true });
      }
      img.addEventListener('error', () => media.classList.remove('skeleton'));
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

    const price = getEventPrice(ev);
    if (price != null) {
      const priceRow = document.createElement('p');
      priceRow.className = 'subtle';
      const strong = document.createElement('strong');
      strong.textContent = 'R$:';
      const span = document.createElement('span');
      span.textContent =
        ' ' + fmtMoneyBR(price).replace(/^R\$\s?/, '');
      priceRow.appendChild(strong);
      priceRow.appendChild(span);
      wrap.appendChild(priceRow);
    }

    const desc = getEventDescription(ev);
    const p = document.createElement('p');
    p.textContent =
      desc ||
      'Ingressos emitidos direto no seu WhatsApp, com QR Code antifraude e repasse via Pix.';
    wrap.appendChild(p);

    const btnRow = document.createElement('div');
    btnRow.className = 'sheet-actions';

    const waUrl = buildWhatsAppUrl(ev);
    const shareUrl = buildEventShareUrl(ev);

    const buyBtn = document.createElement('a');
    buyBtn.className = 'sheet-btn sheet-btn--primary';
    buyBtn.href = waUrl;
    buyBtn.target = '_blank';
    buyBtn.rel = 'noopener noreferrer';
    const buySpan = document.createElement('span');
    buySpan.textContent = 'Comprar no WhatsApp';
    buyBtn.appendChild(buySpan);
    const buyLabel = ev.title || ev.name ? `Comprar no WhatsApp para ${ev.title || ev.name}` : 'Comprar no WhatsApp';
    buyBtn.setAttribute('aria-label', buyLabel);
    buyBtn.insertAdjacentHTML(
      'beforeend',
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M5 12h11M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
        '</svg>'
    );
    btnRow.appendChild(buyBtn);

    const shareLink = document.createElement('button');
    shareLink.type = 'button';
    shareLink.className = 'sheet-btn sheet-btn--ghost';
    shareLink.innerHTML =
      '<span>Compartilhar evento</span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<path d="M12 5v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      '<path d="M8 9l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
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
        // usuário cancelou o share
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

    const placeholderData =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="100%" height="100%" fill="#f6f8fc"/><g fill="#cfe3ff"><rect x="200" y="220" width="800" height="360" rx="80"/><rect x="280" y="300" width="120" height="120" rx="32"/><rect x="520" y="300" width="160" height="120" rx="32"/><rect x="760" y="300" width="160" height="120" rx="32"/></g><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" font-family="Inter,Arial,Helvetica,sans-serif" font-size="32" fill="#6b7280">Imagem do evento ainda não cadastrada</text></svg>'
      );

    evs.forEach((ev) => {
      try {
      const card = document.createElement('article');
      card.className = 'card';
      card.tabIndex = 0;

      const media = document.createElement('div');
      media.className = 'card-media';
      media.classList.add('skeleton');

      const imgUrl = getEventImage(ev);
      let isPlaceholder = false;

      if (imgUrl) {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = `Imagem do evento ${ev.title || ev.name || ''}`;
        img.loading = 'lazy';
        img.decoding = 'async';
        const handleLoad = () => {
          media.classList.remove('skeleton');
          updateMediaFit(media, img);
        };
        if (img.complete && img.naturalWidth) {
          handleLoad();
        } else {
          img.addEventListener('load', handleLoad, { once: true });
        }

        img.addEventListener('error', () => {
          // se a imagem real falhar, cai pro placeholder
          media.innerHTML = '';
          media.style.removeProperty('--media-ratio');
          const ph = document.createElement('img');
          ph.src = placeholderData;
          ph.alt = 'Imagem do evento ainda não cadastrada';
          ph.loading = 'lazy';
          ph.decoding = 'async';
          ph.addEventListener('load', () => media.classList.remove('skeleton'));
          media.appendChild(ph);
          media.classList.add('media-fit-contain', 'media-fit-padded');
          isPlaceholder = true;
        });

        media.appendChild(img);
      } else {
        media.style.removeProperty('--media-ratio');
        const img = document.createElement('img');
        img.src = placeholderData;
        img.alt = 'Imagem do evento ainda não cadastrada';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('load', () => media.classList.remove('skeleton'));
        media.appendChild(img);
        media.classList.add('media-fit-contain', 'media-fit-padded');
        isPlaceholder = true;
      }

      card.appendChild(media);

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

      card.setAttribute('aria-controls', 'sheet');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-expanded', 'false');
      card.addEventListener('click', () => {
        const finalImgUrl = isPlaceholder ? null : getEventImage(ev);
        openSheet(buildSheetContent(ev, finalImgUrl), card);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          const finalImgUrl = isPlaceholder ? null : getEventImage(ev);
          try {
            openSheet(buildSheetContent(ev, finalImgUrl), card);
          } catch (err) {
            console.error('[ingressai] openSheet fail', err);
          }
        }
      });

      elList.appendChild(card);
      } catch (err) {
        console.error('[ingressai] error rendering event card', err, ev);
      }
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
        state.events.splice(foundIdx, 1);
        state.events.unshift(foundEv);

        const city = (foundEv.city || foundEv.cidade || '').trim();
        if (city) {
          state.city = city;
        }

        setTimeout(() => {
          const imgUrl = getEventImage(foundEv);
          openSheet(buildSheetContent(foundEv, imgUrl), null);
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
        .replace(/\./g, '')
        .replace(',', '.');
      const v = parseFloat(clean);
      return isFinite(v) ? v : 0;
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

    function syncFromPriceInput() {
      const v = parseBRL(priceInput.value);
      if (!isFinite(v)) return;
      const clamped = Math.min(Math.max(v, 5), 500);
      priceRange.value = String(clamped.toFixed(0));
      priceInput.value = fmtMoneyBR(clamped);
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

    function syncFromPriceRange() {
      const v = parseFloat(priceRange.value || '0');
      if (!isFinite(v)) return;
      priceInput.value = fmtMoneyBR(v);
      recalc();
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

    syncFromPriceRange();
    syncFromQtyRange();
  }

  async function handleRequestCreate() {
    if (!elReqForm) return;
    const phone = $('#req-phone');
    const title = $('#req-title');
    const name = $('#req-name');
    const city = $('#req-city');

    if (!phone || !title || !name || !city) {
      if (elReqHint) {
        elReqHint.textContent =
          'Formulário indisponível no momento. Atualize a página e tente novamente.';
      }
      console.warn('[ingressai] campos do formulário de solicitação ausentes');
      return;
    }

    let phoneVal = (phone.value || '').replace(/[^\d]/g, '');
    // normalize: if user provided DDD+number (10-11 digits) without country code, prepend '55'
    if (
      phoneVal &&
      !phoneVal.startsWith('55') &&
      (phoneVal.length === 10 || phoneVal.length === 11)
    ) {
      phoneVal = '55' + phoneVal;
    }
    const catBtnOn = $('.chip-opt[aria-checked="true"][data-value]');
    const titleVal = (title.value || '').trim();
    const nameVal = (name.value || '').trim();
    const cityVal = (city.value || '').trim();
    const catVal = catBtnOn ? catBtnOn.dataset.value : 'atleticas';

    if (!phoneVal || phoneVal.length < 10) {
      if (elReqHint) {
        elReqHint.textContent = 'Informe um WhatsApp válido (ex: 34991231234).';
      }
      return;
    }
    if (!titleVal || !cityVal) {
      if (elReqHint) {
        elReqHint.textContent = 'Preencha, no mínimo, nome do evento e cidade.';
      }
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

    if (elReqHint) elReqHint.textContent = 'Enviando...';
    if (elReqSend) elReqSend.disabled = true;

    let ok = false;
    try {
      const res = await fetch(API + '/org/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        ok = true;
      } else if (res.status === 404) {
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
      if (elReqHint) {
        elReqHint.textContent =
          'Pronto! Você vai receber uma mensagem oficial da IngressAI no WhatsApp para confirmar sua solicitação.';
      }
      try {
        elReqForm.reset();
      } catch (e) {
        // ignore
      }
    } else {
      if (elReqHint) {
        elReqHint.textContent =
          'Não consegui enviar agora. Tente novamente em alguns minutos.';
      }
    }
  }

  function setupRequestForm() {
    if (!elReqForm || !elReqSend) return;
    elReqSend.addEventListener('click', (e) => {
      e.preventDefault();
      handleRequestCreate();
    });

    // Hero CTA button: revelar seção, rolar até a calculadora e focar o input
    const calcBtn = document.getElementById('calc-btn');
    if (calcBtn) {
      calcBtn.addEventListener('click', () => {
        try {
          const orgSection = document.getElementById('organizadores');
          if (orgSection && orgSection.hidden) {
            orgSection.hidden = false;
          }

          const card = document.getElementById('calc-card');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            card.classList.add('calc-highlight');
            setTimeout(() => card.classList.remove('calc-highlight'), 2000);
          }

          setTimeout(() => {
            const priceInput = document.getElementById('calc-price');
            if (priceInput) priceInput.focus();
          }, 500);
        } catch (e) {
          console.error('[ingressai] calc-btn click error', e);
        }
      });
    }

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

    if (elOrgValidator && API_ROOT) {
      const url = API_ROOT + '/app/validator.html';
      elOrgValidator.href = url;
      elOrgValidator.target = '_blank';
      elOrgValidator.rel = 'noopener noreferrer';
    }
  }

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

  function initFeatureCards() {
    const cards = $$('.feature[data-feature]');
    if (!cards.length) return;
    document.documentElement.classList.add('js-feature-ready');

    function collapseAll(except) {
      cards.forEach((card) => {
        if (card === except) return;
        card.classList.remove('feature--open');
        card.setAttribute('aria-expanded', 'false');
      });
    }

    function toggleCard(card) {
      const isOpen = card.classList.contains('feature--open');
      if (isOpen) {
        card.classList.remove('feature--open');
        card.setAttribute('aria-expanded', 'false');
        return;
      }
      collapseAll(card);
      card.classList.add('feature--open');
      card.setAttribute('aria-expanded', 'true');
    }

    collapseAll(null);

    cards.forEach((card) => {
      card.setAttribute('aria-expanded', 'false');
      card.addEventListener('click', () => toggleCard(card));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggleCard(card);
        }
      });
    });
  }
  function showGlobalError(message, details) {
    try {
      const existing = document.getElementById('global-error-banner');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.id = 'global-error-banner';
      el.style.cssText = 'background:#ffecec;border:1px solid #f5c2c2;color:#6b2020;padding:10px;font-weight:700;text-align:center;position:fixed;left:0;right:0;top:56px;z-index:9999';
      el.textContent = message || 'Ocorreu um erro na aplicação.';
      if (details) {
        const small = document.createElement('div');
        small.style.cssText = 'font-weight:400;font-size:13px;margin-top:6px;opacity:.9';
        small.textContent = String(details).slice(0, 240);
        el.appendChild(small);
      }
      const btn = document.createElement('button');
      btn.textContent = 'Fechar';
      btn.style.cssText = 'margin-left:12px;padding:.25rem .6rem;border-radius:8px;border:1px solid rgba(0,0,0,.06);background:#fff';
      btn.addEventListener('click', () => el.remove());
      el.appendChild(btn);
      document.body.appendChild(el);
    } catch (e) {
      console.error('[ingressai] showGlobalError fail', e);
    }
  }

  window.addEventListener('error', (ev) => {
    try {
      console.error('[ingressai] Uncaught error', ev.error || ev.message || ev);
      showGlobalError('Erro não tratado no JavaScript — veja o console do navegador.', ev.error || ev.message);
    } catch (e) {}
  });
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      console.error('[ingressai] Unhandled promise rejection', ev.reason);
      showGlobalError('Rejeição de promessa não tratada — veja o console do navegador.', ev.reason);
    } catch (e) {}
  });

  document.addEventListener('DOMContentLoaded', () => {
    try {
      initDrawer();
      initSheet();
      initSearch();
      initFeatureCards();
      setupCalc();
      setupRequestForm();
      initHealth();
      initEvents();
    } catch (e) {
      console.error('[ingressai] erro no init', e);
      showGlobalError('Falha ao inicializar a aplicação — confira o console.', e && e.message ? e.message : e);
    }
  });
  // single DOMContentLoaded handler above (with try/catch)
})();
