/* ====== CONFIG (robusta) ====== */
(function () {
  const qsApi = new URLSearchParams(location.search).get("api") || "";
  const PROD = "https://ingressai-backend-production.up.railway.app/api";
  function normalizeApi(raw) {
    let s = String(raw || "").trim();
    s = s.replace(/[.\s/]+$/g, "");           // remove pontinhos/barras finais
    if (!/\/api$/i.test(s)) s = s + "/api";   // garante /api
    s = s.replace(/([^:])\/{2,}/g, "$1/");    // colapsa barras duplas (sem quebrar https://)
    return s;
  }
  window.INGRESSAI_API = normalizeApi(qsApi || PROD);
})();

const API = String(window.INGRESSAI_API);
const SUPPORT_WA = "5534999992747";

/* ====== HELPERS ====== */
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function money(v){ try { return Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});} catch { return "R$ 0,00"; } }
function onlyDigits(v){ return String(v||"").replace(/\D+/g,""); }

/* evita duplo toque em botões no iOS */
function once(fn){ let lock=false; return async (...a)=>{ if(lock) return; lock=true; try{ await fn(...a);} finally{ setTimeout(()=>lock=false,350);} }; }

/* ====== NAV / HEADER ====== */
(function headerFX(){
  const header = document.querySelector("header");
  const onScroll = () => {
    if (window.scrollY > 12) header.classList.add("is-scrolled");
    else header.classList.remove("is-scrolled");
    document.documentElement.style.setProperty("--hero-p", Math.min(1, window.scrollY/320));
  };
  window.addEventListener("scroll", onScroll, { passive:true });
  onScroll();
  // todos que têm data-login abrem modal
  $$("[data-login]").forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); openLoginModal(); }));
})();

/* ====== HEALTH ====== */
async function updateHealth() {
  const el = $("#auth-indicator");
  const setState = (on, label) => {
    el.classList.toggle("on", !!on);
    el.classList.toggle("off", !on);
    el.textContent = label || (on ? "online" : "offline");
  };
  try {
    await fetch(`${API}/health`, { cache:"no-store", mode:"cors", credentials:"omit" })
      .then(r=>r.ok?r.json():Promise.reject(r.status));
    setState(true, "online");
    $("#nav-val")?.removeAttribute("hidden");
    return true;
  } catch (err) {
    setState(false, "offline");
    console.warn("Health failed:", err);
    return false;
  }
}

