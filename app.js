/* app.js — IngressAI (frontend leve)
   - vitrine, filtros, sheet
   - calculadora (mobile-first): 3% plataforma (top); emissão manual 1,5% (bottom)
   - preço com digitação livre; máscara no blur; sliders sincronizados
   - formulário "Quero criar meu evento"
   - máscara BRL, URL state, localStorage, skeletons, tooltips acessíveis
   - diagnóstico de backend
*/
(() => {
  "use strict";

  // Utilitários básicos
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function normalizeApi(raw) {
    let s = String(raw || "").trim().replace(/\/+$/g, "");
    if (!/\/api$/i.test(s)) s += "/api";
    s = s.replace(/([^:])\/{2,}/g, "$1/");
    return s;
  }

  async function getJSON(url, opts = {}) {
    const r = await fetch(url, { method: "GET", credentials: "omit", mode: "cors", cache: "no-store", ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
    const t = await r.text();
    return t ? JSON.parse(t) : {};
  }
  async function postJSON(url, body = {}, opts = {}) {
    const r = await fetch(url, {
      method: "POST",
      credentials: "omit",
      mode: "cors",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(body),
      ...opts,
    });
    const t = await r.text();
    const j = t ? JSON.parse(t) : {};
    if (!r.ok) {
      const msg = j?.error || j?.message || `HTTP ${r.status} @ ${url}`;
      const err = new Error(msg);
      err.response = j; err.status = r.status;
      throw err;
    }
    return j;
  }

  // Helpers de moeda
  function clampInt(v, min, max){ const n = Math.max(min, Math.min(max, parseInt(v || "0", 10) || 0)); return n; }
  function centsToBRL(c){ return (c/100).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
  function brlToCents(raw){
    if (raw == null) return 0;
    const s = String(raw).replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",",".");
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n*100) : 0;
  }

  // Entrypoint
  window.addEventListener("DOMContentLoaded", async () => {
    // ===== Config / API
    const qs = new URLSearchParams(location.search);
    const QS_API = (qs.get("api") || "").trim();
    const META_API = document.querySelector('meta[name="ingressai-api"]')?.content?.trim() || "";
    const INGRESSAI_API = window.INGRESSAI_API || normalizeApi(QS_API || META_API);
    const INGRESSAI_BASE = window.INGRESSAI_BASE || INGRESSAI_API.replace(/\/api$/i, "");
    window.INGRESSAI_API = INGRESSAI_API;
    window.INGRESSAI_BASE = INGRESSAI_BASE;

    const BOT_NUMBER = "5534999992747";
    const PLACEHOLDER_IMG = "./logo_ingressai.png";

    // Resolve URL de mídia vinda do backend (/uploads, /media, http…)
    function resolveMediaUrl(src) {
      if (!src) return PLACEHOLDER_IMG;
      const s = String(src).trim();
      // Já é URL absoluta
      if (/^https?:\/\//i.test(s)) return s;
      // Caminhos servidos pelo backend
      if (s.startsWith("/uploads") || s.startsWith("/media")) {
        return INGRESSAI_BASE.replace(/\/+$/, "") + s;
      }
      return s;
    }

    // ===== Header scroll
    const header = $("header");
    const toggleScrolled = () => header && (window.scrollY > 4 ? header.classList.add("is-scrolled") : header.classList.remove("is-scrolled"));
    window.addEventListener("scroll", toggleScrolled, { passive: true });
    toggleScrolled();

    // ===== Drawer
    const drawer = $("#drawer");
    const drawerBackdrop = $("#drawer-backdrop");
    const btnDrawerOpen = $("#drawer-toggle");
    const btnDrawerClose = $("#drawer-close");
    const btnDrawerCreate = $("#drawer-create");
    function openDrawer(){ if(!drawer) return; drawer.classList.add("is-open"); drawerBackdrop.classList.add("is-open"); btnDrawerOpen?.setAttribute("aria-expanded","true"); drawer.setAttribute("aria-hidden","false"); drawerBackdrop.setAttribute("aria-hidden","false"); }
    function closeDrawer(){ if(!drawer) return; drawer.classList.remove("is-open"); drawerBackdrop.classList.remove("is-open"); btnDrawerOpen?.setAttribute("aria-expanded","false"); drawer.setAttribute("aria-hidden","true"); drawerBackdrop.setAttribute("aria-hidden","true"); }
    btnDrawerOpen?.addEventListener("click", openDrawer);
    btnDrawerClose?.addEventListener("click", closeDrawer);
    drawerBackdrop?.addEventListener("click", closeDrawer);
    btnDrawerCreate?.addEventListener("click", () => {
      closeDrawer();
      document.getElementById("organizadores")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // ===== Vitrine
    const listaEl = $("#lista-eventos");
    const filtroCidadesEl = $("#filtro-cidades");
    const buscaEl = $("#busca-eventos");

    let allEvents = [];
    let activeCity = null;
    let searchTerm = "";

    async function fetchEventsSmart() {
      const endpoints = ["/events/vitrine", "/events/public", "/events", "/events/seed"];
      for (const p of endpoints) {
        try {
          const url = INGRESSAI_API + p;
          const json = await getJSON(url);
          const events =
            json?.events ||
            (Array.isArray(json) ? json : null) ||
            json?.data?.events ||
            json?.data ||
            json?.items ||
            json?.rows ||
            [];
          if (Array.isArray(events)) return events;
        } catch { /* próximo */ }
      }
      throw new Error("Nenhum endpoint de eventos respondeu.");
    }

    const cityFrom = (ev) => ev.city || ev.cidade || ev.location?.city || ev.venueCity || ev.placeCity || null;
    const dateTextFrom = (ev) => ev.dateText || ev.eventDateText || ev.date || ev.startsAt || "";
    const mediaFrom = (ev) => ev.image || ev.coverUrl || ev.banner || ev.media?.[0] || ev.thumb || null;

    function statusChip(ev) {
      if (ev.soldOut) return ["sold", "Esgotado"];
      if (ev.lowStock) return ["low", "Últimos ingressos"];
      return ["soon", "Disponível"];
    }
    function imgNode(src) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "Capa do evento";
      img.src = resolveMediaUrl(src);
      img.addEventListener("error", () => { img.src = PLACEHOLDER_IMG; }, { once:true });
      return img;
    }

    function el(tag, attrs = {}, children = []) {
      const node = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => {
        if (v == null) return;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else node.setAttribute(k, v);
      });
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
      return node;
    }

    function renderEvents() {
      if (!listaEl) return;
      const q = (searchTerm || "").trim().toLowerCase();

      const filtered = allEvents.filter((ev) => {
        const city = (cityFrom(ev) || "").toLowerCase();
        const title = (ev.title || ev.name || ev.eventTitle || "").toLowerCase();
        const hitCity = !activeCity || city === activeCity.toLowerCase();
        const hitSearch = !q || title.includes(q) || city.includes(q) || (ev.venue || ev.local || "").toLowerCase().includes(q);
        return hitCity && hitSearch;
      });

      listaEl.innerHTML = "";
      if (!filtered.length) {
        listaEl.appendChild(
          el("div", { class: "std-card" }, [
            el("strong", {}, "Nenhum evento encontrado"),
            el("p", { class: "subtle" }, "Tente limpar filtros ou buscar outro termo."),
          ])
        );
        return;
      }

      filtered.forEach((ev) => {
        const city = cityFrom(ev);
        const img = mediaFrom(ev);
        const [k, label] = statusChip(ev);

        const card = el("article", { class: "card", tabindex: "0", role: "button" }, [
          el("div", { class: "card-header" }, [
            el("div", {}, [
              el("div", { class: "card-city" }, city || "—"),
              el("div", { class: "card-title" }, ev.title || ev.name || ev.eventTitle || "Evento"),
              el("div", { class: `status-line status--${k}` }, [
                el("span", { class: "status-dot", "aria-hidden": "true" }),
                el("span", {}, label),
              ]),
            ]),
          ]),
          el("div", { class: "card-media" }, img ? imgNode(img) : imgNode(null)),
        ]);

        card.addEventListener("click", () => openEventSheet(ev));
        card.addEventListener("keyup", (e) => { if (e.key === "Enter" || e.key === " ") openEventSheet(ev); });
        listaEl.appendChild(card);
      });
    }

    function buildCityChips() {
      if (!filtroCidadesEl) return;
      const set = new Set();
      allEvents.forEach((ev) => { const c = cityFrom(ev); if (c) set.add(String(c)); });

      const cities = Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
      filtroCidadesEl.innerHTML = "";

      const allChip = el("button", { class: "chip", role: "tab", "aria-selected": activeCity ? "false" : "true" }, "Todas");
      allChip.addEventListener("click", () => {
        activeCity = null;
        $$('[role="tab"]', filtroCidadesEl).forEach((n) => n.setAttribute("aria-selected", "false"));
        allChip.setAttribute("aria-selected", "true");
        renderEvents();
      });
      filtroCidadesEl.appendChild(allChip);

      cities.forEach((city) => {
        const chip = el("button", {
          class: "chip", role: "tab",
          "aria-selected": activeCity && activeCity.toLowerCase() === city.toLowerCase() ? "true" : "false",
        }, city);
        chip.addEventListener("click", () => {
          activeCity = city;
          $$('[role="tab"]', filtroCidadesEl).forEach((n) => n.setAttribute("aria-selected", "false"));
          chip.setAttribute("aria-selected", "true");
          renderEvents();
        });
        filtroCidadesEl.appendChild(chip);
      });
    }

    function openEventSheet(ev) {
      const sheet = $("#sheet");
      const sheetBody = $("#sheet-body");
      const sheetBackdrop = $("#sheet-backdrop");
      if (!sheet || !sheetBody) return;
      sheetBody.innerHTML = "";

      const city = cityFrom(ev);
      const dateText = dateTextFrom(ev);
      const img = mediaFrom(ev);

      const head = el("div", {}, [
        el("h3", {}, ev.title || ev.name || ev.eventTitle || "Evento"),
        el("div", { class: "status-chip soon", style: "margin-top:6px" }, [
          el("span", { class: "dot" }),
          el("span", {}, city || "—"),
        ]),
      ]);

      const mediaNode = el("div", { class: "sheet-media" }, [ img ? imgNode(img) : imgNode(null) ]);

      const makeWaDeepLink = (ev) => {
        const id = ev.id || ev.slug || "";
        if (!id) return `https://wa.me/${BOT_NUMBER}`;
        const txt = encodeURIComponent(`ingressai:start ev=${id} qty=1 autopay=1`);
        return `https://wa.me/${BOT_NUMBER}?text=${txt}`;
      };
      const ctaHref = ev.whatsappLink || ev.deepLink || makeWaDeepLink(ev);

      const details = el("div", { class: "std-list" }, [
        el("div", {}, `Quando: ${dateText || "—"}`),
        el("div", {}, `Local: ${ev.venue || ev.local || city || "—"}`),
      ]);

      const actions = el("div", { style: "display:flex;gap:8px;margin-top:8px" }, [
        el("a", { class: "btn btn--secondary btn--sm", href: ctaHref, target: "_blank", rel: "noopener noreferrer" }, "Comprar no WhatsApp"),
      ]);

      sheetBody.appendChild(head);
      sheetBody.appendChild(mediaNode);
      sheetBody.appendChild(details);
      sheetBody.appendChild(actions);

      sheet.setAttribute("aria-hidden", "false");
      sheet.classList.add("is-open");
      sheetBackdrop.classList.add("is-open");
    }

    function closeSheet() {
      const sheet = $("#sheet");
      const sheetBackdrop = $("#sheet-backdrop");
      if (!sheet) return;
      sheet.classList.remove("is-open");
      sheetBackdrop.classList.remove("is-open");
      sheet.setAttribute("aria-hidden", "true");
    }
    $("#sheet-close")?.addEventListener("click", closeSheet);
    $("#sheet-backdrop")?.addEventListener("click", closeSheet);
    buscaEl?.addEventListener("input", (e) => { searchTerm = e.target.value || ""; renderEvents(); });

    // ===== Calculadora (3% top + 1,5% manual)
    const priceEl = $("#calc-price");
    const priceRangeEl = $("#calc-price-range");
    const qtyNEl = $("#calc-qty-n");
    const qtySlider = $("#calc-qty");

    const baseUnitEl = $("#calc-base-unit");
    const feeOrgEl = $("#calc-fee-org");
    const grossEl = $("#calc-gross");
    const netEl = $("#calc-net");

    const manualFeeUnitEl   = $("#manual-fee-unit");
    const manualFeeTotalEl  = $("#manual-fee-total");
    const manualNetTotalEl  = $("#manual-net-total");
    const manualNetUnitEl   = $("#manual-net-unit");

    let priceCents = brlToCents(qs.get("price")) || 6000; // R$ 60,00
    let qty = clampInt(qs.get("qty") || localStorage.getItem("ia.qty") || "100", 0, 10000);

    function pushState(){
      const params = new URLSearchParams(location.search);
      params.set("price", (priceCents/100).toFixed(2));
      params.set("qty", String(qty));
      const newUrl = `${location.pathname}?${params.toString()}${location.hash || ""}`;
      history.replaceState(null, "", newUrl);
      localStorage.setItem("ia.qty", String(qty));
    }

    function recalc(){
      // 3% (plataforma)
      baseUnitEl.textContent = centsToBRL(priceCents);
      const pct3 = 0.03;
      const feeUnit3 = Math.round(priceCents * pct3);
      const gross = priceCents * qty;
      const net = Math.max(0, (priceCents - feeUnit3) * qty);
      feeOrgEl.textContent = `${centsToBRL(feeUnit3)} / ingresso`;
      grossEl.textContent = centsToBRL(gross);
      netEl.textContent = centsToBRL(net);

      // 1,5% (emissão manual)
      const pct15 = 0.015;
      const feeUnit15 = Math.round(priceCents * pct15);
      const feeTotal15 = feeUnit15 * qty;
      const manualNetTotal = Math.max(0, (priceCents - feeUnit15) * qty);
      const manualNetUnit  = Math.max(0, priceCents - feeUnit15);
      manualFeeUnitEl.textContent  = `${centsToBRL(feeUnit15)} / ingresso`;
      manualFeeTotalEl.textContent = centsToBRL(feeTotal15);
      manualNetTotalEl.textContent = centsToBRL(manualNetTotal);
      manualNetUnitEl.textContent  = centsToBRL(manualNetUnit);
    }

    // Prepara campos iniciais
    if (priceEl) priceEl.value = centsToBRL(priceCents);
    const priceRangeDefault = Math.max(5, Math.min(500, Math.round(priceCents/100)));
    if (priceRangeEl) priceRangeEl.value = String(priceRangeDefault);
    if (qtyNEl) qtyNEl.value = String(qty);
    if (qtySlider) qtySlider.value = String(Math.min(1000, qty));
    recalc();

    // Eventos UI
    priceEl?.addEventListener("input", (e) => {
      priceCents = brlToCents(e.target.value);
      const v = Math.max(5, Math.min(500, Math.round(priceCents/100)));
      if (priceRangeEl) priceRangeEl.value = String(v);
      pushState(); recalc();
    });
    priceEl?.addEventListener("blur", (e) => {
      let c = brlToCents(e.target.value);
      const mod = c % 100;
      if (mod === 0 && c >= 1000) c = c - 10;            // .00 → .90
      else if (mod >= 90 && mod < 99) c = c + (99 - mod); // ~.90 → .99
      priceCents = Math.max(0, c);
      e.target.value = centsToBRL(priceCents);
      const v = Math.max(5, Math.min(500, Math.round(priceCents/100)));
      if (priceRangeEl) priceRangeEl.value = String(v);
      pushState(); recalc();
    });
    priceRangeEl?.addEventListener("input", (e) => {
      const reais = clampInt(e.target.value, 5, 500);
      priceCents = reais * 100;
      if (priceEl) priceEl.value = centsToBRL(priceCents);
      pushState(); recalc();
    });
    qtyNEl?.addEventListener("input", (e) => {
      const v = clampInt(e.target.value, 0, 10000);
      e.target.value = String(v);
      qty = v;
      if (qtySlider) qtySlider.value = String(Math.min(1000, v));
      pushState(); recalc();
    });
    qtySlider?.addEventListener("input", (e) => {
      const v = clampInt(e.target.value, 0, 1000);
      if (qtyNEl) qtyNEl.value = String(v);
      qty = v;
      pushState(); recalc();
    });

    // Tooltips acessíveis (usa aria-controls)
    function closeAllTips(except){
      $$(".tip[aria-hidden='false']").forEach(n => { if (n.id !== except) { n.setAttribute("aria-hidden","true"); n.classList.remove("open"); }});
    }
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".i-btn");
      if (btn) {
        const id = btn.getAttribute("aria-controls");
        const tip = id && document.getElementById(id);
        if (tip) {
          const isOpen = tip.getAttribute("aria-hidden") === "false";
          closeAllTips(isOpen ? undefined : id);
          tip.setAttribute("aria-hidden", isOpen ? "true" : "false");
          tip.classList.toggle("open", !isOpen);
        }
      } else if (!e.target.closest(".tip")) {
        closeAllTips();
      }
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllTips(); });

    // Form "Quero criar meu evento"
    const reqForm = $("#req-form");
    const reqBtn = $("#req-send");
    const reqHint = $("#req-hint");
    const catAth = $("#cat-ath");
    const catProd = $("#cat-prod");
    let reqCategory = "atleticas";
    function setCat(which){
      reqCategory = which;
      catAth?.setAttribute("aria-checked", which === "atleticas" ? "true" : "false");
      catProd?.setAttribute("aria-checked", which === "produtoras" ? "true" : "false");
    }
    catAth?.addEventListener("click", () => setCat("atleticas"));
    catProd?.addEventListener("click", () => setCat("produtoras"));

    async function submitOrgRequest() {
      if (!reqForm) return;
      const phone = ($("#req-phone")?.value || "").replace(/\D+/g, "");
      const title = $("#req-title")?.value?.trim() || "";
      const name = $("#req-name")?.value?.trim() || "";
      const city = $("#req-city")?.value?.trim() || "";
      if (!phone || !title || !name || !city) { if (reqHint) reqHint.textContent = "Preencha WhatsApp, evento, seu nome e cidade."; return; }

      reqBtn?.setAttribute("disabled", "true");
      if (reqHint) reqHint.textContent = "Enviando…";
      try {
        const payload = { phone, title, name, city, category: reqCategory };
        const res = await postJSON(INGRESSAI_API + "/org/request", payload);
        if (res?.ok) {
          if (reqHint) reqHint.textContent = "Solicitação enviada. Você receberá o passo a passo no WhatsApp.";
          reqForm.reset(); setCat("atleticas");
        } else {
          if (reqHint) reqHint.textContent = "Não foi possível enviar agora.";
        }
      } catch {
        if (reqHint) reqHint.textContent = "Falha ao enviar. Tente novamente.";
      } finally {
        reqBtn?.removeAttribute("disabled");
        setTimeout(() => reqHint && (reqHint.textContent = ""), 4500);
      }
    }
    reqBtn?.addEventListener("click", submitOrgRequest);

    // Diagnóstico
    const dApi = $("#d-api");
    const dHealth = $("#d-health");
    const dEv = $("#d-ev2");
    const authIndicator = $("#auth-indicator");
    function setDiag(el, ok, extra) {
      if (!el) return;
      el.textContent = ok ? (extra || "on") : (extra || "off");
      el.style.color = ok ? "#157f3b" : "#b64848";
    }

    try {
      setDiag(dApi, !!INGRESSAI_API, INGRESSAI_API || "off");
      let j;
      try { j = await getJSON(INGRESSAI_API + "/health"); }
      catch { j = await getJSON(INGRESSAI_BASE + "/health"); }
      setDiag(dHealth, !!j?.ok, j?.ok ? "on" : "off");
      authIndicator?.classList.remove("off", "on");
      authIndicator?.classList.add(j?.ok ? "on" : "off");
      if (authIndicator) authIndicator.textContent = j?.ok ? "online" : "offline";
    } catch {
      setDiag(dHealth, false);
      authIndicator?.classList.remove("off", "on");
      authIndicator?.classList.add("off");
      if (authIndicator) authIndicator.textContent = "offline";
    }

    try {
      allEvents = await fetchEventsSmart();
      setDiag(dEv, true, `${allEvents.length} evt`);
      buildCityChips();
      renderEvents();
    } catch {
      setDiag(dEv, false, "—");
    }

    // Wire do Validador (HEAD + fallback)
    try {
      const url = INGRESSAI_BASE.replace(/\/+$/, "") + "/app/validator.html";
      const r = await fetch(url, { method: "HEAD", cache: "no-store" });
      const ok = r.ok || r.status === 200;
      const orgBtn = $("#org-validator");
      if (ok && orgBtn && (!orgBtn.href || orgBtn.getAttribute("href") === "#")) orgBtn.href = url;
    } catch {}
  });
})();
