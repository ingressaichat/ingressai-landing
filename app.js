/* ====== CONFIG ====== */
const API =
  (typeof window !== "undefined" && window.INGRESSAI_API)
    ? String(window.INGRESSAI_API).replace(/\/+$/, "")
    : "https://ingressai-backend-production.up.railway.app/api";

const SUPPORT_WA = "5534999992747";

/* ====== HELPERS ====== */
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * safeFetch(url, opts, timeoutMs)
 * Por padrão mantém credentials:"omit".
 * Para rotas de auth (que precisam setar cookie cross-site), passe { credentials:"include" }.
 */
async function safeFetch(url, opts = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      mode: "cors",
      credentials: opts.credentials || "omit",
      cache: "no-store",
      ...opts,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText}${
          text ? ` — ${text.slice(0, 160)}` : ""
        }`
      );
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
  } finally {
    clearTimeout(id);
  }
}

function money(v) {
  try {
    return Number(v).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  } catch {
    return "R$ 0,00";
  }
}

function onlyDigits(v) {
  return String(v || "").replace(/\D+/g, "");
}

/* ====== NAV / HEADER ====== */
(function headerFX() {
  const header = document.querySelector("header");
  const onScroll = () => {
    if (window.scrollY > 12) header.classList.add("is-scrolled");
    else header.classList.remove("is-scrolled");
    document.documentElement.style.setProperty(
      "--hero-p",
      Math.min(1, window.scrollY / 320)
    );
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Links "login" viram modal (não navega)
  $$("[data-login]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openLoginModal();
    });
  });
})();

/* ====== HEALTH ====== */
async function updateHealth() {
  const el = $("#auth-indicator");
  if (!el) return false;

  const setState = (on, label) => {
    el.classList.toggle("on", !!on);
    el.classList.toggle("off", !on);
    el.textContent = label || (on ? "online" : "offline");
  };

  try {
    // tenta /api/health; se falhar, tenta /healthz na raiz do backend
    await safeFetch(`${API}/health`).catch(() =>
      safeFetch(`${API.replace(/\/api$/, "")}/healthz`)
    );
    setState(true, "online");
    $("#nav-val")?.removeAttribute("hidden");
    return true;
  } catch (err) {
    setState(false, "offline");
    console.warn("Health failed:", err?.message || err);
    return false;
  }
}

/* ====== VITRINE (EVENTOS) ====== */
async function loadEvents() {
  const wrap = $("#lista-eventos");
  const chips = $("#filtro-cidades");
  const search = $("#busca-eventos");
  if (!wrap || !chips || !search) return;

  wrap.innerHTML = `<div class="subtle">Carregando eventos…</div>`;

  let items = [];
  try {
    const r = await safeFetch(`${API}/events`);
    items = Array.isArray(r?.items) ? r.items : [];
  } catch (e) {
    console.warn("Falha /events:", e?.message || e);
  }

  if (!items.length) {
    // fallback demo
    items = [
      {
        id: "demo-1",
        title: "Sunset no Terraço",
        city: "Uberaba-MG",
        venue: "Terraço 21",
        date: new Date(Date.now() + 86400e3).toISOString(),
        price: 60,
        image: "",
      },
      {
        id: "demo-2",
        title: "Baile do Ingresso",
        city: "Uberlândia-MG",
        venue: "Arena UFU",
        date: new Date(Date.now() + 172800e3).toISOString(),
        price: 80,
        image: "",
      },
    ];
  }

  const cities = Array.from(new Set(items.map((i) => i.city).filter(Boolean))).sort();

  function render(list) {
    if (!list.length) {
      wrap.innerHTML = `<div class="subtle">Nenhum evento encontrado.</div>`;
      return;
    }
    wrap.innerHTML = "";
    list.forEach((ev) => {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">${ev.title}</div>
            <div class="card-city">${ev.city || ""}</div>
            <div class="status-line status--soon"><span class="status-dot"></span> Acontece em breve</div>
          </div>
          <button class="view" data-view="${ev.id}">Ver</button>
        </div>
        <div class="card-media">${ev.image ? `<img src="${ev.image}" alt="">` : "Ingresso"}</div>
      `;
      wrap.appendChild(card);
    });
  }

  // filtros
  chips.innerHTML = "";
  const all = document.createElement("button");
  all.className = "chip";
  all.role = "tab";
  all.textContent = "Todas";
  all.setAttribute("aria-selected", "true");
  chips.appendChild(all);

  cities.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.role = "tab";
    b.textContent = c;
    b.dataset.city = c;
    chips.appendChild(b);
  });

  let activeCity = "";
  let q = "";
  const apply = () => {
    let list = items.slice();
    if (activeCity) list = list.filter((i) => i.city === activeCity);
    if (q) list = list.filter((i) => (i.title || "").toLowerCase().includes(q));
    render(list);
  };

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    $$(".chip", chips).forEach((x) => x.setAttribute("aria-selected", "false"));
    btn.setAttribute("aria-selected", "true");
    activeCity = btn.dataset.city || "";
    apply();
  });

  search.addEventListener("input", () => {
    q = search.value.trim().toLowerCase();
    apply();
  });

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    const id = b.getAttribute("data-view");
    const ev = items.find((x) => String(x.id) === String(id));
    if (ev) openSheetForEvent(ev);
  });

  apply();
}