/* ====== VITRINE ====== */
async function loadEvents() {
  const wrap = $("#lista-eventos");
  const chips = $("#filtro-cidades");
  const search = $("#busca-eventos");
  wrap.innerHTML = `<div class="subtle">Carregando eventos…</div>`;
  let items = [];
  try {
    const r = await fetch(`${API}/events`, { cache:"no-store" }).then(x=>x.json());
    items = Array.isArray(r?.items) ? r.items : [];
  } catch (e) { console.warn("Falha /events:", e); }
  if (!items.length) {
    // demo de fallback
    items = [
      { id:"demo-1", title:"Sunset no Terraço", city:"Uberaba-MG", venue:"Terraço 21", date:new Date(Date.now()+86400e3).toISOString(), price:60, image:"" },
      { id:"demo-2", title:"Baile do Ingresso", city:"Uberlândia-MG", venue:"Arena UFU", date:new Date(Date.now()+172800e3).toISOString(), price:80, image:"" },
    ];
  }
  const cities = Array.from(new Set(items.map(i => i.city).filter(Boolean))).sort();

  function render(list){
    if (!list.length) { wrap.innerHTML = `<div class="subtle">Nenhum evento encontrado.</div>`; return; }
    wrap.innerHTML = "";
    list.forEach(ev => {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">${ev.title}</div>
            <div class="card-city">${ev.city || ""}</div>
            <div class="status-line status--soon"><span class="status-dot"></span> Acontece em breve</div>
          </div>
          <button class="view" data-view="${ev.id}" type="button">Ver</button>
        </div>
        <div class="card-media">${ev.image ? `<img src="${ev.image}" alt="">` : "Ingresso"}</div>
      `;
      wrap.appendChild(card);
    });
  }

  // chips de cidades
  chips.innerHTML = "";
  const all = document.createElement("button");
  all.className = "chip"; all.role = "tab"; all.textContent = "Todas"; all.setAttribute("aria-selected","true"); all.type="button";
  chips.appendChild(all);
  cities.forEach(c => { const b = document.createElement("button"); b.className="chip"; b.role="tab"; b.textContent=c; b.dataset.city=c; b.type="button"; chips.appendChild(b); });

  let activeCity = ""; let q = "";
  const apply = () => {
    let list = items.slice();
    if (activeCity) list = list.filter(i=>i.city===activeCity);
    if (q) list = list.filter(i=>(i.title||"").toLowerCase().includes(q));
    render(list);
  };

  chips.addEventListener("click",(e)=>{ const btn=e.target.closest(".chip"); if(!btn) return;
    $$(".chip",chips).forEach(x=>x.setAttribute("aria-selected","false"));
    btn.setAttribute("aria-selected","true"); activeCity=btn.dataset.city||""; apply();
  }, { passive:true });

  search.addEventListener("input",()=>{ q=search.value.trim().toLowerCase(); apply(); }, { passive:true });

  wrap.addEventListener("click",(e)=>{ const b=e.target.closest("[data-view]"); if(!b) return;
    const id=b.getAttribute("data-view"); const ev=items.find(x=>String(x.id)===String(id));
    if(ev) openSheetForEvent(ev);
  });

  apply();
}

function openSheetForEvent(ev){
  const backdrop = $("#sheet-backdrop");
  const sheet = $("#sheet");
  const body = $("#sheet-body");
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
        <a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://wa.me/${SUPPORT_WA}?text=Tenho%20d%C3%BAvidas%20sobre%20${encodeURIComponent(ev.title)}">Falar no WhatsApp</a>
      </div>
    </div>
  `;
  const close = () => { sheet.classList.remove("is-open"); backdrop.classList.remove("is-open"); };
  $("#sheet-close").onclick = close; backdrop.onclick = close;

  $("#buy-demo").onclick = once(async () => {
    try {
      const phone = prompt("Seu WhatsApp (DDI+DDD+NÚMERO):", ""); if (!phone) return;
      const params = new URLSearchParams({ ev: ev.id, to: onlyDigits(phone), name: "Participante", qty: "1" });
      const r = await fetch(`${API}/purchase/start?${params.toString()}`).then(x=>x.json());
      alert("Ticket emitido! PDF: " + (r?.pdfUrl || "—"));
    } catch (e) { alert("Falha ao comprar: " + (e?.message || e)); }
  });

  backdrop.classList.add("is-open"); sheet.classList.add("is-open");
}

/* ====== ORGANIZADORES ====== */
function setupOrganizadores(){
  // Texto “Como funciona”
  const std = $("#std-card");
  std.innerHTML = `
    <h3>Como funciona</h3>
    <ul class="std-list">
      <li>Você cria o evento e define os lotes.</li>
      <li>Divulga o link/QR do WhatsApp.</li>
      <li>O bot vende, emite ingressos e envia por WhatsApp.</li>
      <li>Repasse imediato (Pix) e dashboard para acompanhar.</li>
    </ul>
  `;

  // Estado da taxa selecionada
  const taxBox = $("#tax-selector");
  let plan = "atl"; // atl (8% + 1,50) | prod (10% + 2)
  let fee = { pct: 8, fix: 1.5 };

  const calc=$("#calc-box");
  const preco=$("#preco"); const qtd=$("#qtd");
  const grossEl=$("#calc-gross"); const netEl=$("#calc-net"); const note=$("#calc-note");

  // Ativação/desativação inicial
  function enableCalc(on){
    [preco,qtd].forEach(i=>i.disabled=!on);
    calc.dataset.fee = on ? "on" : "";
  }
  enableCalc(false);

  // Seleção de taxa (chips)
  taxBox.addEventListener("click",(e)=>{
    const btn = e.target.closest(".chip"); if(!btn) return;
    $$(".chip", taxBox).forEach(x=>x.setAttribute("aria-selected","false"));
    btn.setAttribute("aria-selected","true");
    plan = btn.dataset.plan || "atl";
    fee = plan === "prod" ? { pct: 10, fix: 2 } : { pct: 8, fix: 1.5 };
    note.textContent = `Taxa aplicada: ${fee.pct}% + ${money(fee.fix)} por ingresso.`;
    enableCalc(true);
    calculate();
  }, { passive:true });

  // Cálculo
  function parsePrice(raw){
    // aceita "60", "60,00", "R$ 60,00"
    const s = String(raw||"").replace(/[^\d,.-]/g,"").replace(",",".");
    const n = Number(s);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  function calculate(){
    const pv=parsePrice(preco.value);
    const qv=Math.max(1, Number(qtd.value||"1"));
    const gross=pv*qv;
    const tax=(gross*(fee.pct/100))+(fee.fix*qv);
    const net=Math.max(0, gross-tax);
    grossEl.textContent=money(gross);
    netEl.textContent=money(net);
  }
  [preco,qtd].forEach(i=>i.addEventListener("input", calculate, { passive:true }));

  // Solicitar criação (POST /api/org/apply)
  $("#org-request").onclick = once(async ()=>{
    const payload = {
      plan,
      price: parsePrice(preco.value),
      qty: Math.max(1, Number($("#qtd").value || "1")),
      phone: onlyDigits($("#f-phone").value),
      pixKey: $("#f-pix").value.trim(),
      eventName: $("#f-title").value.trim(),
      city: $("#f-city").value.trim(),
      venue: $("#f-venue").value.trim(),
      date: $("#f-date").value.trim()
    };
    if (!payload.phone || payload.phone.length < 12) {
      alert("Informe seu WhatsApp com DDI+DDD+número.");
      $("#f-phone").focus();
      return;
    }
    try{
      const res = await fetch(`${API}/org/apply`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      }).then(r=>r.json());

      if (res?.ok) {
        alert("Solicitação enviada! Você receberá uma confirmação no WhatsApp.");
      } else {
        throw new Error(res?.error || "Falha ao enviar solicitação.");
      }
    }catch(e){
      alert("Erro: " + (e?.message || e));
    }
  });
}

/* ====== VALIDADOR ====== */
function setupValidator(){
  $("#val-check").onclick = once(async () => {
    const input=$("#val-code"); const out=$("#val-result");
    out.textContent="Checando…";
    let code=String(input.value||"").trim().replace(/^ingressai:ticket:/,"");
    if(!code){ out.textContent="Informe um código."; return; }
    try{
      const r = await fetch(`${API}/validator/check`,{
        method:"POST",
        headers:{ "Content-Type":"application/json", "Accept":"application/json" },
        credentials:"include",
        body:JSON.stringify({ code })
      }).then(res=>res.json());
      if(r?.valid) out.innerHTML=`<div class="valid">Válido! Ticket #${r.ticketId} • ${r.buyerName||""}</div>`;
      else out.innerHTML=`<div class="invalid">Inválido (${r?.reason||"desconhecido"})</div>`;
    }catch(e){
      out.innerHTML=`<div class="invalid">Erro: ${e?.message||e}</div>`;
    }
  });
}

/* ====== LOGIN (OTP) ====== */
function openLoginModal(){
  const modal=$("#login-modal");
  const hint=$("#login-hint");
  const phoneEl=$("#login-phone");
  const codeBlock=$("#code-block");
  hint.textContent=""; codeBlock.style.display="none"; modal.classList.add("is-open"); phoneEl.focus();

  $("#login-cancel").onclick=()=>modal.classList.remove("is-open");
  $("#code-back").onclick=()=>{ codeBlock.style.display="none"; hint.textContent=""; };

  $("#login-send").onclick=once(async ()=>{
    const phone=onlyDigits(phoneEl.value);
    if(phone.length<12){ hint.textContent="Informe número com DDI+DDD+número."; return; }
    hint.textContent="Enviando código…";
    try{
      await fetch(`${API}/auth/request`,{
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({ phone }),
        credentials:"include"
      });
      hint.textContent="Código enviado por WhatsApp. Digite abaixo:";
      codeBlock.style.display="block";
      $("#login-code").focus();
    }catch(e){ hint.textContent="Erro: "+(e?.message||e); }
  });

  $("#code-verify").onclick=once(async ()=>{
    const code=onlyDigits($("#login-code").value);
    const phone=onlyDigits($("#login-phone").value);
    if(!code){ hint.textContent="Digite o código recebido."; return; }
    hint.textContent="Verificando…";
    try{
      const r = await fetch(`${API}/auth/verify`,{
        method:"POST",
        headers:{ "content-type":"application/json" },
        body:JSON.stringify({ phone, code }),
        credentials:"include"
      }).then(x=>x.json());
      if(r && r.ok){
        // garante cookie
        await fetch(`${API}/auth/session`, { credentials:"include" }).catch(()=>null);
        hint.textContent="Verificado! Abrindo Dashboard…";
        await sleep(400);
        window.location.href = `${API.replace(/\/api$/,"")}/app/dashboard.html`;
      }else{
        hint.textContent="Código inválido.";
      }
    }catch(e){ hint.textContent="Erro: "+(e?.message||e); }
  });
}

/* ====== SEÇÕES & BOOT ====== */
function setupSections(){
  const orgBtn=$("#cta-organizadores");
  const orgSec=$("#organizadores");
  orgBtn.addEventListener("click", ()=>{ orgSec.hidden=false; orgSec.scrollIntoView({behavior:"smooth", block:"start"}); });
  // se o hash abrir direto (#organizadores), garante visível sem JS bloqueando
  if (location.hash === "#organizadores") orgSec.hidden = false;
}

(async function boot(){
  await updateHealth();
  setupSections();
  setupOrganizadores();
  setupValidator();
  await loadEvents();
})();
