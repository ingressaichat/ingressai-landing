// ========= CONFIG =========
const API = (window.INGRESSAI_API || (location.origin + "/api")).replace(/\/$/, "");
const SUPPORT_WA = "5534999992747";

// ========= HELPERS =========
const BRL = new Intl.NumberFormat("pt-BR",{ style:"currency", currency:"BRL" });
const money = v => BRL.format(isFinite(v)?v:0);
const onlyDigits = v => String(v||"").replace(/\D+/g,"");
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function el(tag, attrs={}, kids=[]){
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === "text") n.textContent = v;
    else if (k === "src" || k === "href") {
      try { n[k] = new URL(v, location.origin).toString(); } catch {}
    } else n.setAttribute(k, v);
  }
  [].concat(kids).forEach(k => {
    if (k == null) return;
    if (typeof k === "string") n.appendChild(document.createTextNode(k));
    else n.appendChild(k);
  });
  return n;
}
function waHref(text){ return `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent(text)}`; }
function fmtDate(iso){ try { return new Date(iso).toLocaleString("pt-BR",{dateStyle:"medium",timeStyle:"short"}); } catch { return iso; } }

// ========= STATE =========
let eventos = [];
let evIndex = {};
let isOrganizer = false;
let authPhone = "";

// ========= AUTH STATE/UI =========
function setAuthState(state, phone="", organizerFlag=true){
  isOrganizer = !!state && !!organizerFlag;
  authPhone = phone || "";
  applyAuthState();
}
function applyAuthState(){
  const tag = $("#auth-indicator");
  const navVal = $("#nav-val");
  const orgPanel = $("#org-detail");
  const preco = $("#preco");
  const qtd = $("#qtd");
  const orgReq = $("#org-request");

  if (isOrganizer) {
    tag.textContent = "organizador";
    tag.classList.remove("off"); tag.classList.add("on");
    navVal.hidden = false;
    orgPanel?.classList.remove("is-disabled");
    if (preco) preco.disabled = false;
    if (qtd)   qtd.disabled = false;
  } else {
    tag.textContent = "offline";
    tag.classList.add("off"); tag.classList.remove("on");
    navVal.hidden = true;
    orgPanel?.classList.add("is-disabled");
    if (preco) preco.disabled = true;
    if (qtd)   qtd.disabled = true;
  }
}

// ========= HEADER FX =========
(function initHeader(){
  const hero=$(".hero"); const header=$("header");
  const onScroll=()=>{
    const y=window.scrollY||0;
    header.classList.toggle("is-scrolled", y>8);
    const p=Math.min(1,Math.max(0,(y-16)/(240-16)));
    hero.style.setProperty("--hero-p", p.toFixed(3));
    hero.classList.toggle("is-hidden", p>=1);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive:true });

  // abre modal de login
  $$("[data-login]").forEach(a => a.addEventListener("click",(e)=>{ e.preventDefault(); openLoginModal(); }));
})();

// ========= HEALTH =========
async function updateHealth(){
  const elTag = $("#auth-indicator");
  const set = (on,label)=>{ elTag.textContent = label || (on?"online":"offline"); elTag.classList.toggle("on",!!on); elTag.classList.toggle("off",!on); };
  try{
    const r = await fetch(`${API}/health`, { cache:"no-store", mode:"cors", credentials:"include" });
    set(r.ok,"online");
    if (r.ok) $("#nav-val")?.removeAttribute("hidden");
  }catch{ set(false,"offline"); }
}

// ========= EVENTS =========
const MAIN_CITIES = ["Uberaba","Uberlândia","Belo Horizonte","Ribeirão Preto","Franca"];
let selectedCity='Todas';
let query='';

const lista         = $("#lista-eventos");
const inputBusca    = $("#busca-eventos");
const chipsRow      = $("#filtro-cidades");
const sheet         = $("#sheet");
const sheetBody     = $("#sheet-body");
const sheetBackdrop = $("#sheet-backdrop");