function openSheetForEvent(ev) {
  const backdrop = $("#sheet-backdrop");
  const sheet = $("#sheet");
  const body = $("#sheet-body");
  if (!backdrop || !sheet || !body) return;

  body.innerHTML = `
    <div class="sheet-head">
      <h3>${ev.title}</h3>
      <div class="status-chip soon"><span class="dot" style="background:#1B5FB3"></span>${ev.city || ""}</div>
    </div>
    <div class="sheet-media">${ev.image ? `<img src="${ev.image}" alt="">` : ""}</div>
    <div class="std-card">
      <p><strong>Local:</strong> ${ev.venue || "-"}<br/>
      <strong>Quando:</strong> ${new Date(ev.date || Date.now()).toLocaleString("pt-BR")}<br/>
      <strong>Preço:</strong> ${money(ev.price || 0)}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn--secondary btn--sm" id="buy-demo">Comprar (demo)</a>
        <a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://wa.me/${SUPPORT_WA}?text=Tenho%20d%C3%BAvidas%20sobre%20${encodeURIComponent(
          ev.title
        )}">Falar no WhatsApp</a>
      </div>
    </div>
  `;

  const close = () => {
    sheet.classList.remove("is-open");
    backdrop.classList.remove("is-open");
  };
  $("#sheet-close").onclick = close;
  backdrop.onclick = close;

  $("#buy-demo").onclick = async () => {
    try {
      const phone = prompt("Seu WhatsApp (DDI+DDD+NÚMERO):", "");
      if (!phone) return;
      const params = new URLSearchParams({
        ev: ev.id,
        to: onlyDigits(phone),
        name: "Participante",
        qty: "1",
      });
      const r = await safeFetch(`${API}/purchase/start?${params.toString()}`);
      alert("Ticket emitido! PDF: " + (r?.pdfUrl || "—"));
    } catch (e) {
      alert("Falha ao comprar: " + (e?.message || e));
    }
  };

  backdrop.classList.add("is-open");
  sheet.classList.add("is-open");
}

