/* IngressAI Landing — app.js (root do repo)
   - Lê API de ?api= ou meta[name="ingressai-api"]
   - Normaliza para terminar em /api
   - Deriva ORIGIN do backend (sem /api) para abrir páginas do backend (/app/*)
   - Carrega cidades e eventos
   - Healthcheck + diagnósticos
   - Form de solicitação de criação de evento
*/

(() => {
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
  const S = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  // --- Config API
  function normalizeApi(raw) {
    let s = String(raw || "").trim();
    if (!s) return "";
    s = s.replace(/[.\s/]+$/g, "");
    if (!/\/api$/i.test(s)) s += "/api";
    s = s.replace(/([^:])\/{2,}/g, "$1/");
    return s;
  }

  const qsApi = new URLSearchParams(location.search).get("api") || "";
  const metaApi = $('meta[name="ingressai-api"]')?.content || "";
  const API = normalizeApi(qsApi || metaApi || "");
  const ORIGIN = API ? API.replace(/\/api$/i, "") : "";
  window.INGRESSAI_API = API; // expõe para debugging

  // --- UI refs
  const elAuth = $("#auth-indicator");
  const elEvents = $("#lista-eventos");
  const elCities = $("#filtro-cidades");
  const elSearch = $("#busca-eventos");
  const elOrgSection = $("#organizadores");
  const elStdCard = $("#std-card");
  const elErrOverlay = $("#err-overlay");
  const elErrPre = $("#err-pre");

  const dApi = $("#d-api");
  const dHealth = $("#d-health");
  const dEv = $("#d-ev");
  const dEv2 = $("#d-ev2");

  // Nav actions
  $("#nav-org")?.addEventListener("click", (e) => {
    e.preventDefault();
    elOrgSection?.removeAttribute("hidden");
    document.getElementById("organizadores").scrollIntoView({ behavior: "smooth" });
  });

  // Entrar → abre login que vive no backend
  $("#nav-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!ORIGIN) return alert("API não configurada. Use ?api= ou a meta tag.");
    window.open(`${ORIGIN}/app/login.html`, "_blank", "noopener,noreferrer");
  });

  // Conteúdo estático (pode vir do backend futuramente)
  elStdCard.innerHTML = `
    <h3 style="margin-top:0">Como funciona</h3>
    <ul class="std-list">
      <li>Você cria o evento pelo bot (WhatsApp) e aprova.</li>
      <li>A venda rola 100% no WhatsApp via Pix, com repasse imediato.</li>
      <li>Os ingressos têm QR Code antifraude e você valida no Dashboard.</li>
    </ul>
  `;

  // --- State
  const state = {
    events: [],
    cities: [],
    city: "todas",
    search: ""
  };

  // --- Helpers
  function setOnline(isOn) {
    if (isOn) {
      elAuth.textContent = "online";
      elAuth.classList.remove("off");
      elAuth.classList.add("on");
    } else {
      elAuth.textContent = "offline";
      elAuth.classList.remove("on");
      elAuth.classList.add("off");
    }
  }

  function cardStatus(e) {
    // Heurística simples: tickets_left
    const left = Number(e?.tickets_left ?? 0);
    if (left <= 0) return { cls: "status--sold", txt: "esgotado" };
    if (left <= Math.max(5, Math.round((e.capacity || 100) * 0.1))) return { cls: "status--low", txt: "últimos" };
    return { cls: "status--soon", txt: "disponível" };
  }

  function drawEvents() {
    const q = state.search.trim().toLowerCase();
    const city = state.city;

    const list = state.events.filter(ev => {
      const byCity = city === "todas" || String(ev.city || "").toLowerCase() === city;
      const text = `${ev.title || ""} ${ev.city || ""} ${ev.venue || ""}`.toLowerCase();
      const bySearch = !q || text.includes(q);
      return byCity && bySearch;
    });

    elEvents.innerHTML = list.map(ev => {
      const st = cardStatus(ev);
      const cover = ev.cover || "";
      const dt = ev.date ? new Date(ev.date) : null;
      const when = dt ? dt.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "";

      const price = ev.price_min != null ? S().format(ev.price_min/100) : (ev.price != null ? S().format(ev.price/100) : "");
      const city = ev.city || "—";
      const url = ev.whatsapp_url || ev.url || (ORIGIN ? `${ORIGIN}/app/login.html` : "#");

      return `
      <article class="card" aria-label="${ev.title || "Evento"}">
        <div class="card-header">
          <div>
            <div class="card-title">${ev.title || "Evento"}</div>
            <div class="card-city">${city}${when ? " · " + when : ""}</div>
            <div class="status-line ${st.cls}">
              <span class="status-dot" aria-hidden="true"></span>
              <span>${st.txt}${price ? " · " + price : ""}</span>
            </div>
          </div>
          <a class="btn btn--sm btn--ghost" href="${url}" target="_blank" rel="noopener noreferrer">Abrir</a>
        </div>
        <div class="card-media">
          ${cover ? `<img src="${cover}" alt="" loading="lazy" />` : "IngressAI"}
        </div>
      </article>`;
    }).join("");

    dEv.textContent = String(state.events.length || "0");
    dEv2.textContent = String(list.length || "0");
    $("#calc-gross").textContent = S().format(sumGross(state.events)/100);
    $("#calc-net").textContent = S().format(sumNet(state.events)/100);
  }

  function drawCities() {
    const chips = ["todas", ...state.cities];
    elCities.innerHTML = chips.map((c, i) => {
      const sel = (i === 0 && state.city === "todas") || state.city === c;
      return `<button class="chip" role="tab" aria-selected="${sel}" data-city="${c.toLowerCase()}">${c}</button>`;
    }).join("");

    $$(".chip", elCities).forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".chip[aria-selected='true']", elCities).forEach(b => b.setAttribute("aria-selected","false"));
        btn.setAttribute("aria-selected","true");
        state.city = btn.dataset.city;
        drawEvents();
      });
    });
  }

  function sumGross(arr) {
    // soma simples (price_min ou price) para demo
    return arr.reduce((acc, e) => acc + (Number(e.price_min ?? e.price ?? 0)), 0);
  }
  function sumNet(arr) {
    // aplica desconto de taxa fictícia por categoria para demo
    const cat = (document.querySelector("input[name='org-cat']:checked")?.value) || "promotor";
    const gross = sumGross(arr);
    const fee = cat === "casa" ? 0.035 : 0.05; // exemplo
    return Math.max(0, Math.round(gross * (1 - fee)));
  }

  // Interação calculadora
  $$("input[name='org-cat']").forEach(r => r.addEventListener("change", () => drawEvents()));

  // Busca
  elSearch?.addEventListener("input", (e) => {
    state.search = e.target.value || "";
    drawEvents();
  });

  // Solicitação de criação
  $("#req-send")?.addEventListener("click", async () => {
    if (!API) return alert("API não configurada. Use ?api= ou a meta tag.");
    const hint = $("#req-hint");
    hint.textContent = "Enviando…";
    const body = {
      phone: ($("#req-phone")?.value || "").trim(),
      title: ($("#req-title")?.value || "").trim(),
      city: ($("#req-city")?.value || "").trim(),
      venue: ($("#req-venue")?.value || "").trim(),
      date: ($("#req-date")?.value || "").trim()
    };
    try {
      const r = await fetch(`${API}/organizers/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const ok = r.ok;
      const data = await r.json().catch(() => ({}));
      hint.textContent = ok ? "Solicitação enviada! Você receberá um retorno no WhatsApp." : (data?.error || "Falha ao enviar.");
    } catch (err) {
      hint.textContent = "Erro de rede.";
      console.error(err);
    }
  });

  // --- Boot
  async function boot() {
    try {
      dApi.textContent = API || "não definido";
      if (!API) setOnline(false);

      // health
      if (API) {
        try {
          const h = await fetch(`${API}/health`, { cache: "no-store" });
          const ok = h.ok;
          setOnline(ok);
          dHealth.textContent = ok ? "ok" : "erro";
        } catch {
          setOnline(false);
          dHealth.textContent = "erro";
        }
      }

      // cidades
      try {
        const r = await fetch(`${API}/cities`);
        const data = await r.json();
        const raw = Array.isArray(data) ? data : (data?.cities || []);
        state.cities = raw.map(c => String(c).trim()).filter(Boolean);
        drawCities();
      } catch (e) {
        state.cities = [];
        drawCities();
      }

      // eventos
      try {
        const r = await fetch(`${API}/events`);
        const data = await r.json();
        state.events = Array.isArray(data) ? data : (data?.events || []);
      } catch (e) {
        state.events = [];
      }
      drawEvents();

      // “Organizadores” via âncora
      if (location.hash === "#organizadores") {
        elOrgSection?.removeAttribute("hidden");
      }

    } catch (err) {
      console.error(err);
      elErrPre.textContent = String(err && err.stack || err);
      elErrOverlay.removeAttribute("hidden");
    }
  }

  // Header scrolled
  const header = document.querySelector("header");
  function onScroll() {
    const y = window.scrollY || 0;
    header.classList.toggle("is-scrolled", y > 4);
    document.documentElement.style.setProperty("--hero-p", Math.min(1, y/140));
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  boot();
})();