function filterEventos(data,q,city){
  const qn=(q||"").trim().toLowerCase();
  const citySel=city||"Todas";
  return data.filter(ev=>{
    const matchCity = citySel==="Todas" ? true : (ev.cidade||"").toLowerCase()===citySel.toLowerCase();
    const nome=(ev.nome||"").toLowerCase();
    const desc=(ev.descricao||"").toLowerCase();
    const matchQuery = !qn ? true : (nome.includes(qn)||desc.includes(qn));
    return matchCity && matchQuery;
  });
}
function buildChips(){
  chipsRow.innerHTML="";
  const cities = Array.from(new Set(MAIN_CITIES.concat(eventos.map(e=>e.cidade).filter(Boolean))));
  ["Todas", ...cities].forEach(c=>{
    const b = el("button",{class:"chip", role:"tab", "aria-selected": c===selectedCity?"true":"false", "data-city":c, type:"button", text:c});
    chipsRow.appendChild(b);
  });
}
function renderCards(){
  const data = filterEventos(eventos, query, selectedCity);
  lista.innerHTML = "";
  if (!data.length){
    lista.appendChild(el("div",{class:"std-card"},[
      el("strong",{text:"Sem eventos publicados ainda."}), document.createTextNode(" "),
      el("span",{class:"subtle",text:"Volte em breve — estamos preparando novidades ✨"})
    ]));
    return;
  }
  data.forEach(ev=>{
    const statusLabel = ev.status==="Esgotado" ? "Esgotado" : (ev.status==="Últimos ingressos"?"Último lote":(ev.status||"Em breve"));
    const statusKey = statusLabel==="Esgotado" ? "sold" : (statusLabel==="Último lote"?"low":"soon");

    const media = el("div",{class:"card-media"}, ev.img ? el("img",{src:ev.img, alt:`Imagem do evento ${ev.nome}`, loading:"lazy", decoding:"async"}) : "Mídia do evento");
    const header = el("div",{class:"card-header"},[
      el("div",{},[
        el("div",{class:"card-title", text:ev.nome}),
        el("div",{class:"card-city", text:ev.cidade || ""}),
        el("div",{class:`status-line status--${statusKey}`},[
          el("span",{class:"status-dot"}), el("span",{class:"status-label", text:statusLabel})
        ])
      ])
    ]);
    const btn = el("button",{class:"view", "data-open":ev.id, type:"button", "aria-label":`Ver detalhes de ${ev.nome}`, text:"Ver detalhes"});
    const card = el("article",{class:"card","data-key":ev.id, tabindex:"0", "aria-labelledby":`card-title-${ev.id}`},[media, header, btn]);
    lista.appendChild(card);
  });
}
function openSheet(ev){
  sheetBody.innerHTML="";
  const statusLabel = ev.status==="Esgotado" ? "Esgotado" : (ev.status==="Últimos ingressos"?"Último lote":(ev.status||"Em breve"));
  const key = statusLabel==="Esgotado" ? "sold" : (statusLabel==="Último lote"?"low":"soon");
  const head = el("div",{class:"sheet-head"},[
    el("h3",{id:"sheet-title", text:`${ev.nome} — ${ev.cidade||""}`}),
    el("span",{class:`status-chip ${key}`},[
      el("span",{class:"dot"}), document.createTextNode(statusLabel)
    ])
  ]);
  const media = el("div",{class:"sheet-media"}, ev.img ? el("img",{src:ev.img, alt:`Imagem do evento ${ev.nome}`, loading:"lazy", decoding:"async"}) : "Mídia do evento");
  const meta = el("div",{class:"std-card"},[
    el("p",{},[
      el("strong",{text:"Local: "}), document.createTextNode(ev.localNome || "Local a confirmar"), el("br"),
      el("strong",{text:"Quando: "}), document.createTextNode(fmtDate(ev.dataISO||Date.now())), el("br"),
      el("strong",{text:"Preço: "}), document.createTextNode(money(ev.preco||0))
    ]),
    el("div",{style:"display:flex;gap:10px;flex-wrap:wrap"},[
      statusLabel==="Esgotado"
        ? el("span",{class:"status-line status--sold"},[el("span",{class:"status-dot"}),document.createTextNode("Esgotado")])
        : el("button",{class:"btn btn--secondary btn--sm", type:"button", id:"buy-btn", text:"Comprar (demo)"}),
      el("a",{class:"btn btn--ghost btn--sm", href:waHref(`Tenho dúvidas sobre ${ev.nome}`), target:"_blank", rel:"noopener", text:"Falar no WhatsApp"})
    ])
  ]);

  sheetBody.append(head, media, meta);

  // comprar (demo)
  $("#buy-btn")?.addEventListener("click", async ()=>{
    const to = prompt("Seu WhatsApp (DDI+DDD+NÚMERO):","")||"";
    const clean = onlyDigits(to);
    if (clean.length<10) return alert("Número inválido.");
    try{
      const qs = new URLSearchParams({ ev: ev.id, to: clean, name: "Participante", qty: "1" });
      const r = await fetch(`${API}/purchase/start?${qs}`, { credentials:"include" });
      const j = await r.json().catch(()=>({}));
      alert(j?.ok ? "Ticket emitido! Você receberá no WhatsApp." : "Falha ao emitir.");
    }catch(e){ alert("Erro de rede."); }
  });

  // abre sheet
  sheet.classList.add("is-open"); sheetBackdrop.classList.add("is-open");
  sheet.setAttribute("aria-hidden","false"); sheet.setAttribute("aria-labelledby","sheet-title");
  sheetBackdrop.setAttribute("aria-hidden","false");
  document.body.style.overflow="hidden";
}
function closeSheetSafe(e){
  e?.preventDefault?.();
  sheet.classList.remove("is-open"); sheetBackdrop.classList.remove("is-open");
  sheet.removeAttribute("aria-labelledby"); sheet.setAttribute("aria-hidden","true");
  sheetBackdrop.setAttribute("aria-hidden","true");
  document.body.style.overflow="";
}