/* ====== ORGANIZADORES / CALCULADORA ====== */
function setupOrganizadores() {
  const std = $("#std-card");
  if (!std) return;

  std.innerHTML = `
    <h3>Como funciona</h3>
    <ul class="std-list">
      <li>Você cria o evento e define os lotes.</li>
      <li>Divulga o link/QR do WhatsApp.</li>
      <li>O bot vende, emite ingressos e envia por WhatsApp.</li>
      <li>Repasse imediato (Pix) e dashboard para acompanhar.</li>
    </ul>
  `;

  const models = [
    { id: "start", name: "Start", feePct: 12, feeFix: 0, desc: "Sem mensalidade. Repasse T+0." },
    { id: "pro",   name: "Pro",   feePct: 8,  feeFix: 1.5, desc: "Menor taxa + ferramentas PRO." },
    { id: "zero",  name: "Zero",  feePct: 0,  feeFix: 3.9, desc: "Repasse integral; taxa fixa." },
  ];

  const modelsBox = $("#org-models");
  if (!modelsBox) return;

  modelsBox.innerHTML = "";
  models.forEach((m) => {
    const b = document.createElement("button");
    b.className = "model";
    b.setAttribute("role", "tab");
    b.dataset.id = m.id;
    b.innerHTML = `<div><strong>${m.name}</strong><div class="subtle">${m.desc}</div></div>`;
    modelsBox.appendChild(b);
  });

  const feeRow = $("#fee-row");
  const feeChip = $("#fee-chip");
  const calc = $("#calc-box");
  const preco = $("#preco");
  const qtd = $("#qtd");
  const grossEl = $("#calc-gross");
  const netEl = $("#calc-net");
  const note = $("#calc-note");
  const quick = $("#org-quick");

  let fee = { pct: 0, fix: 0 };
  let selected = "";

  const enableCalc = (on) => {
    [preco, qtd].forEach((i) => i && (i.disabled = !on));
    if (quick) {
      quick.classList.toggle("is-disabled", !on);
      quick.setAttribute("aria-disabled", on ? "false" : "true");
    }
    if (calc) calc.dataset.fee = on ? "on" : "";
  };

  function calcValues() {
    const pv = Number(
      (preco?.value || "").replace(/[^\d,.-]/g, "").replace(",", ".")
    ) || 0;
    const qv = Math.max(1, Number(qtd?.value || "1"));
    const gross = pv * qv;
    const tax = gross * (fee.pct / 100) + fee.fix * qv;
    const net = Math.max(0, gross - tax);
    if (grossEl) grossEl.textContent = money(gross);
    if (netEl) netEl.textContent = money(net);
  }

  modelsBox.addEventListener("click", (e) => {
    const btn = e.target.closest(".model");
    if (!btn) return;
    selected = btn.dataset.id;
    $$(".model", modelsBox).forEach((x) => x.setAttribute("aria-selected", "false"));
    btn.setAttribute("aria-selected", "true");

    const m = models.find((x) => x.id === selected);
    fee = { pct: m.feePct, fix: m.feeFix };
    feeRow?.classList.add("is-visible");
    if (feeChip) feeChip.textContent = `Taxa: ${fee.pct}% ${fee.fix ? `+ ${money(fee.fix)} / ing.` : ""}`;
    if (note) note.textContent = `Plano ${m.name} selecionado. Informe preço e quantidade.`;
    enableCalc(true);
    calcValues();
  });

  [preco, qtd].forEach((i) => i && i.addEventListener("input", calcValues));

  $("#org-request")?.addEventListener("click", () => {
    const t = $("#f-title")?.value.trim();
    const city = $("#f-city")?.value.trim();
    const venue = $("#f-venue")?.value.trim();
    const date = $("#f-date")?.value.trim();
    const phone = onlyDigits($("#f-phone")?.value);

    const msg =
      `Quero criar evento na IngressAI:%0A%0A` +
      `Plano: ${selected || "-"}%0A` +
      `Evento: ${encodeURIComponent(t || "-")}%0A` +
      `Cidade: ${encodeURIComponent(city || "-")}%0A` +
      `Local: ${encodeURIComponent(venue || "-")}%0A` +
      `Data/hora: ${encodeURIComponent(date || "-")}%0A` +
      `Meu WhatsApp: ${phone || "-"}`;

    window.open(`https://wa.me/${SUPPORT_WA}?text=${msg}`, "_blank");
  });

  enableCalc(false);
}

