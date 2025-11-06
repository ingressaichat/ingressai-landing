/* app.js — IngressAI (frontend leve, Apple-like)
   - vitrine, filtros, sheet (mídia primeiro)
   - planos fixos: 3% org + 4%/5% comprador (SEM toggle)
   - máscara BRL, URL state, localStorage, skeletons
   - diagnóstico de backend
*/
(() => {
  "use strict";

  /* ================= Base / Config ================= */
  const qs = new URLSearchParams(location.search);
  const QS_API = (qs.get("api") || "").trim();
  const META_API =
    document.querySelector('meta[name="ingressai-api"]')?.content?.trim() || "";

  function normalizeApi(raw) {
    let s = String(raw || "").trim().replace(/\/+$/g, "");
    if (!/\/api$/i.test(s)) s += "/api";
    s = s.replace(/([^:])\/{2,}/g, "$1/");
    return s;
  }

  const INGRESSAI_API = normalizeApi(QS_API || META_API || "https://ingressai-backend-production.up.railway.app/api");
  const WHATSAPP_NUM = "5534999992747"; // PUBLIC_WHATSAPP (memorizado)
  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='742' viewBox='0 0 1200 742'>
       <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
         <stop offset='0%' stop-color='#0c2244'/><stop offset='100%' stop-color='#2F7DD9'/>
       </linearGradient></defs>
       <rect fill='url(#g)' width='1200' height='742'/>
       <g fill='#ffffff' fill-opacity='.85'>
         <rect x='420' y='210' width='360' height='36' rx='8'/>
         <rect x='360' y='270' width='480' height='16' rx='8' opacity='.7'/>
         <rect x='460' y='300' width='280' height='16' rx='8' opacity='.55'/>
       </g>
     </svg>`
  );

  const els = {
    hdr: document.getElementById("hdr"),
    brand: document.getElementById("brand"),
    hero: document.getElementById("hero"),
    q: document.getElementById("q"),
    chips: document.getElementById("chips"),
    cards: document.getElementById("cards"),
    backendStatus: document.getElementById("backendStatus"),
    openWhatsapp: document.getElementById("openWhatsapp"),
    sheet: document.getElementById("sheet"),
    sImg: document.getElementById("sImg"),
    sTitle: document.getElementById("sTitle"),
    sPrice: document.getElementById("sPrice"),
    sMeta: document.getElementById("sMeta"),
    sBuy: document.getElementById("sBuy"),
    sView: document.getElementById("sView"),
  };

  /* ================= Header shadow ================= */
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY || 0;
    const scrolled = y > 4;
    els.hdr.classList.toggle("is-scrolled", scrolled);
    lastY = y;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ================= Fetch helpers ================= */
  async function jget(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers || {}) } });
    if (!r.ok) throw new Error("http_" + r.status);
    return r.json();
  }

  function brMoney(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function dateBR(ts) {
    const d = new Date(Number(ts || 0));
    if (!isFinite(d)) return "—";
    return d.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
  }

  /* ================= State ================= */
  const state = {
    brand: "IngressAI",
    logo: "./logo_ingressai.png",
    cities: [],
    events: [],
    activeCity: "",
    query: "",
    buyerPlan: "atl", // "atl" (4%) ou "prod" (5%)
  };

  /* ================= Health & Brand ================= */
  async function boot() {
    try {
      const h = await jget(`${INGRESSAI_API}/health`);
      if (h?.brand) state.brand = h.brand;
      if (h?.logo) state.logo = h.logo;
      els.brand.querySelector("span").textContent = state.brand;
      const img = els.brand.querySelector("img");
      img.src = state.logo;
      img.onerror = () => (img.src = "./logo_ingressai.png");

      els.backendStatus.textContent = "Backend: ok";
      els.backendStatus.classList.remove("off");
      els.backendStatus.classList.add("on");
    } catch {
      els.backendStatus.textContent = "Backend: off";
      els.backendStatus.classList.add("off");
    }
  }

  /* ================= Vitrine ================= */
  function skeleton(n = 6) {
    const a = [];
    for (let i = 0; i < n; i++) {
      a.push(`
        <article class="card" aria-busy="true">
          <div class="media skeleton"></div>
          <div class="title skeleton" style="height:16px;border-radius:8px"></div>
          <div class="meta skeleton" style="height:12px;border-radius:6px;width:70%"></div>
          <div class="meta skeleton" style="height:12px;border-radius:6px;width:40%"></div>
        </article>`);
    }
    els.cards.innerHTML = a.join("");
  }

  function cityFromEvent(ev) {
    return (ev.city || "").trim();
  }

  function buildCities(events) {
    const set = new Set();
    for (const ev of events) {
      const c = cityFromEvent(ev);
      if (c) set.add(c);
    }
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }

  function renderChips() {
    const cities = state.cities;
    const all = [{ label: "Todas", val: "" }, ...cities.map(c => ({ label: c, val: c }))];
    els.chips.innerHTML = all.map(c => (
      `<button class="chip" data-city="${c.val}" aria-selected="${c.val === state.activeCity}">${c.label}</button>`
    )).join("");
    els.chips.querySelectorAll(".chip").forEach(btn => {
      btn.addEventListener("click", () => {
        state.activeCity = btn.getAttribute("data-city") || "";
        renderChips();
        renderCards();
      });
    });
  }

  function matchesQuery(ev) {
    const q = state.query.toLowerCase();
    if (!q) return true;
    return [ev.title, ev.city, ev.venue].filter(Boolean).some(s => String(s).toLowerCase().includes(q));
  }

  function filterEvents() {
    return state.events
      .filter(ev => (state.activeCity ? ev.city === state.activeCity : true))
      .filter(matchesQuery)
      .sort((a,b)=> (a.date || 0) - (b.date || 0));
  }

  function waLinkFor(evId) {
    const txt = encodeURIComponent(`ingressai:start ev=${evId}`);
    return `https://wa.me/${WHATSAPP_NUM}?text=${txt}`;
  }

  function renderCards() {
    const items = filterEvents();
    if (!items.length) {
      els.cards.innerHTML = `<div class="subtle">Nada por aqui (ainda). Volte em breve ✨</div>`;
      return;
    }
    els.cards.innerHTML = items.map(ev => {
      const img = (ev.image || "").trim() || PLACEHOLDER;
      const price = Number(ev.price || 0);
      const priceLabel = price > 0 ? brMoney(price) : "Grátis";
      const meta = [ev.city, dateBR(ev.date), ev.venue].filter(Boolean).join(" • ");
      return `
        <article class="card" data-evid="${ev.id}">
          <div class="media"><img loading="lazy" src="${img}" alt="${ev.title}" onerror="this.src='${PLACEHOLDER}'"/></div>
          <div class="title">${ev.title}</div>
          <div class="meta">${meta}</div>
          <div class="meta"><span class="price">${priceLabel}</span></div>
        </article>`;
    }).join("");

    els.cards.querySelectorAll(".card").forEach(card => {
      card.addEventListener("click", () => openSheet(card.getAttribute("data-evid")));
    });
  }

  /* ================= Sheet ================= */
  const sheetEl = document.getElementById("sheet");
  const closeEls = sheetEl.querySelectorAll("[data-close]");

  closeEls.forEach(el => el.addEventListener("click", closeSheet));
  sheetEl.addEventListener("click", (e) => {
    if (e.target.hasAttribute("data-close")) closeSheet();
  });

  function openSheet(evId) {
    const ev = state.events.find(e => e.id === evId);
    if (!ev) return;
    const img = (ev.image || "").trim() || PLACEHOLDER;
    els.sImg.src = img;
    els.sImg.onerror = () => (els.sImg.src = PLACEHOLDER);
    els.sTitle.textContent = ev.title;
    const price = Number(ev.price || 0);
    els.sPrice.textContent = price > 0 ? brMoney(price) : "Grátis";
    els.sMeta.textContent = [ev.city, dateBR(ev.date), ev.venue].filter(Boolean).join(" • ");

    els.sBuy.href = waLinkFor(ev.id);
    els.sView.href = `${INGRESSAI_API.replace(/\/api$/,'')}/app/validator.html`;

    sheetEl.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function closeSheet() {
    sheetEl.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  /* ================= Buscar dados ================= */
  async function loadCitiesFallback() {
    return buildCities(state.events);
  }

  async function loadEvents() {
    skeleton(6);
    const j = await jget(`${INGRESSAI_API}/events`);
    const items = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
    // Normaliza campos esperados
    state.events = items.map(ev => ({
      id: ev.id || ev.slug || ev.eventId || `ev_${Math.random().toString(36).slice(2,8)}`,
      title: ev.title || ev.name || "Evento",
      city: ev.city || "",
      date: ev.date || ev.startsAt || Date.now(),
      price: Number(ev.price || 0),
      venue: ev.venue || ev.location || "",
      image: ev.image || ev.imageUrl || ev.cover || "",
      status: ev.status || "published",
    })).filter(e => e.status !== "deleted");
  }

  async function loadCities() {
    try {
      const j = await jget(`${INGRESSAI_API}/cities`);
      if (Array.isArray(j) && j.length) return j;
    } catch { /* fallback nos eventos */ }
    return loadCitiesFallback();
  }

  /* ================= Busca / Chips ================= */
  els.q.addEventListener("input", () => {
    state.query = els.q.value.trim();
    renderCards();
  });

  /* ================= CTA WhatsApp (header/hero) ================= */
  els.openWhatsapp.href = `https://wa.me/${WHATSAPP_NUM}`;

  /* ================= Calculadora (3% org, 4%/5% comprador) ================= */
  const elInPrice = document.getElementById("inPrice");
  const elInQty = document.getElementById("inQty");
  const elPlanAtl = document.getElementById("planAtl");
  const elPlanProd = document.getElementById("planProd");
  const elKOrg = document.getElementById("kOrg");
  const elKBuyer = document.getElementById("kBuyer");
  const elKBruto = document.getElementById("kBruto");
  const elKLiq = document.getElementById("kLiquido");

  function recalc() {
    const p = Math.max(0, Number(elInPrice.value || 0));
    const q = Math.max(1, Math.floor(Number(elInQty.value || 1)));
    const feeOrg = 0.03; // fixo
    const feeBuyer = state.buyerPlan === "atl" ? 0.04 : 0.05;

    const bruto = p * q;
    const taxaOrgTotal = (p * feeOrg) * q; // 3% por ingresso
    const liquido = bruto - taxaOrgTotal; // comprador paga a parte 4/5% no checkout

    elKOrg.textContent = "3% por ingresso";
    elKBuyer.textContent = state.buyerPlan === "atl" ? "4% (compra)" : "5% (compra)";
    elKBruto.textContent = brMoney(bruto);
    elKLiq.textContent = brMoney(liquido);
  }
  [elInPrice, elInQty].forEach(el => el.addEventListener("input", recalc));
  elPlanAtl.addEventListener("click", () => {
    state.buyerPlan = "atl";
    elPlanAtl.setAttribute("aria-selected", "true");
    elPlanProd.removeAttribute("aria-selected");
    recalc();
  });
  elPlanProd.addEventListener("click", () => {
    state.buyerPlan = "prod";
    elPlanProd.setAttribute("aria-selected", "true");
    elPlanAtl.removeAttribute("aria-selected");
    recalc();
  });

  /* ================= Init ================= */
  (async function init(){
    await boot();
    await loadEvents();
    state.cities = await loadCities();
    renderChips();
    renderCards();
    recalc();
  })();
})();