// ========= FETCH EVENTS FROM API =========
async function fetchEventos(){
  let arr = [];
  try{
    const r = await fetch(`${API}/events`, { headers:{Accept:"application/json"}, credentials:"include" });
    const j = await r.json().catch(()=> ({}));
    arr = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
  }catch(e){ /* offline/demo */ }

  if (!arr.length) {
    const dt = new Date(Date.now()+2*86400e3).toISOString();
    arr = [{ id:"DEMO-1", title:"Evento Teste IngressAI", city:"Uberaba-MG", venue:"Espaço Demo", date:dt, price:60, image:"" }];
  }

  eventos = arr.map(e=>({
    id: String(e.id ?? e._id ?? e.code ?? "EV"),
    nome: e.title || e.nome || "Evento",
    cidade: e.city || e.cidade || "",
    dataISO: e.date || e.startsAt || e.dataISO || new Date().toISOString(),
    localNome: e.venue || e.local || "",
    status: e.statusLabel || e.status || "Em breve",
    descricao: e.description || e.title || e.nome || "",
    img: e.image || e.bannerUrl || "",
    preco: e.price ?? 0
  }));
  evIndex = Object.fromEntries(eventos.map(e=>[e.id,e]));
}

// ========= ORGANIZADORES =========
function setupOrganizadores(){
  const std = $("#std-card");
  const features=[
    "Criação de evento 100% pelo WhatsApp",
    "Geração automática de ingresso com QR Code",
    "Link público de vendas e acompanhamento em tempo real",
    "Repasse na hora ao organizador",
    "Validador liberado ao criar o evento",
    "Lista de compradores atualizada"
  ];
  std.innerHTML = "<ul class='std-list'>" + features.map(f=>"<li>"+f+"</li>").join("") + "</ul>";

  const taxBox = $("#tax-selector");
  let fee = { pct: 8, fix: 1.5 };
  const calc=$("#calc-box");
  const preco=$("#preco"); const qtd=$("#qtd");
  const grossEl=$("#calc-gross"); const netEl=$("#calc-net"); const note=$("#calc-note");

  function enableCalc(on){ [preco,qtd].forEach(i=>i.disabled=!on); calc.dataset.fee = on ? "on" : ""; }
  enableCalc(false);

  taxBox.addEventListener("click",(e)=>{
    const btn=e.target.closest(".chip"); if(!btn) return;
    $$(".chip", taxBox).forEach(x=>x.setAttribute("aria-selected","false"));
    btn.setAttribute("aria-selected","true");
    fee = btn.dataset.plan === "prod" ? { pct:10, fix:2 } : { pct:8, fix:1.5 };
    note.textContent = `Taxa aplicada: ${fee.pct}% + ${money(fee.fix)} por ingresso.`;
    enableCalc(true); calculate();
  }, { passive:true });

  const parsePrice = raw => { const s=String(raw||"").replace(/[^\d,.-]/g,"").replace(",","."); const n=Number(s); return Number.isFinite(n)?Math.max(0,n):0; }
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

  $("#org-request").onclick = () => {
    const payload = [
      "Quero solicitar criação de evento:",
      `• Nome: ${$("#f-title").value.trim()||"—"}`,
      `• Cidade: ${$("#f-city").value.trim()||"—"}`,
      `• Local: ${$("#f-venue").value.trim()||"—"}`,
      `• Data/hora: ${$("#f-date").value.trim()||"—"}`,
      `• Meu WhatsApp: ${onlyDigits($("#f-phone").value)||"—"}`,
      `• Chave Pix: ${$("#f-pix").value.trim()||"—"}`
    ].join("\n");
    location.href = waHref(payload);
  };
}

