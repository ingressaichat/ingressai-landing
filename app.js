// ==============================
// IngressAI Landing — app.js
// raiz do repositório (./app.js)
// ==============================

(() => {
  const LOGP = "[IngressAI]";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  // ------------------------------
  // Config / Bases
  // ------------------------------
  const API_PARAM = new URLSearchParams(location.search).get("api");
  const ENV_API = (typeof window !== "undefined" && window.INGRESSAI_API) ? window.INGRESSAI_API : "";
  const DEFAULT_API = "https://ingressai-backend-production.up.railway.app/api";

  function normalizeApi(raw) {
    let s = String(raw || "").trim();
    if (!s) s = DEFAULT_API;
    s = s.replace(/[.\s/]+$/g, "");     // tira barras/espacos finais
    if (!/\/api$/i.test(s)) s += "/api";
    s = s.replace(/([^:])\/{2,}/g, "$1/");
    return s;
  }

  const BASE_WITH_API = normalizeApi(API_PARAM || ENV_API || DEFAULT_API);
  const BASE_ROOT = BASE_WITH_API.replace(/\/api$/i, "");
  const WHATSAPP_NUMBER = "5534999992747";

  // Expor para debugging
  window.__INGRESSAI_CFG__ = { BASE_WITH_API, BASE_ROOT };

  // ------------------------------
  // Helpers de rede/UI
  // ------------------------------
  async function tryFetch(paths, opts) {
    let lastErr;
    for (const p of paths) {
      try {
        const res = await fetch(p, { mode: "cors", ...opts });
        if (res.ok) return res;
        lastErr = new Error(`HTTP ${res.status} @ ${p}`);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("Falha na requisição");
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, {
      headers: { "Accept": "application/json", ...(opts?.headers || {}) },
      mode: "cors",
      credentials: opts?.credentials || "omit", // "include" apenas nas rotas auth/validator
      ...opts
    });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const j = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text();
    if (!res.ok) throw new Error((j && j.error) || res.statusText || "Request failed");
    return j;
  }

  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const money = v => BRL.format(isFinite(v) ? v : 0);
  const formatDate = (iso) => {
    try { const d = new Date(iso); return d.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return iso }
  };
  const normalizeStatusLabel = (s) => !s ? "" : s.replace("Últimos ingressos", "Último lote");
  const waHref = (text) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

  // ------------------------------
  // Estado
  // ------------------------------
  let eventos = [];
  let evIndex = {};
  let backendOnline = false;

  // ------------------------------
  // Elementos
  // ------------------------------
  const lista = $("#lista-eventos");
  const inputBusca = $("#busca-eventos");
  const chipsRow = $("#filtro-cidades");
  const sheet = $("#sheet");
  const sheetBody = $("#sheet-body");
  const sheetBackdrop = $("#sheet-backdrop");
  const authTag = $("#auth-indicator");

  const loginModal = $("#login-modal");
  const loginSendBtn = $("#login-send");
  const loginCancel = $("#login-cancel");
  const loginPhone = $("#login-phone");
  const codeBlock = $("#code-block");
  const codeBack = $("#code-back");
  const codeVerify = $("#code-verify");
  const codeInput = $("#login-code");
  const loginHint = $("#login-hint");

  // ------------------------------
  // Header/Hero
  // ------------------------------
  function initHeader() {
    document.addEventListener("click", e => {
      const el = e.target.closest(".btn,.view");
      if (!el) return;
      el.style.transform = "translateY(0) scale(.98)";
      setTimeout(() => { el.style.transform = ""; }, 120);
    });
    const hero = $(".hero"); const header = $("header");
    const HIDE_START = 16, HIDE_END = 240; let ticking = false;
    function onScroll() {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        header && header.classList.toggle("is-scrolled", y > 8);
        const p = Math.min(1, Math.max(0, (y - HIDE_START) / (HIDE_END - HIDE_START)));
        if (hero) { hero.style.setProperty("--hero-p", p.toFixed(3)); hero.classList.toggle("is-hidden", p >= 1); }
        ticking = false;
      });
    }
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
  }

  // ------------------------------
  // Vitrine
  // ------------------------------
  function buildChips() {
    if (!chipsRow) return;
    chipsRow.innerHTML = "";
    const cities = Array.from(new Set(eventos.map(e => e.city).filter(Boolean)));
    const all = document.createElement("button");
    all.className = "chip"; all.type = "button"; all.textContent = "Todas";
    all.setAttribute("role", "tab"); all.setAttribute("aria-selected", "true");
    chipsRow.appendChild(all);
    cities.forEach(c => {
      const b = document.createElement("button");
      b.className = "chip"; b.type = "button"; b.textContent = c; b.dataset.city = c;
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", "false");
      chipsRow.appendChild(b);
    });
  }

  function renderCards(filterCity = "", q = "") {
    if (!lista) return;
    lista.innerHTML = "";
    const qn = (q || "").toLowerCase();
    const data = eventos.filter(ev => {
      const byCity = filterCity ? ev.city === filterCity : true;
      const byQ = qn ? (ev.title || "").toLowerCase().includes(qn) || (ev.description || "").toLowerCase().includes(qn) : true;
      return byCity && byQ;
    });

    if (!data.length) {
      const empty = document.createElement("div");
      empty.className = "std-card";
      empty.innerHTML = '<strong>Sem eventos publicados ainda.</strong><br><span class="subtle">Volte em breve — estamos preparando novidades ✨</span>';
      lista.appendChild(empty);
      return;
    }

    data.forEach(ev => {
      const statusLabel = normalizeStatusLabel(ev.statusLabel || ev.status || "");
      const statusKey = statusLabel === "Esgotado" ? "sold" : (statusLabel === "Último lote" ? "low" : "soon");
      const card = document.createElement("article");
      card.className = "card";
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-labelledby", `card-title-${ev.id}`);
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title" id="card-title-${ev.id}">${ev.title}</div>
            <div class="card-city">${ev.city || ""}</div>
            <div class="status-line status--${statusKey}"><span class="status-dot"></span> <span class="status-label">${statusLabel || "Em breve"}</span></div>
          </div>
          <button class="view" data-open="${ev.id}" type="button" aria-label="Ver detalhes de ${ev.title}">Ver detalhes</button>
        </div>
        <div class="card-media">${ev.image ? `<img src="${ev.image}" alt="Imagem do evento ${ev.title}" loading="lazy" decoding="async">` : "Ingresso"}</div>
      `;
      lista.appendChild(card);
    });
  }

  function buildStatusChip(statusLabel) {
    const key = statusLabel === "Esgotado" ? "sold" : (statusLabel === "Último lote" ? "low" : "soon");
    const lbl = statusLabel || "Em breve";
    return `<span class="status-chip ${key}"><span class="dot" aria-hidden="true"></span>${lbl}</span>`;
  }

  function openSheet(ev) {
    if (!sheet || !sheetBody) return;
    sheetBody.innerHTML = `
      <div class="sheet-head">
        <h3 id="sheet-title">${ev.title} — ${ev.city || ""}</h3>
        ${buildStatusChip(normalizeStatusLabel(ev.statusLabel || ev.status || ""))}
      </div>
      <div class="sheet-media">${ev.image ? `<img src="${ev.image}" alt="Imagem do evento ${ev.title}" loading="lazy" decoding="async">` : ""}</div>
      <div class="std-card">
        <p style="margin-top:0"><strong>Local:</strong> ${ev.venue || "-"}<br/>
        <strong>Quando:</strong> ${formatDate(ev.date)}<br/>
        ${Number.isFinite(+ev.price) ? `<strong>Preço:</strong> ${money(ev.price)}` : ""}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn btn--secondary btn--sm" id="buy-demo">Comprar (demo)</a>
        </div>
      </div>
    `;

    sheet.setAttribute("aria-hidden", "false");
    sheet.setAttribute("aria-labelledby", "sheet-title");
    sheetBackdrop?.setAttribute("aria-hidden", "false");
    sheet.classList.add("is-open");
    sheetBackdrop?.classList.add("is-open");

    const buyBtn = $("#buy-demo");
    on(buyBtn, "click", async () => {
      const to = prompt("Seu WhatsApp (DDI+DDD+NÚMERO):", "");
      if (!to) return;
      const qs = new URLSearchParams({ ev: ev.id, to, name: "Participante", qty: "1" }).toString();
      try {
        await tryFetch([`${BASE_WITH_API}/purchase/start?${qs}`], {});
        alert("🎟️ Ingresso enviado no seu WhatsApp!");
      } catch (e) {
        console.error(e);
        alert("Não consegui enviar agora. Você pode tentar pelo WhatsApp: " + waHref(`ingressai:start ev=${ev.id} qty=1 autopay=1 name=`));
      }
    });
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("is-open");
    sheetBackdrop?.classList.remove("is-open");
    sheet.removeAttribute("aria-labelledby");
    sheet.setAttribute("aria-hidden", "true");
    sheetBackdrop?.setAttribute("aria-hidden", "true");
  }

  // ------------------------------
  // Modal Login / OTP
  // ------------------------------
  function openLogin() {
    if (!loginModal) return;
    loginHint.textContent = "";
    codeBlock.style.display = "none";
    loginModal.classList.add("is-open");
    loginModal.setAttribute("aria-hidden", "false");
    loginPhone?.focus();
  }
  function closeLogin() {
    if (!loginModal) return;
    loginModal.classList.remove("is-open");
    loginModal.setAttribute("aria-hidden", "true");
  }

  // Delegations
  document.addEventListener("click", (e) => {
    // qualquer elemento com data-login abre o modal
    const trg = e.target.closest("[data-login]");
    if (trg) { e.preventDefault(); openLogin(); }
  });

  on(loginCancel, "click", closeLogin);
  on(codeBack, "click", () => { codeBlock.style.display = "none"; loginHint.textContent = ""; });

  on(loginSendBtn, "click", async () => {
    const phone = String(loginPhone.value || "").replace(/[^\d]/g, "");
    if (!/^\d{10,15}$/.test(phone)) { loginHint.textContent = "Número inválido. Use DDI+DDD+NÚMERO (ex.: 5534999999999)"; return; }
    try {
      loginHint.textContent = "Enviando código…";
      await fetchJson(`${BASE_WITH_API}/auth/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
        credentials: "include" // precisa cookie da API
      });
      loginHint.textContent = "Código enviado no seu WhatsApp. Digite abaixo para verificar.";
      codeBlock.style.display = "block";
      codeInput.focus();
      sessionStorage.setItem("ingr_phone", phone);
    } catch (e) {
      console.error(e);
      loginHint.textContent = "Falha ao enviar código (CORS ou indisponível).";
    }
  });

  on(codeVerify, "click", async () => {
    const phone = sessionStorage.getItem("ingr_phone") || "";
    const code = String(codeInput.value || "").trim();
    if (!/^\d{3,6}$/.test(code)) { loginHint.textContent = "Código inválido."; return; }
    try {
      loginHint.textContent = "Verificando…";
      await fetchJson(`${BASE_WITH_API}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
        credentials: "include"
      });
      loginHint.textContent = "Pronto! Você está autenticado.";
      const dashUrl = `${BASE_ROOT}/app/dashboard.html`;
      const dashFallback = `${BASE_ROOT}/app/`;
      // abre em nova aba; se bloquear, tenta fallback
      (window.open(dashUrl, "_blank", "noopener,noreferrer") ||
        window.open(dashFallback, "_blank", "noopener,noreferrer"));
      closeLogin();
    } catch (e) {
      console.error(e);
      loginHint.textContent = "Código inválido, expirado ou bloqueado por CORS.";
    }
  });

  // ------------------------------
  // Validador
  // ------------------------------
  on($("#val-check"), "click", async () => {
    const raw = String($("#val-code")?.value || "").trim();
    if (!raw) { $("#val-result").innerHTML = '<span class="invalid">Informe um código.</span>'; return; }
    const code = raw.replace(/^ingressai:ticket:/i, '');
    try {
      $("#val-result").textContent = "Checando…";
      const j = await fetchJson(`${BASE_WITH_API}/validator/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include"
      });
      $("#val-result").innerHTML = j.valid
        ? `<div class="valid">✅ Válido — Ticket #${j.ticketId} • Evento: ${j.eventId} • Nome: ${j.buyerName || "-"}</div>`
        : `<div class="invalid">❌ Inválido (${j.reason || "desconhecido"})</div>`;
    } catch (e) {
      console.error(e);
      $("#val-result").innerHTML = `<div class="invalid">❌ Erro na validação (CORS/Network)</div>`;
    }
  });

  // ------------------------------
  // Bindings gerais (sheet e filtros)
  // ------------------------------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close='sheet']")) { e.preventDefault(); closeSheet(); }
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) {
      const ev = evIndex[openBtn.dataset.open];
      if (ev) openSheet(ev);
    }
  });
  on(sheetBackdrop, "click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet?.classList?.contains("is-open")) closeSheet(); });

  // ------------------------------
  // INIT
  // ------------------------------
  async function boot() {
    try {
      initHeader();

      // hash #organizadores abre seção
      const sec = $("#organizadores");
      const cta = $("#cta-organizadores");
      function openOrganizadores() { if (sec) { sec.removeAttribute("hidden"); sec.setAttribute("tabindex", "-1"); sec.focus?.(); } }
      on(cta, "click", (e) => {
        if (cta.getAttribute("href")?.startsWith("#organizadores")) { e.preventDefault(); openOrganizadores(); }
      });
      if (location.hash === "#organizadores") openOrganizadores();

      // health
      try {
        const h = await fetchJson(`${BASE_WITH_API}/health`, {});
        backendOnline = !!h?.ok;
      } catch { backendOnline = false; }
      if (authTag) {
        authTag.textContent = backendOnline ? "online" : "offline";
        authTag.classList.toggle("off", !backendOnline);
        authTag.classList.toggle("on", !!backendOnline);
      }

      // eventos
      try {
        const r = await tryFetch(
          [`${BASE_WITH_API}/events`, `${BASE_ROOT}/events`],
          { headers: { Accept: "application/json" } }
        );
        const j = await r.json().catch(() => ({}));
        const arr = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
        eventos = arr.length ? arr : [{
          id: "demo-1",
          title: "Evento Demo IngressAI",
          city: "Uberaba-MG",
          venue: "Espaço Demo",
          date: new Date(Date.now() + 2 * 86400e3).toISOString(),
          price: 60,
          statusLabel: "Último lote",
          image: ""
        }];
      } catch (e) {
        console.warn(LOGP, "falha /events", e);
        eventos = [{
          id: "demo-1",
          title: "Evento Demo IngressAI",
          city: "Uberaba-MG",
          venue: "Espaço Demo",
          date: new Date(Date.now() + 2 * 86400e3).toISOString(),
          price: 60,
          statusLabel: "Último lote",
          image: ""
        }];
      }
      evIndex = Object.fromEntries(eventos.map(e => [String(e.id), e]));

      buildChips();
      renderCards();

      // filtros
      on(chipsRow, "click", e => {
        const b = e.target.closest("button.chip"); if (!b) return;
        chipsRow.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-selected", "false"));
        b.setAttribute("aria-selected", "true");
        renderCards(b.dataset.city || "", inputBusca?.value || "");
      });

      let debounce;
      on(inputBusca, "input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const active = chipsRow?.querySelector('.chip[aria-selected="true"]');
          renderCards(active?.dataset.city || "", inputBusca.value);
        }, 180);
      });

      window.__INGRESSAI_BOOTED__ = true;
      console.log(LOGP, "ready", { BASE_WITH_API, BASE_ROOT });
    } catch (err) {
      console.error(LOGP, "boot error", err);
      showCrashBanner(err);
    }
  }

  function showCrashBanner(err) {
    try {
      const b = document.createElement("div");
      b.style.cssText = "position:fixed;inset:auto 12px 12px 12px;z-index:9999;background:#fff3f3;border:1px solid #ffd8d8;border-radius:10px;padding:10px;font:14px/1.4 system-ui;color:#7a1d1d;box-shadow:0 6px 18px rgba(0,0,0,.12)";
      b.innerHTML = `<strong>Falha ao carregar a página</strong><br><code>${String(err && err.message || err)}</code>`;
      document.body.appendChild(b);
    } catch {}
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
