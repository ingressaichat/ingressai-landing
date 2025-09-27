// IngressAI landing – app.js (robusto, tolerante a rotas ausentes)
console.log("[IngressAI] app.js boot");

const API = String(window.INGRESSAI_API || (location.origin + "/api")).replace(/\/$/, "");
const BASE_ROOT = API.replace(/\/api$/,"");
const SUPPORT_WA = "5534999992747";

// ===== utils =====
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const money = (v)=> {
  try { return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
  catch { return "R$ 0,00"; }
};
const onlyDigits = v => String(v||"").replace(/\D+/g,"");
const waHref = (text)=> `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(text)}`;
const BRL = new Intl.NumberFormat("pt-BR",{ style:"currency", currency:"BRL" });

async function fetchJson(url, opts) {
  const res = await fetch(url, { headers:{ "Accept":"application/json", ...(opts?.headers||{}) }, ...opts });
  let j=null; try{ j=await res.json(); }catch{}
  if(!res.ok) throw new Error(j?.error || res.statusText || "Request failed");
  return j;
}
async function tryFetch(urls, opts){ for(const u of urls){ try{ const r=await fetch(u,opts); if(r.ok) return r; }catch{} } throw new Error("All endpoints failed"); }

// ===== header fx =====
(function headerFX(){
  const header = document.querySelector("header");
  const onScroll = () => {
    header?.classList.toggle("is-scrolled", (window.scrollY||0) > 8);
    document.documentElement.style.setProperty("--hero-p", Math.min(1,(window.scrollY||0)/320));
  };
  window.addEventListener("scroll", onScroll, { passive:true });
  onScroll();
  $$("[data-login]").forEach(a => a.addEventListener("click",(e)=>{ e.preventDefault(); openLoginModal(); }));
})();

// ===== health =====
async function updateHealth(){
  const el = $("#auth-indicator");
  const navVal = $("#nav-val");
  try{
    await fetch(`${API}/health`, { cache:"no-store", credentials:"omit" });
    el.textContent="online"; el.classList.add("on"); el.classList.remove("off");
    navVal?.removeAttribute("hidden");
    return true;
  }catch{
    el.textContent="offline"; el.classList.add("off"); el.classList.remove("on");
    return false;
  }
}

// ===== vitrine =====
async function loadEvents(){
  const wrap = $("#lista-eventos");
  const chips = $("#filtro-cidades");
  const search = $("#busca-eventos");
  wrap.innerHTML = `<div class="subtle">Carregando eventos…</div>`;

  let items = [];
  try{
    const r = await fetch(`${API}/events`, { cache:"no-store" });
    if (r.ok) {
      const j = await r.json().catch(()=>null);
      items = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
    }
  }catch{}
  if (!items.length){
    // fallback demo (mantém landing funcional mesmo sem /api/events)
    items = [
      { id:"demo-1", title:"Sunset no Terraço", city:"Uberaba-MG", venue:"Terraço 21", date:new Date(Date.now()+86400e3).toISOString(), price:60, image:"" },
      { id:"demo-2", title:"Baile do Ingresso", city:"Uberlândia-MG", venue:"Arena UFU", date:new Date(Date.now()+172800e3).toISOString(), price:80, image:"" },
    ];
  }
  const cities = Array.from(new Set(items.map(i=>i.city).filter(Boolean))).sort();

  function render(list){
    if(!list.length){ wrap.innerHTML = `<div class="subtle">Nenhum evento encontrado.</div>`; return; }
    wrap.innerHTML = "";
    list.forEach(ev=>{
      const el = document.createElement("article");
      el.className="card";
      el.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">${ev.title}</div>
            <div class="card-city">${ev.city||""}</div>
            <div class="status-line status--soon"><span class="status-dot"></span> Acontece em breve</div>
          </div>
          <button class="view" data-view="${ev.id}" type="button">Ver</button>
        </div>
        <div class="card-media">${ev.image?`<img src="${ev.image}" alt="">`:"Ingresso"}</div>
      `;
      wrap.appendChild(el);
    });
  }

  // chips de cidades
  chips.innerHTML = "";
  const all = document.createElement("button");
  all.className="chip"; all.role="tab"; all.textContent="Todas"; all.setAttribute("aria-selected","true"); all.type="button";
  chips.appendChild(all);
  cities.forEach(c => {
    const b=document.createElement("button"); b.className="chip"; b.role="tab"; b.textContent=c; b.dataset.city=c; b.type="button"; chips.appendChild(b);
  });

  let activeCity=""; let q="";
  const apply=()=>{
    let list = items.slice();
    if(activeCity) list = list.filter(i=>i.city===activeCity);
    if(q) list = list.filter(i=>(i.title||"").toLowerCase().includes(q));
    render(list);
  };
  chips.addEventListener("click",(e)=>{
    const btn=e.target.closest(".chip"); if(!btn) return;
    $$(".chip",chips).forEach(x=>x.setAttribute("aria-selected","false"));
    btn.setAttribute("aria-selected","true");
    activeCity = btn.dataset.city || "";
    apply();
  }, { passive:true });

  search.addEventListener("input",()=>{ q=search.value.trim().toLowerCase(); apply(); }, { passive:true });

  wrap.addEventListener("click",(e)=>{
    const b=e.target.closest("[data-view]"); if(!b) return;
    const id=b.getAttribute("data-view"); const ev=items.find(x=>String(x.id)===String(id));
    if(ev) openSheetForEvent(ev);
  });

  apply();
}

function openSheetForEvent(ev){
  const backdrop=$("#sheet-backdrop");
  const sheet=$("#sheet");
  const body=$("#sheet-body");
  body.innerHTML = `
    <div class="sheet-head">
      <h3>${ev.title}</h3>
      <div class="status-chip soon"><span class="dot" style="background:#1B5FB3"></span>${ev.city||""}</div>
    </div>
    <div class="sheet-media">${ev.image?`<img src="${ev.image}" alt="">`:""}</div>
    <div class="std-card">
      <p><strong>Local:</strong> ${ev.venue||"-"}<br/>
      <strong>Quando:</strong> ${new Date(ev.date||Date.now()).toLocaleString("pt-BR")}<br/>
      <strong>Preço:</strong> ${money(ev.price||0)}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn--secondary btn--sm" id="buy-demo">Comprar (demo)</a>
        <a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="${waHref(`Tenho dúvidas sobre ${ev.title}`)}">Falar no WhatsApp</a>
      </div>
    </div>
  `;
  const close = ()=>{ sheet.classList.remove("is-open"); backdrop.classList.remove("is-open"); };
  $("#sheet-close").onclick = close; backdrop.onclick = close;

  $("#buy-demo").onclick = async ()=>{
    // fluxo demo: se /api/purchase/start não existir, apenas alerta
    const phone = prompt("Seu WhatsApp (DDI+DDD+NÚMERO):",""); if(!phone) return;
    try{
      const params = new URLSearchParams({ ev: ev.id, to: onlyDigits(phone), name:"Participante", qty:"1" });
      const res = await tryFetch([
        `${API}/purchase/start?${params}`,
        `${BASE_ROOT}/purchase/start?${params}`
      ], { method:"GET" });
      let j=null; try{ j=await res.json(); }catch{}
      alert("Ticket emitido! PDF: " + (j?.pdfUrl || "—"));
    }catch{
      alert("Fluxo de compra indisponível agora. Tente pelo WhatsApp: " + waHref(`ingressai:start ev=${ev.id} qty=1 autopay=1`));
    }
  };

  backdrop.classList.add("is-open");
  sheet.classList.add("is-open");
}

// ===== organizadores (calculadora e request via WhatsApp) =====
function setupOrganizadores(){
  const std=$("#std-card");
  std.innerHTML = `
    <h3>Como funciona</h3>
    <ul class="std-list">
      <li>Você cria o evento e define os lotes.</li>
      <li>Divulga o link/QR do WhatsApp.</li>
      <li>O bot vende, emite ingressos e envia por WhatsApp.</li>
      <li>Repasse imediato (Pix) e dashboard para acompanhar.</li>
    </ul>
  `;

  const taxBox=$("#tax-selector");
  let plan="atl"; let fee={ pct:8, fix:1.5 };

  const calc=$("#calc-box");
  const preco=$("#preco"); const qtd=$("#qtd");
  const grossEl=$("#calc-gross"); const netEl=$("#calc-net"); const note=$("#calc-note");

  const enableCalc=(on)=>{ [preco,qtd].forEach(i=>i.disabled=!on); calc.dataset.fee = on ? "on" : ""; };
  enableCalc(false);

  taxBox.addEventListener("click",(e)=>{
    const btn=e.target.closest(".chip"); if(!btn) return;
    $$(".chip",taxBox).forEach(x=>x.setAttribute("aria-selected","false"));
    btn.setAttribute("aria-selected","true");
    plan = btn.dataset.plan || "atl";
    fee  = plan==="prod" ? { pct:10, fix:2 } : { pct:8, fix:1.5 };
    note.textContent = `Taxa aplicada: ${fee.pct}% + ${money(fee.fix)} por ingresso.`;
    enableCalc(true); calculate();
  }, { passive:true });

  function parsePrice(raw){ const s=String(raw||"").replace(/[^\d,.-]/g,"").replace(",","."); const n=Number(s); return Number.isFinite(n)?Math.max(0,n):0; }
  function calculate(){
    const pv=parsePrice(preco.value); const qv=Math.max(1, Number(qtd.value||"1"));
    const gross=pv*qv; const tax=(gross*(fee.pct/100))+(fee.fix*qv); const net=Math.max(0, gross-tax);
    grossEl.textContent=money(gross); netEl.textContent=money(net);
  }
  [preco,qtd].forEach(i=>i.addEventListener("input", calculate, { passive:true }));

  $("#org-request").onclick = ()=>{
    const payload = {
      plan, price: parsePrice(preco.value), qty: Math.max(1, Number($("#qtd").value||"1")),
      phone: onlyDigits($("#f-phone").value), pixKey: $("#f-pix").value.trim(),
      eventName: $("#f-title").value.trim(), city: $("#f-city").value.trim(),
      venue: $("#f-venue").value.trim(), date: $("#f-date").value.trim()
    };
    const msg = [
      "Quero solicitar criação de evento:",
      `• Plano: ${plan==="prod"?"10%+R$2,00":"8%+R$1,50"}`,
      `• Preço: ${money(payload.price)} • Qtd: ${payload.qty}`,
      `• Nome: ${payload.eventName||"—"}`,
      `• Cidade: ${payload.city||"—"}`,
      `• Local: ${payload.venue||"—"}`,
      `• Data/hora: ${payload.date||"—"}`,
      `• Meu WhatsApp: ${payload.phone||"—"}`,
      `• Pix: ${payload.pixKey||"—"}`
    ].join("\n");
    location.href = waHref(msg);
  };
}

// ===== validador (tolerante a ausência do endpoint) =====
function setupValidator(){
  $("#val-check").onclick = async ()=>{
    const input=$("#val-code"); const out=$("#val-result");
    out.textContent="Checando…";
    let code=String(input.value||"").trim().replace(/^ingressai:ticket:/,"");
    if(!code){ out.textContent="Informe um código."; return; }
    try{
      const r = await fetch(`${API}/validator/check`,{
        method:"POST",
        headers:{ "Content-Type":"application/json","Accept":"application/json" },
        credentials:"include",
        body:JSON.stringify({ code })
      });
      if(!r.ok){ out.innerHTML=`<div class="invalid">Endpoint indisponível no momento.</div>`; return; }
      const j = await r.json();
      if(j?.valid) out.innerHTML=`<div class="valid">Válido! Ticket #${j.ticketId} • ${j.buyerName||""}</div>`;
      else out.innerHTML=`<div class="invalid">Inválido (${j?.reason||"desconhecido"})</div>`;
    }catch{ out.innerHTML=`<div class="invalid">Erro de rede/CORS</div>`; }
  };
}

// ===== login (OTP) =====
function openLoginModal(){
  const modal=$("#login-modal");
  const hint=$("#login-hint");
  const phoneEl=$("#login-phone");
  const codeBlock=$("#code-block");
  hint.textContent=""; codeBlock.style.display="none";
  modal.classList.add("is-open"); modal.setAttribute("aria-hidden","false"); phoneEl.focus();

  $("#login-cancel").onclick=()=>{ modal.classList.remove("is-open"); modal.setAttribute("aria-hidden","true"); };
  $("#code-back").onclick=()=>{ codeBlock.style.display="none"; hint.textContent=""; };

  $("#login-send").onclick=async ()=>{
    const phone=onlyDigits(phoneEl.value);
    if(phone.length<10){ hint.textContent="Informe número com DDI+DDD+número."; return; }
    hint.textContent="Enviando código…";
    try{
      const r = await fetch(`${API}/auth/request`,{
        method:"POST", headers:{ "content-type":"application/json" },
        body:JSON.stringify({ phone }), credentials:"include"
      });
      if(!r.ok){ throw new Error("request_fail"); }
      hint.textContent="Código enviado por WhatsApp. Digite abaixo:";
      codeBlock.style.display="block";
      $("#login-code").focus();
    }catch(e){ hint.textContent="Erro ao enviar código (CORS/indisponível)"; }
  };

  $("#code-verify").onclick=async ()=>{
    const code=onlyDigits($("#login-code").value);
    const phone=onlyDigits($("#login-phone").value);
    if(!code){ hint.textContent="Digite o código recebido."; return; }
    hint.textContent="Verificando…";
    try{
      const r = await fetch(`${API}/auth/verify`,{
        method:"POST", headers:{ "content-type":"application/json" },
        body:JSON.stringify({ phone, code }), credentials:"include"
      });
      const j = await r.json().catch(()=>null);
      if(j && j.ok){
        hint.textContent="Verificado! Abrindo Dashboard…";
        await sleep(400);
        window.location.href = `${BASE_ROOT}/app/dashboard.html`;
      }else{
        hint.textContent="Código inválido ou expirado.";
      }
    }catch{ hint.textContent="Erro de rede/CORS"; }
  };
}

// ===== nav e boot =====
function setupSections(){
  const orgBtn=$("#cta-organizadores");
  const orgSec=$("#organizadores");
  orgBtn.addEventListener("click",(e)=>{ e.preventDefault(); orgSec.hidden=false; orgSec.scrollIntoView({behavior:"smooth", block:"start"}); });
  if (location.hash==="#organizadores") orgSec.hidden=false;

  // sheet close
  const backdrop=$("#sheet-backdrop"); const sheet=$("#sheet");
  const close=()=>{ sheet.classList.remove("is-open"); backdrop.classList.remove("is-open"); };
  $("#sheet-close").onclick=close; backdrop.onclick=close;
  document.addEventListener("keydown",(e)=>{ if(e.key==="Escape" && sheet.classList.contains("is-open")) close(); });
}

(async function boot(){
  await updateHealth();
  setupSections();
  setupOrganizadores();
  setupValidator();
  await loadEvents();
  console.log("[IngressAI] ready", { API, BASE_ROOT });
})();