// ========= VALIDADOR =========
function setupValidator(){
  $("#val-check").addEventListener("click", async ()=>{
    const raw = String($("#val-code").value||"").trim();
    const code = raw.replace(/^ingressai:ticket:/i,'');
    const out = $("#val-result");
    if (!code) { out.textContent="Informe um código."; return; }
    out.textContent="Checando…";
    try{
      const r = await fetch(`${API}/validator/check`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Accept":"application/json" },
        credentials:"include",
        body: JSON.stringify({ code })
      });
      const j = await r.json();
      out.textContent = j.valid ? `✅ Válido — Ticket #${j.ticketId} • ${j.buyerName||"-"}` : `❌ Inválido (${j?.reason||"desconhecido"})`;
    }catch{ out.textContent="❌ Erro na validação (rede/CORS)"; }
  });
}

// ========= LOGIN (OTP) =========
function openLoginModal(){
  const modal=$("#login-modal");
  const hint=$("#login-hint");
  const phoneEl=$("#login-phone");
  const codeBlock=$("#code-block");
  hint.textContent=""; codeBlock.style.display="none"; modal.classList.add("is-open"); phoneEl.focus();

  $("#login-cancel").onclick=()=>modal.classList.remove("is-open");
  $("#code-back").onclick=()=>{ codeBlock.style.display="none"; hint.textContent=""; };

  $("#login-send").onclick=async ()=>{
    const phone=onlyDigits(phoneEl.value);
    if(phone.length<10){ hint.textContent="Informe número com DDI+DDD+número."; return; }
    hint.textContent="Enviando código…";
    try{
      const r = await fetch(`${API}/auth/request`,{
        method:"POST",
        headers:{ "content-type":"application/json" },
        credentials:"include",
        body:JSON.stringify({ phone })
      });
      if (!r.ok) throw new Error("request_fail");
      hint.textContent="Código enviado por WhatsApp. Digite abaixo:";
      codeBlock.style.display="block";
      $("#login-code").focus();
      authPhone = phone;
    }catch{ hint.textContent="Erro ao enviar código."; }
  };

  $("#code-verify").onclick=async ()=>{
    const code=onlyDigits($("#login-code").value);
    if(!code){ hint.textContent="Digite o código recebido."; return; }
    hint.textContent="Verificando…";
    try{
      const r = await fetch(`${API}/auth/verify`,{
        method:"POST",
        headers:{ "content-type":"application/json" },
        credentials:"include",
        body:JSON.stringify({ phone: authPhone, code })
      });
      const j = await r.json();
      if(j?.ok){
        setAuthState(true, authPhone, !!j.isOrganizer);
        hint.textContent="Verificado! Você está autenticado.";
        await sleep(400);
        modal.classList.remove("is-open");
      }else{
        hint.textContent="Código inválido.";
      }
    }catch{ hint.textContent="Erro de rede."; }
  };
}

// ========= NAV / SHEET BINDINGS =========
document.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-close='sheet']");
  if (btn) { closeSheetSafe(e); }
});
sheetBackdrop?.addEventListener("click", closeSheetSafe);
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && sheet?.classList?.contains("is-open")) closeSheetSafe(e); });
$("#lista-eventos")?.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-open]");
  if (!btn) return;
  const ev = evIndex[btn.dataset.open];
  if (ev) openSheet(ev);
});
$("#nav-org")?.addEventListener("click", ()=>{
  const sec=$("#organizadores");
  if (sec && sec.hasAttribute("hidden")) sec.removeAttribute("hidden");
});

// ========= BOOT =========
(async function boot(){
  await updateHealth();
  setupOrganizadores();
  setupValidator();
  await fetchEventos();
  buildChips();
  renderCards();

  // filtros
  chipsRow?.addEventListener("click", e=>{
    const b=e.target.closest("button.chip"); if(!b) return;
    selectedCity=b.dataset.city;
    chipsRow.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-selected","false"));
    b.setAttribute("aria-selected","true");
    renderCards();
  });
  let debounce;
  inputBusca?.addEventListener("input", ()=>{
    clearTimeout(debounce);
    debounce=setTimeout(()=>{ query=inputBusca.value; renderCards(); }, 180);
  });
})();