/* ====== VALIDADOR ====== */
function setupValidator() {
  $("#val-check")?.addEventListener("click", async () => {
    const input = $("#val-code");
    const out = $("#val-result");
    if (!input || !out) return;

    out.textContent = "Checando…";
    let code = String(input.value || "").trim();
    code = code.replace(/^ingressai:ticket:/, "");
    if (!code) {
      out.textContent = "Informe um código.";
      return;
    }
    try {
      const r = await safeFetch(`${API}/validate?code=${encodeURIComponent(code)}`);
      if (r?.valid) {
        out.innerHTML = `<div class="valid">Válido! Ticket #${r.ticketId} • ${r.buyerName || ""}</div>`;
      } else {
        out.innerHTML = `<div class="invalid">Inválido (${r?.reason || "desconhecido"})</div>`;
      }
    } catch (e) {
      out.innerHTML = `<div class="invalid">Erro: ${e?.message || e}</div>`;
    }
  });
}

/* ====== LOGIN (OTP) ====== */
function openLoginModal() {
  const modal = $("#login-modal");
  const hint = $("#login-hint");
  const phoneEl = $("#login-phone");
  const codeBlock = $("#code-block");

  if (!modal || !hint || !phoneEl || !codeBlock) return;

  hint.textContent = "";
  codeBlock.style.display = "none";
  modal.classList.add("is-open");
  phoneEl.focus();

  $("#login-cancel").onclick = () => modal.classList.remove("is-open");
  $("#code-back").onclick = () => {
    codeBlock.style.display = "none";
    hint.textContent = "";
  };

  // Envia OTP (usa backend novo /api/auth/request)
  $("#login-send").onclick = async () => {
    const phone = onlyDigits(phoneEl.value);
    if (phone.length < 12) {
      hint.textContent = "Informe número com DDI+DDD+número.";
      return;
    }
    hint.textContent = "Enviando código…";
    try {
      await safeFetch(`${API}/auth/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
        credentials: "include", // importante: permite set-cookie cross-site
      });
      hint.textContent = "Código enviado por WhatsApp. Digite abaixo:";
      codeBlock.style.display = "block";
      $("#login-code").focus();
    } catch (e) {
      hint.textContent = "Erro: " + (e?.message || e);
    }
  };

  // Verifica OTP e garante salvar o cookie de sessão (SameSite=None; Secure)
  $("#code-verify").onclick = async () => {
    const code = onlyDigits($("#login-code").value);
    const phone = onlyDigits($("#login-phone").value);
    if (!code) {
      hint.textContent = "Digite o código recebido.";
      return;
    }
    hint.textContent = "Verificando…";
    try {
      const r = await safeFetch(`${API}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code }),
        credentials: "include", // IMPORTANTE: permite Set-Cookie cross-site
      });

      if (r && (r.ok || r.session || r.user)) {
        // checa sessão para confirmar que o cookie pegou
        await safeFetch(`${API}/auth/session`, { credentials: "include" }).catch(
          () => null
        );
        hint.textContent = "Verificado! Abrindo Dashboard…";
        await sleep(400);
        // redireciona ao domínio do backend (onde o cookie é 1st-party)
        window.location.href = `${API.replace(/\/api$/, "")}/app/dashboard.html`;
      } else {
        hint.textContent = "Código inválido.";
      }
    } catch (e) {
      hint.textContent = "Erro: " + (e?.message || e);
    }
  };
}

/* ====== SEÇÕES ====== */
function setupSections() {
  const orgBtn = $("#cta-organizadores");
  const orgSec = $("#organizadores");
  orgBtn?.addEventListener("click", () => {
    if (!orgSec) return;
    orgSec.hidden = false;
    orgSec.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* ====== BOOT ====== */
(async function boot() {
  await updateHealth();
  setupSections();
  setupOrganizadores();
  setupValidator();
  await loadEvents();
})();
