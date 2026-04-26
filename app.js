/* ═══════════════════════════════════════════════════════════
 * MeowFi 喵算 v19 — JS 目錄
 * ─────────────────────────────────────────
 *   STATE       資料／預設值／localStorage 讀寫       ~1087
 *   STATS       summary 卡、預算警示                 ~1229
 *   CAT TABS    分類切換                            ~1326
 *   PRODUCTS    商品卡渲染（補貨頁）                  ~1340
 *   REMINDERS   總覽頁快照卡                         ~1403
 *   FIXED       固定支出 + mini calendar             ~1431
 *   RECORDS     花費記帳 + 分類下鑽 + 分頁             ~1485
 *   PRICE HX    價格歷史                            ~1504
 *   ACTIONS     CRUD 動作 + Undo toast              ~1554
 *   PAGE NAV    tab 切換                           ~1645
 *   FAB         懸浮新增按鈕                        ~1672
 *   MODALS      各類 modal 開關                     ~1692
 *   OCR         截圖匯入（Claude API）              ~1749
 *   DEDUP       重複偵測                           ~1825
 *   INCOME      薪資／獎金／券                      ~1959
 *   THEME/IO    深色模式、匯出入、Esc、SW           (文末)
 * ═══════════════════════════════════════════════════════════ */

// ── Bug Fix 1: 用 getNow() 取代 const NOW，避免跨午夜時間錯誤 ──
function getNow(){ return new Date(); }
const NOW=getNow(); // 保留給初始化預設資料用
let recordMonth={y:NOW.getFullYear(),m:NOW.getMonth()};
let fabOpen=false;
let currentPriceProductId=null;

// ─────────────────────────────────────────────
// Phase F (Hardening) Helpers
// ─────────────────────────────────────────────
// 1) localStorage 安全包裝
const LS={
  get(key,def=null){ try{ const v=localStorage.getItem(key); return v===null?def:v; }catch(e){ return def; } },
  getJSON(key,def=null){ try{ const v=localStorage.getItem(key); return v==null?def:JSON.parse(v); }catch(e){ return def; } },
  getInt(key,def=0){ const v=parseInt(this.get(key,'')); return Number.isFinite(v)?v:def; },
  getFloat(key,def=0){ const v=parseFloat(this.get(key,'')); return Number.isFinite(v)?v:def; },
  set(key,val){ try{ localStorage.setItem(key,typeof val==='string'?val:JSON.stringify(val)); }catch(e){ console.warn('LS quota?',e); } },
  setStr(key,val){ try{ localStorage.setItem(key,String(val)); }catch(e){} },
  del(key){ try{ localStorage.removeItem(key); }catch(e){} },
};
// 2) HTML escape：避免使用者輸入拼進 onclick / innerHTML 造成 XSS / 引號中斷
function escapeHTML(str){
  if(str==null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeAttr(str){ return escapeHTML(str); }
function escapeJS(str){
  // 給 onclick="foo('xxx')" 用：跳脫單引號 / 反斜線 / 換行
  if(str==null) return '';
  return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r?\n/g,'\\n');
}
// 3) 統一導航：依 page id 找對應 tab，避免依賴 .tab[idx]
function navTab(pageId){
  const tab=document.querySelector(`.tab[onclick*="'${pageId}'"]`);
  showPage(pageId,tab);
}
// 4) 跨日／回到前景時重新渲染當月卡片
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible') return;
  const last=window._lastVisibleDay||'';
  const today=new Date().toISOString().slice(0,10);
  if(last && last!==today){
    try{ if(typeof updateAll==='function') updateAll(); }catch(e){}
  }
  window._lastVisibleDay=today;
});
window._lastVisibleDay=new Date().toISOString().slice(0,10);
// 5) CSV 匯出 BOM
function downloadCSV(filename,csvBody){
  const blob=new Blob(['\ufeff'+csvBody],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); },100);
}
// 6) localStorage key 常量（鍵集中，避免拼錯）
const LS_KEYS=Object.freeze({
  ONBOARDED:'btOnboarded', TOUR_SEEN:'btTourSeen',
  RECORDS:'btRecords', FIXED:'btFixed', DEBTS:'btDebts',
  INCOME:'btIncome', BUDGET:'btBudget', LIFE_BUDGET:'btLifeBudget',
  FIXED_BUDGET:'btFixedBudget', SAVINGS_TARGET:'btSavingsTarget',
  CASH_SAVINGS:'btCashSavings', CONFIRMED:'btConfirmed', CATS:'btCats',
  TRAVEL_BUDGET_YEARLY:'btTravelBudgetYearly', TRAVEL_FUND:'btTravelFund',
  TRAVEL_FUND_LOG:'btTravelFundLog', VOUCHERS:'btVouchers', BONUS:'btBonus',
  EXTRA_INCOME:'btExtraIncome', SALARY:'btSalary', INVESTMENTS:'btInv',
  EASYCARD:'btEasyCard', PRIVACY:'btPrivacy', THEME:'btTheme',
  GEMINI_KEY:'btGeminiKey',
});
window.LS=LS; window.LS_KEYS=LS_KEYS; window.navTab=navTab;
window.escapeHTML=escapeHTML; window.escapeAttr=escapeAttr; window.escapeJS=escapeJS;
window.downloadCSV=downloadCSV;
// ─────────────────────────────────────────────

const DEFAULT_CATS=[
  {id:'health',label:'保健品',emoji:'💊',color:'#18b87c'},
  {id:'skin',label:'保養品',emoji:'🧴',color:'#e8488a'},
  {id:'daily',label:'日用品',emoji:'🛒',color:'#e87c20'},
];
let categories=JSON.parse(localStorage.getItem('btCats')||'null')||DEFAULT_CATS;
function catById(id){return categories.find(c=>c.id===id)||{label:id,emoji:'📦',color:'#aaa'};}
function saveCats(){ localStorage.setItem('btCats',JSON.stringify(categories)); }

function dAgo(n){return new Date(NOW.getTime()-n*86400000).toISOString().split('T')[0];}

// priceHistory: { [productId]: [{date, price}] }
let priceHistory=JSON.parse(localStorage.getItem('btPriceHistory')||'{}');

// 📦 示範資料定義（首次啟動詢問是否載入；不再寫死為預設）
const DEMO_PRODUCTS=[
  {id:1,name:'EPA 1200 頂級魚油軟膠囊',brand:'大研生醫',price:1327,origPrice:2520,emoji:'🐟',cat:'health',totalDays:30,boughtDate:dAgo(15),shopeeUrl:'https://shopee.tw/search?keyword=大研生醫+EPA+1200'},
  {id:2,name:'超級1000薑黃錠60粒',brand:'大研生醫',price:1185,origPrice:2250,emoji:'🫚',cat:'health',totalDays:60,boughtDate:dAgo(45),shopeeUrl:'https://shopee.tw/search?keyword=大研生醫+薑黃錠'},
  {id:3,name:'好睡眠芝麻素膠囊90粒',brand:'大研生醫',price:1185,origPrice:2250,emoji:'😴',cat:'health',totalDays:90,boughtDate:dAgo(80),shopeeUrl:'https://shopee.tw/search?keyword=大研生醫+芝麻素'},
  {id:4,name:'女性B群+鐵雙層錠30顆',brand:'大研生醫',price:506,origPrice:960,emoji:'💊',cat:'health',totalDays:30,boughtDate:dAgo(27),shopeeUrl:'https://shopee.tw/search?keyword=大研生醫+B群'},
  {id:5,name:'維生素D3膠囊90粒',brand:'大研生醫',price:474,origPrice:900,emoji:'☀️',cat:'health',totalDays:90,boughtDate:dAgo(30),shopeeUrl:'https://shopee.tw/search?keyword=大研生醫+D3'},
  {id:6,name:'溫和洗卸泡沫潔膚乳',brand:'CeraVe適樂膚',price:254,origPrice:299,emoji:'🫧',cat:'skin',totalDays:45,boughtDate:dAgo(38),shopeeUrl:'https://shopee.tw/search?keyword=CeraVe+洗卸'},
  {id:7,name:'全效清爽修護防曬乳4件組',brand:'CeraVe適樂膚',price:534,origPrice:736,emoji:'🌞',cat:'skin',totalDays:60,boughtDate:dAgo(55),shopeeUrl:'https://shopee.tw/search?keyword=CeraVe+防曬'},
  {id:8,name:'水楊酸煥膚淨嫩潔膚4件組',brand:'CeraVe適樂膚',price:594,origPrice:859,emoji:'✨',cat:'skin',totalDays:60,boughtDate:dAgo(20),shopeeUrl:'https://shopee.tw/search?keyword=CeraVe+水楊酸'},
  {id:9,name:'全效超級修護乳+保濕修護6件組',brand:'CeraVe適樂膚',price:941,origPrice:1288,emoji:'💧',cat:'skin',totalDays:90,boughtDate:dAgo(10),shopeeUrl:'https://shopee.tw/search?keyword=CeraVe+修護乳'},
  {id:10,name:'A醇勻亮修護精華控油保濕6件組',brand:'CeraVe適樂膚',price:1247,origPrice:1648,emoji:'🌿',cat:'skin',totalDays:60,boughtDate:dAgo(5),shopeeUrl:'https://shopee.tw/search?keyword=CeraVe+A醇'},
  {id:11,name:'Vaseline 專業修護潤膚露',brand:'Vaseline',price:169,origPrice:299,emoji:'🧴',cat:'daily',totalDays:45,boughtDate:dAgo(40),shopeeUrl:'https://shopee.tw/search?keyword=Vaseline+修護'},
  {id:12,name:'Vaseline 菸鹼醯胺煥亮乳',brand:'Vaseline',price:119,origPrice:119,emoji:'💎',cat:'daily',totalDays:30,boughtDate:dAgo(22),shopeeUrl:'https://shopee.tw/search?keyword=Vaseline+菸鹼醯胺'},
  {id:13,name:'Vaseline 煥亮潤色護唇',brand:'Vaseline',price:199,origPrice:199,emoji:'👄',cat:'daily',totalDays:30,boughtDate:dAgo(10),shopeeUrl:'https://shopee.tw/search?keyword=Vaseline+護唇'},
];
const DEMO_FIXED=[
  {id:1,name:'手機費',emoji:'📱',amount:699,day:1,cycle:'monthly',note:''},
  {id:2,name:'Netflix',emoji:'📺',amount:390,day:15,cycle:'monthly',note:'家庭方案'},
  {id:3,name:'Spotify',emoji:'🎵',amount:149,day:20,cycle:'monthly',note:''},
];

let products=JSON.parse(localStorage.getItem('btProducts')||'null')||[];

// confirmedDeductions: { 'YYYY-MM-fxId': true }
let confirmedDeductions=JSON.parse(localStorage.getItem('btConfirmed')||'{}');

let fixedExpenses=JSON.parse(localStorage.getItem('btFixed')||'null')||[];
// debts schema: {id,name,emoji,totalAmount,monthlyPayment,totalMonths,paidMonths,startMonth(YYYY-MM),rate,day,note,linkedFixedId,status:'active'|'paid'}
let debts=JSON.parse(localStorage.getItem('btDebts')||'[]');

let monthlyIncome=parseInt(localStorage.getItem('btIncome')||'0');
let monthlyBudget=parseInt(localStorage.getItem('btBudget')||'0');
// 🛫 年度旅遊預算（目標金額）+ 旅遊資金（已撥入的累積金額）
let travelBudgetYearly=parseInt(localStorage.getItem('btTravelBudgetYearly')||'0');
let travelFund=parseFloat(localStorage.getItem('btTravelFund')||'0')||0;
let travelFundLog=JSON.parse(localStorage.getItem('btTravelFundLog')||'[]');
let records=JSON.parse(localStorage.getItem('btRecords')||'[]');

function save(){
  localStorage.setItem('btProducts',JSON.stringify(products));
  localStorage.setItem('btRecords',JSON.stringify(records));
  localStorage.setItem('btCats',JSON.stringify(categories));
  localStorage.setItem('btFixed',JSON.stringify(fixedExpenses));
  localStorage.setItem('btIncome',monthlyIncome.toString());
  localStorage.setItem('btBudget',monthlyBudget.toString());
  localStorage.setItem('btPriceHistory',JSON.stringify(priceHistory));
  localStorage.setItem('btConfirmed',JSON.stringify(confirmedDeductions));
  localStorage.setItem('btInventory',JSON.stringify(inventory));
  localStorage.setItem('btStock',JSON.stringify(stockCount));
  localStorage.setItem('btSalary',JSON.stringify(typeof salaryRecords!=='undefined'?salaryRecords:[]));
  localStorage.setItem('btBonus',JSON.stringify(typeof bonusExpected!=='undefined'?bonusExpected:[]));
  localStorage.setItem('btVouchers',JSON.stringify(typeof vouchers!=='undefined'?vouchers:[]));
  if(typeof fxRates!=='undefined') localStorage.setItem('btFxRates',JSON.stringify(fxRates));
  if(typeof creditCards!=='undefined') localStorage.setItem('btCreditCards',JSON.stringify(creditCards));
  if(typeof cashSavings!=='undefined') localStorage.setItem('btCashSavings',JSON.stringify(cashSavings));
  if(typeof easyCard!=='undefined') localStorage.setItem('btEasyCard',JSON.stringify(easyCard));
  if(typeof investments!=='undefined') localStorage.setItem('btInvestments',JSON.stringify(investments));
  if(typeof debts!=='undefined') localStorage.setItem('btDebts',JSON.stringify(debts));
  if(typeof invoiceSeen!=='undefined') localStorage.setItem('btInvoiceSeen',JSON.stringify(invoiceSeen));
  if(typeof lotteryNumbers!=='undefined') localStorage.setItem('btLotteryNumbers',JSON.stringify(lotteryNumbers));
}

// ── Bug Fix 2: 時區安全的日期解析 + 使用 getNow() ──
function parseLocalDate(s){
  // YYYY-MM-DD 解析為本地時間，避免 UTC 偏移導致 ±1 天
  const [y,m,d]=s.split('-').map(Number);
  return new Date(y,m-1,d);
}
function getDaysLeft(p){
  const now=getNow();
  const bought=parseLocalDate(p.boughtDate);
  const expiry=new Date(bought.getTime()+p.totalDays*86400000);
  return Math.ceil((expiry-now)/86400000);
}
function getStockPct(p){return Math.max(0,Math.min(100,(getDaysLeft(p)/p.totalDays)*100));}
function fmtDate(s){const d=parseLocalDate(s);return `${d.getMonth()+1}/${d.getDate()}`;}
function getMonthlyFixed(){
  return fixedExpenses.reduce((s,f)=>{
    if(f.cycle==='monthly')return s+f.amount;
    if(f.cycle==='yearly')return s+Math.round(f.amount/12);
    if(f.cycle==='weekly')return s+Math.round(f.amount*52/12);
    return s;
  },0);
}
function getDaysUntilDeduction(day){
  const now=getNow();
  const today=now.getDate();
  if(day>=today)return day-today;
  const next=new Date(now.getFullYear(),now.getMonth()+1,day);
  return Math.ceil((next-now)/86400000);
}
function deductionKey(fxId){
  const now=getNow();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${fxId}`;
}
function isConfirmed(fxId){return !!confirmedDeductions[deductionKey(fxId)];}

// Price history helpers
function getPriceHistory(pid){return priceHistory[pid]||[];}
function getLastTwoPrices(pid){
  const h=getPriceHistory(pid);
  if(h.length<2)return null;
  return{prev:h[h.length-2].price, curr:h[h.length-1].price};
}

function renderAll(){
  const now=getNow();
  updateMonthBadge(now);
  renderStats(now);
  const activePage=document.querySelector('.page.active')?.id||'home';
  if(activePage==='home'){ renderHqCats(); renderOnboardBanner(); if(typeof renderNetWorth==='function') renderNetWorth(); }
  if(activePage==='reminder'){ renderCatTabs(); renderProducts(); renderReminderHeader(); renderHomeRestockSummary(); }
  if(activePage==='fixed') { renderFixed(); if(typeof renderDebts==='function') renderDebts(); }
  if(activePage==='record'){ renderRecords(); renderChart(); }
  if(activePage==='income') renderIncome();
  // 設定輸入欄位（只在存在時設定）
  const budEl=document.getElementById('budgetInput');
  const lbEl=document.getElementById('lifeBudgetInput');
  const fbEl=document.getElementById('fixedBudgetInput');
  if(budEl&&monthlyBudget>0) budEl.value=monthlyBudget;
  if(lbEl&&lifeBudget>0) lbEl.value=lifeBudget;
  if(fbEl&&fixedBudget>0) fbEl.value=fixedBudget;
  if(typeof renderSavingGoalUI==='function') renderSavingGoalUI();
  if(typeof renderCreditCardList==='function') renderCreditCardList();
  if(typeof renderCashSavingsUI==='function') renderCashSavingsUI();
  if(typeof renderCardPendingHome==='function') renderCardPendingHome();
  if(typeof renderTravelFundUI==='function') renderTravelFundUI();
  if(typeof renderBackupReminder==='function' && activePage==='home') renderBackupReminder();
  if(activePage==='home') updateAlertChip();
}

// 提醒中心：折疊膠囊邏輯
function updateAlertChip(){
  const chip=document.getElementById('alertChip');
  const stack=document.getElementById('alertStack');
  const cntEl=document.getElementById('alertChipCount');
  if(!chip||!stack||!cntEl) return;
  const banners=['alertBar','budgetAlert','onboardBanner','backupReminder'];
  let n=0;
  banners.forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    const visible=el.style.display!=='none' && el.innerHTML.trim()!=='';
    if(visible) n++;
  });
  if(n===0){
    chip.style.display='none';
    stack.style.display='none';
    chip.classList.remove('open');
  } else {
    chip.style.display='flex';
    cntEl.textContent=n;
    // 預設展開（首次）；若使用者收合過，記住偏好
    const pref=localStorage.getItem('btAlertOpen');
    if(pref==='0'){
      stack.style.display='none';
      chip.classList.remove('open');
    } else {
      stack.style.display='block';
      chip.classList.add('open');
    }
  }
}
function toggleAlertStack(){
  const chip=document.getElementById('alertChip');
  const stack=document.getElementById('alertStack');
  if(!chip||!stack) return;
  const open=stack.style.display!=='none';
  stack.style.display=open?'none':'block';
  chip.classList.toggle('open',!open);
  localStorage.setItem('btAlertOpen',open?'0':'1');
}

function updateMonthBadge(now){
  now=now||getNow();
  const mn=['一','二','三','四','五','六','七','八','九','十','十一','十二'];
  document.getElementById('currentMonthBadge').textContent=`${now.getFullYear()}年${mn[now.getMonth()]}月`;
}

// ── STATS + BUDGET ALERTS ──
function renderStats(now){
  now=now||getNow();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const varTotal=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='var'&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
  const lifeTotal=records.filter(r=>getEffectiveMonth(r)===ym&&(r.type==='life'||r.type==='voucher'||r.type==='easycard')&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
  const fixedTotal=getMonthlyFixed();
  const urgent=products.filter(p=>getDaysLeft(p)<=7).length;

  document.getElementById('totalSpend').textContent=`$${varTotal.toLocaleString()}`;
  document.getElementById('totalFixed').textContent=`$${fixedTotal.toLocaleString()}`;
  document.getElementById('alertCount').textContent=urgent;
  const homeLifeEl=document.getElementById('homeLifeTotal');
  if(homeLifeEl) homeLifeEl.textContent=`$${lifeTotal.toLocaleString()}`;
  const homeTotalEl=document.getElementById('homeTotalAll');
  if(homeTotalEl) homeTotalEl.textContent=`$${(varTotal+lifeTotal+fixedTotal).toLocaleString()}`;
  // 三類預算副標（顯示 /$N 預算上限與超支提示）
  const setBudgetLabel=(elId,spent,budget)=>{
    const el=document.getElementById(elId); if(!el) return;
    if(!budget||budget<=0){ el.textContent=''; el.className='hsc-budget'; return; }
    const pct=spent/budget;
    el.textContent=`/ $${budget.toLocaleString()}`;
    el.className='hsc-budget '+(pct>=1?'over':pct>=0.7?'warn':'ok');
  };
  setBudgetLabel('totalSpendBudget',varTotal,monthlyBudget);
  setBudgetLabel('homeLifeBudget',lifeTotal,lifeBudget);
  setBudgetLabel('totalFixedBudget',fixedTotal,(typeof fixedBudget!=='undefined'?fixedBudget:0));
  document.getElementById('alertBar').style.display=urgent>0?'block':'none';
  if(urgent>0)document.getElementById('alertCountBadge').textContent=urgent;

  // Budget alert（採購 + 生活費 + 固定，合併為一張柔和卡片）
  const budgetAlertEl=document.getElementById('budgetAlert');
  if(budgetAlertEl){
    const rows=[];
    const pushRow=(label,used,limit)=>{
      if(!(limit>0)) return null;
      const pct=used/limit;
      if(pct<0.7) return null; // 低於 70% 不提示
      const lvl=pct>=1?'danger':'warn';
      const w=Math.min(100,pct*100);
      const txt=pct>=1
        ? `超出 $${(used-limit).toLocaleString()}`
        : `剩 $${(limit-used).toLocaleString()}`;
      rows.push(`<div class="bas-row ${lvl}"><span class="bas-name">${label} · ${txt}</span><span class="bas-bar"><span style="width:${w}%"></span></span><span class="bas-pct">${Math.round(pct*100)}%</span></div>`);
      return pct;
    };
    pushRow('採購',varTotal,monthlyBudget);
    pushRow('生活費',lifeTotal,lifeBudget);
    if(typeof fixedBudget!=='undefined') pushRow('固定',fixedTotal,fixedBudget);

    // Update budget progress bar in settings (採購)
    if(monthlyBudget>0){
      const bp=document.getElementById('budgetProgress');
      if(bp){
        bp.style.display='block';
        const pct=varTotal/monthlyBudget;
        const fill=document.getElementById('budgetBarFill');
        const w=Math.min(100,pct*100);
        fill.style.width=w+'%';
        fill.className='budget-bar-fill '+(pct>=1?'over':pct>=0.8?'warn':'ok');
        document.getElementById('budgetSpentLabel').textContent=`已花 $${varTotal.toLocaleString()}`;
        document.getElementById('budgetLimitLabel').textContent=`上限 $${monthlyBudget.toLocaleString()}`;
      }
    } else {
      const bp=document.getElementById('budgetProgress'); if(bp) bp.style.display='none';
    }

    if(rows.length){
      budgetAlertEl.style.display='block';
      budgetAlertEl.innerHTML=`<div class="budget-alert-stack"><div class="bas-hdr">本月預算提醒</div>${rows.join('')}</div>`;
    } else {
      budgetAlertEl.style.display='none';
    }
  }

  // Life budget progress (settings page)
  const lbp=document.getElementById('lifeBudgetProgress');
  if(lbp){
    if(lifeBudget>0){
      lbp.style.display='block';
      const pct=lifeTotal/lifeBudget;
      const fill=document.getElementById('lifeBudgetBarFill');
      fill.style.width=Math.min(100,pct*100)+'%';
      fill.className='budget-bar-fill '+(pct>=1?'over':pct>=0.8?'warn':'ok');
      document.getElementById('lifeBudgetSpentLabel').textContent=`已花 $${lifeTotal.toLocaleString()}`;
      document.getElementById('lifeBudgetLimitLabel').textContent=`上限 $${lifeBudget.toLocaleString()}`;
    } else { lbp.style.display='none'; }
  }
  // Fixed budget progress (settings page)
  const fbp=document.getElementById('fixedBudgetProgress');
  if(fbp){
    if(fixedBudget>0){
      fbp.style.display='block';
      const pct=fixedTotal/fixedBudget;
      const fill=document.getElementById('fixedBudgetBarFill');
      fill.style.width=Math.min(100,pct*100)+'%';
      fill.className='budget-bar-fill '+(pct>=1?'over':pct>=0.8?'warn':'ok');
      document.getElementById('fixedBudgetSpentLabel').textContent=`已花 $${fixedTotal.toLocaleString()}`;
      document.getElementById('fixedBudgetLimitLabel').textContent=`上限 $${fixedBudget.toLocaleString()}`;
    } else { fbp.style.display='none'; }
  }

  // Free balance
  const freeCard=document.getElementById('freeCard');
  if(!freeCard) return; // not on home page
  const freeVal=document.getElementById('freeValue');
  const freeLbl=document.getElementById('freeLabel');
  const freeSub=document.getElementById('freeSub');
  const freeIcon=document.getElementById('freeIcon');
  if(monthlyIncome>0){
    const spent=varTotal+lifeTotal+fixedTotal;
    const goal=(typeof getSavingGoalAmount==='function')?getSavingGoalAmount():0;
    const free=monthlyIncome-spent-goal;
    freeVal.textContent=`$${free.toLocaleString()}`;
    freeVal.style.fontSize='26px';
    freeLbl.textContent='本月可用餘額';
    const denom=Math.max(1,monthlyIncome-goal);
    const pct=free/denom;
    const goalNote=goal>0?`（已預留存款 $${goal.toLocaleString()}）`:'';
    if(free<0){
      freeCard.className='free-card';
      freeVal.style.color='var(--danger)';
      freeIcon.textContent='😰';
      freeSub.textContent=`支出+存款超出收入 $${Math.abs(free).toLocaleString()}${goalNote}`;
    } else if(pct<0.2){
      freeCard.className='free-card';
      freeVal.style.color='var(--warn)';
      freeIcon.textContent='⚠️';
      freeSub.textContent=`剩餘僅 ${Math.round(pct*100)}%，注意控制支出${goalNote}`;
    } else {
      freeCard.className='free-card';
      freeVal.style.color='var(--accent3)';
      freeIcon.textContent='💚';
      freeSub.textContent=`財務健康！可自由支配 ${Math.round(pct*100)}%${goalNote}`;
    }
    document.getElementById('cashflowBar').style.display='block';
    document.getElementById('cfIncomeLabel').textContent=`進貢 $${monthlyIncome.toLocaleString()}`;
    const vp=Math.min(100,(varTotal/monthlyIncome)*100);
    const lp=Math.min(100-vp,(lifeTotal/monthlyIncome)*100);
    const fp=Math.min(100-vp-lp,(fixedTotal/monthlyIncome)*100);
    document.getElementById('cfSegProducts').style.width=vp+'%';
    const cfLife=document.getElementById('cfSegLife');
    if(cfLife) cfLife.style.width=lp+'%';
    document.getElementById('cfSegFixed').style.width=fp+'%';
  } else {
    freeCard.className='free-card';
    freeVal.style.color='var(--text3)';freeVal.style.fontSize='16px';
    freeVal.textContent='點右下角 《＋》 新增薪資 →';
    freeLbl.textContent='記錄薪資後自動顯示可用餘額';
    freeSub.textContent='';freeIcon.textContent='💰';
    document.getElementById('cashflowBar').style.display='none';
  }
  // 存款目標 + 設定頁進度
  if(typeof renderSavingGoalUI==='function') renderSavingGoalUI();

  // ── Quick Stats（4 小格）+ vs 上月對比 ──
  const qs=document.getElementById('quickStats');
  if(qs){
    const totalSpend=varTotal+lifeTotal+fixedTotal;
    const balance=monthlyIncome-totalSpend;
    const saveRate=monthlyIncome>0?Math.round((balance/monthlyIncome)*100):null;
    const setQ=(id,val,cls)=>{
      const el=document.getElementById(id); if(!el) return;
      el.textContent=val;
      el.className='qs-value'+(cls?' '+cls:'');
    };
    if(monthlyIncome>0||totalSpend>0){
      qs.style.display='grid';
      setQ('qsIncome','$'+monthlyIncome.toLocaleString(),'income');
      // 待扣款：所有信用卡未來月份合計（含 records + fixed 推估）
      let pendingTotal=0;
      try{
        const now2=getNow();
        const curYM2=`${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}`;
        records.filter(r=>r.pay==='card'&&r.billingMonth&&r.billingMonth>curYM2&&r.type!=='fixed').forEach(r=>{ pendingTotal+=(r.price||0); });
      }catch(e){}
      setQ('qsPending','$'+pendingTotal.toLocaleString(),'spend');
      setQ('qsBalance','$'+balance.toLocaleString(),'balance'+(balance<0?' neg':''));
      if(saveRate===null){
        setQ('qsSaveRate','—','rate');
      } else {
        const rateCls=saveRate>=20?'good':saveRate>=0?'warn':'bad';
        setQ('qsSaveRate',saveRate+'%','rate '+rateCls);
      }
    } else {
      qs.style.display='none';
    }
  }
  // 章節標題：有資產/目標卡時才顯示
  const showSec=(id,...cardIds)=>{
    const sec=document.getElementById(id); if(!sec) return;
    const visible=cardIds.some(cid=>{
      const c=document.getElementById(cid);
      return c && c.style.display!=='none';
    });
    sec.style.display=visible?'flex':'none';
  };
  showSec('homeSecAssets','cardPendingCard','netWorthCard');
  showSec('homeSecGoals','savingGoalCard');

  // 上月對比膠囊
  const fcCompare=document.getElementById('freeCompare');
  if(fcCompare){
    const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
    const pYm=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
    const prevSpend=records.filter(r=>{
      const m=getEffectiveMonth(r);
      return m===pYm && (r.type==='var'||r.type==='life'||r.type==='voucher'||r.type==='easycard') && !r._travelBudget;
    }).reduce((s,r)=>s+r.price,0);
    const curSpend=varTotal+lifeTotal;
    if(prevSpend>0 && curSpend>0){
      const diff=((curSpend-prevSpend)/prevSpend)*100;
      const arrow=diff>=0?'↑':'↓';
      const cls=diff>0.5?'up':diff<-0.5?'down':'';
      fcCompare.style.display='inline-flex';
      fcCompare.className='fc-compare privacy-mask '+cls;
      fcCompare.innerHTML=`<span class="fcc-arrow">${arrow}</span>${Math.abs(diff).toFixed(0)}% vs 上月支出`;
    } else {
      fcCompare.style.display='none';
    }
  }
  // 🐱 P3：喵咪心情卡
  if(typeof renderCatMood==='function') renderCatMood({monthlyIncome,varTotal,lifeTotal,fixedTotal});
}

// ── 🐱 CAT MOOD CARD ──
// 喵咪 SVG 生成器 v2 — Q 版超萌（大頭、星星眼、白口吻、腮紅、清楚鬍鬚）
function meowCatSvg(mood='mid',size=72){
  // 🎨 造型表（橘貓 / 賓士 / 三花 / 純黑 / 灰虎）
  const SKIN_PRESETS={
    orange:{FACE:'#FFB874',STRIPE:'#D27A3C',EAR_IN:'#FFC9D6'},
    tuxedo:{FACE:'#FFFFFF',STRIPE:'#1F1A15',EAR_IN:'#FFC9D6'},
    calico:{FACE:'#FFF1DC',STRIPE:'#E5A234',EAR_IN:'#FFC9D6'},
    black:{FACE:'#2D2620',STRIPE:'#1A1410',EAR_IN:'#9A6B6B'},
    grey:{FACE:'#C9BDB0',STRIPE:'#6B5F52',EAR_IN:'#F5C2C9'},
  };
  const skinKey=(typeof catSkin!=='undefined'?catSkin:'orange')||'orange';
  const sk=SKIN_PRESETS[skinKey]||SKIN_PRESETS.orange;
  const FACE=sk.FACE, STRIPE=sk.STRIPE, EAR_IN=sk.EAR_IN, SNOUT='#FFF5E8',
        LINE=skinKey==='black'?'#FFE9C9':'#3A2A1F',
        WHISK=skinKey==='black'?'#E0CDB4':'#5C544A',
        BLUSH='#FF9F8A', NOSE='#E55A4D';
  // 共用：白口吻（嘴部三角白塊）+ 腮紅 — 讓「貓味」立刻出來
  const snout=`<ellipse cx="50" cy="68" rx="20" ry="13" fill="${SNOUT}"/>`;
  const blush=`<ellipse cx="26" cy="64" rx="6" ry="3.5" fill="${BLUSH}" opacity="0.55"/><ellipse cx="74" cy="64" rx="6" ry="3.5" fill="${BLUSH}" opacity="0.55"/>`;
  const nose =`<path d="M46 60 Q50 64 54 60 Q52 65 50 65 Q48 65 46 60 Z" fill="${NOSE}"/>`;
  const lips =`<path d="M50 65 L50 68" stroke="${LINE}" stroke-width="1.2" stroke-linecap="round"/>`;

  const parts={
    rich:{ // 皇室喵：閉眼大笑 + 吐舌 + 皇冠
      eyes:`<path d="M28 50 Q35 42 42 50" stroke="${LINE}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M58 50 Q65 42 72 50" stroke="${LINE}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
            <circle cx="80" cy="34" r="3" fill="#FFD54F" stroke="#C8961D" stroke-width="0.8"/>
            <text x="78" y="37" font-size="4" fill="#C8961D">★</text>`,
      mouth:`<path d="M50 70 Q47 76 50 80 Q53 84 50 86" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>
             <ellipse cx="50" cy="80" rx="5" ry="4" fill="#FF7A8A"/>
             <path d="M50 78 L50 84" stroke="#D14E60" stroke-width="0.8"/>`,
      extra:`<g><path d="M30 24 L36 12 L44 22 L50 8 L56 22 L64 12 L70 24 Z" fill="#FFD54F" stroke="#C8961D" stroke-width="1.4" stroke-linejoin="round"/>
             <circle cx="36" cy="14" r="1.8" fill="#FF6B6B"/>
             <circle cx="50" cy="10" r="2" fill="#5BC2DC"/>
             <circle cx="64" cy="14" r="1.8" fill="#FF6B6B"/></g>`
    },
    mid:{ // 小資喵：圓亮眼 + 微笑（最 Q 版，大眼睛）
      eyes:`<circle cx="36" cy="52" r="7" fill="${LINE}"/><circle cx="64" cy="52" r="7" fill="${LINE}"/>
            <circle cx="38" cy="49" r="2.6" fill="#fff"/><circle cx="66" cy="49" r="2.6" fill="#fff"/>
            <circle cx="34" cy="55" r="1.2" fill="#fff" opacity="0.7"/><circle cx="62" cy="55" r="1.2" fill="#fff" opacity="0.7"/>`,
      mouth:`<path d="M44 70 Q50 76 56 70" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
      extra:''
    },
    low:{ // 貧民喵：瞇眼 + 歪嘴
      eyes:`<path d="M30 54 L42 50" stroke="${LINE}" stroke-width="3.2" stroke-linecap="round"/>
            <path d="M58 50 L70 54" stroke="${LINE}" stroke-width="3.2" stroke-linecap="round"/>
            <text x="74" y="44" font-size="6">💢</text>`,
      mouth:`<path d="M44 72 Q48 68 52 73 Q56 78 60 72" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
      extra:''
    },
    broke:{ // 破產喵：超驚恐圓眼 + 大張嘴 + 淚水
      eyes:`<circle cx="36" cy="52" r="9" fill="#fff" stroke="${LINE}" stroke-width="1.8"/>
            <circle cx="64" cy="52" r="9" fill="#fff" stroke="${LINE}" stroke-width="1.8"/>
            <circle cx="36" cy="54" r="3.2" fill="${LINE}"/>
            <circle cx="64" cy="54" r="3.2" fill="${LINE}"/>
            <circle cx="34" cy="51" r="1.4" fill="#fff"/><circle cx="62" cy="51" r="1.4" fill="#fff"/>`,
      mouth:`<ellipse cx="50" cy="76" rx="6.5" ry="8" fill="${LINE}"/>
             <ellipse cx="50" cy="78" rx="4" ry="4.5" fill="#FF7A8A"/>`,
      extra:`<g><path d="M22 58 Q18 70 22 80 Q26 70 22 58 Z" fill="#5BC2DC" stroke="#3DA0BC" stroke-width="0.8"/>
             <path d="M78 58 Q82 70 78 80 Q74 70 78 58 Z" fill="#5BC2DC" stroke="#3DA0BC" stroke-width="0.8"/></g>`
    },
    peek:{ // 防偷窺：兩肉球遮眼
      eyes:`<path d="M30 53 Q38 51 46 53" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>
            <path d="M54 53 Q62 51 70 53" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.5"/>`,
      mouth:`<path d="M44 70 Q50 75 56 70" stroke="${LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
      extra:`<g>
        <ellipse cx="36" cy="52" rx="13" ry="11" fill="${FACE}" stroke="${STRIPE}" stroke-width="1.6"/>
        <circle cx="30" cy="50" r="2.4" fill="${STRIPE}"/><circle cx="36" cy="46" r="2.4" fill="${STRIPE}"/><circle cx="42" cy="50" r="2.4" fill="${STRIPE}"/>
        <ellipse cx="36" cy="56" rx="3.2" ry="2.6" fill="${STRIPE}"/>
        <ellipse cx="64" cy="52" rx="13" ry="11" fill="${FACE}" stroke="${STRIPE}" stroke-width="1.6"/>
        <circle cx="58" cy="50" r="2.4" fill="${STRIPE}"/><circle cx="64" cy="46" r="2.4" fill="${STRIPE}"/><circle cx="70" cy="50" r="2.4" fill="${STRIPE}"/>
        <ellipse cx="64" cy="56" rx="3.2" ry="2.6" fill="${STRIPE}"/>
      </g>`
    },
    look:{ // 顯示模式：睜眼喵（同 mid 但小一號 — 用於 toggle）
      eyes:`<circle cx="36" cy="52" r="6" fill="${LINE}"/><circle cx="64" cy="52" r="6" fill="${LINE}"/>
            <circle cx="38" cy="50" r="2.2" fill="#fff"/><circle cx="66" cy="50" r="2.2" fill="#fff"/>`,
      mouth:`<path d="M44 70 Q50 75 56 70" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
      extra:''
    }
  };
  const p=parts[mood]||parts.mid;
  const showFaceFx=mood!=='peek'; // peek 模式肉球蓋住，不畫鼻/嘴吻
  return `<svg class="meow-cat mood-${mood}" viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- 耳朵（更大更尖、內側粉色） -->
    <path d="M14 42 L26 14 L42 38 Z" fill="${FACE}" stroke="${STRIPE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M22 36 L27 22 L33 36 Z" fill="${EAR_IN}"/>
    <path d="M86 42 L74 14 L58 38 Z" fill="${FACE}" stroke="${STRIPE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M78 36 L73 22 L67 36 Z" fill="${EAR_IN}"/>
    <!-- 大圓臉（Q 版重點：頭大臉圓） -->
    <ellipse cx="50" cy="60" rx="36" ry="33" fill="${FACE}" stroke="${STRIPE}" stroke-width="1.8"/>
    <!-- 額頭 M 字斑（橘貓特徵） -->
    <path d="M44 32 Q48 38 50 34 Q52 38 56 32" stroke="${STRIPE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M28 44 Q34 46 38 44" stroke="${STRIPE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M62 44 Q66 46 72 44" stroke="${STRIPE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    ${showFaceFx?blush:''}
    ${showFaceFx?snout:''}
    <!-- 鬍鬚（更明顯） -->
    <g class="meow-whiskers" stroke="${WHISK}" stroke-width="1" stroke-linecap="round" opacity="0.7" fill="none">
      <path d="M14 64 L34 62"/><path d="M14 70 L34 68"/>
      <path d="M66 62 L86 64"/><path d="M66 68 L86 70"/>
    </g>
    ${showFaceFx?nose:''}
    ${showFaceFx?lips:''}
    ${p.eyes}
    ${p.mouth}
    ${p.extra}
  </svg>`;
}

const CAT_QUOTES={
  rich:['優秀！這個月本喵賞你一條小魚乾 🐟','繼續省下去本喵考慮升你為鏟屎官總管 ✨','本喵很滿意 (｡•́‿•̀｡)','財務優等生～本喵驕傲','再多省一點本喵就賞你 SSR 罐罐'],
  mid:['還行啦，繼續努力本喵就考慮誇你 ✨','勉強及格 ٩(˃̶͈̀௰˂̶͈́)و','本喵看你還有救','記得多存一點啊鏟屎官','差一步就晉級了喵～'],
  low:['勉強及格，下個月再不努力本喵要罷工 💢','你這樣本喵的罐罐要打折了喔','可以再省一點啦～','再亂花本喵真的會生氣','你的零用錢被本喵沒收了'],
  broke:['鏟屎官你完蛋了，本喵的罐罐錢都被你花光啦！','救命喔！本喵要餓死了！','錢呢？(´;ω;`)','本喵宣布罷工 (╯°□°）╯','你給本喵省一點啦！']
};

function renderCatMood(ctx){
  const card=document.getElementById('catMoodCard');
  if(!card) return;
  // 合併上次完整 ctx：換毛色重繪時只會帶 netRate，避免 income=0 把卡片藏起來
  ctx=Object.assign({},window._lastCmcCtx||{},ctx||{});
  window._lastCmcCtx=ctx;
  const income=ctx.monthlyIncome||0;
  const spend=(ctx.varTotal||0)+(ctx.lifeTotal||0)+(ctx.fixedTotal||0);
  if(income<=0){ card.style.display='none'; return; }
  card.style.display='block';
  const balance=income-spend;
  const rate=balance/income;
  let key;
  if(rate>=0.5) key='rich';
  else if(rate>=0.2) key='mid';
  else if(rate>0) key='low';
  else key='broke';
  const tierMap={
    rich:{name:'皇室喵',lv:99,cls:'tier-rich'},
    mid:{name:'小資喵',lv:50,cls:'tier-mid'},
    low:{name:'貧民喵',lv:10,cls:'tier-low'},
    broke:{name:'破產喵',lv:1,cls:'tier-broke'}
  };
  const tier=tierMap[key];
  card.className='cat-mood-card '+tier.cls;
  card.dataset.mood=key;
  // 確保有尾巴
  if(!card.querySelector('.cmc-tail')){
    const tail=document.createElement('div');
    tail.className='cmc-tail';
    tail.innerHTML='<svg viewBox="0 0 60 60" width="60" height="60"><path d="M14 50 Q20 30 32 26 Q44 22 50 30" stroke="#D27A3C" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M14 50 Q20 30 32 26 Q44 22 50 30" stroke="#FFB874" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M48 28 Q52 26 54 28" stroke="#D27A3C" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
    card.appendChild(tail);
  }
  // 確保有對話泡泡容器
  if(!card.querySelector('.meow-bubble')){
    const b=document.createElement('div'); b.className='meow-bubble'; b.id='cmcBubble'; card.appendChild(b);
  }
  // 確保有換造型小盤
  if(!card.querySelector('.cat-skin-row')){
    const row=document.createElement('div');
    row.className='cat-skin-row';
    row.innerHTML=Object.keys(CAT_SKIN_LABELS).map(k=>{
      const sw={orange:'#FFB874',tuxedo:'#1F1A15',calico:'#FFD27A',black:'#2D2620',grey:'#8A7A6B'}[k];
      return `<button class="cat-skin-opt${catSkin===k?' active':''}" data-skin="${k}" title="${CAT_SKIN_LABELS[k]}" onclick="event.stopPropagation();setCatSkin('${k}')"><span class="cs-dot" style="background:${sw}"></span></button>`;
    }).join('');
    // 行動裝置點擊 🐾 切換展開
    row.addEventListener('click',(e)=>{
      if(e.target===row || e.target.classList.contains('cat-skin-row')){
        row.classList.toggle('is-open');
        // 點外面收合
        if(row.classList.contains('is-open')){
          setTimeout(()=>{
            const closer=(ev)=>{ if(!row.contains(ev.target)){ row.classList.remove('is-open'); document.removeEventListener('click',closer); } };
            document.addEventListener('click',closer);
          },50);
        }
      }
    });
    card.appendChild(row);
  }
  // 記住最近的 net rate 供換造型重繪用
  if(ctx&&'netRate' in ctx) window._lastNetRate=ctx.netRate;
  const emojiEl=document.getElementById('cmcEmoji');
  emojiEl.innerHTML=meowCatSvg(key,72);
  emojiEl.style.cursor='pointer';
  emojiEl.title='點本喵看心情碎碎念';
  if(!emojiEl._meowBound){
    emojiEl.addEventListener('click',()=>{
      const k=card.dataset.mood||'mid';
      const arr=CAT_QUOTES[k]||CAT_QUOTES.mid;
      const q=arr[Math.floor(Math.random()*arr.length)];
      // 對話泡泡（取代之前的 quote 換字）
      const bub=card.querySelector('.meow-bubble');
      if(bub){
        bub.textContent=q;
        bub.classList.add('show');
        clearTimeout(bub._t);
        bub._t=setTimeout(()=>bub.classList.remove('show'),2400);
      }
      emojiEl.classList.remove('meow-pop');void emojiEl.offsetWidth;emojiEl.classList.add('meow-pop');
      // 🔊 喵叫
      if(typeof playMeow==='function') playMeow();
      // 皇室喵點擊冒愛心
      if(k==='rich'){
        ['💖','✨','💛','🐟','💖'].forEach((h,i)=>{
          const el=document.createElement('span');
          el.className='heart-burst';el.textContent=h;
          el.style.setProperty('--hx',((i-2)*16)+'px');
          el.style.animationDelay=(i*0.08)+'s';
          card.appendChild(el);
          setTimeout(()=>el.remove(),1700);
        });
      }
    });
    emojiEl._meowBound=true;
  }
  document.getElementById('cmcName').textContent=tier.name;
  document.getElementById('cmcLevel').textContent='Lv·'+tier.lv;
  document.getElementById('cmcQuote').textContent=CAT_QUOTES[key][0];
  const pct=Math.max(0,Math.min(100,rate*100));
  document.getElementById('cmcBarFill').style.width=pct+'%';
  const rateEl=document.getElementById('cmcRate');
  rateEl.textContent=(rate*100).toFixed(0)+'%';
  rateEl.style.color=rate<0?'var(--danger)':rate<0.2?'var(--warn)':'var(--accent3)';
}

// ── CAT TABS ──
let currentCat='all';
function renderCatTabs(){
  const el=document.getElementById('homeCatTabs'); if(!el) return;
  el.innerHTML=
    `<button class="cat-tab ${currentCat==='all'?'active':''}" onclick="filterCat('all',this)">全部</button>`
    +categories.map(c=>`<button class="cat-tab ${currentCat===c.id?'active':''}" onclick="filterCat('${c.id}',this)">${c.emoji} ${c.label}</button>`).join('')
    +`<button class="cat-tab cat-tab-manage" onclick="openCatManagerModal('restock')" title="管理類別">⚙️ 管理</button>`;
}
function filterCat(cat,el){
  currentCat=cat;
  document.querySelectorAll('#homeCatTabs .cat-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');renderProducts();
}

// ── PRODUCTS ──
function renderProducts(){
  const list=document.getElementById('productList');
  if(!list) return;
  const q=(document.getElementById('productSearchInput')?.value||'').trim().toLowerCase();
  let filtered=currentCat==='all'?products:products.filter(p=>p.cat===currentCat);
  if(q) filtered=filtered.filter(p=>(p.name+p.brand).toLowerCase().includes(q));
  if(!filtered.length){list.innerHTML=q
    ?`<div style="text-align:center;padding:32px;color:var(--text3)">找不到符合的商品</div>`
    :emptyState({cat:'sleeping',title:currentCat==='all'?'本喵的補貨清單空空如也':'此分類還沒有品項',sub:'按右下角 ➕ 新增第一個品項，本喵會幫你顧著'});
    return;}
  list.innerHTML=filtered.map(p=>{
    const d=getDaysLeft(p),pct=getStockPct(p);
    const isEmpty=d<=0;
    const isCrit=d<=3&&d>0;
    const isUrg=d<=7&&d>0;
    const fillCls=isCrit?'fill-danger':(isUrg?'fill-warn':'fill-ok');
    const daysTxt=isEmpty?'已用完':`(剩 ${d} 天)`;
    const daysCls=isEmpty?'crit-d':(isCrit?'crit-d':(isUrg?'warn-d':''));
    const cat=catById(p.cat);
    const stock=typeof getStock==='function'?getStock(p.id):0;
    const histCount=getPriceHistory(p.id).length;
    const trendHtml=(()=>{const two=getLastTwoPrices(p.id);if(!two)return '';const diff=two.curr-two.prev;return diff>0?`<div class="price-trend up">▲$${diff}</div>`:diff<0?`<div class="price-trend down">▼$${Math.abs(diff)}</div>`:''})();

    // Card state: empty = yellow, urgent = orange border, normal = default
    let cardStyle='', cardClass='product-card';
    if(isEmpty){
      cardStyle='background:#fffdf0;border-color:rgba(232,180,32,0.45);';
    } else if(isUrg||isCrit){
      cardClass+=' urgent';
    }

    const stockBadge=stock>0?`<span style="background:var(--accent-light);color:var(--accent);font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;margin-left:5px">庫存 ${stock}</span>`:'';
    const emptyBadge=isEmpty?`<span class="urgent-badge" style="background:#fff3cd;color:#b8860b">已用完</span>`:'';
    const urgBadge=!isEmpty&&isUrg?`<span class="urgent-badge ${isCrit?'crit':'warn'}">${isCrit?'緊急':'快補貨'}</span>`:'';

    return `<div class="${cardClass}" data-pid="${p.id}" style="${cardStyle}">
      <div class="cat-stripe" style="background:${isEmpty?'#e8c832':cat.color}"></div>
      <div class="card-top">
        <div class="product-emoji" onclick="openProductEdit(${p.id})" style="cursor:pointer" title="點擊編輯品項資訊">${p.emoji}</div>
        <div class="product-info">
          <div class="product-name">${p.name}${emptyBadge}${urgBadge}${stockBadge}</div>
          <div class="product-brand">${p.brand} · ${cat.emoji}${cat.label}</div>
        </div>
        <div class="product-price">
          <div class="price-current">$${p.price.toLocaleString()}</div>
          ${p.origPrice>p.price?`<div class="price-original" title="定價 $${p.origPrice.toLocaleString()}">$${p.origPrice.toLocaleString()} <span style="color:var(--accent3);font-size:10px;font-weight:700">-${Math.round((1-p.price/p.origPrice)*100)}%</span></div>`:''}
          ${trendHtml}
        </div>
      </div>
      <div class="stock-section">
        <div class="stock-header"><span>使用進度</span><span class="days-left ${daysCls}">${daysTxt}</span></div>
        <div class="progress-bar"><div class="progress-fill ${isEmpty?'fill-danger':fillCls}" style="width:${isEmpty?'0':pct}%"></div></div>
      </div>
      <div class="card-actions">
        <button class="btn-sm ${isEmpty||isUrg?'restock':''}" onclick="openRecordAndPrice(${p.id})" style="${isEmpty?'background:rgba(232,180,32,0.15);border-color:rgba(232,180,32,0.35);color:#8b6800;':''}">
          🛒 補貨並記帳
        </button>
        <button class="btn-sm" onclick="openInventoryModal(${p.id})">📦 庫存</button>
        <button class="btn-sm" style="flex:0;padding:7px 10px;color:var(--danger)" onclick="deleteProduct(${p.id})" title="刪除品項">🗑</button>
      </div>
    </div>`;
  }).join('');
  setTimeout(applySwipeToProducts,10);
}

// ── REMINDERS (輕量區塊：總覽頁快照) ──
function renderHomeRestockSummary(){
  const el=document.getElementById('homeRestockSummary'); if(!el) return;
  // 含 5–10 天比價建議：擴大到 ≤14 天，按 d 升冪取前 5
  const list=products.map(p=>({p,d:getDaysLeft(p)})).filter(x=>x.d<=14).sort((a,b)=>a.d-b.d).slice(0,5);
  if(!list.length){ el.innerHTML=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;text-align:center;color:var(--text3);box-shadow:var(--shadow);font-size:12px;display:flex;align-items:center;justify-content:center;gap:8px"><span style="font-size:18px">🎉</span><span>目前沒有需補貨的商品</span></div>`; return; }
  const rows=list.map(({p,d})=>{
    const color=d<=3?'var(--danger)':(d<=7?'var(--warn)':'var(--accent3)');
    const msg=d<=0?'已用完！':`(剩 ${d} 天)`;
    const compareTip=(d>=5&&d<=10)?`<span class="rb-tip">🛒 建議比價</span>`:'';
    return `<div class="rb-row" onclick="openCompareModal(${p.id})" style="border-left:4px solid ${color};margin-bottom:6px;box-shadow:var(--shadow)">
      <div class="rb-emoji" style="font-size:22px;width:30px">${p.emoji}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)">${p.name}</div>
        <div style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:6px;flex-wrap:wrap">${p.brand}${compareTip}</div>
      </div>
      <div style="text-align:right;margin-right:4px">
        <div style="font-size:13px;font-weight:700;color:${color}">${msg}</div>
        <div style="font-size:11px;color:var(--text2)">$${p.price.toLocaleString()}</div>
      </div>
      <div class="rb-go">›</div>
    </div>`;
  }).join('');
  const totalNeed=products.filter(p=>getDaysLeft(p)<=14).length;
  const more=totalNeed-list.length;
  const moreBtn=more>0
    ? `<button class="load-more-btn" onclick="goAllReminder()">查看全部 ${totalNeed} 項 →</button>`
    : `<button class="load-more-btn" onclick="goAllReminder()">管理商品 →</button>`;
  el.innerHTML=rows+moreBtn;
}
// 「查看全部 / 管理商品」入口：在補貨頁就捲到「📋 所有商品」，否則切到補貨頁
function goAllReminder(){
  const onReminder=document.getElementById('reminder')?.classList.contains('active');
  if(onReminder){
    const target=document.getElementById('productList');
    if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
  } else {
    navTab('reminder');
  }
}
function renderReminderHeader(){
  const now=getNow();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const varTotal=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='var').reduce((s,r)=>s+r.price,0);
  const urgent=products.filter(p=>getDaysLeft(p)<=7).length;
  const a=document.getElementById('remTotalCount'); if(a) a.textContent=products.length;
  const b=document.getElementById('remUrgentCount'); if(b) b.textContent=urgent;
  const c=document.getElementById('remMonthSpend'); if(c) c.textContent=`$${varTotal.toLocaleString()}`;
}

// ── FIXED (with deduction confirm) ──
function renderFixed(){
  const total=getMonthlyFixed();
  document.getElementById('fixedPageTotal').textContent=`$${total.toLocaleString()}`;
  document.getElementById('fixedPageCount').textContent=`共 ${fixedExpenses.length} 項`;

  const list=document.getElementById('fixedList');
  if(!fixedExpenses.length){
    list.innerHTML=`<div style="text-align:center;padding:32px;color:var(--text3)">還沒有固定支出<br>點上方「📺 ＋ 新增訂閱／固定」開始記錄</div>`;
    return;
  }
  const cycleLabel={monthly:'每月',yearly:'每年',weekly:'每週'};
  const weekdayName=['','週一','週二','週三','週四','週五','週六','週日'];
  list.innerHTML=fixedExpenses.map(f=>{
    const confirmed=isConfirmed(f.id);
    const daysUntil=f.cycle==='monthly'?getDaysUntilDeduction(f.day):null;
    const isSoon=daysUntil!==null&&daysUntil<=5&&!confirmed;
    const monthlyAmt=f.cycle==='yearly'?Math.round(f.amount/12):(f.cycle==='weekly'?Math.round(f.amount*52/12):f.amount);
    let dueLabel='',dueCls='ok';
    if(f.cycle==='monthly'){
      if(confirmed){dueLabel='✓ 本月已確認';dueCls='done';}
      else if(daysUntil===0){dueLabel='今天扣款';dueCls='soon';}
      else if(isSoon){dueLabel=`${daysUntil}天後扣款`;dueCls='soon';}
      else{dueLabel=`每月${f.day}號`;dueCls='ok';}
    } else if(f.cycle==='yearly'){
      const m=f.monthOfYear||1;
      dueLabel=`每年 ${m}月${f.day}日`;
    }
    else{
      const wd=weekdayName[f.day]||`第${f.day}天`;
      dueLabel=`每${wd}`;
    }

    const isAuto=!!confirmedDeductions[deductionKey(f.id)+'_auto'];
    const confirmBtn=!confirmed&&f.cycle==='monthly'
      ? `<button class="btn-sm primary" style="font-size:11px" onclick="confirmDeduction(${f.id})">✓ 本月已扣款</button>`
      : confirmed
        ? `<button class="btn-sm confirmed-btn" style="font-size:11px" onclick="unconfirmDeduction(${f.id})">${isAuto?'🤖 自動確認':'✓ 已確認'}（取消）</button>`
        : '';

    // 付款方式徽章（顯示在 meta 列）
    let payLabel='';
    if(f.pay==='card' && f.cardId){
      const c=creditCards.find(x=>x.id===f.cardId);
      if(c) payLabel=` · 💳 ${c.name}${c.last4?' ··'+c.last4:''}`;
      else payLabel=' · 💳 信用卡';
    } else if(f.pay==='cash' || !f.pay){
      payLabel=' · 💵 現金';
    }
    return `<div class="fixed-card ${confirmed?'confirmed':''}">
      <div class="cat-stripe" style="background:${confirmed?'var(--accent3)':'var(--fixed)'}"></div>
      <div class="fixed-card-inner">
        <div class="fixed-emoji">${f.emoji}</div>
        <div class="fixed-info">
          <div class="fixed-name">${f.name}</div>
          <div class="fixed-meta">${cycleLabel[f.cycle]}${payLabel}${f.note?` · ${f.note}`:''}</div>
        </div>
        <div class="fixed-right">
          <div class="fixed-amount">$${f.amount.toLocaleString()}</div>
          ${f.cycle==='yearly'?`<div style="font-size:11px;color:var(--text2)">月均 $${monthlyAmt}</div>`:''}
          <div class="fixed-due ${dueCls}">${dueLabel}</div>
        </div>
      </div>
      <div class="fixed-actions">
        ${confirmBtn}
        <button class="btn-sm" onclick="editFixed(${f.id})" style="font-size:11px">✏️ 編輯</button>
        <button class="btn-sm del" onclick="deleteFixed(${f.id})" style="flex:0;padding:7px 14px">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── RECORDS ──

function renderChart(){
  const now=getNow();
  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const varT=records.filter(r=>getEffectiveMonth(r)===ym&&r.type!=='fixed').reduce((s,r)=>s+r.price,0);
    months.push({label:`${d.getMonth()+1}月`,total:varT+getMonthlyFixed()});
  }
  const max=Math.max(...months.map(m=>m.total),1);
  document.getElementById('barChart').innerHTML=months.map((m,i)=>{
    const pct=(m.total/max)*100,isCur=i===5;
    return `<div class="bar-col"><div class="bar-val">${m.total>0?Math.round(m.total/1000)+'K':''}</div><div class="bar-wrap"><div class="bar" style="height:${pct}%;background:${isCur?'linear-gradient(to top,var(--accent),var(--accent2))':'var(--bg2)'}"></div></div><div class="bar-label">${m.label}</div></div>`;
  }).join('');
  document.getElementById('chartSubtitle').textContent=`最高 $${Math.max(...months.map(m=>m.total)).toLocaleString()}`;
}

// ── PRICE HISTORY ──
function openPriceHistory(id){
  currentPriceProductId=id;
  const p=products.find(x=>x.id===id);
  document.getElementById('priceModalTitle').textContent=`📈 ${p.name}`;
  document.getElementById('ph-price').value='';
  renderPriceHistoryList();
  document.getElementById('priceModalOverlay').classList.add('open');
}

function renderPriceHistoryList(){
  const id=currentPriceProductId;
  const hist=getPriceHistory(id);
  const listEl=document.getElementById('priceHistoryList');
  if(!hist.length){
    listEl.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3)">還沒有價格記錄<br>每次補貨時記錄當下購買價格</div>`;
    return;
  }
  const maxP=Math.max(...hist.map(h=>h.price));
  listEl.innerHTML=`<div class="ph-modal-list">`+hist.slice().reverse().map((h,i,arr)=>{
    const prev=arr[i+1];
    let deltaHtml='';
    if(prev){
      const diff=h.price-prev.price;
      if(diff>0)deltaHtml=`<span class="ph-modal-delta up">▲${diff}</span>`;
      else if(diff<0)deltaHtml=`<span class="ph-modal-delta down">▼${Math.abs(diff)}</span>`;
      else deltaHtml=`<span class="ph-modal-delta eq">—</span>`;
    }
    const barW=Math.round((h.price/maxP)*100);
    return `<div class="ph-modal-item">
      <div class="ph-modal-date">${fmtDate(h.date)}</div>
      <div style="flex:1"><div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:600">$${h.price.toLocaleString()}</div>
        <div style="height:5px;background:var(--border);border-radius:3px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${barW}%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px"></div></div>
      </div>
      ${deltaHtml}
    </div>`;
  }).join('')+`</div>`;
}

function addPriceRecord(){
  const price=parseInt(document.getElementById('ph-price').value);
  if(!price||price<=0){showToast('請輸入有效價格','error');return;}
  const id=currentPriceProductId;
  if(!priceHistory[id])priceHistory[id]=[];
  priceHistory[id].push({date:todayStr(),price});
  const p=products.find(x=>x.id===id);
  if(p)p.price=price;
  save();renderPriceHistoryList();renderProducts();
}

// ── ACTIONS ──
function confirmDeduction(id){
  confirmedDeductions[deductionKey(id)]=true;
  // 若是負債分期的 linkedFixed，同步推進負債 paidMonths（idempotent）
  const fx=fixedExpenses.find(f=>f.id===id);
  if(fx && fx._linkedDebtId){
    const dKey=deductionKey(id)+'_debtPaid';
    if(!confirmedDeductions[dKey]){
      const d=debts.find(x=>x.id===fx._linkedDebtId);
      if(d && d.paidMonths<d.totalMonths){
        d.paidMonths++;
        if(d.paidMonths>=d.totalMonths){
          d.status='paid';
          if(d.linkedFixedId){
            fixedExpenses=fixedExpenses.filter(f=>f.id!==d.linkedFixedId);
            d.linkedFixedId=null;
          }
          showToast(`🎉 ${d.name} 已全數還清！`,'ok');
        } else {
          // 更新 linkedFixed 備註剩餘期數
          fx.note=`負債分期：剩 ${d.totalMonths-d.paidMonths} 期`;
        }
        confirmedDeductions[dKey]=true;
      }
    }
  }
  save();renderAll();
}
function unconfirmDeduction(id){
  delete confirmedDeductions[deductionKey(id)];
  delete confirmedDeductions[deductionKey(id)+'_auto'];
  // 取消後，標記「本月不要再自動 confirm 這筆」避免下次啟動又被自動勾回來
  confirmedDeductions[deductionKey(id)+'_skip']=true;
  // 若曾透過此確認推進負債分期，回退一期
  const fx=fixedExpenses.find(f=>f.id===id);
  if(fx && fx._linkedDebtId){
    const dKey=deductionKey(id)+'_debtPaid';
    if(confirmedDeductions[dKey]){
      const d=debts.find(x=>x.id===fx._linkedDebtId);
      if(d && d.paidMonths>0){
        d.paidMonths--;
        if(d.status==='paid'){
          d.status='active';
          // 重建 linkedFixed
          if(!d.linkedFixedId){
            const newFx={id:Date.now(),name:`${d.name}（負債）`,emoji:d.emoji,amount:d.monthlyPayment,day:d.day,cycle:'monthly',note:`負債分期：剩 ${d.totalMonths-d.paidMonths} 期`,pay:d.pay||'cash',cardId:d.cardId,_linkedDebtId:d.id};
            fixedExpenses.push(newFx);
            d.linkedFixedId=newFx.id;
          }
        } else {
          fx.note=`負債分期：剩 ${d.totalMonths-d.paidMonths} 期`;
        }
      }
      delete confirmedDeductions[dKey];
    }
  }
  save();renderAll();
}
function markRestocked(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const today=todayStr();
  p.boughtDate=today;
  records.push({id:Date.now(),productId:p.id,name:p.name,emoji:p.emoji,brand:p.brand,price:p.price,cat:p.cat,date:today,type:'var'});
  save();renderAll();
}
function recordBuy(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  showConfirm(`記錄購買「${p.name}」？<br><span style="color:var(--accent2);font-family:'DM Mono',monospace;font-size:18px;font-weight:700">NT$ ${p.price.toLocaleString()}</span>`,()=>{
    records.push({id:Date.now(),productId:p.id,name:p.name,emoji:p.emoji,brand:p.brand,price:p.price,cat:p.cat,date:todayStr(),type:'var'});
    save();renderAll();
  });
}
function deleteProduct(id){
  const idx=products.findIndex(x=>x.id===id); if(idx<0) return;
  const p=products[idx];
  const backup={item:p,idx,priceHistory:JSON.parse(JSON.stringify(priceHistory?.[id]||null))};
  products.splice(idx,1);
  save();renderAll();
  showUndoToast(`已刪除「${p.name}」`,()=>{
    products.splice(backup.idx,0,backup.item);
    if(backup.priceHistory) priceHistory[id]=backup.priceHistory;
    save();renderAll();
    showToast('✓ 已復原','ok');
  });
}
function openShopee(id){
  const p=products.find(x=>x.id===id);
  if(p&&p.shopeeUrl)window.open(p.shopeeUrl,'_blank');
}
function deleteFixed(id){
  const idx=fixedExpenses.findIndex(x=>x.id===id); if(idx<0) return;
  const f=fixedExpenses[idx];
  fixedExpenses.splice(idx,1);
  save();renderAll();
  showUndoToast(`已刪除「${f.name}」`,()=>{
    fixedExpenses.splice(idx,0,f);
    save();renderAll();
    showToast('✓ 已復原','ok');
  });
}
function saveIncome(){
  // incomeInput removed from settings; income is now set via payslip/manual salary
  renderAll();
}
function saveBudget(){
  const v=parseInt(document.getElementById('budgetInput').value)||0;
  monthlyBudget=v;save();renderAll();
}

// ── BUDGET EDIT TOGGLE (lock/unlock with sanity check) ──
function toggleBudgetEdit(kind){
  const cfg={
    budget:{input:'budgetInput',btn:'budgetSaveBtn',cur:monthlyBudget,save:v=>{monthlyBudget=v;localStorage.setItem('btBudget',v.toString());save();},name:'採購預算'},
    life:{input:'lifeBudgetInput',btn:'lifeBudgetSaveBtn',cur:lifeBudget,save:v=>{lifeBudget=v;localStorage.setItem('btLifeBudget',v.toString());},name:'生活花費預算'},
    fixed:{input:'fixedBudgetInput',btn:'fixedBudgetSaveBtn',cur:fixedBudget,save:v=>{fixedBudget=v;localStorage.setItem('btFixedBudget',v.toString());},name:'固定花費預算'}
  }[kind];
  if(!cfg) return;
  const inp=document.getElementById(cfg.input);
  const btn=document.getElementById(cfg.btn);
  if(inp.readOnly){
    // unlock
    inp.readOnly=false; inp.classList.remove('locked');
    inp.focus(); inp.select();
    btn.textContent='💾 儲存';
  } else {
    // attempt save
    const v=parseInt(inp.value)||0;
    const old=cfg.cur;
    // Sanity check: warn if new value is 5x larger or smaller (likely typo)
    if(old>0 && v>0 && (v>=old*5 || v<=old/5)){
      const dir=v>old?'放大':'縮小';
      showConfirm(`${cfg.name} 從 <strong>$${old.toLocaleString()}</strong> ${dir}至 <strong style="color:var(--danger)">$${v.toLocaleString()}</strong>？<br><span style="color:var(--text2);font-size:11px">差異很大，請確認沒有多打或少打 0</span>`,()=>{
        cfg.save(v); inp.readOnly=true; inp.classList.add('locked');
        btn.textContent='✏️ 編輯'; renderAll();
        showToast(`✓ ${cfg.name}已更新`,'ok');
      });
      return;
    }
    cfg.save(v); inp.readOnly=true; inp.classList.add('locked');
    btn.textContent='✏️ 編輯'; renderAll();
    showToast(`✓ ${cfg.name}已儲存`,'ok');
  }
}

function deleteRecord(id){
  const idx=records.findIndex(r=>String(r.id)===String(id));
  if(idx<0) return;
  const r=records[idx];
  records.splice(idx,1);
  save();renderRecords();renderChart();renderStats();
  showUndoToast(`已刪除「${r.name}」`,()=>{
    records.splice(idx,0,r);
    save();renderRecords();renderChart();renderStats();
    showToast('✓ 已復原','ok');
  });
}
function clearData(type){
  if(type==='records'){
    showConfirm('確定清除所有花費記錄？<br><span style="font-size:11px;color:var(--text2)">此操作無法復原</span>',()=>{
      records=[];save();renderAll();
    });
  } else if(type==='all'){
    showConfirm('確定重置全部資料？<br><span style="font-size:11px;color:var(--danger)">所有品項、記錄、設定將全部清除，無法復原</span>',()=>{
      // 掃描所有 bt 開頭的 LS key 一次清光，避免漏掉新功能加的 key
      const keys=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k && k.startsWith('bt')) keys.push(k);
      }
      keys.forEach(k=>localStorage.removeItem(k));
      // 明確存空陣列，防止 JS 裡的硬寫預設品項重新載入
      localStorage.setItem('btProducts','[]');
      localStorage.setItem('btRecords','[]');
      localStorage.setItem('btFixed','[]');
      // 也清掉 service worker 快取，確保下次載入是乾淨的
      if('caches' in window){
        caches.keys().then(ks=>ks.forEach(k=>caches.delete(k))).finally(()=>location.reload());
      } else {
        location.reload();
      }
    });
  }
}
function changeRecordMonth(d){
  recordMonth.m+=d;
  if(recordMonth.m>11){recordMonth.m=0;recordMonth.y++;}
  if(recordMonth.m<0){recordMonth.m=11;recordMonth.y--;}
  renderRecords();renderChart();
}

// ── PAGE NAV ──
const REPORT_PAGES=['record','income','fixed'];
function openReports(el){
  const last=localStorage.getItem('btLastReport');
  const target=REPORT_PAGES.includes(last)?last:'record';
  showPage(target, el);
}
window.openReports=openReports;
function showPage(id,el){
  navigator.vibrate?.(8);
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).style.display='block';
  document.getElementById(id).classList.add('active');
  if(el && el.classList) el.classList.add('active');
  // 同步底部導覽列高亮
  const bn=document.getElementById('bottomNav');
  if(bn){
    bn.querySelectorAll('.bn-item').forEach(b=>b.classList.remove('active'));
    let navKey=id;
    if(REPORT_PAGES.includes(id)){ navKey='record'; localStorage.setItem('btLastReport',id); }
    const target=bn.querySelector(`.bn-item[data-page="${navKey}"]`);
    if(target) target.classList.add('active');
  }
  // 同步報表分頁列高亮
  document.querySelectorAll('.report-tabs .rt-btn').forEach(b=>{
    b.classList.toggle('active', b.getAttribute('data-rt')===id);
  });
  document.body.classList.toggle('home-active', id==='home');
  closeFab();
  const now=getNow();
  updateMonthBadge(now);
  renderStats(now);
  if(id==='home'){ renderHqCats(); if(typeof renderNetWorth==='function') renderNetWorth(); if(typeof renderOnboardBanner==='function') renderOnboardBanner(); if(typeof renderCardPendingHome==='function') renderCardPendingHome(); }
  if(id==='reminder'){ renderCatTabs(); renderProducts(); renderReminderHeader(); renderHomeRestockSummary(); }
  if(id==='fixed'){ renderFixed(); if(typeof renderDebts==='function') renderDebts(); }
  if(id==='record'){ renderRecords(); renderChart(); }
  if(id==='income') renderIncome();
  if(id==='settings'){
    const bud=document.getElementById('budgetInput');
    const lbud=document.getElementById('lifeBudgetInput');
    const fbud=document.getElementById('fixedBudgetInput');
    if(bud){
      bud.value=monthlyBudget>0?monthlyBudget:'';
      bud.readOnly=true; bud.classList.add('locked');
      const sb=document.getElementById('budgetSaveBtn'); if(sb) sb.textContent='✏️ 編輯';
    }
    if(lbud){
      lbud.value=lifeBudget>0?lifeBudget:'';
      lbud.readOnly=true; lbud.classList.add('locked');
      const sb=document.getElementById('lifeBudgetSaveBtn'); if(sb) sb.textContent='✏️ 編輯';
    }
    if(fbud){
      fbud.value=fixedBudget>0?fixedBudget:'';
      fbud.readOnly=true; fbud.classList.add('locked');
      const sb=document.getElementById('fixedBudgetSaveBtn'); if(sb) sb.textContent='✏️ 編輯';
    }
    const kEl=document.getElementById('claudeKeyInput');
    if(kEl&&claudeApiKey) kEl.value=claudeApiKey;
    const gEl=document.getElementById('geminiKeyInput');
    if(gEl&&geminiApiKey) gEl.value=geminiApiKey;
    renderClaudeKeyStatus();
    renderGeminiKeyStatus();
    renderAiProviderBtns();
    if(typeof renderInvSeenHint==='function') renderInvSeenHint();
    renderStats();
  }
}

// ── FAB (bottom-sheet card grid) ──
function toggleFab(){
  fabOpen=!fabOpen;
  navigator.vibrate?.(10);
  const ov=document.getElementById('fabSheetOverlay');
  const btn=document.getElementById('mainFab');
  if(!ov) return;
  if(fabOpen){
    ov.classList.add('open');
    btn.textContent='✕';
    btn.classList.add('open');
    if(typeof renderFabRecent==='function') renderFabRecent();
  } else closeFab();
}
function closeFab(){
  fabOpen=false;
  const ov=document.getElementById('fabSheetOverlay');
  const btn=document.getElementById('mainFab');
  if(ov) ov.classList.remove('open');
  if(btn){ btn.textContent='＋'; btn.classList.remove('open'); }
}
function openFab(){ if(!fabOpen) toggleFab(); }
// 兼容舊呼叫（已不再使用，但保險）
function toggleFabCat(){ /* deprecated, kept as no-op */ }

// ── PHASE G: FAB 使用次數追蹤 + ⭐ 常用置頂 ──
const _fabUsage=LS.getJSON('btFabUsage',{}) || {};
function _trackFabUse(card){
  const title=card.querySelector('.fab-card-title')?.textContent?.trim();
  if(!title) return;
  _fabUsage[title]=(_fabUsage[title]||0)+1;
  LS.set('btFabUsage',_fabUsage);
}
document.addEventListener('click',e=>{
  const card=e.target.closest('.fab-card');
  if(card && document.getElementById('fabSheetOverlay')?.classList.contains('open')) _trackFabUse(card);
},true);
function renderFabRecent(){
  const sheet=document.getElementById('fabSheet');
  if(!sheet) return;
  // 先清掉舊的常用區
  sheet.querySelector('#fabRecentSection')?.remove();
  const top=Object.entries(_fabUsage).filter(([_,c])=>c>=2).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k);
  if(!top.length) return;
  // 從現有卡找出對應 node 複製過來
  const allCards=Array.from(sheet.querySelectorAll('.fab-card'));
  const picks=top.map(t=>allCards.find(c=>c.querySelector('.fab-card-title')?.textContent?.trim()===t)).filter(Boolean);
  if(!picks.length) return;
  const sec=document.createElement('div');
  sec.id='fabRecentSection';
  sec.innerHTML=`<div class="fab-section-label">⭐ 常用</div>
    <div class="fab-sheet-grid fab-grid-compact"></div>`;
  const grid=sec.querySelector('.fab-sheet-grid');
  picks.forEach(p=>grid.appendChild(p.cloneNode(true)));
  // 插到第一個 .fab-section-label 前
  const firstLabel=sheet.querySelector('.fab-section-label');
  if(firstLabel) sheet.insertBefore(sec,firstLabel);
  else sheet.prepend(sec);
}
window.renderFabRecent=renderFabRecent;
function openAIChooser(){
  document.getElementById('aiChooserOverlay').classList.add('open');
}

// ── 📷 INVOICE QR SCANNER (台灣電子發票) ──
window._invScanState={stream:null,running:false,detector:null,pending:null,raf:0};

async function openInvoiceScanner(){
  closeFab();
  const errEl=document.getElementById('invScanError');
  errEl.style.display='none'; errEl.textContent='';
  document.getElementById('invScanHint').textContent='對準發票左下角 QR Code';
  document.getElementById('invoiceScanOverlay').classList.add('open');
  // 偵測能力
  if(!('BarcodeDetector' in window)){
    errEl.innerHTML='⚠️ 此瀏覽器不支援相機即時掃描<br>請改用 <strong>📁 選擇照片</strong>（iOS Safari 17+ / Chrome 支援）';
    errEl.style.display='block';
    return;
  }
  try{
    _invScanState.detector=new BarcodeDetector({formats:['qr_code']});
  }catch(e){
    errEl.textContent='⚠️ 無法建立掃描器：'+e.message; errEl.style.display='block'; return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    _invScanState.stream=stream;
    const vid=document.getElementById('invScanVideo');
    vid.srcObject=stream;
    await vid.play();
    _invScanState.running=true;
    scanLoop();
  }catch(e){
    errEl.innerHTML='⚠️ 無法開啟相機：'+e.message+'<br>請改用 <strong>📁 選擇照片</strong>';
    errEl.style.display='block';
  }
}

function closeInvoiceScanner(){
  _invScanState.running=false;
  if(_invScanState.raf) cancelAnimationFrame(_invScanState.raf);
  if(_invScanState.stream){ _invScanState.stream.getTracks().forEach(t=>t.stop()); _invScanState.stream=null; }
  const vid=document.getElementById('invScanVideo'); if(vid) vid.srcObject=null;
  closeModal('invoiceScanOverlay');
}

async function scanLoop(){
  if(!_invScanState.running) return;
  const vid=document.getElementById('invScanVideo');
  const det=_invScanState.detector;
  if(vid && vid.readyState>=2 && det){
    try{
      const codes=await det.detect(vid);
      if(codes && codes.length){
        const raw=codes[0].rawValue||'';
        onInvoiceQRDecoded(raw);
        return;
      }
    }catch(e){/* ignore frame errors */}
  }
  _invScanState.raf=requestAnimationFrame(scanLoop);
}

async function scanInvoiceFiles(files){
  if(!files||!files.length) return;
  const errEl=document.getElementById('invScanError');
  errEl.style.display='none';
  let detector;
  try{ detector=('BarcodeDetector' in window)?new BarcodeDetector({formats:['qr_code']}):null; }catch(e){ detector=null; }
  if(!detector){
    errEl.innerHTML='⚠️ 此瀏覽器不支援 QR 辨識<br>建議使用 Chrome / Edge / Safari 17+';
    errEl.style.display='block';
    return;
  }
  let found=null, failed=0;
  for(const file of files){
    try{
      const bmp=await createImageBitmap(file);
      const codes=await detector.detect(bmp);
      if(codes && codes.length){ found=codes[0].rawValue||''; break; }
      else failed++;
    }catch(e){ failed++; }
  }
  if(found){ onInvoiceQRDecoded(found); }
  else{
    errEl.innerHTML=`❌ ${files.length} 張圖片都未偵測到 QR Code<br>請確認對準發票左下角、光線充足`;
    errEl.style.display='block';
  }
}

// 解析財政部電子發票 QR 左碼
// 格式：字軌10 + 民國YYYMMDD7 + 隨機4 + 銷售額8hex + 總計8hex + 買方統編8 + 賣方統編8 + 驗證24 + ** + items
function parseTaiwanInvoiceQR(raw){
  try{
    if(!raw||raw.length<77) return null;
    const inv=raw.substring(0,10);
    if(!/^[A-Z]{2}\d{8}$/.test(inv)) return null;
    const rocDate=raw.substring(10,17); // YYYMMDD 民國
    const rocY=parseInt(rocDate.substring(0,3),10);
    const mm=rocDate.substring(3,5), dd=rocDate.substring(5,7);
    const date=`${rocY+1911}-${mm}-${dd}`;
    // 隨機碼 17-21
    // 銷售額 21-29（稅前）
    // 總計金額 29-37（含稅，hex）
    const totalHex=raw.substring(29,37);
    const total=parseInt(totalHex,16);
    if(isNaN(total)||total<=0||total>1000000) return null;
    const buyerId=raw.substring(37,45);
    const sellerId=raw.substring(45,53);
    // 54+ 是驗證碼 ** items
    let items=[];
    const idx=raw.indexOf('**');
    if(idx>0 && idx+2<raw.length){
      const tail=raw.substring(idx+2);
      // tail 格式：:AES加密:BASE64品項  → 只擷取可見中文品項
      const parts=tail.split(':').filter(s=>s && /[\u4e00-\u9fff]/.test(s));
      items=parts.slice(0,20);
    }
    return {
      invoice:inv, date, total,
      sellerId:(/^\d{8}$/.test(sellerId)?sellerId:''),
      buyerId:(/^\d{8}$/.test(buyerId)?buyerId:''),
      items
    };
  }catch(e){ return null; }
}

window._invPending=null;
function onInvoiceQRDecoded(raw){
  const parsed=parseTaiwanInvoiceQR(raw);
  if(!parsed){
    const errEl=document.getElementById('invScanError');
    errEl.innerHTML=`⚠️ 不是台灣電子發票格式<br><div style="font-size:10px;color:#999;word-break:break-all;margin-top:4px">原始內容：${raw.substring(0,60)}...</div>`;
    errEl.style.display='block';
    // 繼續掃
    if(_invScanState.running) _invScanState.raf=requestAnimationFrame(scanLoop);
    return;
  }
  // 停掉相機、關 scanner modal、開結果
  closeInvoiceScanner();
  // 查重：字軌已記過 → 跳訊息
  if(invoiceSeen && invoiceSeen[parsed.invoice]){
    const prev=invoiceSeen[parsed.invoice];
    showToast(`⚠️ 發票 ${parsed.invoice} 已記過\n${prev.date} · $${(prev.total||0).toLocaleString()}`,'error');
    return;
  }
  _invPending=parsed;
  // 填結果
  const body=document.getElementById('invoiceResultBody');
  body.innerHTML=`
    <div style="background:linear-gradient(135deg,rgba(0,188,212,0.12),rgba(240,138,107,0.08));border:1.5px solid rgba(0,188,212,0.3);border-radius:var(--r-sm);padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <div style="font-size:11px;color:var(--text2)">💰 金額</div>
        <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:800;color:var(--accent)">$${parsed.total.toLocaleString()}</div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:3px"><span>📅 日期</span><span style="color:var(--text);font-weight:600">${parsed.date}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:3px"><span>🧾 發票</span><span style="color:var(--text);font-family:'DM Mono',monospace">${parsed.invoice}</span></div>
      ${parsed.sellerId?`<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)"><span>🏪 賣方</span><span style="color:var(--text);font-family:'DM Mono',monospace">${parsed.sellerId}</span></div>`:''}
    </div>
    ${parsed.items.length?`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:12px">
      <div style="font-size:10px;color:var(--text2);margin-bottom:6px">📋 品項（${parsed.items.length}）</div>
      <div style="font-size:12px;line-height:1.7">${parsed.items.slice(0,8).map(i=>`• ${i}`).join('<br>')}${parsed.items.length>8?'<br>...':''}</div>
    </div>`:''}
    <div class="form-group"><label class="form-label">品名（可修改）</label>
      <input class="form-input" id="ir-name" value="${parsed.items[0]||'發票'+parsed.invoice.slice(-4)}"/>
    </div>
  `;
  // 分類下拉（使用生活花費類別 expCats，而非補貨品項類別）
  const catSel=document.getElementById('ir-cat');
  catSel.innerHTML=expCats.map(c=>`<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
  // 簡單分類猜測
  const guess=guessInvoiceCategory(parsed);
  if(guess && expCats.some(c=>c.id===guess)) catSel.value=guess;
  document.getElementById('ir-pay').value='card';
  // 重置 type 選擇 → 預設生活花費
  _invType='life';
  document.querySelectorAll('#invoiceTypeSelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  const lifeOpt=document.querySelector('#invoiceTypeSelect [data-val="life"]');
  if(lifeOpt) lifeOpt.classList.add('selected');
  applyInvoiceTypeUI();
  document.getElementById('invoiceResultOverlay').classList.add('open');
}

// 切換發票記到「生活花費」或「補貨採購」
let _invType='life';
function selectInvoiceType(el, mode){
  document.querySelectorAll('#invoiceTypeSelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  _invType=mode;
  applyInvoiceTypeUI();
}
function applyInvoiceTypeUI(){
  const catSel=document.getElementById('ir-cat');
  const hint=document.getElementById('invoiceTypeHint');
  if(!catSel) return;
  if(_invType==='restock'){
    // 切到補貨採購 → 用補貨類別 (categories: 保健品/保養品/日用品)
    catSel.innerHTML=categories.map(c=>`<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
    if(hint) hint.textContent='將計入「本月採購」（保健品/保養品/日用品），不會新增到商品清單';
  } else {
    catSel.innerHTML=expCats.map(c=>`<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
    const guess=_invPending?guessInvoiceCategory(_invPending):null;
    if(guess && expCats.some(c=>c.id===guess)) catSel.value=guess;
    if(hint) hint.textContent='將以「分類」記入生活花費（餐飲/交通/醫藥保健…）';
  }
}
window.selectInvoiceType=selectInvoiceType;
window._setInvCatList=applyInvoiceTypeUI; // legacy

function guessInvoiceCategory(parsed){
  const text=(parsed.items.join(' ')||'').toLowerCase();
  const rules=[
    {kw:['餐','便當','飲','咖啡','茶','pizza','mcd','麥當勞','星巴克','麵','飯','鍋'],cat:'food'},
    {kw:['油','停車','uber','計程','客運','高鐵','台鐵','捷運'],cat:'transport'},
    {kw:['書','電影','遊戲','steam','netflix','spotify'],cat:'entertainment'},
    {kw:['衣','鞋','uniqlo','zara','服飾'],cat:'clothing'},
  ];
  for(const r of rules){
    if(r.kw.some(k=>text.includes(k))){
      if(categories.some(c=>c.id===r.cat)) return r.cat;
    }
  }
  return null;
}

function confirmInvoiceRecord(){
  if(!_invPending) return;
  const name=document.getElementById('ir-name').value.trim()||'發票';
  const cat=document.getElementById('ir-cat').value;
  const pay=document.getElementById('ir-pay').value;
  const p=_invPending;
  const isRestock=_invType==='restock';
  const rec={
    id:Date.now(),
    name,
    emoji:isRestock?(catById(cat)?.emoji||'📦'):(catEmoji(cat)||'🧾'),
    brand:'掃描發票',
    price:p.total,
    cat,
    date:p.date,
    type:isRestock?'var':'life',
    pay,
    invoice:p.invoice,
    note:`發票 ${p.invoice}${p.sellerId?' · '+p.sellerId:''}`
  };
  if(pay==='card' && creditCards.length){
    rec.cardId=creditCards[0].id;
    rec.billingMonth=typeof calcBillingMonth==='function'?calcBillingMonth(p.date,creditCards[0]):'';
  }
  records.push(rec);
  // 記錄字軌防重
  if(!invoiceSeen) invoiceSeen={};
  invoiceSeen[p.invoice]={date:p.date,total:p.total,seller:p.sellerId||'',savedAt:new Date().toISOString()};
  save();
  closeModal('invoiceResultOverlay');
  showToast(`✓ 已加入 ${name} $${p.total.toLocaleString()}`,'ok');
  if(typeof renderAll==='function') renderAll();
  _invPending=null;
}

// ── 📥 CSV 匯入（統一發票兌獎 App 匯出的消費明細）──
window._csvPending=null;

function parseCSVLine(line){
  // 支援雙引號內含逗號
  const out=[]; let cur='', q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ q=!q; continue; }
    if(c===',' && !q){ out.push(cur); cur=''; continue; }
    cur+=c;
  }
  out.push(cur);
  return out.map(s=>s.trim());
}

function parseInvoiceCSV(text){
  // 財政部 App 匯出格式欄位（常見）：發票狀態, 發票號碼(字軌), 發票日期, 載具名稱, 賣方名稱, 賣方統編, 金額, 幣別, 註記
  // 實際上使用者匯出的檔案可能是 UTF-8 BOM，且欄位順序略有不同
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
  if(lines.length<2) return [];
  const header=parseCSVLine(lines[0]).map(h=>h.replace(/\s+/g,''));
  // 找欄位位置
  const findCol=(...keys)=>{
    for(const k of keys){
      const i=header.findIndex(h=>h.includes(k));
      if(i>=0) return i;
    }
    return -1;
  };
  const colInv=findCol('發票號碼','字軌','號碼');
  const colDate=findCol('發票日期','日期');
  const colSeller=findCol('賣方名稱','店家','商家','賣方');
  const colSellerId=findCol('賣方統編','統編');
  const colAmount=findCol('金額','總計','總金額');
  if(colInv<0 || colDate<0 || colAmount<0) return [];
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const f=parseCSVLine(lines[i]);
    const inv=(f[colInv]||'').replace(/[-\s]/g,'').toUpperCase();
    if(!/^[A-Z]{2}\d{8}$/.test(inv)) continue;
    // 日期格式：可能是 113/04/25 或 2024-04-25 或 2024/04/25
    let date=f[colDate]||'';
    const m1=date.match(/^(\d{2,4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if(m1){
      let y=parseInt(m1[1]);
      if(y<1911) y+=1911; // 民國年
      date=`${y}-${String(m1[2]).padStart(2,'0')}-${String(m1[3]).padStart(2,'0')}`;
    }
    const total=parseInt((f[colAmount]||'0').replace(/[^\d]/g,''))||0;
    if(total<=0) continue;
    rows.push({
      invoice:inv, date, total,
      seller:(colSeller>=0?f[colSeller]:'')||'',
      sellerId:(colSellerId>=0?(f[colSellerId]||'').replace(/\s/g,''):'')||''
    });
  }
  return rows;
}

async function importInvoiceCSV(ev){
  const files=ev.target.files; ev.target.value='';
  if(!files||!files.length) return;
  let all=[], totalRows=0, parseFailFiles=0;
  for(const f of files){
    try{
      const text=await f.text();
      const rows=parseInvoiceCSV(text);
      if(!rows.length){ parseFailFiles++; continue; }
      totalRows+=rows.length;
      all=all.concat(rows);
    }catch(e){ parseFailFiles++; }
  }
  if(!all.length){
    showToast(`❌ 未解析到任何發票${parseFailFiles?`（${parseFailFiles} 檔失敗）`:''}`,'error');
    return;
  }
  // 檔內去重（同字軌只留一筆）
  const byInv=new Map();
  all.forEach(r=>{ if(!byInv.has(r.invoice)) byInv.set(r.invoice,r); });
  const unique=[...byInv.values()];
  // 分類：已存在字軌（重複）vs 新
  const dupes=[], news=[];
  unique.forEach(r=>{
    if(invoiceSeen && invoiceSeen[r.invoice]) dupes.push(r);
    else news.push(r);
  });
  _csvPending={news,dupes,totalRows,parseFailFiles};
  // 渲染摘要
  const body=document.getElementById('csvImportBody');
  body.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:linear-gradient(135deg,rgba(24,184,124,0.12),rgba(24,184,124,0.04));border:1px solid rgba(24,184,124,0.3);border-radius:var(--r-sm);padding:10px;text-align:center">
        <div style="font-size:10px;color:var(--text2)">✨ 新增</div>
        <div style="font-size:20px;font-weight:800;color:var(--accent3);font-family:'DM Mono',monospace">${news.length}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;text-align:center">
        <div style="font-size:10px;color:var(--text2)">⚠️ 重複</div>
        <div style="font-size:20px;font-weight:800;color:var(--text2);font-family:'DM Mono',monospace">${dupes.length}</div>
      </div>
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;text-align:center">
        <div style="font-size:10px;color:var(--text2)">💰 總金額</div>
        <div style="font-size:16px;font-weight:700;color:var(--accent);font-family:'DM Mono',monospace">$${news.reduce((s,r)=>s+r.total,0).toLocaleString()}</div>
      </div>
    </div>
    ${news.length?`<div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-sm);padding:8px;margin-bottom:10px">
      ${news.slice(0,12).map(r=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 6px;border-bottom:1px solid var(--border)">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.date} · ${r.seller||r.invoice}</span>
        <span style="font-family:'DM Mono',monospace;color:var(--accent);font-weight:600">$${r.total.toLocaleString()}</span>
      </div>`).join('')}
      ${news.length>12?`<div style="text-align:center;font-size:10px;color:var(--text3);padding:6px">... 還有 ${news.length-12} 筆</div>`:''}
    </div>`:'<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px">沒有新發票可匯入</div>'}
    ${parseFailFiles?`<div style="font-size:10px;color:var(--danger);text-align:center;margin-bottom:8px">⚠️ ${parseFailFiles} 個檔案無法解析</div>`:''}
  `;
  // 下拉
  const catSel=document.getElementById('csv-cat');
  catSel.innerHTML=categories.map(c=>`<option value="${c.id}">${c.emoji} ${c.label||c.name||c.id}</option>`).join('');
  document.getElementById('csv-pay').value='cash';
  document.getElementById('csvImportConfirmBtn').disabled=news.length===0;
  document.getElementById('csvImportConfirmBtn').textContent=news.length?`✓ 匯入 ${news.length} 筆`:'無可匯入';
  document.getElementById('csvImportOverlay').classList.add('open');
}

function confirmCSVImport(){
  if(!_csvPending || !_csvPending.news.length){ closeModal('csvImportOverlay'); return; }
  const cat=document.getElementById('csv-cat').value;
  const pay=document.getElementById('csv-pay').value;
  const firstCard=creditCards.length?creditCards[0]:null;
  const now=Date.now();
  _csvPending.news.forEach((r,i)=>{
    const rec={
      id:now+i,
      name:r.seller||`發票 ${r.invoice.slice(-4)}`,
      emoji:'🧾',
      price:r.total,
      cat, date:r.date,
      type:'var', pay,
      invoice:r.invoice,
      note:`CSV 匯入 · ${r.invoice}${r.sellerId?' · '+r.sellerId:''}`
    };
    if(pay==='card' && firstCard){
      rec.cardId=firstCard.id;
      rec.billingMonth=typeof calcBillingMonth==='function'?calcBillingMonth(r.date,firstCard):'';
    }
    records.push(rec);
    if(!invoiceSeen) invoiceSeen={};
    invoiceSeen[r.invoice]={date:r.date,total:r.total,seller:r.sellerId||'',savedAt:new Date().toISOString()};
  });
  save();
  closeModal('csvImportOverlay');
  showToast(`✓ 匯入 ${_csvPending.news.length} 筆發票（跳過 ${_csvPending.dupes.length} 筆重複）`,'ok');
  if(typeof renderAll==='function') renderAll();
  if(typeof renderInvSeenHint==='function') renderInvSeenHint();
  const importedCount=_csvPending.news.length;
  _csvPending=null;
  // 匯入完若有中獎號碼資料 → 提示對獎
  if(importedCount>0){
    const hasNums=lotteryNumbers.special||lotteryNumbers.grand||(lotteryNumbers.first||[]).length;
    setTimeout(()=>{
      showConfirm(
        hasNums
          ?`本期新增 ${importedCount} 張發票，要立即對獎嗎？`
          :`本期新增 ${importedCount} 張發票，尚未設定獎號，要去設定嗎？`,
        ()=>{ hasNums?openLotteryModal():openLotteryModal(); }
      );
    },600);
  }
}

function renderInvSeenHint(){
  const el=document.getElementById('invSeenCount');
  if(el) el.textContent=Object.keys(invoiceSeen||{}).length;
}

function clearInvoiceSeen(){
  if(!confirm('清除字軌紀錄後，下次匯入 CSV / 掃 QR 可能會重複入帳。確定？')) return;
  invoiceSeen={};
  save();
  renderInvSeenHint();
  showToast('✓ 已清除字軌紀錄','ok');
}

// ── 🔍 發票查詢 ──
let invoiceSearchFilter='all'; // all | dup | only
function openInvoiceSearch(){
  document.getElementById('invoiceSearchOverlay').classList.add('open');
  const inp=document.getElementById('invSearchInput'); if(inp) inp.value='';
  invoiceSearchFilter='all';
  setInvoiceFilter('all');
}
function setInvoiceFilter(f){
  invoiceSearchFilter=f;
  ['all','dup','only'].forEach(k=>{
    const b=document.getElementById('invFilter'+(k==='all'?'All':k==='dup'?'Dup':'Only'));
    if(b) b.classList.toggle('primary',k===f);
  });
  renderInvoiceSearch();
}
function renderInvoiceSearch(){
  const list=document.getElementById('invSearchList');
  const summary=document.getElementById('invSearchSummary');
  if(!list) return;
  const q=(document.getElementById('invSearchInput')?.value||'').trim().toLowerCase();
  const seen=invoiceSeen||{};
  // 收集所有發票條目：來自 records (有 r.invoice) + 字軌紀錄
  const recsWithInv=records.filter(r=>r.invoice);
  const recMap=new Map();
  recsWithInv.forEach(r=>{
    if(!recMap.has(r.invoice)) recMap.set(r.invoice,[]);
    recMap.get(r.invoice).push(r);
  });
  // 合併條目
  const allInvNums=new Set([...Object.keys(seen),...recMap.keys()]);
  const items=[];
  allInvNums.forEach(inv=>{
    const recs=recMap.get(inv)||[];
    const meta=seen[inv]||null;
    items.push({
      inv,
      recs,
      meta,
      isDup:recs.length>1,
      hasRecord:recs.length>0,
      seller:meta?.seller||recs[0]?.name||'',
      total:meta?.total||recs[0]?.price||0,
      date:meta?.date||recs[0]?.date||''
    });
  });
  // filter
  let filtered=items;
  if(invoiceSearchFilter==='dup') filtered=filtered.filter(x=>x.isDup);
  else if(invoiceSearchFilter==='only') filtered=filtered.filter(x=>!x.hasRecord);
  if(q){
    filtered=filtered.filter(x=>{
      return (x.inv||'').toLowerCase().includes(q)
        || (x.seller||'').toLowerCase().includes(q)
        || String(x.total).includes(q);
    });
  }
  // sort by date desc
  filtered.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const dupCount=items.filter(x=>x.isDup).length;
  summary.innerHTML=`共 ${items.length} 張發票 · ${dupCount>0?`<span style="color:var(--warn);font-weight:700">⚠️ ${dupCount} 張疑似重複</span>`:'<span style="color:var(--accent3)">✓ 無重複</span>'}`;

  if(!filtered.length){
    list.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">${q?'查無相符紀錄':'沒有發票紀錄'}</div>`;
    return;
  }
  list.innerHTML=filtered.slice(0,200).map(x=>{
    const tail=(x.inv||'').slice(-4);
    const dupBadge=x.isDup?`<span style="background:var(--warn-light);color:var(--warn);font-size:10px;font-weight:700;padding:2px 6px;border-radius:8px;margin-left:6px">×${x.recs.length}</span>`:'';
    const sourceBadge=x.hasRecord?'':'<span style="background:var(--bg2);color:var(--text3);font-size:10px;padding:2px 6px;border-radius:8px;margin-left:6px">僅字軌</span>';
    const recList=x.recs.map(r=>`<div style="font-size:11px;color:var(--text2);padding-left:10px">· ${r.date} · ${r.name} · $${r.price.toLocaleString()}${r.cat?' · '+r.cat:''}</div>`).join('');
    return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:6px;background:var(--surface)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <div style="font-family:'DM Mono',monospace;font-size:12px;font-weight:700">${x.inv||'—'}${dupBadge}${sourceBadge}</div>
        <div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--accent)">$${x.total.toLocaleString()}</div>
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px">${x.date||'—'} · ${x.seller||'—'} · 末4碼 ${tail}</div>
      ${recList}
    </div>`;
  }).join('');
}

// ── 🎰 統一發票對獎 ──
function openLotteryEditModal(){
  closeModal('lotteryOverlay');
  document.getElementById('lot-period').value=lotteryNumbers.period||'';
  document.getElementById('lot-special').value=lotteryNumbers.special||'';
  document.getElementById('lot-grand').value=lotteryNumbers.grand||'';
  document.getElementById('lot-first').value=(lotteryNumbers.first||[]).join(', ');
  document.getElementById('lot-sixth').value=(lotteryNumbers.sixth||[]).join(', ');
  document.getElementById('lotteryEditOverlay').classList.add('open');
}

// ── 📸 AI 辨識中獎號碼（Claude / Gemini）──
function triggerLotteryAIScan(){
  if(!getActiveAiProvider()){
    showToast('請先到「⚙️ → 🤖 AI」設定 Claude 或 Gemini 金鑰','error');
    return;
  }
  document.getElementById('lotteryAIInput').click();
}

function onLotteryAIPick(ev){
  const file=ev.target.files[0]; ev.target.value='';
  if(!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    showToast('🤖 AI 辨識中…請稍候','ok');
    try{
      const parsed=await analyzeLotteryImage(e.target.result);
      lotteryNumbers={
        period:parsed.period||lotteryNumbers.period||'',
        special:(parsed.special||'').replace(/\D/g,'').slice(-8),
        grand:(parsed.grand||'').replace(/\D/g,'').slice(-8),
        first:(parsed.first||[]).map(s=>String(s).replace(/\D/g,'').slice(-8)).filter(s=>s.length===8),
        sixth:(parsed.sixth||[]).map(s=>String(s).replace(/\D/g,'').slice(-3)).filter(s=>s.length===3),
        updatedAt:new Date().toISOString()
      };
      if(!lotteryNumbers.special && !lotteryNumbers.grand && !lotteryNumbers.first.length){
        throw new Error('未辨識到任何獎號，請改用手動輸入');
      }
      save();
      showToast(`✓ 已辨識 ${lotteryNumbers.period||'本期'}`,'ok');
      openLotteryModal();
    }catch(err){
      showToast('辨識失敗：'+err.message,'error');
    }
  };
  reader.readAsDataURL(file);
}

async function analyzeLotteryImage(b64url){
  const prompt=`你是統一發票中獎號碼辨識 AI。分析這張截圖，找出本期中獎號碼。
以 JSON 格式回傳（只回 JSON 不加說明）：
{"period":"114年3-4月","special":"12345678","grand":"87654321","first":["11112222","33334444","55556666"],"sixth":["123","456"]}
規則：
- period: 期別中文，如「114年3-4月」或「113-11-12」
- special: 特別獎(1000萬)末8碼字串
- grand: 特獎(200萬)末8碼字串
- first: 頭獎(20萬) 3 組末8碼陣列
- sixth: 增開六獎末3碼陣列（若截圖沒有就回空陣列）
- 找不到的欄位回空字串或空陣列，不要亂猜。`;
  const text=await aiAnalyzeImage(b64url,prompt,500);
  const clean=text.replace(/```json|```/g,'').trim();
  const m=clean.match(/\{[\s\S]*\}/); // 抓 JSON 物件
  try{return JSON.parse(m?m[0]:clean);}catch{throw new Error('AI 回傳格式錯誤');}
}

function saveLotteryNumbers(){
  const period=document.getElementById('lot-period').value.trim();
  const special=document.getElementById('lot-special').value.replace(/\D/g,'');
  const grand=document.getElementById('lot-grand').value.replace(/\D/g,'');
  const firstRaw=document.getElementById('lot-first').value;
  const sixthRaw=document.getElementById('lot-sixth').value;
  const first=firstRaw.split(/[,，\s]+/).map(s=>s.replace(/\D/g,'')).filter(s=>s.length===8);
  const sixth=sixthRaw.split(/[,，\s]+/).map(s=>s.replace(/\D/g,'')).filter(s=>s.length===3);
  if(special && special.length!==8){ showToast('特別獎需 8 碼','error'); return; }
  if(grand && grand.length!==8){ showToast('特獎需 8 碼','error'); return; }
  lotteryNumbers={period,special,grand,first,sixth,updatedAt:new Date().toISOString()};
  save();
  closeModal('lotteryEditOverlay');
  showToast('✓ 中獎號碼已更新','ok');
  openLotteryModal();
}

// 回傳 {level, prize} 或 null
function checkInvoiceWin(invoice){
  if(!invoice||invoice.length!==10) return null;
  const last8=invoice.slice(2); // 去掉字軌前 2 英文
  const last3=last8.slice(-3);
  if(lotteryNumbers.special && last8===lotteryNumbers.special) return {level:'特別獎',prize:10000000};
  if(lotteryNumbers.grand && last8===lotteryNumbers.grand) return {level:'特獎',prize:2000000};
  // 頭獎：8-3 碼遞減對應獎金 20萬/4萬/1萬/4千/1千
  for(const f of (lotteryNumbers.first||[])){
    if(last8===f) return {level:'頭獎',prize:200000};
    // 二獎：末 7 碼
    if(f && last8.slice(-7)===f.slice(-7)) return {level:'二獎',prize:40000};
    if(f && last8.slice(-6)===f.slice(-6)) return {level:'三獎',prize:10000};
    if(f && last8.slice(-5)===f.slice(-5)) return {level:'四獎',prize:4000};
    if(f && last8.slice(-4)===f.slice(-4)) return {level:'五獎',prize:1000};
    if(f && last8.slice(-3)===f.slice(-3)) return {level:'六獎',prize:200};
  }
  // 增開六獎
  for(const s of (lotteryNumbers.sixth||[])){
    if(s && last3===s) return {level:'增開六獎',prize:200};
  }
  return null;
}

function openLotteryModal(){
  const body=document.getElementById('lotteryBody');
  if(!lotteryNumbers.special && !lotteryNumbers.grand && !(lotteryNumbers.first||[]).length){
    body.innerHTML=`<div style="text-align:center;padding:24px 12px;color:var(--text2);font-size:13px">
      尚未設定中獎號碼。<br>
      請先按「✏️ 更新號碼」並填入最新一期獎號。
    </div>`;
    document.getElementById('lotteryOverlay').classList.add('open');
    return;
  }
  // 用字軌清單對獎
  const allInv=Object.keys(invoiceSeen||{});
  const hits=[];
  let totalPrize=0;
  allInv.forEach(inv=>{
    const r=checkInvoiceWin(inv);
    if(r){ hits.push({inv,...r,info:invoiceSeen[inv]}); totalPrize+=r.prize; }
  });
  hits.sort((a,b)=>b.prize-a.prize);
  const periodLabel=lotteryNumbers.period||'最新期';
  if(!hits.length){
    body.innerHTML=`
      <div style="text-align:center;padding:20px 12px">
        <div style="font-size:48px;margin-bottom:8px">😅</div>
        <div style="font-size:14px;color:var(--text);font-weight:600;margin-bottom:4px">${periodLabel} · 沒有中獎</div>
        <div style="font-size:11px;color:var(--text2)">本期比對了 <strong>${allInv.length}</strong> 張發票</div>
        <div style="font-size:11px;color:var(--text3);margin-top:8px">下次好運 🍀</div>
      </div>`;
  } else {
    body.innerHTML=`
      <div style="background:linear-gradient(135deg,#ffd700,#ffa000);color:#000;border-radius:var(--r-sm);padding:14px;margin-bottom:12px;text-align:center;box-shadow:0 4px 16px rgba(255,193,7,0.4)">
        <div style="font-size:11px;font-weight:700;opacity:0.8">${periodLabel} · 中獎 ${hits.length} 張</div>
        <div style="font-size:32px;font-weight:800;font-family:'DM Mono',monospace;margin-top:4px">🎉 $${totalPrize.toLocaleString()}</div>
      </div>
      <div style="max-height:200px;overflow-y:auto">
        ${hits.map(h=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:6px">
          <div style="background:var(--accent);color:#fff;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;white-space:nowrap">${h.level}</div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'DM Mono',monospace;font-size:12px;font-weight:600">${h.inv}</div>
            <div style="font-size:10px;color:var(--text3)">${h.info.date||''}${h.info.seller?' · '+h.info.seller:''}</div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-weight:700;color:var(--accent3)">$${h.prize.toLocaleString()}</div>
        </div>`).join('')}
      </div>`;
  }
  document.getElementById('lotteryOverlay').classList.add('open');
}

// ── MODALS ──
let selectedCat='health',selectedNewCatEmoji='📦',selectedCycle='monthly';
let editingPid=null;
const CAT_EMOJIS=['💊','🧴','🛒','🏠','🍽','👗','📚','🐾','🎮','🌸','🧹','✏️','💄','🧺','🫙','💅','🍀','🎁','🧸','🔧'];

function openProductModal(){closeFab();editingPid=null;document.getElementById('productModalTitle').textContent='📦 新增補貨品項';document.getElementById('productSubmitBtn').textContent='新增品項';renderCatOpts();renderEmojiGrid();document.getElementById('productModalOverlay').classList.add('open');}
function openProductEdit(pid){
  const p=products.find(x=>x.id===pid); if(!p) return;
  editingPid=pid;
  selectedCat=p.cat||'health';
  document.getElementById('f-name').value=p.name||'';
  document.getElementById('f-brand').value=p.brand||'';
  document.getElementById('f-price').value=p.price||'';
  document.getElementById('f-origprice').value=p.origPrice||'';
  document.getElementById('f-days').value=p.totalDays||'';
  document.getElementById('f-emoji').value=p.emoji||'';
  document.getElementById('f-shopee').value=p.shopeeUrl||'';
  document.getElementById('f-volume').value=p.volume||'';
  document.getElementById('f-unit').value=p.unit||'';
  document.getElementById('productModalTitle').textContent='✏️ 編輯品項資訊';
  document.getElementById('productSubmitBtn').textContent='✓ 儲存修改';
  renderCatOpts();renderEmojiGrid();
  document.getElementById('productModalOverlay').classList.add('open');
}
function openFixedModal(){
  closeFab();
  // 退出編輯模式
  _editingFixedId=null;
  document.getElementById('fx-id').value='';
  document.getElementById('fixedModalTitle').textContent='💳 新增固定支出';
  document.getElementById('fixedSubmitBtn').textContent='新增固定支出';
  // 清空表單
  ['fx-name','fx-amount','fx-emoji','fx-day','fx-month','fx-note'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  // reset cycle 為 monthly
  selectedCycle='monthly';
  document.querySelectorAll('#fixedModalOverlay .type-select').forEach(sel=>{
    sel.querySelectorAll('.type-opt').forEach(o=>o.classList.remove('selected'));
    const first=sel.querySelector('.type-opt'); if(first) first.classList.add('selected');
  });
  if(typeof updateFxDayUI==='function') updateFxDayUI();
  // reset pay 預設現金
  _fxSelectedPay='cash';
  document.querySelectorAll('#fxPaySelect .type-opt').forEach(o=>o.classList.toggle('selected',o.dataset.val==='cash'));
  const picker=document.getElementById('fxCardPicker'); if(picker) picker.style.display='none';
  document.getElementById('fixedModalOverlay').classList.add('open');
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function closeModalOutside(e,id){if(e.target===document.getElementById(id))closeModal(id);}
function renderCatOpts(){
  document.getElementById('catOptWrap').innerHTML=categories.map(c=>
    `<div class="cat-opt ${selectedCat===c.id?'selected':''}" data-val="${c.id}" onclick="selectCat(this)">${c.emoji} ${c.label}</div>`
  ).join('');
}
function selectCat(el){document.querySelectorAll('.cat-opt').forEach(o=>o.classList.remove('selected'));el.classList.add('selected');selectedCat=el.dataset.val;}
function renderEmojiGrid(){
  document.getElementById('emojiGrid').innerHTML=CAT_EMOJIS.map(e=>
    `<button class="ep-btn ${selectedNewCatEmoji===e?'selected':''}" onclick="pickEmoji(this,'${e}')">${e}</button>`
  ).join('');
}
function pickEmoji(el,emoji){selectedNewCatEmoji=emoji;document.querySelectorAll('.ep-btn').forEach(b=>b.classList.remove('selected'));el.classList.add('selected');}
function toggleNewCatForm(){document.getElementById('newCatForm').classList.toggle('open');}
function addNewCategory(){
  const name=document.getElementById('nc-name').value.trim();
  const color=document.getElementById('nc-color').value;
  if(!name){showToast('請輸入類別名稱','error');return;}
  const id='cat_'+Date.now();
  categories.push({id,label:name,emoji:selectedNewCatEmoji,color});
  selectedCat=id;save();renderCatOpts();
  document.getElementById('nc-name').value='';
  document.getElementById('newCatForm').classList.remove('open');
}
function addProduct(){
  const name=document.getElementById('f-name').value.trim();
  const brand=document.getElementById('f-brand').value.trim();
  const price=parseInt(document.getElementById('f-price').value)||0;
  const origPrice=parseInt(document.getElementById('f-origprice').value)||price;
  const days=parseInt(document.getElementById('f-days').value)||30;
  const emoji=document.getElementById('f-emoji').value.trim()||'📦';
  const shopeeUrl=document.getElementById('f-shopee').value.trim()||'';
  const volume=parseFloat(document.getElementById('f-volume').value)||0;
  const unit=document.getElementById('f-unit').value||'';
  if(!name){showToast('請輸入商品名稱','error');return;}
  const clearForm=()=>['f-name','f-brand','f-price','f-origprice','f-days','f-emoji','f-shopee','f-volume','f-unit'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});

  // 編輯模式：直接更新現有品項，不查重複
  if(editingPid){
    const p=products.find(x=>x.id===editingPid);
    if(p){
      p.name=name;p.brand=brand;p.price=price;p.origPrice=origPrice;p.totalDays=days;
      p.emoji=emoji;p.cat=selectedCat;p.shopeeUrl=shopeeUrl;
      p.volume=volume;p.unit=unit;
    }
    editingPid=null;
    save();closeModal('productModalOverlay');renderAll();
    clearForm();
    showToast('✓ 品項已更新','ok');
    return;
  }

  // 相似品檢查：避免重複建立、提示是否取代
  const dup=findDuplicate({name, brand});
  const newP={id:Date.now(),name,brand,price,origPrice,emoji,cat:selectedCat,totalDays:days,boughtDate:todayStr(),shopeeUrl,volume,unit};
  const doInsert=()=>{
    products.push(newP);
    save();closeModal('productModalOverlay');renderAll();
    clearForm();
    showToast('✓ 已新增品項','ok');
  };
  const doReplace=(useDays)=>{
    const old=dup.product;
    old.name=name; old.brand=brand; old.price=price; old.origPrice=origPrice;
    old.emoji=emoji; old.cat=selectedCat; old.totalDays=useDays||days;
    old.boughtDate=todayStr(); old.shopeeUrl=shopeeUrl;
    if(volume>0){ old.volume=volume; }
    if(unit){ old.unit=unit; }
    save();closeModal('productModalOverlay');renderAll();
    clearForm();
    showToast('✓ 已更新為新品牌（沿用使用紀錄）','ok');
  };
  if(dup){
    const o=dup.product;
    // 容量比例建議
    let scaledDays=null;
    if(volume>0&&o.volume>0&&unit&&o.unit&&unit===o.unit){
      const ratio=volume/o.volume;
      scaledDays=Math.round(o.totalDays*ratio);
    }
    const oldVolStr=o.volume?`${o.volume}${o.unit||''}`:'未設定';
    const newVolStr=volume?`${volume}${unit||''}`:'未設定';
    const scaleHint=scaledDays?`<br><span style="color:var(--accent);font-size:11px">📐 依容量比例建議：${o.totalDays} 天 × (${volume}/${o.volume}) ≈ <strong>${scaledDays} 天</strong></span>`:'';
    const choices=[];
    if(scaledDays){
      choices.push({label:`📐 取代並按容量比例調整為 ${scaledDays} 天`, style:'primary', onClick:()=>doReplace(scaledDays)});
      choices.push({label:`🔄 取代但保留輸入的 ${days} 天`, onClick:()=>doReplace(days)});
    } else {
      choices.push({label:'🔄 取代為新品牌（沿用紀錄）', style:'primary', onClick:()=>doReplace(days)});
    }
    choices.push({label:'➕ 兩者並存（建立新品項）', onClick:doInsert});
    choices.push({label:'取消', onClick:()=>{}});
    showChoice(
      '🔍 偵測到相似品項',
      `現有：<strong>${o.emoji} ${o.name}</strong>${o.brand?' · '+o.brand:''}（${oldVolStr} / ${o.totalDays}天）<br>新增：<strong>${emoji} ${name}</strong>${brand?' · '+brand:''}（${newVolStr} / ${days}天）${scaleHint}`,
      choices
    );
    return;
  }
  doInsert();
}
function selectCycle(el){
  // 範圍限縮在同一個 type-select 容器，避免誤刪付款方式按鈕的 selected
  el.parentElement.querySelectorAll('.type-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  selectedCycle=el.dataset.val;
  updateFxDayUI();
}
function updateFxDayUI(){
  const label=document.getElementById('fxDayLabel');
  const hint=document.getElementById('fxDayHint');
  const monthCol=document.getElementById('fxMonthCol');
  const dayInput=document.getElementById('fx-day');
  if(!label||!dayInput) return;
  if(selectedCycle==='monthly'){
    label.textContent='每月扣款日';
    monthCol.style.display='none';
    dayInput.min=1; dayInput.max=31; dayInput.placeholder='例：15';
    hint.textContent='輸入 1-31 號';
  } else if(selectedCycle==='yearly'){
    label.textContent='每年扣款日（月 / 日）';
    monthCol.style.display='block';
    dayInput.min=1; dayInput.max=31; dayInput.placeholder='日（1-31）';
    hint.textContent='例：12 月 25 日 → 月填 12、日填 25';
  } else if(selectedCycle==='weekly'){
    label.textContent='每週扣款日';
    monthCol.style.display='none';
    dayInput.min=1; dayInput.max=7; dayInput.placeholder='1=週一 ... 7=週日';
    hint.textContent='輸入 1-7（1=週一、7=週日）';
  }
}
let _fxSelectedPay='cash';
let _editingFixedId=null;
function selectFxPay(el){
  document.querySelectorAll('#fxPaySelect .type-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  _fxSelectedPay=el.dataset.val;
  const picker=document.getElementById('fxCardPicker');
  const sel=document.getElementById('fx-cardId');
  if(_fxSelectedPay==='card'){
    if(!creditCards.length){
      sel.innerHTML='<option value="">尚無信用卡，請先到 ⚙️ 設定 → 帳戶 新增</option>';
    } else {
      sel.innerHTML=creditCards.map(c=>`<option value="${c.id}">💳 ${c.name}${c.last4?' ····'+c.last4:''}</option>`).join('');
    }
    picker.style.display='block';
  } else {
    picker.style.display='none';
  }
}
function addFixed(){ saveFixed(); }
function saveFixed(){
  const name=document.getElementById('fx-name').value.trim();
  const amount=parseInt(document.getElementById('fx-amount').value)||0;
  const emoji=document.getElementById('fx-emoji').value.trim()||'💳';
  const day=parseInt(document.getElementById('fx-day').value)||1;
  const note=document.getElementById('fx-note').value.trim();
  if(!name){showToast('請輸入名稱','error');return;}
  // 驗證 day 範圍
  if(selectedCycle==='weekly' && (day<1||day>7)){ showToast('每週扣款日請填 1-7','error'); return; }
  if(selectedCycle!=='weekly' && (day<1||day>31)){ showToast('扣款日請填 1-31','error'); return; }
  let monthOfYear;
  if(selectedCycle==='yearly'){
    const month=parseInt(document.getElementById('fx-month').value)||1;
    if(month<1||month>12){ showToast('每年扣款月請填 1-12','error'); return; }
    monthOfYear=month;
  }
  let cardId=null;
  if(_fxSelectedPay==='card'){
    cardId=parseInt(document.getElementById('fx-cardId').value);
    if(!cardId){ showToast('請先到 ⚙️ 設定 → 帳戶 新增信用卡','error'); return; }
  }

  if(_editingFixedId){
    // 編輯模式：更新現有資料，保留 id 與 _linkedDebtId
    const fx=fixedExpenses.find(x=>x.id===_editingFixedId);
    if(fx){
      fx.name=name; fx.emoji=emoji; fx.amount=amount; fx.day=day;
      fx.cycle=selectedCycle; fx.note=note; fx.pay=_fxSelectedPay;
      if(monthOfYear!=null) fx.monthOfYear=monthOfYear; else delete fx.monthOfYear;
      if(cardId) fx.cardId=cardId; else delete fx.cardId;
    }
    _editingFixedId=null;
    save();closeModal('fixedModalOverlay');renderAll();
    showToast('✓ 固定支出已更新','ok');
  } else {
    const entry={id:Date.now(),name,emoji,amount,day,cycle:selectedCycle,note,pay:_fxSelectedPay};
    if(monthOfYear!=null) entry.monthOfYear=monthOfYear;
    if(cardId) entry.cardId=cardId;
    fixedExpenses.push(entry);
    save();closeModal('fixedModalOverlay');renderAll();
  }
  ['fx-name','fx-amount','fx-emoji','fx-day','fx-month','fx-note','fx-id'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  // reset cycle 為 monthly + UI
  selectedCycle='monthly';
  document.querySelectorAll('#fixedModalOverlay .type-select').forEach(sel=>{
    sel.querySelectorAll('.type-opt').forEach(o=>o.classList.remove('selected'));
    const first=sel.querySelector('.type-opt'); if(first) first.classList.add('selected');
  });
  if(typeof updateFxDayUI==='function') updateFxDayUI();
  // reset pay 為 cash
  _fxSelectedPay='cash';
  document.querySelectorAll('#fxPaySelect .type-opt').forEach(o=>o.classList.toggle('selected',o.dataset.val==='cash'));
  document.getElementById('fxCardPicker').style.display='none';
  // reset modal title
  document.getElementById('fixedModalTitle').textContent='💳 新增固定支出';
  document.getElementById('fixedSubmitBtn').textContent='新增固定支出';
}

function editFixed(id){
  const fx=fixedExpenses.find(x=>x.id===id);
  if(!fx){ showToast('找不到該固定支出','error'); return; }
  // 負債分期自動建立的固定支出，提示改去負債頁編輯
  if(fx._linkedDebtId){
    showToast('此項由負債分期建立，請到 💸 負債頁編輯','warn');
    return;
  }
  _editingFixedId=id;
  document.getElementById('fx-id').value=id;
  document.getElementById('fx-name').value=fx.name||'';
  document.getElementById('fx-amount').value=fx.amount||'';
  document.getElementById('fx-emoji').value=fx.emoji||'';
  document.getElementById('fx-day').value=fx.day||'';
  document.getElementById('fx-note').value=fx.note||'';
  // cycle
  selectedCycle=fx.cycle||'monthly';
  document.querySelectorAll('#fixedModalOverlay .type-select').forEach(sel=>{
    // 跳過付款方式 select
    if(sel.id==='fxPaySelect') return;
    sel.querySelectorAll('.type-opt').forEach(o=>o.classList.toggle('selected',o.dataset.val===selectedCycle));
  });
  if(typeof updateFxDayUI==='function') updateFxDayUI();
  if(fx.cycle==='yearly' && fx.monthOfYear){
    const mEl=document.getElementById('fx-month'); if(mEl) mEl.value=fx.monthOfYear;
  }
  // pay
  _fxSelectedPay=fx.pay||'cash';
  document.querySelectorAll('#fxPaySelect .type-opt').forEach(o=>o.classList.toggle('selected',o.dataset.val===_fxSelectedPay));
  const picker=document.getElementById('fxCardPicker');
  const sel=document.getElementById('fx-cardId');
  if(_fxSelectedPay==='card'){
    if(!creditCards.length){
      sel.innerHTML='<option value="">尚無信用卡，請先到 ⚙️ 設定 → 帳戶 新增</option>';
    } else {
      sel.innerHTML=creditCards.map(c=>`<option value="${c.id}"${fx.cardId===c.id?' selected':''}>💳 ${c.name}${c.last4?' ····'+c.last4:''}</option>`).join('');
    }
    picker.style.display='block';
  } else {
    picker.style.display='none';
  }
  // title / btn
  document.getElementById('fixedModalTitle').textContent='✏️ 編輯固定支出';
  document.getElementById('fixedSubmitBtn').textContent='✓ 儲存修改';
  document.getElementById('fixedModalOverlay').classList.add('open');
}

// ── 💸 DEBT MANAGEMENT（負債管理）──
let _debtSelectedPay='cash';
let _debtEditingId=null;
function selectDebtPay(el){
  document.querySelectorAll('#debtPaySelect .type-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  _debtSelectedPay=el.dataset.val;
  const picker=document.getElementById('debtCardPicker');
  const sel=document.getElementById('debt-cardId');
  if(_debtSelectedPay==='card'){
    if(!creditCards.length){
      sel.innerHTML='<option value="">尚無信用卡，請先到 ⚙️ 設定 → 帳戶 新增</option>';
    } else {
      sel.innerHTML=creditCards.map(c=>`<option value="${c.id}">💳 ${c.name}${c.last4?' ····'+c.last4:''}</option>`).join('');
    }
    picker.style.display='block';
  } else {
    picker.style.display='none';
  }
}
function openDebtModal(debtId){
  _debtEditingId=debtId||null;
  _debtSourceRecordId=null; // 預設清空，openDebtFromExpense 會在呼叫後重新賦值
  const isEdit=!!debtId;
  document.getElementById('debtModalTitle').textContent=isEdit?'✏️ 編輯負債':'💸 新增負債';
  document.getElementById('debtSubmitBtn').textContent=isEdit?'儲存修改':'新增負債';
  // reset
  ['debt-name','debt-emoji','debt-total','debt-monthly','debt-months','debt-paid','debt-rate','debt-note'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('debt-day').value='5';
  document.getElementById('debt-paid').value='0';
  _debtSelectedPay='cash';
  document.querySelectorAll('#debtPaySelect .type-opt').forEach(o=>o.classList.toggle('selected',o.dataset.val==='cash'));
  document.getElementById('debtCardPicker').style.display='none';
  if(isEdit){
    const d=debts.find(x=>x.id===debtId);
    if(d){
      document.getElementById('debt-id').value=d.id;
      document.getElementById('debt-name').value=d.name||'';
      document.getElementById('debt-emoji').value=d.emoji||'';
      document.getElementById('debt-total').value=d.totalAmount||'';
      document.getElementById('debt-monthly').value=d.monthlyPayment||'';
      document.getElementById('debt-months').value=d.totalMonths||'';
      document.getElementById('debt-paid').value=d.paidMonths||0;
      document.getElementById('debt-day').value=d.day||5;
      document.getElementById('debt-rate').value=d.rate||'';
      document.getElementById('debt-note').value=d.note||'';
      _debtSelectedPay=d.pay||'cash';
      document.querySelectorAll('#debtPaySelect .type-opt').forEach(o=>o.classList.toggle('selected',o.dataset.val===_debtSelectedPay));
      if(_debtSelectedPay==='card'){
        const sel=document.getElementById('debt-cardId');
        sel.innerHTML=creditCards.map(c=>`<option value="${c.id}"${c.id===d.cardId?' selected':''}>💳 ${c.name}${c.last4?' ····'+c.last4:''}</option>`).join('')||'<option value="">尚無信用卡</option>';
        document.getElementById('debtCardPicker').style.display='block';
      }
    }
  }
  document.getElementById('debtModalOverlay').classList.add('open');
}
function saveDebt(){
  const name=document.getElementById('debt-name').value.trim();
  const emoji=document.getElementById('debt-emoji').value.trim()||'💸';
  const total=parseInt(document.getElementById('debt-total').value)||0;
  const monthly=parseInt(document.getElementById('debt-monthly').value)||0;
  const months=parseInt(document.getElementById('debt-months').value)||0;
  const paid=parseInt(document.getElementById('debt-paid').value)||0;
  const day=Math.min(28,Math.max(1,parseInt(document.getElementById('debt-day').value)||5));
  const rate=parseFloat(document.getElementById('debt-rate').value)||0;
  const note=document.getElementById('debt-note').value.trim();
  if(!name){showToast('請輸入名稱','error');return;}
  if(monthly<=0){showToast('請填每月還款金額','error');return;}
  if(months<=0){showToast('請填總期數（月）','error');return;}
  if(paid>months){showToast('已付期數不可大於總期數','error');return;}
  let cardId=null;
  if(_debtSelectedPay==='card'){
    cardId=parseInt(document.getElementById('debt-cardId').value)||null;
    if(!cardId){ showToast('請先新增信用卡','error'); return; }
  }
  if(_debtEditingId){
    // 編輯：更新 debt 同時更新 linkedFixed
    const d=debts.find(x=>x.id===_debtEditingId);
    if(d){
      d.name=name; d.emoji=emoji; d.totalAmount=total; d.monthlyPayment=monthly;
      d.totalMonths=months; d.paidMonths=paid; d.day=day; d.rate=rate; d.note=note;
      d.pay=_debtSelectedPay; d.cardId=cardId;
      d.status=paid>=months?'paid':'active';
      const fx=fixedExpenses.find(f=>f.id===d.linkedFixedId);
      if(d.status==='paid' && fx){
        // 還清 → 移除 linkedFixed
        fixedExpenses=fixedExpenses.filter(f=>f.id!==d.linkedFixedId);
        d.linkedFixedId=null;
      } else if(fx){
        fx.name=`${name}（負債）`; fx.emoji=emoji; fx.amount=monthly; fx.day=day;
        fx.note=`負債分期：剩 ${months-paid} 期`;
        fx.pay=_debtSelectedPay; fx.cardId=cardId;
      } else if(d.status==='active'){
        // 之前還清又恢復：重建 linked
        const newFx={id:Date.now()+1,name:`${name}（負債）`,emoji,amount:monthly,day,cycle:'monthly',note:`負債分期：剩 ${months-paid} 期`,pay:_debtSelectedPay,cardId,_linkedDebtId:d.id};
        fixedExpenses.push(newFx);
        d.linkedFixedId=newFx.id;
      }
    }
    showToast('✓ 負債已更新','ok');
  } else {
    // 新增 debt + 自動建立 linked fixedExpense
    const debtId=Date.now();
    const status=paid>=months?'paid':'active';
    let linkedFixedId=null;
    if(status==='active'){
      linkedFixedId=Date.now()+1;
      fixedExpenses.push({
        id:linkedFixedId, name:`${name}（負債）`, emoji, amount:monthly, day, cycle:'monthly',
        note:`負債分期：剩 ${months-paid} 期`, pay:_debtSelectedPay, cardId, _linkedDebtId:debtId
      });
    }
    debts.push({
      id:debtId, name, emoji, totalAmount:total, monthlyPayment:monthly,
      totalMonths:months, paidMonths:paid, startMonth:`${getNow().getFullYear()}-${String(getNow().getMonth()+1).padStart(2,'0')}`,
      rate, day, note, pay:_debtSelectedPay, cardId, linkedFixedId, status
    });
    showToast(status==='paid'?'✓ 負債已建立（已還清）':'✓ 負債已建立並同步固定支出','ok');
  }
  // 若是從消費紀錄轉分期，刪除原始 record（避免下月信用卡待扣重複計算總額）
  if(_debtSourceRecordId!=null){
    const idx=records.findIndex(r=>r.id===_debtSourceRecordId);
    if(idx>=0){
      records.splice(idx,1);
      showToast('🔁 已將原始消費轉為每月分期，從消費紀錄移除','ok');
    }
    _debtSourceRecordId=null;
  }
  save();
  _debtEditingId=null;
  closeModal('debtModalOverlay');
  renderAll();
}
function deleteDebt(debtId){
  showConfirm('確定刪除此負債？對應的固定支出也會一併移除。',()=>{
    const d=debts.find(x=>x.id===debtId);
    if(d && d.linkedFixedId){
      fixedExpenses=fixedExpenses.filter(f=>f.id!==d.linkedFixedId);
    }
    debts=debts.filter(x=>x.id!==debtId);
    save(); renderAll();
    showToast('已刪除','ok');
  });
}
function payDebtMonth(debtId){
  const d=debts.find(x=>x.id===debtId);
  if(!d) return;
  if(d.paidMonths>=d.totalMonths){ showToast('已全數還清','warn'); return; }
  // 標記本月 linkedFixed 為已確認（避免在固定支出頁再點一次又++）
  if(d.linkedFixedId){
    confirmedDeductions[deductionKey(d.linkedFixedId)]=true;
    confirmedDeductions[deductionKey(d.linkedFixedId)+'_debtPaid']=true;
    delete confirmedDeductions[deductionKey(d.linkedFixedId)+'_skip'];
  }
  d.paidMonths++;
  if(d.paidMonths>=d.totalMonths){
    d.status='paid';
    if(d.linkedFixedId){
      fixedExpenses=fixedExpenses.filter(f=>f.id!==d.linkedFixedId);
      d.linkedFixedId=null;
    }
    showToast(`🎉 ${d.name} 已全數還清！`,'ok');
  } else {
    // 更新 linkedFixed 備註
    const fx=fixedExpenses.find(f=>f.id===d.linkedFixedId);
    if(fx) fx.note=`負債分期：剩 ${d.totalMonths-d.paidMonths} 期`;
    showToast(`✓ 已記錄第 ${d.paidMonths}/${d.totalMonths} 期`,'ok');
  }
  save(); renderAll();
}
function unpayDebtMonth(debtId){
  const d=debts.find(x=>x.id===debtId);
  if(!d || d.paidMonths<=0) return;
  d.paidMonths--;
  if(d.status==='paid'){
    d.status='active';
    // 重建 linked
    const newFx={id:Date.now(),name:`${d.name}（負債）`,emoji:d.emoji,amount:d.monthlyPayment,day:d.day,cycle:'monthly',note:`負債分期：剩 ${d.totalMonths-d.paidMonths} 期`,pay:d.pay||'cash',cardId:d.cardId,_linkedDebtId:d.id};
    fixedExpenses.push(newFx);
    d.linkedFixedId=newFx.id;
  } else {
    const fx=fixedExpenses.find(f=>f.id===d.linkedFixedId);
    if(fx) fx.note=`負債分期：剩 ${d.totalMonths-d.paidMonths} 期`;
  }
  // 同步取消固定支出本月確認
  if(d.linkedFixedId){
    delete confirmedDeductions[deductionKey(d.linkedFixedId)];
    delete confirmedDeductions[deductionKey(d.linkedFixedId)+'_debtPaid'];
    delete confirmedDeductions[deductionKey(d.linkedFixedId)+'_auto'];
    confirmedDeductions[deductionKey(d.linkedFixedId)+'_skip']=true;
  }
  save(); renderAll();
}
function getDebtRemaining(d){
  return Math.max(0,(d.totalAmount||d.monthlyPayment*d.totalMonths)-d.paidMonths*d.monthlyPayment);
}
function getTotalDebtBalance(){
  return debts.filter(d=>d.status!=='paid').reduce((s,d)=>s+getDebtRemaining(d),0);
}
// 💎 資產淨值
function renderNetWorth(){
  const card=document.getElementById('netWorthCard');
  if(!card) return;
  const cash=(typeof cashSavings!=='undefined'&&cashSavings.amount)?cashSavings.amount:0;
  const inv=(typeof getInvestCurValue==='function')?getInvestCurValue():0;
  const debt=getTotalDebtBalance();
  const totalAssets=cash+inv;
  const netWorth=totalAssets-debt;
  // 三者皆 0 時不顯示，避免新用戶看到一堆 0
  if(cash===0 && inv===0 && debt===0){ card.style.display='none'; return; }
  card.style.display='block';
  document.getElementById('netWorthValue').textContent=`${netWorth<0?'-$':'$'}${Math.abs(netWorth).toLocaleString()}`;
  // 動態調整 sub 標籤
  document.getElementById('netWorthSubLabel').textContent=
    debt>0 ? `總資產 $${totalAssets.toLocaleString()} − 負債 $${debt.toLocaleString()}` : `總資產 $${totalAssets.toLocaleString()}`;
  // 明細 (配合深哖背景：金色重點 + 亮色數字)
  const det=document.getElementById('netWorthDetail');
  if(det){
    const rows=[];
    const valStyle='color:rgba(255,255,255,.92);font-weight:700';
    rows.push(`<div style="display:flex;justify-content:space-between"><span>💵 現金存款</span><span class="privacy-mask" style="${valStyle}">$${cash.toLocaleString()}</span></div>`);
    rows.push(`<div style="display:flex;justify-content:space-between"><span>📈 投資估值</span><span class="privacy-mask" style="${valStyle}">$${inv.toLocaleString()}</span></div>`);
    if(debt>0){
      rows.push(`<div style="display:flex;justify-content:space-between;color:#FFB6A0"><span>💸 負債總額</span><span class="privacy-mask" style="font-weight:700">−$${debt.toLocaleString()}</span></div>`);
      const activeDebts=debts.filter(d=>d.status!=='paid');
      activeDebts.forEach(d=>{
        rows.push(`<div style="display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.5);padding-left:14px"><span>${d.emoji||'·'} ${d.name}（剩 ${d.totalMonths-d.paidMonths} 期）</span><span class="privacy-mask">$${getDebtRemaining(d).toLocaleString()}</span></div>`);
      });
    }
    rows.push(`<div style="display:flex;justify-content:space-between;border-top:1px dashed rgba(255,216,107,.25);margin-top:6px;padding-top:8px;font-weight:800"><span style="color:#FFD86B">👑 淨值</span><span class="privacy-mask" style="color:#FFD86B">${netWorth<0?'-$':'$'}${Math.abs(netWorth).toLocaleString()}</span></div>`);
    det.innerHTML=rows.join('');
  }
}
function toggleNetWorthDetail(){
  const det=document.getElementById('netWorthDetail');
  const hint=document.getElementById('netWorthToggleHint');
  if(!det) return;
  const open=det.style.display!=='none';
  det.style.display=open?'none':'block';
  if(hint) hint.textContent=open?'展開明細 ▾':'收合 ▴';
}
function renderDebts(){
  const list=document.getElementById('debtList');
  if(!list) return;
  // KPI 列
  const tot=getTotalDebtBalance();
  const monthly=debts.filter(d=>d.status!=='paid').reduce((s,d)=>s+(d.monthlyPayment||0),0);
  const dpt=document.getElementById('debtPageTotal');
  const dpc=document.getElementById('debtPageCount');
  if(dpt) dpt.textContent=`$${tot.toLocaleString()}`;
  if(dpc) dpc.textContent=`共 ${debts.filter(d=>d.status!=='paid').length} 筆 · 每月還款 $${monthly.toLocaleString()}`;
  if(!debts.length){
    list.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px;background:var(--surface);border-radius:12px">尚無負債紀錄<br>點上方「🏦 ＋ 新增負債分期」開始記錄</div>`;
    return;
  }
  // 按未還清優先 + 剩餘金額大的優先
  const sorted=[...debts].sort((a,b)=>{
    if((a.status==='paid')!==(b.status==='paid')) return a.status==='paid'?1:-1;
    return getDebtRemaining(b)-getDebtRemaining(a);
  });
  list.innerHTML=sorted.map(d=>{
    const remaining=getDebtRemaining(d);
    const remMonths=Math.max(0,d.totalMonths-d.paidMonths);
    const pct=d.totalMonths>0?Math.min(100,Math.round(d.paidMonths/d.totalMonths*100)):0;
    const isPaid=d.status==='paid';
    const card=d.pay==='card'&&d.cardId?creditCards.find(c=>c.id===d.cardId):null;
    return `<div style="background:var(--surface);border-radius:14px;padding:14px;margin-bottom:10px;${isPaid?'opacity:0.65':''}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="font-size:24px">${d.emoji||'💸'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${d.name} ${isPaid?'<span style="color:var(--accent3);font-size:11px">✓ 已還清</span>':''}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">每月 $${d.monthlyPayment.toLocaleString()}${d.rate?` · 利率 ${d.rate}%`:''}${card?` · 💳 ${card.name}`:''}</div>
        </div>
        <button class="btn-sm" style="padding:4px 8px;font-size:10px" onclick="openDebtModal(${d.id})">✏️</button>
        <button class="btn-sm" style="padding:4px 8px;font-size:10px;color:var(--danger)" onclick="deleteDebt(${d.id})">🗑</button>
      </div>
      <div style="background:var(--bg2);border-radius:8px;height:8px;overflow:hidden;margin-bottom:8px">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${isPaid?'#10b981,#34d399':'#3b82f6,#60a5fa'});transition:width 0.3s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);margin-bottom:10px">
        <span>已付 ${d.paidMonths}/${d.totalMonths} 期（${pct}%）</span>
        <span>剩餘約 <strong style="color:var(--text)">$${remaining.toLocaleString()}</strong></span>
      </div>
      ${!isPaid?`<div style="display:flex;gap:6px">
        <button class="btn-sm" style="flex:1;padding:6px;font-size:11px" onclick="unpayDebtMonth(${d.id})">－ 退一期</button>
        <button class="btn-sm primary" style="flex:2;padding:6px;font-size:11px" onclick="payDebtMonth(${d.id})">✓ 已付本期（+1）</button>
      </div>`:`<div style="text-align:center;font-size:11px;color:var(--accent3);padding:6px">🎉 已全數還清</div>`}
    </div>`;
  }).join('');
}

// ── IMPORT SCREENSHOT ──
let importResults=[];
let importSelectedIds=new Set();

// ── CLAUDE API KEY MANAGEMENT ──
let claudeApiKey=localStorage.getItem('btClaudeKey')||'';
let geminiApiKey=localStorage.getItem('btGeminiKey')||'';
let aiProvider=localStorage.getItem('btAiProvider')||'claude'; // 'claude' | 'gemini'

function getActiveAiProvider(){
  // 優先使用設定的 provider，若沒 key 則 fallback
  if(aiProvider==='gemini' && geminiApiKey) return 'gemini';
  if(aiProvider==='claude' && claudeApiKey) return 'claude';
  if(claudeApiKey) return 'claude';
  if(geminiApiKey) return 'gemini';
  return null;
}

function setAiProvider(p){
  aiProvider=p;
  localStorage.setItem('btAiProvider',p);
  renderAiProviderBtns();
  showToast(`已切換為 ${p==='claude'?'Claude':'Gemini'}`,'ok');
}
function renderAiProviderBtns(){
  const c=document.getElementById('aiProvClaudeBtn');
  const g=document.getElementById('aiProvGeminiBtn');
  if(!c||!g) return;
  const sel='linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent';
  const unsel='';
  c.style.cssText=`flex:1;padding:9px;${aiProvider==='claude'?sel:unsel}`;
  g.style.cssText=`flex:1;padding:9px;${aiProvider==='gemini'?sel:unsel}`;
}

// ── 統一 AI 影像辨識（provider abstraction）──
async function aiAnalyzeImage(b64url, prompt, maxTokens=800){
  const prov=getActiveAiProvider();
  if(!prov) throw new Error('未設定 AI 金鑰，請到「⚙️ → 🤖 AI」設定 Claude 或 Gemini');
  const base64=b64url.split(',')[1];
  const mediaType=b64url.split(';')[0].split(':')[1];
  if(prov==='claude'){
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:claudeHeaders(),
      body:JSON.stringify({model:'claude-sonnet-4-5',max_tokens:maxTokens,
        messages:[{role:'user',content:[
          {type:'image',source:{type:'base64',media_type:mediaType,data:base64}},
          {type:'text',text:prompt}
        ]}]})
    });
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`Claude ${res.status}`);}
    const data=await res.json();
    return data.content.filter(c=>c.type==='text').map(c=>c.text).join('');
  } else {
    const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
    // gemini-2.5-flash 預設啟用 thinking 會吃掉大量 tokens，必須關掉並提高 maxOutputTokens
    const res=await fetch(url,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[
        {inline_data:{mime_type:mediaType,data:base64}},
        {text:prompt}
      ]}],generationConfig:{
        maxOutputTokens:Math.max(maxTokens*4,4000),
        temperature:0.1,
        thinkingConfig:{thinkingBudget:0}
      }})
    });
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`Gemini ${res.status}`);}
    const data=await res.json();
    const cand=data.candidates?.[0];
    const text=(cand?.content?.parts||[]).map(p=>p.text||'').join('');
    if(!text){
      const reason=cand?.finishReason||'未知';
      throw new Error(`Gemini 未回傳內容 (finishReason=${reason})，請重試或換較清晰的圖片`);
    }
    return text;
  }
}

function getClaudeKey(){
  const k=claudeApiKey||localStorage.getItem('btClaudeKey')||'';
  if(!k) throw new Error('未設定 Claude API 金鑰，請到「⚙️ → AI 辨識」設定');
  return k;
}
function claudeHeaders(){
  return {
    'Content-Type':'application/json',
    'x-api-key':getClaudeKey(),
    'anthropic-version':'2023-06-01',
    'anthropic-dangerous-direct-browser-access':'true'
  };
}
function saveClaudeKey(){
  const v=document.getElementById('claudeKeyInput').value.trim();
  if(!v){showToast('請輸入金鑰','error');return;}
  if(!v.startsWith('sk-ant-')){showToast('金鑰格式錯誤（應以 sk-ant- 開頭）','error');return;}
  claudeApiKey=v;
  localStorage.setItem('btClaudeKey',v);
  renderClaudeKeyStatus();
  showToast('✓ Claude 金鑰已儲存','ok');
}
function clearClaudeKey(){
  claudeApiKey='';
  localStorage.removeItem('btClaudeKey');
  const el=document.getElementById('claudeKeyInput');if(el)el.value='';
  renderClaudeKeyStatus();
  showToast('已清除 Claude 金鑰','ok');
}
function renderClaudeKeyStatus(){
  const el=document.getElementById('claudeKeyStatus');
  if(!el) return;
  if(claudeApiKey){
    const masked=claudeApiKey.slice(0,10)+'...'+claudeApiKey.slice(-4);
    el.innerHTML=`<span style="color:var(--accent3);font-weight:600">✓ 已設定</span> <span style="font-family:'DM Mono',monospace;font-size:10px">${masked}</span>`;
  } else {
    el.innerHTML=`<span style="color:var(--text3)">未設定</span>`;
  }
}
async function testClaudeKey(){
  try{
    const k=getClaudeKey();
    showToast('測試 Claude 連線中…','ok');
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:claudeHeaders(),
      body:JSON.stringify({model:'claude-sonnet-4-5',max_tokens:10,
        messages:[{role:'user',content:'Say OK'}]})
    });
    if(res.ok){ showToast('✓ Claude 連線成功','ok'); }
    else {
      const e=await res.json().catch(()=>({}));
      showToast('✗ '+(e.error?.message||`${res.status} 錯誤`),'error');
    }
  }catch(e){ showToast('✗ '+e.message,'error'); }
}

// ── GEMINI API KEY MANAGEMENT ──
function saveGeminiKey(){
  const v=document.getElementById('geminiKeyInput').value.trim();
  if(!v){showToast('請輸入金鑰','error');return;}
  if(!v.startsWith('AIza')){showToast('金鑰格式錯誤（應以 AIza 開頭）','error');return;}
  geminiApiKey=v;
  localStorage.setItem('btGeminiKey',v);
  renderGeminiKeyStatus();
  showToast('✓ Gemini 金鑰已儲存','ok');
}
function clearGeminiKey(){
  geminiApiKey='';
  localStorage.removeItem('btGeminiKey');
  const el=document.getElementById('geminiKeyInput');if(el)el.value='';
  renderGeminiKeyStatus();
  showToast('已清除 Gemini 金鑰','ok');
}
function renderGeminiKeyStatus(){
  const el=document.getElementById('geminiKeyStatus');
  if(!el) return;
  if(geminiApiKey){
    const masked=geminiApiKey.slice(0,8)+'...'+geminiApiKey.slice(-4);
    el.innerHTML=`<span style="color:var(--accent3);font-weight:600">✓ 已設定</span> <span style="font-family:'DM Mono',monospace;font-size:10px">${masked}</span>`;
  } else {
    el.innerHTML=`<span style="color:var(--text3)">未設定</span>`;
  }
}
async function testGeminiKey(){
  if(!geminiApiKey){showToast('請先儲存金鑰','error');return;}
  showToast('測試 Gemini 連線中…','ok');
  try{
    const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
    const res=await fetch(url,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:'Say OK'}]}],generationConfig:{maxOutputTokens:10}})
    });
    if(res.ok){ showToast('✓ Gemini 連線成功','ok'); }
    else{
      const e=await res.json().catch(()=>({}));
      showToast('✗ '+(e.error?.message||`${res.status} 錯誤`),'error');
    }
  }catch(e){ showToast('✗ '+e.message,'error'); }
}

function openImportModal(){
  closeFab();
  resetImport();
  document.getElementById('importModalOverlay').classList.add('open');
}
function switchImportPreview(i){
  const urls=window._importPreviewUrls||[];
  if(!urls[i]) return;
  document.getElementById('importPreviewImg2').src=urls[i];
  document.querySelectorAll('#importThumbStrip img').forEach(img=>{
    const idx=parseInt(img.dataset.i);
    img.style.borderColor=idx===i?'var(--accent)':'var(--border)';
  });
}
window.switchImportPreview=switchImportPreview;
function resetImport(){
  importResults=[];importSelectedIds=new Set();
  ['importStep1','importStep2','importStep3','importStep4'].forEach((id,i)=>
    document.getElementById(id).style.display=i===0?'block':'none'
  );
  document.getElementById('importFileInput').value='';
}
function handleImportFile(e){
  const files=Array.from(e.target.files||[]);if(!files.length)return;
  document.getElementById('importFileInput').value='';
  document.getElementById('importStep1').style.display='none';
  document.getElementById('importStep2').style.display='block';
  const loadingText=document.querySelector('#importStep2 div[style*="font-size:13px"]');
  if(loadingText&&files.length>1) loadingText.textContent=`AI 正在辨識 ${files.length} 張截圖…`;
  const readFile=f=>new Promise(res=>{
    const r=new FileReader();
    r.onload=ev=>res(ev.target.result);
    r.readAsDataURL(f);
  });
  (async()=>{
    try{
      let allItems=[];
      for(let i=0;i<files.length;i++){
        if(loadingText&&files.length>1) loadingText.textContent=`AI 辨識第 ${i+1}/${files.length} 張…`;
        const b64url=await readFile(files[i]);
        const items=await analyzeOrderScreenshot(b64url);
        allItems=allItems.concat(items);
      }
      if(!allItems.length) throw new Error('未辨識到商品，請確認截圖是訂單頁面');
      // 重新編號 _id
      importResults=allItems.map((it,i)=>({...it,_id:i,_days:30}));
      importSelectedIds=new Set(importResults.map(it=>it._id));
      // 預先讀取所有截圖 dataURL，供縮圖切換
      const allUrls=[];
      for(const f of files){ allUrls.push(await readFile(f)); }
      window._importPreviewUrls=allUrls;
      document.getElementById('importStep2').style.display='none';
      document.getElementById('importStep3').style.display='block';
      const mainImg=document.getElementById('importPreviewImg2');
      mainImg.src=allUrls[0];
      // 縮圖列
      const strip=document.getElementById('importThumbStrip');
      const multiHint=document.getElementById('importMultiHint');
      if(strip){
        if(allUrls.length>1){
          strip.style.display='flex';
          if(multiHint) multiHint.style.display='inline';
          strip.innerHTML=allUrls.map((u,i)=>
            `<img src="${u}" data-i="${i}" onclick="switchImportPreview(${i})" alt="截圖${i+1}" `+
            `style="flex:0 0 auto;width:62px;height:62px;object-fit:cover;border-radius:8px;cursor:pointer;`+
            `border:2px solid ${i===0?'var(--accent)':'var(--border)'};box-shadow:var(--shadow-sm)"/>`).join('');
        } else {
          strip.style.display='none';
          if(multiHint) multiHint.style.display='none';
          strip.innerHTML='';
        }
      }
      document.getElementById('importResultTitle').textContent=
        files.length>1
          ? `辨識到 ${importResults.length} 件商品（${files.length} 張截圖），請確認`
          : `辨識到 ${importResults.length} 件商品，請確認`;
      renderImportResults();
    }catch(err){
      document.getElementById('importStep2').style.display='none';
      document.getElementById('importStep1').style.display='block';
      showToast('辨識失敗：'+err.message,'error');
    }
  })();
}
async function analyzeOrderScreenshot(base64Url){
  const prompt=`你是訂單辨識 AI。分析這張電商訂單截圖（蝦皮/momo/PChome/Yahoo/東森等），提取所有商品。

回傳 JSON 陣列，每個物件欄位：
- name: 商品名稱（精簡，保留規格核心資訊如容量/數量/顆數，最多25字）
- brand: 品牌名稱（若看不出來填空字串）
- price: 實付單價（數字，若只有小計請除以數量）
- qty: 數量（數字，預設 1）
- volume: 容量/規格的「數值」（數字，例如 200ml→200、60錠→60、100g→100；找不到填 0）
- unit: 容量/規格的「單位」(字串，限定值: "ml" / "g" / "錠" / "顆" / "粒" / "包" / "片" / "瓶" / "入"；找不到填 ""）
- emoji: 最能代表此商品的 1 個 emoji
- cat: 分類，只能是以下三種之一：
  * "health" - 保健品/營養品/維他命/膠囊錠劑
  * "skin" - 保養品/化妝品/洗卸/面膜/防曬
  * "daily" - 日用品/清潔用品/護唇/乳液/其他

規則：
1. 只回傳 JSON 陣列純文字，不加 markdown 標記，不加任何說明
2. 不確定分類時選 "daily"
3. 看不清楚或不是訂單截圖則回傳 []
4. 同品項多數量請合併成一筆並正確填 qty，不要拆成多筆
5. volume/unit 用於與既有品項做容量比例換算，請盡量從商品名抽取（如「保濕乳液 200ml」→ volume:200, unit:"ml"）`;
  const text=await aiAnalyzeImage(base64Url,prompt,1500);
  const clean=text.replace(/```json|```/g,'').trim();
  let items;
  try{items=JSON.parse(clean.match(/\[[\s\S]*\]/)?.[0]||clean);}catch{
    console.warn('AI 原始回傳:', text);
    throw new Error(`AI回傳格式錯誤：${text.slice(0,80)}…`);
  }
  if(!Array.isArray(items)) throw new Error('AI回傳格式錯誤，請重試');
  return items;
}

// ── DUPLICATE DETECTION ──
// Returns similarity score 0-1 between two product names
function nameSimilarity(a, b){
  a=a.toLowerCase().replace(/\s+/g,'');
  b=b.toLowerCase().replace(/\s+/g,'');
  if(a===b) return 1;
  if(a.includes(b)||b.includes(a)) return 0.85;
  // count common characters
  const setA=new Set(a), setB=new Set(b);
  let common=0;
  setA.forEach(c=>{ if(setB.has(c)) common++; });
  return common / Math.max(setA.size, setB.size);
}

// Find best matching existing product for an import item
function findDuplicate(it){
  let best=null, bestScore=0;
  products.forEach(p=>{
    const nameScore=nameSimilarity(it.name, p.name);
    const brandScore=(it.brand&&p.brand&&nameSimilarity(it.brand,p.brand)>0.7)?0.1:0;
    const score=nameScore+brandScore;
    if(score>bestScore){ bestScore=score; best=p; }
  });
  return bestScore>=0.7 ? {product:best, score:bestScore} : null;
}

function renderImportResults(){
  // First pass: auto-set default action for duplicates (so summary is correct)
  importResults.forEach(it=>{
    const dup=findDuplicate(it);
    if(dup&&!it._action) it._action='update'; // default to update
  });

  document.getElementById('importResultList').innerHTML=importResults.map(it=>{
    const sel=importSelectedIds.has(it._id);
    const catName=it.cat==='health'?'保健品':it.cat==='skin'?'保養品':'日用品';
    const dup=findDuplicate(it);
    const dupHtml=dup?(()=>{
      const curDays=getDaysLeft(dup.product);
      const isUrg=curDays>=0&&curDays<=10;
      const urgTag=isUrg?`<span style="background:var(--warn-light);color:var(--warn);font-size:10px;font-weight:700;padding:2px 6px;border-radius:8px;margin-left:4px">補貨提醒中</span>`:'';
      // 容量比例調整建議
      let scaleNote='';
      if(it.volume>0&&dup.product.volume>0&&it.unit&&dup.product.unit&&it.unit===dup.product.unit){
        const ratio=it.volume/dup.product.volume;
        const newDays=Math.max(1,Math.round(dup.product.totalDays*ratio));
        if(Math.abs(newDays-dup.product.totalDays)>=2){
          scaleNote=`<br>📐 容量 ${dup.product.volume}${dup.product.unit} → ${it.volume}${it.unit}，週期將自動調整為 <strong>${newDays} 天</strong>`;
        }
      }
      return `
      <div style="background:var(--warn-light);border:1px solid rgba(232,124,32,0.2);border-radius:var(--r-sm);padding:8px 10px;margin-top:8px;font-size:11px">
        <div style="color:var(--warn);font-weight:700;margin-bottom:6px">⚠️ 可能與現有品項重複</div>
        <div style="color:var(--text2);margin-bottom:4px">找到相似品項：<strong>${dup.product.emoji} ${dup.product.name}</strong>${urgTag}</div>
        <div style="color:var(--text3);font-size:10px;margin-bottom:8px">目前狀態：${curDays<=0?'已用完':`剩 ${curDays} 天`}・使用週期 ${dup.product.totalDays} 天${dup.product.volume?` ・ ${dup.product.volume}${dup.product.unit||''}`:''}</div>
        <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
          <button class="btn-sm ${it._action==='update'?'primary':''}" style="font-size:10px;padding:5px 0"
            onclick="setImportAction(${it._id},'update')">🔄 更新現有品項</button>
          <button class="btn-sm ${it._action==='new'?'primary':''}" style="font-size:10px;padding:5px 0"
            onclick="setImportAction(${it._id},'new')">➕ 建立新品項</button>
        </div>
        ${it._action==='update'?`<div style="font-size:10px;color:var(--accent3);margin-top:6px;line-height:1.5">✓ 將重置補貨天數為 ${dup.product.totalDays} 天${isUrg?'，自動移出補貨提醒':''}${it.price&&it.price!==dup.product.price?`<br>✓ 價格更新：$${dup.product.price.toLocaleString()} → $${it.price.toLocaleString()}`:''}${scaleNote}</div>`:''}
        ${it._action==='new'?`<div style="font-size:10px;color:var(--accent);margin-top:6px">✓ 將建立新的獨立品項（與現有品項並存）</div>`:''}
      </div>`;
    })():'';

    return `<div class="import-result-item ${sel?'selected':''}" id="ir-${it._id}">
      <div class="ir-name">
        <span style="cursor:pointer;user-select:none" onclick="toggleImportItem(${it._id})">
          ${sel?'✅':'⬜'} ${it.emoji||'📦'} ${it.name}${it.qty>1?` ×${it.qty}`:''}
        </span>
      </div>
      <div class="ir-meta" onclick="event.stopPropagation()">
        <span>🏷 ${it.brand||'未知'}</span>
        <span>💰 $${(it.price||0).toLocaleString()}</span>
        <select onchange="updateImportCat(${it._id},this.value)" style="font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font-family:inherit">
          <option value="health" ${it.cat==='health'?'selected':''}>💊 保健品</option>
          <option value="skin" ${it.cat==='skin'?'selected':''}>🧴 保養品</option>
          <option value="daily" ${it.cat==='daily'?'selected':''}>🧻 日用品</option>
        </select>
        ${dup?'':'<span style="background:var(--accent3-light);color:var(--accent3);font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px">✨ 新品項</span>'}
      </div>
      <div class="import-edit-row" onclick="event.stopPropagation()">
        <input type="number" placeholder="使用天數（預設30天）" value="${it._days}"
          oninput="updateImportDays(${it._id},this.value)" style="max-width:150px"/>
        <input type="number" placeholder="修改價格" value="${it.price||''}"
          oninput="updateImportPrice(${it._id},this.value)"/>
      </div>
      ${dupHtml}
    </div>`;
  }).join('');

  // Summary card
  const selected=importResults.filter(it=>importSelectedIds.has(it._id));
  let willUpdate=0, willNew=0, willUnhighlight=0;
  selected.forEach(it=>{
    const dup=findDuplicate(it);
    if(dup&&it._action!=='new'){
      willUpdate++;
      if(getDaysLeft(dup.product)<=10) willUnhighlight++;
    } else willNew++;
  });
  const sumEl=document.getElementById('importSummaryCard');
  const sumTxt=document.getElementById('importSummaryText');
  if(sumEl&&sumTxt){
    if(selected.length===0){ sumEl.style.display='none'; }
    else {
      sumEl.style.display='block';
      const parts=[];
      if(willNew>0) parts.push(`<span style="color:var(--accent)">✨ 新增 ${willNew} 個品項</span>`);
      if(willUpdate>0) parts.push(`<span style="color:var(--accent3)">🔄 更新 ${willUpdate} 個現有品項</span>`);
      const hint=willUnhighlight>0?`<div style="font-size:11px;color:var(--text2);font-weight:500;margin-top:4px">🎯 其中 ${willUnhighlight} 個將自動移出「建議比價購買」</div>`:'';
      sumTxt.innerHTML=parts.join('<br>')+hint;
    }
  }

  document.getElementById('importConfirmBtn').textContent=`✓ 確認加入 ${importSelectedIds.size} 個品項`;
}

function setImportAction(id, action){
  const it=importResults.find(x=>x._id===id);
  if(it){ it._action=action; renderImportResults(); }
}
function toggleImportItem(id){
  importSelectedIds.has(id)?importSelectedIds.delete(id):importSelectedIds.add(id);
  renderImportResults();
}
function updateImportDays(id,val){const it=importResults.find(x=>x._id===id);if(it)it._days=parseInt(val)||30;}
function updateImportPrice(id,val){const it=importResults.find(x=>x._id===id);if(it)it.price=parseInt(val)||it.price;}
function updateImportCat(id,val){const it=importResults.find(x=>x._id===id);if(it){it.cat=val; renderImportResults();}}
// 🔍 點圖放大檢視（訂單截圖、收據等）
function openImageZoom(src){
  if(!src) return;
  let ov=document.getElementById('imgZoomOverlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='imgZoomOverlay';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;cursor:zoom-out';
    ov.onclick=()=>ov.remove();
    ov.innerHTML=`<img id="imgZoomImg" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5)"/>
      <div style="position:absolute;top:14px;right:14px;color:#fff;font-size:24px;background:rgba(0,0,0,0.5);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center">✕</div>
      <div style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);color:#fff;font-size:12px;background:rgba(0,0,0,0.5);padding:6px 14px;border-radius:14px">點任一處關閉</div>`;
    document.body.appendChild(ov);
  }
  document.getElementById('imgZoomImg').src=src;
  ov.style.display='flex';
}
window.openImageZoom=openImageZoom;

function confirmImport(){
  const toAdd=importResults.filter(it=>importSelectedIds.has(it._id));
  if(!toAdd.length){showToast('請至少選擇一個品項','error');return;}

  let newCount=0, updateCount=0;

  toAdd.forEach(it=>{
    const today=todayStr();
    const effectiveDays=it._days||30;
    const p=products.find(x=>x.name===it.name && (x.brand||'')===(it.brand||''));
    if(p){
      // UPDATE existing
      p.price=it.price||p.price;
      if(it.volume>0) p.volume=it.volume;
      if(it.unit) p.unit=it.unit;
      updateCount++;
    } else {
      // CREATE new product
      products.push({
        id:Date.now()+Math.floor(Math.random()*10000),
        name:it.name, brand:it.brand||'', price:it.price||0,
        origPrice:it.price||0, emoji:it.emoji||'📦',
        cat:it.cat||'daily', totalDays:effectiveDays,
        boughtDate:today, shopeeUrl:'',
        volume:it.volume||0, unit:it.unit||''
      });
      newCount++;
    }

    // Always record the purchase in expenses
    records.push({
      id:Date.now()+Math.floor(Math.random()*10000),
      name:it.name, emoji:it.emoji||'📦',
      brand:it.brand||'', price:it.price||0,
      cat:it.cat||'daily', date:today, type:'var'
    });
  });

  save();
  document.getElementById('importStep3').style.display='none';
  document.getElementById('importStep4').style.display='block';
  const summary=[];
  if(newCount>0) summary.push(`新增 ${newCount} 個品項`);
  if(updateCount>0) summary.push(`更新 ${updateCount} 個現有品項`);
  document.getElementById('importDoneText').textContent=summary.join('、')+'！';
  renderAll();
}

// ── INCOME PAGE ──
let salaryRecords=JSON.parse(localStorage.getItem('btSalary')||'[]');
// 薪資結算月偏移：0=領薪當月、1=下一月（3/25 入帳算 4 月）
function getSalaryShift(){ return parseInt(localStorage.getItem('btSalaryShift')||'0')||0; }
function setSalaryShift(v){ localStorage.setItem('btSalaryShift',String(v|0)); }
// 將 salaryRecord 換算成「結算月」: 回傳 {y,m}
function getSalaryAttrYM(s){
  const sh=getSalaryShift();
  if(!sh) return {y:s.year, m:s.month};
  let y=s.year, m=s.month+sh;
  while(m>12){ m-=12; y+=1; }
  while(m<1){ m+=12; y-=1; }
  return {y,m};
}
// 條件式 match
function salaryMatchesYM(s, y, m){
  const a=getSalaryAttrYM(s);
  return a.y===y && a.m===m;
}
// 切換結算月偏移
function toggleSalaryShift(){
  const cur=getSalaryShift();
  const next=cur===0?1:0;
  setSalaryShift(next);
  showToast(next===1?'已切換為「下個月」結算':'已切換為「領薪當月」結算','ok');
  if(typeof renderAll==='function') renderAll();
  else { renderIncome(); renderIncomeSalary&&renderIncomeSalary(); }
}
window.toggleSalaryShift=toggleSalaryShift;
let bonusExpected=JSON.parse(localStorage.getItem('btBonus')||'[]');
let vouchers=JSON.parse(localStorage.getItem('btVouchers')||'[]');
let extraIncome=JSON.parse(localStorage.getItem('btExtraIncome')||'[]'); // 副業/投資等额外收入 [{id,name,source,amount,date(YYYY-MM-DD)}]
let creditCards=JSON.parse(localStorage.getItem('btCreditCards')||'[]'); // [{id,name,bank,last4,statementDay,dueDay,color}]
let cashSavings=JSON.parse(localStorage.getItem('btCashSavings')||'null')||{amount:0,history:[],lastSurplusPromptYM:''};
// 🚇 悠遊卡/儲值帳戶（iCash、街口等通用）— balance:目前餘額；history:[{date,delta,note,type:'topup'|'spend'}]
let easyCard=JSON.parse(localStorage.getItem('btEasyCard')||'null')||{balance:0,history:[]};
let investments=JSON.parse(localStorage.getItem('btInvestments')||'null')||{entries:[],valueHistory:[]};
// entries: [{id,name,amount,date,note}]
// valueHistory: [{id,date,value,note}] —  最後一筆即「目前市值」
let invoiceSeen=JSON.parse(localStorage.getItem('btInvoiceSeen')||'{}');
// invoice: {date,total,seller,savedAt}
let lotteryNumbers=JSON.parse(localStorage.getItem('btLotteryNumbers')||'null')||{period:'',special:'',grand:'',first:[],sixth:[],updatedAt:''};
// period '113-03-04'（113年3-4月期） first:['AB12345678',...]（8碼尾號）
let savingGoal=JSON.parse(localStorage.getItem('btSavingGoal')||'null')||{mode:'percent',value:0}; // mode:'percent'|'amount'
let psFields=[];
let summaryMonth={y:getNow().getFullYear(),m:getNow().getMonth()};// 0-indexed month (prev month default)
let currentIncTab='salary';

function switchIncTab(tab, el){
  currentIncTab=tab;
  ['salary','extra','bonus','summary','savings','voucher','easycard'].forEach(t=>{
    const sub=document.getElementById('incSub-'+t);
    if(sub) sub.style.display=t===tab?'block':'none';
    const btn=document.getElementById('incTab-'+t);
    if(btn) btn.classList.toggle('active',t===tab);
  });
  if(tab==='salary') renderIncomeSalary();
  if(tab==='extra') renderExtraIncome();
  if(tab==='bonus') renderBonusTab();
  if(tab==='summary') renderSummaryTab();
  if(tab==='savings') renderSavingsTab();
  if(tab==='voucher') renderVouchers();
  if(tab==='easycard') renderEasyCardTab();
}

function renderIncome(){
  const now=getNow();
  const yr=now.getFullYear(), mo=now.getMonth()+1;
  // 結算月偏移 UI 同步
  const shiftDesc=document.getElementById('salaryShiftDesc');
  if(shiftDesc){
    shiftDesc.textContent=getSalaryShift()===1
      ? '下個月（3/25 入帳算 4 月）'
      : '領薪當月（3/25 入帳算 3 月）';
  }
  // guard: only set if elements exist (income page might not be active)
  const thisMonthSal=salaryRecords.find(s=>salaryMatchesYM(s,yr,mo));
  const el1=document.getElementById('incThisMonth');
  if(el1) el1.textContent=thisMonthSal?`$${thisMonthSal.netPay.toLocaleString()}`:'$0';
  const heroSub=document.getElementById('incHeroSub');
  if(heroSub){
    if(thisMonthSal) heroSub.textContent=`${yr} 年 ${mo} 月 · 點下方「✏️ 輸入薪資」可新增`;
    else heroSub.textContent='本月尚未記錄，點「✏️ 輸入薪資」開始';
  }
  const yearBonus=bonusExpected.reduce((s,b)=>s+b.amount,0);
  const el2=document.getElementById('incBonusYear');
  if(el2) el2.textContent=`$${yearBonus.toLocaleString()}`;
  const yearSalary=salaryRecords.filter(s=>s.year===yr).reduce((s,r)=>s+r.netPay,0);
  const el3=document.getElementById('incYearTotal');
  if(el3) el3.textContent=`$${(yearSalary+yearBonus).toLocaleString()}`;
  // render active sub-tab
  if(currentIncTab==='salary') renderIncomeSalary();
  else if(currentIncTab==='extra') renderExtraIncome();
  else if(currentIncTab==='bonus') renderBonusTab();
  else if(currentIncTab==='summary') renderSummaryTab();
  else if(currentIncTab==='voucher') renderVouchers();
}

// ── SALARY TAB ──
function renderIncomeSalary(){
  const now=getNow();
  const months=[];
  for(let i=11;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const rec=salaryRecords.find(s=>salaryMatchesYM(s,d.getFullYear(),d.getMonth()+1));
    months.push({label:`${d.getMonth()+1}月`,total:rec?rec.netPay:0,isCur:i===0});
  }
  const maxInc=Math.max(...months.map(m=>m.total),1);
  const incBarChartEl=document.getElementById('incBarChart'); if(!incBarChartEl) return;
  incBarChartEl.innerHTML=months.map(m=>{
    const pct=(m.total/maxInc)*100;
    return `<div class="bar-col"><div class="bar-val">${m.total>0?Math.round(m.total/1000)+'K':''}</div><div class="bar-wrap"><div class="bar" style="height:${pct}%;background:${m.isCur?'linear-gradient(to top,var(--accent3),#4dd9a0)':'var(--bg2)'}"></div></div><div class="bar-label">${m.label}</div></div>`;
  }).join('');
  const recCount=months.filter(m=>m.total>0).length;
  document.getElementById('incChartSub').textContent=recCount>0?`已記錄 ${recCount} 個月`:'尚無記錄';

  // salary list
  const sl=[...salaryRecords].sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month);
  const salaryListEl=document.getElementById('salaryList'); if(!salaryListEl) return;
  if(typeof _salaryShown==='undefined') _salaryShown=12;
  const salTotal=sl.length;
  const salVisible=sl.slice(0,_salaryShown);
  const salItems=salVisible.map(s=>`<div onclick="openSalaryDetail(${s.id})" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:11px 13px;margin-bottom:7px;display:flex;align-items:center;gap:11px;box-shadow:var(--shadow);cursor:pointer;transition:all 0.12s">
        <div style="font-size:20px">💵</div>
        <div style="flex:1"><div style="font-size:12px;font-weight:600">${s.year}年${s.month}月${s.source==='manual'?' ✏️':' 📄'}</div><div style="font-size:11px;color:var(--text2);margin-top:2px">${s.fields?s.fields.length+'個項目 · ':' '}${s.date} · 點擊看明細</div></div>
        <div style="text-align:right">
          <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:600;color:var(--accent3)">$${s.netPay.toLocaleString()}</div>
          <button onclick="event.stopPropagation();deleteSalary(${s.id})" style="font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer;margin-top:2px">✕</button>
        </div>
      </div>`).join('');
  const salMore=salTotal>_salaryShown
    ?`<div style="text-align:center;margin-top:8px"><button class="btn-sm primary" style="padding:7px 14px;font-size:12px" onclick="loadMoreSalary()">▼ 載入更多（剩 ${salTotal-_salaryShown} 筆）</button></div>`
    :(salTotal>12?`<div style="text-align:center;margin-top:8px;font-size:11px;color:var(--text3)"><a href="javascript:void(0)" onclick="resetSalaryPage()" style="color:var(--accent)">收合</a></div>`:'');
  salaryListEl.innerHTML=!sl.length
    ?emptyState({cat:'pawcoin',title:'還沒有薪資記錄',sub:'手動輸入或 AI 辨識薪資單，自動計算可用餘額',ctaLabel:'＋ 輸入薪資',ctaOnClick:'openManualSalaryModal()',accent:true})
    :salItems+salMore;
}
let _salaryShown=12;
function loadMoreSalary(){ _salaryShown+=12; renderIncomeSalary(); }
function resetSalaryPage(){ _salaryShown=12; renderIncomeSalary(); }

// ── BONUS TAB (compact timeline) ──
function renderIncomeBonus(){
  const now=getNow(); const mo=now.getMonth()+1;
  const sorted=[...bonusExpected].sort((a,b)=>a.month-b.month);
  const total=sorted.reduce((s,b)=>s+b.amount,0);
  const tlEl=document.getElementById('bonusTotalLabel');
  if(tlEl) tlEl.textContent=`$${total.toLocaleString()}`;

  // Compact timeline: 12 month dots
  const tl=document.getElementById('bonusTimeline');
  if(tl){
    const monthNames=['1','2','3','4','5','6','7','8','9','10','11','12'];
    tl.innerHTML=`<div style="display:flex;align-items:flex-end;gap:4px;padding:8px 0 4px">
      ${monthNames.map((_,i)=>{
        const mNo=i+1;
        const bonuses=sorted.filter(b=>b.month===mNo);
        const isCur=mNo===mo;
        const hasBon=bonuses.length>0;
        return `<div style="flex:1;text-align:center;cursor:${hasBon?'pointer':'default'}" onclick="${hasBon?`toggleBonusMonth(${mNo})`:''}">
          <div style="height:${hasBon?28:8}px;background:${isCur&&hasBon?'var(--accent3)':hasBon?'var(--accent)':'var(--bg2)'};border-radius:4px;margin-bottom:3px;display:flex;align-items:center;justify-content:center;font-size:${hasBon?'10px':'0'};color:white;font-weight:700">
            ${hasBon?bonuses[0].emoji:''}
          </div>
          <div style="font-size:9px;color:${isCur?'var(--accent)':'var(--text3)'};font-weight:${isCur?'700':'400'}">${mNo}月</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // List
  const bc=document.getElementById('bonusCalendar'); if(!bc) return;
  bc.innerHTML=!sorted.length
    ?emptyState({emoji:'🎁',title:'還沒有獎金預期',sub:'預計年終、年中、三節獎金可事先設定',ctaLabel:'＋ 新增獎金預期',ctaOnClick:'openBonusModal()'})
    :sorted.map(b=>{
      const diff=b.month-mo;
      const isCur=diff===0;
      const isPast=diff<0;
      const label=isCur?'🎉 本月發放':(isPast?`${Math.abs(diff)}個月前`:`還有 ${diff} 個月`);
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:${isCur?'var(--accent3-light)':'var(--surface)'};border:1.5px solid ${isCur?'rgba(24,184,124,0.3)':'var(--border)'};border-radius:var(--r-sm);margin-bottom:7px;box-shadow:var(--shadow)">
        <div style="font-size:18px">${b.emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600">${b.name}</div>
          <div style="font-size:10px;color:var(--text2)">${b.month}月 · ${label}${b.note?' · '+b.note:''}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:${isCur?'var(--accent3)':'var(--accent)'};flex-shrink:0">$${b.amount.toLocaleString()}</div>
        <button onclick="deleteBonus(${b.id})" style="color:var(--text3);background:none;border:none;cursor:pointer;font-size:16px;padding:0;flex-shrink:0">✕</button>
      </div>`;
    }).join('');
}

// ── MONTHLY SUMMARY TAB ──
let summaryView='month'; // 'month' | 'year'
function setSummaryView(v){
  summaryView=v;
  const mBtn=document.getElementById('sumViewMonthBtn');
  const yBtn=document.getElementById('sumViewYearBtn');
  if(mBtn&&yBtn){
    mBtn.classList.toggle('primary',v==='month');
    yBtn.classList.toggle('primary',v==='year');
  }
  const ysWrap=document.getElementById('yearlySavingsWrap');
  if(ysWrap) ysWrap.style.display=(v==='year'?'block':'none');
  renderSummaryTab();
}
function changeSummaryPeriod(d){
  if(summaryView==='year'){ summaryMonth.y+=d; }
  else {
    summaryMonth.m+=d;
    if(summaryMonth.m>11){summaryMonth.m=0;summaryMonth.y++;}
    if(summaryMonth.m<0){summaryMonth.m=11;summaryMonth.y--;}
  }
  renderSummaryTab();
}
// 舊 API 相容
function changeSummaryMonth(d){ changeSummaryPeriod(d); }
function renderSummaryTab(){
  if(summaryView==='year'){ renderYearSummary(); renderYearlySavings(); }
  else { renderSummary(); }
}

function renderYearSummary(){
  const y=summaryMonth.y;
  document.getElementById('summaryMonthLabel').textContent=`${y}年`;
  const el=document.getElementById('summaryContent'); if(!el) return;

  // 逐月計算
  const monthly=[];
  for(let m=0;m<12;m++){
    const ym=`${y}-${String(m+1).padStart(2,'0')}`;
    const salRec=salaryRecords.find(s=>salaryMatchesYM(s,y,m+1));
    const sal=salRec?salRec.netPay:0;
    const bon=bonusExpected.filter(b=>b.month===(m+1)).reduce((s,b)=>s+b.amount,0);
    const income=sal+bon;
    const varR=records.filter(r=>getEffectiveMonth(r)===ym&&r.type!=='fixed');
    const fixR=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='fixed');
    const varSp=varR.reduce((s,r)=>s+r.price,0);
    const fixSp=fixR.length>0?fixR.reduce((s,r)=>s+r.price,0):0;
    const vch=records.filter(r=>getEffectiveMonth(r)===ym&&(r.type==='voucher'||r.type==='easycard')).reduce((s,r)=>s+r.price,0);
    const cashSp=varSp+fixSp-vch;
    monthly.push({m:m+1,income,varSp,fixSp,cashSp,surplus:income-cashSp,hasData:sal>0||varR.length>0||fixR.length>0});
  }

  const totalIncome=monthly.reduce((s,x)=>s+x.income,0);
  const totalCashSp=monthly.reduce((s,x)=>s+x.cashSp,0);
  const totalSurplus=totalIncome-totalCashSp;
  const activeMonths=monthly.filter(x=>x.hasData).length;
  const avgSurplus=activeMonths>0?Math.round(totalSurplus/activeMonths):0;
  const savRate=totalIncome>0?Math.round(totalSurplus/totalIncome*100):0;

  // 類別排行（全年 var+life+voucher）
  const catTotal={};
  records.forEach(r=>{
    const rYm=getEffectiveMonth(r);
    if(!rYm||!rYm.startsWith(y+'-')) return;
    if(r.type==='fixed') return;
    const key=r.cat||'other';
    const meta={label:(typeof catLabel==='function'?catLabel(key):key),emoji:(typeof catEmoji==='function'?catEmoji(key):'')};
    const cc=categories.find(c=>c.id===key);
    if(cc){ meta.label=cc.label; meta.emoji=cc.emoji; }
    if(!catTotal[key]) catTotal[key]={label:meta.label,emoji:meta.emoji,total:0,count:0};
    catTotal[key].total+=r.price; catTotal[key].count++;
  });
  const topCats=Object.values(catTotal).sort((a,b)=>b.total-a.total).slice(0,5);

  // 最高單筆
  const yearRecs=records.filter(r=>{const ym=getEffectiveMonth(r); return ym&&ym.startsWith(y+'-')&&r.type!=='fixed';});
  const topRec=yearRecs.reduce((a,b)=>(!a||b.price>a.price)?b:a,null);

  // 12 月柱狀圖
  const maxVal=Math.max(...monthly.map(x=>Math.max(x.income,x.cashSp)),1);
  const barChart=monthly.map(x=>{
    const inH=Math.round(x.income/maxVal*70);
    const outH=Math.round(x.cashSp/maxVal*70);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
      <div style="display:flex;gap:2px;align-items:flex-end;height:72px">
        <div title="收入 $${x.income.toLocaleString()}" style="width:8px;height:${inH}px;background:var(--accent3);border-radius:2px"></div>
        <div title="支出 $${x.cashSp.toLocaleString()}" style="width:8px;height:${outH}px;background:var(--accent2);border-radius:2px"></div>
      </div>
      <div style="font-size:9px;color:var(--text3)">${x.m}</div>
    </div>`;
  }).join('');

  // 月份明細表
  const monthRows=monthly.filter(x=>x.hasData).map(x=>{
    const sign=x.surplus>=0?'+':'-';
    const col=x.surplus>=0?'var(--accent3)':'var(--danger)';
    return `<div style="display:grid;grid-template-columns:40px 1fr 1fr 1fr;gap:4px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px;align-items:center">
      <div style="font-weight:700">${x.m}月</div>
      <div style="font-family:'DM Mono',monospace;color:var(--accent3);text-align:right">$${x.income.toLocaleString()}</div>
      <div style="font-family:'DM Mono',monospace;color:var(--accent2);text-align:right">$${x.cashSp.toLocaleString()}</div>
      <div style="font-family:'DM Mono',monospace;color:${col};text-align:right;font-weight:700">${sign}$${Math.abs(x.surplus).toLocaleString()}</div>
    </div>`;
  }).join('')||`<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">本年尚無資料</div>`;

  el.innerHTML=`
    <!-- 年度總覽 -->
    <div style="background:${totalSurplus>=0?'linear-gradient(135deg,rgba(24,184,124,0.1),rgba(240,138,107,0.07))':'linear-gradient(135deg,rgba(232,48,48,0.08),rgba(232,124,32,0.06))'};border:2px solid ${totalSurplus>=0?'rgba(24,184,124,0.3)':'rgba(232,48,48,0.3)'};border-radius:var(--r);padding:16px;margin-bottom:10px;text-align:center">
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px">${totalSurplus>=0?`💰 ${y}年結餘`:`⚠️ ${y}年超支`}</div>
      <div style="font-family:'DM Mono',monospace;font-size:30px;font-weight:700;color:${totalSurplus>=0?'var(--accent3)':'var(--danger)'}">
        ${totalSurplus>=0?'':'-'}$${Math.abs(totalSurplus).toLocaleString()}
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:6px">儲蓄率 ${savRate}% · 已記錄 ${activeMonths} 個月 · 平均每月存 $${avgSurplus.toLocaleString()}</div>
    </div>

    <!-- 收入/支出 KPI -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;box-shadow:var(--shadow)">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">💚 年度總收入</div>
        <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:var(--accent3)">$${totalIncome.toLocaleString()}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;box-shadow:var(--shadow)">
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">🔴 年度現金支出</div>
        <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:var(--accent2)">$${totalCashSp.toLocaleString()}</div>
      </div>
    </div>

    <!-- 12 月收支曲線 -->
    <div class="chart-card" style="margin-bottom:12px">
      <div class="chart-title">📊 12 個月收支</div>
      <div style="display:flex;gap:2px;padding:10px 4px 0">${barChart}</div>
      <div style="display:flex;gap:14px;justify-content:center;margin-top:8px;font-size:10px;color:var(--text2)">
        <span><span style="display:inline-block;width:8px;height:8px;background:var(--accent3);border-radius:2px;margin-right:4px"></span>收入</span>
        <span><span style="display:inline-block;width:8px;height:8px;background:var(--accent2);border-radius:2px;margin-right:4px"></span>支出</span>
      </div>
    </div>

    <!-- 年度類別排行 -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:10px;box-shadow:var(--shadow)">
      <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:10px">🏆 年度消費類別 Top 5</div>
      ${topCats.length?topCats.map((c,i)=>{
        const pct=totalCashSp>0?Math.round(c.total/totalCashSp*100):0;
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:${i<topCats.length-1?'1px solid var(--border)':'none'}">
          <div style="width:20px;font-size:14px;text-align:center">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600">${c.emoji} ${c.label}</div>
            <div style="font-size:10px;color:var(--text3)">${c.count} 筆 · 占 ${pct}%</div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--accent2)">$${c.total.toLocaleString()}</div>
        </div>`;
      }).join(''):`<div style="text-align:center;padding:16px;color:var(--text3);font-size:12px">本年度尚無消費記錄</div>`}
    </div>

    ${topRec?`<!-- 最高單筆 -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:10px;box-shadow:var(--shadow)">
      <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:10px">💥 最高單筆消費</div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:24px">${topRec.emoji||'🏷'}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700">${topRec.name}</div>
          <div style="font-size:11px;color:var(--text3)">${topRec.date}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:18px;font-weight:700;color:var(--danger)">$${topRec.price.toLocaleString()}</div>
      </div>
    </div>`:''}

    <!-- 月份明細 -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;box-shadow:var(--shadow)">
      <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:10px">📅 逐月明細</div>
      <div style="display:grid;grid-template-columns:40px 1fr 1fr 1fr;gap:4px;font-size:10px;color:var(--text3);padding-bottom:6px;border-bottom:1.5px solid var(--border)">
        <div>月份</div><div style="text-align:right">收入</div><div style="text-align:right">支出</div><div style="text-align:right">結餘</div>
      </div>
      ${monthRows}
    </div>

    <!-- 🌊 桑基圖：收入 → 類別支出 -->
    ${renderSankeyCard(y, totalIncome, topCats, totalCashSp, totalSurplus)}

    <!-- 🔥 支出熱力圖（GitHub 風格） -->
    ${renderHeatmapCard(y)}

    <!-- 📈 資產淨值時間序列（近 12 月） -->
    ${renderNetWorthTimelineCard()}

    <!-- 📤 年度回顧分享卡 -->
    <button class="btn-submit" style="width:100%;margin-top:14px" onclick="exportYearReviewCard(${y})">
      📤 產生 ${y} 年度回顧分享卡
    </button>
  `;
}

// ─────────────────────────────────────────────────────
// PHASE J — 視覺化（純 SVG，無外部依賴）
// ─────────────────────────────────────────────────────

// 1) 桑基圖：收入 → 類別支出 + 結餘（含「其他」歸併、最小寬高保證避免重疊）
function renderSankeyCard(year, totalIncome, topCats, totalCashSp, totalSurplus){
  if(totalIncome<=0 && totalCashSp<=0) return '';
  const W=360, H=280, lpad=80, rpad=120;
  const leftX=lpad, rightX=W-rpad;
  const leftH=H-30, leftY=15;

  // 多色色盤（避免全部一色）
  const palette=['#e8488a','#F08A6B','#18b87c','#e87c20','#3b82f6','#a855f7','#14b8a6'];

  // 取 top 4 類別 + 其他歸併
  const sortedCats=[...topCats].sort((a,b)=>b.total-a.total);
  const TOP_N=4;
  const top=sortedCats.slice(0,TOP_N);
  const restTotal=sortedCats.slice(TOP_N).reduce((s,c)=>s+c.total,0);

  const rightItems=[];
  top.forEach((c,i)=>rightItems.push({label:`${c.emoji} ${c.label}`, value:c.total, color:palette[i%palette.length]}));
  if(restTotal>0) rightItems.push({label:'📦 其他', value:restTotal, color:'#94a3b8'});
  if(totalSurplus>0) rightItems.push({label:'💰 結餘', value:totalSurplus, color:'#16a974'});
  if(rightItems.length===0) return '';

  const rightTotal=rightItems.reduce((s,r)=>s+r.value,0);

  // 為了標籤清晰，計算每段最小高度（讓 2 行文字不重疊）
  const MIN_H=22; // 每個 label 至少 22px 才能擺得下兩行
  const gap=4;
  const totalGap=gap*(rightItems.length-1);
  const usableH=leftH-totalGap;
  // 按比例分配，但保證最小 MIN_H
  let allocated=rightItems.map(r=>Math.max(MIN_H, (r.value/rightTotal)*usableH));
  // 若總和超過 usableH，按比例縮回（但不低於 MIN_H）
  let sumAlloc=allocated.reduce((s,h)=>s+h,0);
  if(sumAlloc>usableH){
    const overflow=sumAlloc-usableH;
    // 從最大塊扣
    const indices=[...allocated.keys()].sort((a,b)=>allocated[b]-allocated[a]);
    let remain=overflow;
    for(const i of indices){
      const canTrim=Math.max(0,allocated[i]-MIN_H);
      const trim=Math.min(canTrim,remain);
      allocated[i]-=trim; remain-=trim;
      if(remain<=0)break;
    }
  }
  let yCursor=leftY;
  const flows=rightItems.map((r,i)=>{
    const h=allocated[i];
    const o={...r, y:yCursor, h};
    yCursor+=h+gap;
    return o;
  });

  const incomeColor='#F08A6B';
  const flowsSvg=flows.map(f=>{
    const sx=leftX+10, sy=leftY+leftH/2;
    const ex=rightX, ey=f.y+f.h/2;
    const c1x=(sx+ex)/2;
    // 流寬以實際 value 比例為主（避免最小高度誤導），但限制在 [4, f.h]
    const flowH=Math.max(4, Math.min(f.h, (f.value/rightTotal)*leftH));
    return `<path d="M ${sx} ${sy-flowH/2} C ${c1x} ${sy-flowH/2}, ${c1x} ${ey-flowH/2}, ${ex} ${ey-flowH/2} L ${ex} ${ey+flowH/2} C ${c1x} ${ey+flowH/2}, ${c1x} ${sy+flowH/2}, ${sx} ${sy+flowH/2} Z"
      fill="${f.color}" opacity="0.35"/>`;
  }).join('');
  const rightLabels=flows.map(f=>`
    <rect x="${rightX}" y="${f.y}" width="14" height="${f.h}" fill="${f.color}" rx="2"/>
    <text x="${rightX+18}" y="${f.y+f.h/2-2}" font-size="10" fill="var(--text)" font-weight="600">${escapeHTML(f.label)}</text>
    <text x="${rightX+18}" y="${f.y+f.h/2+11}" font-size="9" fill="var(--text3)">$${Math.round(f.value).toLocaleString()}</text>
  `).join('');
  return `
    <div class="chart-card" style="margin-top:12px">
      <div class="chart-title">🌊 金流流向</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
        <rect x="${leftX-12}" y="${leftY}" width="14" height="${leftH}" fill="${incomeColor}" rx="2"/>
        <text x="${leftX-18}" y="${leftY+leftH/2-2}" font-size="10" fill="var(--text)" font-weight="600" text-anchor="end">總收入</text>
        <text x="${leftX-18}" y="${leftY+leftH/2+11}" font-size="9" fill="var(--text3)" text-anchor="end">$${Math.round(totalIncome).toLocaleString()}</text>
        ${flowsSvg}
        ${rightLabels}
      </svg>
      <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:6px">收入如何分流到不同支出類別</div>
    </div>`;
}

// 2) 熱力圖：以日為格，顏色深淺 = 支出 / 中位數倍率
function renderHeatmapCard(year){
  const start=new Date(year,0,1);
  const end=new Date(year,11,31);
  const today=getNow();
  const dayMap={};
  records.forEach(r=>{
    if(r._travelBudget) return;
    if(!r.date) return;
    const d=r.date.slice(0,10);
    if(d.startsWith(String(year))){ dayMap[d]=(dayMap[d]||0)+r.price; }
  });
  const values=Object.values(dayMap).filter(v=>v>0).sort((a,b)=>a-b);
  if(!values.length) return '';
  const median=values[Math.floor(values.length/2)] || 1;
  const max=values[values.length-1] || 1;
  function colorOf(v){
    if(!v) return 'var(--bg2)';
    const r=Math.min(1, v/(median*2));
    // 由淺橘到深紅
    const stops=['#fde9d9','#fbc99a','#f59e0b','#e87c20','#c2410c','#7c2d12'];
    return stops[Math.min(stops.length-1, Math.floor(r*stops.length))] || stops[stops.length-1];
  }
  // 53 週 x 7 天
  const cols=[];
  let cur=new Date(start);
  // 對齊到當週的週日
  const offset=cur.getDay();
  cur.setDate(cur.getDate()-offset);
  for(let w=0;w<53;w++){
    const week=[];
    for(let d=0;d<7;d++){
      const ds=cur.toISOString().slice(0,10);
      const inYear=cur.getFullYear()===year;
      const isFuture=cur>today;
      week.push({date:ds,val:dayMap[ds]||0,inYear,isFuture});
      cur.setDate(cur.getDate()+1);
    }
    cols.push(week);
  }
  // 截掉「整週都在未來」的 cols，避免出現大塊空白（當年才裁，往年保留全 53 週）
  const isCurYear=(year===today.getFullYear());
  let lastValidCol=cols.length;
  if(isCurYear){
    for(let i=cols.length-1;i>=0;i--){
      if(cols[i].some(c=>c.inYear && !c.isFuture)){ lastValidCol=i+1; break; }
    }
    cols.length=Math.min(cols.length, lastValidCol+1); // 保留 1 週緩衝
  }
  const cellSize=10, gap=2;
  const W=cols.length*(cellSize+gap)+4, H=7*(cellSize+gap)+18;
  const cells=cols.map((wk,wi)=>wk.map((c,di)=>{
    if(!c.inYear || c.isFuture) return '';
    const x=wi*(cellSize+gap)+2, y=di*(cellSize+gap)+14;
    return `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${colorOf(c.val)}" rx="1.5"><title>${c.date}: $${c.val.toLocaleString()}</title></rect>`;
  }).join('')).join('');
  // 月份標記：只顯示「該月有 1 號」且不在未來
  const monthMarks=[];
  let lastX=-9999;
  const curY=today.getFullYear(), curM=today.getMonth(); // 0-indexed
  for(let mo=0;mo<12;mo++){
    if(year===curY && mo>curM) continue; // 當年僅顯示已過月份
    const wkIdx=cols.findIndex(wk=>wk.some(c=>c.inYear && c.date.slice(5,7)===String(mo+1).padStart(2,'0')));
    if(wkIdx<0) continue;
    const x=wkIdx*(cellSize+gap)+2;
    if(x-lastX < 26) continue;
    monthMarks.push(`<text x="${x}" y="10" font-size="9" fill="var(--text3)">${mo+1}月</text>`);
    lastX=x;
  }
  const totalDays=Object.keys(dayMap).length;
  const totalSum=values.reduce((s,v)=>s+v,0);
  return `
    <div class="chart-card" style="margin-top:12px">
      <div class="chart-title">🔥 支出熱力圖</div>
      <div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:280px;display:block">${monthMarks.join('')}${cells}</svg></div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:6px">
        <span>${totalDays} 天有記錄 · 共 $${totalSum.toLocaleString()}</span>
        <span>少 <span style="display:inline-block;width:8px;height:8px;background:#fde9d9;margin:0 2px"></span><span style="display:inline-block;width:8px;height:8px;background:#f59e0b;margin:0 2px"></span><span style="display:inline-block;width:8px;height:8px;background:#7c2d12;margin:0 2px"></span> 多</span>
      </div>
    </div>`;
}

// 3) 資產淨值時間序列：近 12 個月（用每月底結餘累加）
function renderNetWorthTimelineCard(){
  const cash=(typeof cashSavings!=='undefined'&&cashSavings.amount)?cashSavings.amount:0;
  const inv=(typeof getInvestCurValue==='function')?getInvestCurValue():0;
  const debt=(typeof getTotalDebtBalance==='function')?getTotalDebtBalance():0;
  if(cash===0 && inv===0 && debt===0) return '';
  // 簡化：以「目前淨值」當作 t=12，回推每月用每月結餘累積
  const now=getNow();
  const points=[];
  let val=cash+inv-debt;
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const salRec=(typeof salaryRecords!=='undefined')?salaryRecords.find(s=>`${s.year}-${String(s.month+1).padStart(2,'0')}`===ym):null;
    const sal=salRec?salRec.netPay:0;
    const sp=records.filter(r=>getEffectiveMonth(r)===ym&&!r._travelBudget&&(r.type==='var'||r.type==='life'||r.type==='fixed'||r.type==='voucher'||r.type==='easycard')).reduce((s,r)=>s+r.price,0);
    points.unshift({ym,val});
    val-=sal-sp; // 回推：上月底淨值 = 本月底 - 本月結餘
  }
  const W=320, H=120, padL=8, padR=8, padT=10, padB=18;
  const minV=Math.min(...points.map(p=>p.val));
  const maxV=Math.max(...points.map(p=>p.val));
  const range=Math.max(1,maxV-minV);
  const xs=(i)=>padL+i*((W-padL-padR)/(points.length-1));
  const ys=(v)=>padT+(H-padT-padB)*(1-(v-minV)/range);
  const path='M '+points.map((p,i)=>`${xs(i)} ${ys(p.val)}`).join(' L ');
  const area=path+` L ${xs(points.length-1)} ${H-padB} L ${xs(0)} ${H-padB} Z`;
  const xlabels=points.map((p,i)=>{
    if(i%3!==0) return '';
    const [yy,mm]=p.ym.split('-');
    const label=mm==='01' ? `${yy}/1` : `${parseInt(mm)}月`; // 1 月顯示年份標籤
    return `<text x="${xs(i)}" y="${H-4}" font-size="8" fill="var(--text3)" text-anchor="middle">${label}</text>`;
  }).join('');
  return `
    <div class="chart-card" style="margin-top:12px">
      <div class="chart-title">📈 近 12 月淨值變化</div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
        <path d="${area}" fill="rgba(240,138,107,0.12)"/>
        <path d="${path}" fill="none" stroke="#F08A6B" stroke-width="2"/>
        ${points.map((p,i)=>`<circle cx="${xs(i)}" cy="${ys(p.val)}" r="2.5" fill="#F08A6B"/>`).join('')}
        ${xlabels}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:4px">
        <span>最低 $${Math.round(minV).toLocaleString()}</span>
        <span>目前 $${Math.round(points[points.length-1].val).toLocaleString()}</span>
        <span>最高 $${Math.round(maxV).toLocaleString()}</span>
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px;text-align:center">＊以目前淨值反推，僅供趨勢參考</div>
    </div>`;
}

// 4) 年度回顧分享卡：canvas → PNG download
function exportYearReviewCard(year){
  try{
    const cv=document.createElement('canvas');
    cv.width=720; cv.height=1280;
    const c=cv.getContext('2d');
    // 漸層背景
    const g=c.createLinearGradient(0,0,720,1280);
    g.addColorStop(0,'#F08A6B'); g.addColorStop(1,'#e8488a');
    c.fillStyle=g; c.fillRect(0,0,720,1280);
    // 計算
    let totalIncome=0,totalSp=0;
    if(typeof salaryRecords!=='undefined') totalIncome+=salaryRecords.filter(s=>s.year===year).reduce((s,x)=>s+(x.netPay||0),0);
    if(typeof bonusExpected!=='undefined') totalIncome+=bonusExpected.reduce((s,b)=>s+b.amount,0);
    records.forEach(r=>{ if(!r._travelBudget && r.date && r.date.startsWith(String(year))){ totalSp+=r.price; } });
    const surplus=totalIncome-totalSp;
    const savRate=totalIncome>0?Math.round(surplus/totalIncome*100):0;
    // 文案
    c.fillStyle='#fff'; c.textAlign='center';
    c.font='bold 56px "Noto Sans TC", sans-serif';
    c.fillText(`${year} 年度回顧`, 360, 200);
    c.font='28px "Noto Sans TC", sans-serif';
    c.fillStyle='rgba(255,255,255,0.85)';
    c.fillText('TheTrack · 你的記帳成績單', 360, 250);
    // KPI
    function drawKpi(y,label,val,color){
      c.fillStyle='rgba(255,255,255,0.13)';
      c.beginPath();
      const x=80,w=560,h=140,r=24;
      c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.fill();
      c.fillStyle='rgba(255,255,255,0.7)'; c.textAlign='left'; c.font='22px "Noto Sans TC", sans-serif';
      c.fillText(label, x+30, y+45);
      c.fillStyle=color||'#fff'; c.font='bold 56px "DM Mono", monospace';
      c.fillText(val, x+30, y+110);
    }
    drawKpi(330,'💚 年度總收入',`$${totalIncome.toLocaleString()}`,'#a7f3d0');
    drawKpi(490,'🔴 年度總支出',`$${totalSp.toLocaleString()}`,'#fbcfe8');
    drawKpi(650, surplus>=0?'💰 年度結餘':'⚠️ 年度超支', `${surplus>=0?'+':'-'}$${Math.abs(surplus).toLocaleString()}`, surplus>=0?'#a7f3d0':'#fecaca');
    drawKpi(810,'🎯 儲蓄率',`${savRate}%`, savRate>=20?'#a7f3d0':savRate>=0?'#fef08a':'#fecaca');
    // Footer
    c.fillStyle='rgba(255,255,255,0.6)'; c.textAlign='center'; c.font='20px "Noto Sans TC", sans-serif';
    c.fillText('📱 TheTrack 個人記帳', 360, 1180);
    c.font='16px "Noto Sans TC", sans-serif';
    c.fillText(new Date().toLocaleDateString('zh-TW'), 360, 1220);
    // 下載
    cv.toBlob(b=>{
      if(!b){ showToast('產生失敗','error'); return; }
      const url=URL.createObjectURL(b);
      const a=document.createElement('a');
      a.href=url; a.download=`year-review-${year}.png`;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); },200);
      showToast(`✓ ${year} 年度回顧已下載`,'ok');
    },'image/png');
  }catch(e){
    console.error(e);
    showToast('產生失敗：'+e.message,'error');
  }
}
window.exportYearReviewCard=exportYearReviewCard;

function renderSummary(){
  const {y,m}=summaryMonth;
  const mo=m+1;
  const ym=`${y}-${String(mo).padStart(2,'0')}`;
  document.getElementById('summaryMonthLabel').textContent=`${y}年${mo}月`;

  const salRec=salaryRecords.find(s=>salaryMatchesYM(s,y,mo));
  const salAmt=salRec?salRec.netPay:0;
  const bonusThisMonth=bonusExpected.filter(b=>b.month===mo).reduce((s,b)=>s+b.amount,0);
  const totalIncome=salAmt+bonusThisMonth;

  const varSpend=records.filter(r=>getEffectiveMonth(r)===ym&&r.type!=='fixed').reduce((s,r)=>s+r.price,0);
  // For historical months, use actual fixed records saved; fall back to current monthly total for current/future months
  const fixedRecs=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='fixed');
  const fixedSpend=fixedRecs.length>0
    ? fixedRecs.reduce((s,r)=>s+r.price,0)
    : getMonthlyFixed();
  const totalSpend=varSpend+fixedSpend;
  // voucher spend (non-cash)
  const voucherSpend=records.filter(r=>getEffectiveMonth(r)===ym&&(r.type==='voucher'||r.type==='easycard')).reduce((s,r)=>s+r.price,0);
  const cashSpend=totalSpend-voucherSpend;

  const surplus=totalIncome-cashSpend;
  const hasSalary=salAmt>0;

  const summContentEl=document.getElementById('summaryContent'); if(!summContentEl) return;
  summContentEl.innerHTML=`
    ${!hasSalary?`<div style="background:var(--warn-light);border:1px solid rgba(232,124,32,0.2);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:12px;font-size:12px;color:var(--warn)">⚠️ 本月尚未記錄薪資，結餘計算可能不準確</div>`:''}

    <!-- income block -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:10px;box-shadow:var(--shadow)">
      <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:10px">💚 本月收入</div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span>薪資實領</span><span style="font-family:'DM Mono',monospace;color:${hasSalary?'var(--accent3)':'var(--text3)'}">
          ${hasSalary?`$${salAmt.toLocaleString()}`:`<span style="font-size:11px;cursor:pointer;color:var(--accent)" onclick="openPayslipModal()">+ 記錄薪資</span>`}
        </span>
      </div>
      ${bonusThisMonth>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)"><span>預期獎金</span><span style="font-family:'DM Mono',monospace;color:var(--accent)">$${bonusThisMonth.toLocaleString()}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:8px 0 0">
        <span>合計</span><span style="font-family:'DM Mono',monospace;color:var(--accent3);font-size:16px">$${totalIncome.toLocaleString()}</span>
      </div>
    </div>

    <!-- expense block -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-bottom:10px;box-shadow:var(--shadow)">
      <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:10px">🔴 本月支出</div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span>採購支出</span><span style="font-family:'DM Mono',monospace;color:var(--accent2)">$${varSpend.toLocaleString()}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span>固定支出</span><span style="font-family:'DM Mono',monospace;color:var(--fixed)">$${fixedSpend.toLocaleString()}</span>
      </div>
      ${voucherSpend>0?`<div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)"><span>禮券支付（不計現金）</span><span style="font-family:'DM Mono',monospace;color:var(--text2)">-$${voucherSpend.toLocaleString()}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:8px 0 0">
        <span>現金支出合計</span><span style="font-family:'DM Mono',monospace;color:var(--danger);font-size:16px">$${cashSpend.toLocaleString()}</span>
      </div>
    </div>

    <!-- surplus block -->
    <div style="background:${surplus>=0?'linear-gradient(135deg,rgba(24,184,124,0.1),rgba(240,138,107,0.07))':'linear-gradient(135deg,rgba(232,48,48,0.08),rgba(232,124,32,0.06))'};border:2px solid ${surplus>=0?'rgba(24,184,124,0.3)':'rgba(232,48,48,0.3)'};border-radius:var(--r);padding:16px;margin-bottom:14px;text-align:center">
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px">${surplus>=0?'💰 本月結餘':'⚠️ 本月超支'}</div>
      <div style="font-family:'DM Mono',monospace;font-size:32px;font-weight:700;color:${surplus>=0?'var(--accent3)':'var(--danger)'}">
        ${surplus>=0?'':'-'}$${Math.abs(surplus).toLocaleString()}
      </div>
      ${hasSalary&&totalIncome>0?`<div style="font-size:11px;color:var(--text2);margin-top:6px">支出佔收入 ${Math.round((cashSpend/totalIncome)*100)}%</div>`:''}
    </div>

    ${surplus>0?`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;font-size:12px;color:var(--text2);line-height:1.7;box-shadow:var(--shadow)">
      💡 <strong>結餘建議：</strong><br>
      • 緊急備用金（3–6個月生活費）優先<br>
      • 再考慮定存、ETF 或其他投資
    </div>`:''}
  `;
}

// ── 🚇 EASYCARD TAB ──
function renderEasyCardTab(){
  const bal=(easyCard&&easyCard.balance)||0;
  const balEl=document.getElementById('ecBalance');
  if(balEl) balEl.textContent=`$${bal.toLocaleString()}`;
  const hist=document.getElementById('ecHistoryList');
  if(hist){
    const arr=[...(easyCard.history||[])].reverse();
    if(!arr.length){
      hist.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">尚無交易紀錄</div>';
    } else {
      hist.innerHTML=arr.slice(0,30).map(h=>{
        const isTopup=h.type==='topup'||h.delta>0;
        const sign=h.delta>=0?'+':'';
        const color=isTopup?'var(--accent3)':'var(--danger)';
        const icon=isTopup?'＋':'－';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600">${icon} ${h.note||(isTopup?'儲值':'消費')}</div>
            <div style="font-size:10px;color:var(--text3)">${h.date||''} · 餘額 $${(h.balance||0).toLocaleString()}</div>
          </div>
          <div style="font-family:'DM Mono',monospace;font-weight:700;color:${color}">${sign}$${Math.abs(h.delta||0).toLocaleString()}</div>
        </div>`;
      }).join('');
    }
  }
}
let _ecTopupPay='cash';
function selectEcTopupPay(el,mode){
  document.querySelectorAll('#easyCardTopupOverlay .cat-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  _ecTopupPay=mode;
  document.getElementById('ec-topup-card-row').style.display=mode==='card'?'block':'none';
  if(mode==='card'){
    const sel=document.getElementById('ec-topup-card');
    sel.innerHTML=creditCards.length
      ? creditCards.map(c=>`<option value="${c.id}">💳 ${c.name}${c.last4?' ····'+c.last4:''}</option>`).join('')
      : '<option value="">尚無信用卡</option>';
  }
}
function openEasyCardTopup(){
  // 先關掉其他可能開啟的覆蓋層
  document.querySelectorAll('.modal-overlay.open').forEach(o=>{ if(o.id!=='easyCardTopupOverlay') o.classList.remove('open'); });
  if(typeof closeFab==='function') closeFab();
  document.getElementById('ecCurBal').textContent=`$${((easyCard&&easyCard.balance)||0).toLocaleString()}`;
  document.getElementById('ec-topup-amt').value='';
  document.getElementById('ec-topup-note').value='';
  _ecTopupPay='cash';
  document.querySelectorAll('#easyCardTopupOverlay .cat-opt').forEach(o=>{
    o.classList.toggle('selected', o.dataset.val==='cash');
  });
  document.getElementById('ec-topup-card-row').style.display='none';
  document.getElementById('easyCardTopupOverlay').classList.add('open');
}
function saveEasyCardTopup(){
  const amt=parseInt(document.getElementById('ec-topup-amt').value)||0;
  if(amt<=0){showToast('請填儲值金額','error');return;}
  const note=document.getElementById('ec-topup-note').value.trim()||'悠遊卡儲值';
  const today=todayStr();
  // 1) 加到餘額
  if(!easyCard) easyCard={balance:0,history:[]};
  easyCard.balance=(easyCard.balance||0)+amt;
  if(!easyCard.history) easyCard.history=[];
  easyCard.history.push({date:today,delta:amt,balance:easyCard.balance,note,type:'topup'});
  // 2) 記為一筆生活花費（從現金或信用卡扣）
  const recId=Date.now();
  if(_ecTopupPay==='card'){
    const cid=parseInt(document.getElementById('ec-topup-card').value);
    const card=creditCards.find(x=>x.id===cid);
    if(!card){showToast('請先建立信用卡','error');return;}
    const billingMonth=calcBillingMonth(today,card);
    records.push({id:recId,name:'悠遊卡儲值',emoji:'🚇',brand:`💳${card.name}`,price:amt,cat:'other',date:today,type:'life',pay:'card',cardId:cid,billingMonth,memo:note});
  } else {
    records.push({id:recId,name:'悠遊卡儲值',emoji:'🚇',brand:'儲值',price:amt,cat:'other',date:today,type:'life',pay:'cash',memo:note});
  }
  save(); renderAll(); renderEasyCardTab();
  closeModal('easyCardTopupOverlay');
  showToast(`🚇 已儲值 $${amt.toLocaleString()}（餘 $${easyCard.balance.toLocaleString()}）`,'ok');
}
function openEasyCardAdjust(){
  document.getElementById('ecAdjCurBal').textContent=`$${((easyCard&&easyCard.balance)||0).toLocaleString()}`;
  document.getElementById('ec-adj-amt').value=(easyCard&&easyCard.balance)||'';
  document.getElementById('easyCardAdjustOverlay').classList.add('open');
}
function saveEasyCardAdjust(){
  const v=parseInt(document.getElementById('ec-adj-amt').value);
  if(isNaN(v)||v<0){showToast('請填正確金額','error');return;}
  if(!easyCard) easyCard={balance:0,history:[]};
  const old=easyCard.balance||0;
  const delta=v-old;
  easyCard.balance=v;
  if(!easyCard.history) easyCard.history=[];
  easyCard.history.push({date:todayStr(),delta,balance:v,note:'手動校正餘額',type:'adjust'});
  save(); renderEasyCardTab();
  closeModal('easyCardAdjustOverlay');
  showToast('✓ 餘額已校正','ok');
}

// ── VOUCHER TAB — 即享券錢包 ──
let voucherSelectedCat='daily';
let vucSelectedCat='daily';

function renderVouchers(){
  const totalFace=vouchers.reduce((s,v)=>s+v.faceValue,0);
  const totalUsed=vouchers.reduce((s,v)=>s+(v.usedAmt||0),0);
  const totalRem=totalFace-totalUsed;
  const active=vouchers.filter(v=>(v.faceValue-(v.usedAmt||0))>0);
  const used=vouchers.filter(v=>(v.faceValue-(v.usedAmt||0))<=0);

  const voucherListEl=document.getElementById('voucherList'); if(!voucherListEl) return;
  // 把總餘額卡片渲染到上方獨立容器
  const heroEl=document.getElementById('voucherHero');
  if(heroEl){
    heroEl.innerHTML=`
    <div style="background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:var(--r);padding:14px 16px;margin-bottom:14px;box-shadow:0 4px 16px rgba(240,138,107,0.25)">
      <div style="font-size:11px;color:rgba(255,255,255,0.75);margin-bottom:4px">即享券總餘額</div>
      <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:white">$${totalRem.toLocaleString()}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:4px">共 ${active.length} 張可用 · 已用 ${used.length} 張</div>
    </div>`;
  }
  voucherListEl.innerHTML=`
    ${!vouchers.length?emptyState({emoji:'🎫',title:'還沒有即享券',sub:'記錄紙本或數位券面額，每次使用自動鬆餘額',ctaLabel:'＋ 新增即享券',ctaOnClick:'openVoucherModal()'}):''}
    ${active.length?`<div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:8px">可用</div>`:''}
    ${active.map(v=>{
      const rem=v.faceValue-(v.usedAmt||0);
      const pct=Math.round(((v.usedAmt||0)/v.faceValue)*100);
      return `<div style="background:var(--surface);border:1.5px solid rgba(24,184,124,0.25);border-radius:var(--r);padding:12px 14px;margin-bottom:8px;box-shadow:var(--shadow)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="font-size:22px;width:40px;height:40px;background:var(--accent3-light);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${v.emoji||'🎫'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600">${v.name}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:1px">${v.note||''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:var(--accent3)">$${rem.toLocaleString()}</div>
            <div style="font-size:10px;color:var(--text2)">剩餘 / $${v.faceValue.toLocaleString()}</div>
          </div>
        </div>
        <div style="height:5px;background:var(--bg2);border-radius:3px;overflow:hidden;margin-bottom:8px">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent3),#4dd9a0);border-radius:3px"></div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm primary" style="font-size:11px" onclick="openUseVoucher(${v.id})">💸 使用</button>
          <button class="btn-sm" style="font-size:11px" onclick="showVoucherHistory(${v.id})">📋 明細</button>
          <button class="btn-sm del" style="flex:0;padding:7px 10px" onclick="deleteVoucher(${v.id})">✕</button>
        </div>
      </div>`;
    }).join('')}
    ${used.length?`<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:0.8px;margin:10px 0 8px">已用完</div>
    ${used.map(v=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;opacity:0.6">
      <div style="font-size:18px">${v.emoji||'🎫'}</div>
      <div style="flex:1;font-size:12px;color:var(--text2)">${v.name}${v.note?' · '+v.note:''}</div>
      <div style="font-family:'DM Mono',monospace;font-size:12px;color:var(--text3)">$${v.faceValue.toLocaleString()} 已用完</div>
      <button onclick="deleteVoucher(${v.id})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px">✕</button>
    </div>`).join('')}`:''}
  `;
}

function openVoucherModal(){
  document.getElementById('voucherModalOverlay').classList.add('open');
}
function addVoucher(){
  const name=document.getElementById('vc-name').value.trim();
  const faceValue=parseInt(document.getElementById('vc-value').value)||0;
  if(!name||!faceValue){showToast('請填寫名稱和面額','error');return;}
  vouchers.push({
    id:Date.now(), name,
    emoji:document.getElementById('vc-emoji').value.trim()||'🎫',
    faceValue, usedAmt:0,
    note:document.getElementById('vc-note').value.trim(),
    history:[]
  });
  save(); closeModal('voucherModalOverlay'); renderVouchers();
  ['vc-name','vc-emoji','vc-value','vc-note'].forEach(id=>document.getElementById(id).value='');
  showToast('即享券已新增！','ok');
}
function deleteVoucher(id){
  showConfirm('刪除此即享券？',()=>{ vouchers=vouchers.filter(v=>v.id!==id); save(); renderVouchers(); });
}
function openUseVoucher(id){
  const v=vouchers.find(x=>x.id===id); if(!v) return;
  const rem=v.faceValue-(v.usedAmt||0);
  if(rem<=0){showToast('此即享券已用完','error');return;}
  document.getElementById('vuc-id').value=id;
  document.getElementById('vucTitle').textContent=`🎫 使用 ${v.name}`;
  document.getElementById('vucBalance').textContent=`$${rem.toLocaleString()}`;
  document.getElementById('vuc-item').value='';
  document.getElementById('vuc-amount').value='';
  // reset cat
  document.querySelectorAll('#vucCatSelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  document.querySelector('#vucCatSelect [data-val="daily"]').classList.add('selected');
  vucSelectedCat='daily';
  document.getElementById('voucherUseOverlay').classList.add('open');
}
function selectVucCat(el){
  document.querySelectorAll('#vucCatSelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected'); vucSelectedCat=el.dataset.val;
}
function confirmUseVoucher(){
  const id=parseInt(document.getElementById('vuc-id').value);
  const v=vouchers.find(x=>x.id===id); if(!v) return;
  const item=document.getElementById('vuc-item').value.trim();
  const amount=parseInt(document.getElementById('vuc-amount').value)||0;
  if(!item){showToast('請填寫購買了什麼','error');return;}
  if(amount<=0){showToast('請填寫金額','error');return;}
  const rem=v.faceValue-(v.usedAmt||0);
  if(amount>rem){showToast(`超過剩餘金額 $${rem}`,'error');return;}
  v.usedAmt=(v.usedAmt||0)+amount;
  if(!v.history) v.history=[];
  v.history.push({date:todayStr(),item,amount,cat:vucSelectedCat});
  // record as life expense (voucher type — not counted as cash)
  records.push({id:Date.now(),name:item,emoji:'🎫',brand:`${v.name}折抵`,
    price:amount,cat:vucSelectedCat,date:todayStr(),type:'voucher'});
  save(); closeModal('voucherUseOverlay'); renderVouchers();
  showToast(`已記錄！${v.name}折抵 $${amount}，剩餘 $${(v.faceValue-v.usedAmt).toLocaleString()}`,'ok');
}
function showVoucherHistory(id){
  const v=vouchers.find(x=>x.id===id); if(!v) return;
  const hist=v.history||[];
  const lines=hist.length?hist.map(h=>`• ${h.date} ${h.item} $${h.amount}`).join('\n'):'尚無使用記錄';
  showToast(`${v.name} 使用明細\n${lines}`, 'info');
}
function openVoucherUseFromRecord(){
  const avail=vouchers.filter(v=>(v.faceValue-(v.usedAmt||0))>0);
  if(!avail.length){showToast('目前沒有可用的即享券','error');return;}
  openUseVoucher(avail[0].id);
}

// ── QUICK EXPENSE ──
let qeCat='food', qePay='cash', qeCur='TWD';
let lifeBudget=parseInt(localStorage.getItem('btLifeBudget')||'0');

// 💱 外幣匯率與 metadata（避免未定義錯誤導致 modal 無法開啟）
let fxRates=JSON.parse(localStorage.getItem('btFxRates')||'{}');
const FX_META={
  TWD:{symbol:'NT$',name:'新台幣'},
  USD:{symbol:'$',name:'美元'},
  JPY:{symbol:'¥',name:'日圓'},
  EUR:{symbol:'€',name:'歐元'},
  KRW:{symbol:'₩',name:'韓元'},
  CNY:{symbol:'¥',name:'人民幣'},
  HKD:{symbol:'HK$',name:'港幣'},
  GBP:{symbol:'£',name:'英鎊'},
  SGD:{symbol:'S$',name:'新幣'},
  THB:{symbol:'฿',name:'泰銖'}
};
function renderQeCurrencyChips(){
  const wrap=document.getElementById('qeCurrencySelect'); if(!wrap) return;
  const list=['TWD',...Object.keys(fxRates||{}).filter(c=>c!=='TWD')];
  wrap.innerHTML=list.map(c=>{
    const sym=(FX_META[c]&&FX_META[c].symbol)||c;
    return `<div class="cat-opt${c===qeCur?' selected':''}" data-val="${c}" onclick="selectQeCur(this)">${sym} ${c}</div>`;
  }).join('');
}

// 🏷 記帳類別（可自訂）
const DEFAULT_EXP_CATS=[
  {id:'food',emoji:'🍽',label:'餐飲'},
  {id:'social',emoji:'🥂',label:'社交'},
  {id:'clothing',emoji:'👗',label:'治裝'},
  {id:'transport',emoji:'🚗',label:'交通'},
  {id:'entertainment',emoji:'🎮',label:'娛樂'},
  {id:'travel',emoji:'✈️',label:'旅遊'},
  {id:'medical',emoji:'🏥',label:'醫藥保健'},
  {id:'other',emoji:'📦',label:'其他'}
];
let expCats=JSON.parse(localStorage.getItem('btExpCats')||'null')||DEFAULT_EXP_CATS;
function saveExpCats(){ localStorage.setItem('btExpCats',JSON.stringify(expCats)); }
function renderQeCatOptions(){
  const wrap=document.getElementById('qeCatSelect'); if(!wrap) return;
  wrap.innerHTML=expCats.map((c,i)=>`<div class="cat-opt${c.id===qeCat?' selected':''}" data-val="${c.id}" onclick="selectQeCat(this)">${c.emoji} ${c.label}</div>`).join('');
}
function renderHqCats(){
  const wrap=document.getElementById('hqCats'); if(!wrap) return;
  const active=wrap.querySelector('.hq-cat.active')?.dataset.val||'food';
  // 計算近 60 天各 cat 使用次數，作為排序依據
  const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-60);
  const cutoffStr=cutoff.toISOString().split('T')[0];
  const usage={};
  records.forEach(r=>{ if((r.type==='life'||r.type==='voucher'||r.type==='easycard') && r.date>=cutoffStr){ usage[r.cat]=(usage[r.cat]||0)+1; } });
  // 預設順序：餐飲、交通、娛樂、治裝
  const defaultOrder=['food','transport','entertainment','clothing'];
  const sorted=[...expCats].sort((a,b)=>{
    const ua=usage[a.id]||0, ub=usage[b.id]||0;
    if(ua!==ub) return ub-ua;
    const ia=defaultOrder.indexOf(a.id), ib=defaultOrder.indexOf(b.id);
    if(ia!==ib) return (ia<0?99:ia)-(ib<0?99:ib);
    return 0;
  });
  const top4=sorted.slice(0,4);
  // 確保 active 類別在頂部可見，若不在 top4 則加入
  if(active && !top4.find(c=>c.id===active)){
    const ac=expCats.find(c=>c.id===active);
    if(ac){ top4.pop(); top4.unshift(ac); }
  }
  wrap.innerHTML=top4.map(c=>`<div class="hq-cat${c.id===active?' active':''}" data-val="${c.id}" onclick="setHqCat(this)">${c.emoji} ${c.label}</div>`).join('');
}

let editingRecordId=null;
function openQuickExpense(){
  editingRecordId=null;
  document.getElementById('qeModalTitle').textContent='📝 詳細記帳';
  document.getElementById('qeSubmitBtn').textContent='記錄支出';
  document.getElementById('qe-name').value=document.getElementById('hqName')?.value||'';
  document.getElementById('qe-amount').value=document.getElementById('hqAmount')?.value||'';
  document.getElementById('qe-date').value=todayStr();
  document.getElementById('qe-tags').value='';
  document.getElementById('qe-memo').value='';
  const curHomeCat=document.querySelector('#hqCats .hq-cat.active')?.dataset.val||expCats[0]?.id||'food';
  qeCat=curHomeCat;
  renderQeCatOptions();
  document.querySelectorAll('#qePaySelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  document.querySelector('#qePaySelect [data-val="cash"]').classList.add('selected');
  document.getElementById('qeVoucherPicker').style.display='none';
  document.getElementById('qeFxHint').style.display='none';
  qePay='cash'; qeCur='TWD';
  renderQeCurrencyChips();
  document.getElementById('quickExpenseOverlay').classList.add('open');
}
function editRecord(id){
  const r=records.find(x=>String(x.id)===String(id));
  if(!r){ showToast('找不到此筆記錄','error'); return; }
  if(r.type==='voucher'){
    showToast('即享券記錄請先刪除再新增','error');
    return;
  }
  editingRecordId=r.id;
  document.getElementById('qeModalTitle').textContent='✏️ 編輯記帳';
  document.getElementById('qeSubmitBtn').textContent='✓ 儲存修改';
  document.getElementById('qe-name').value=r.name||'';
  // 若有外幣 fx，顯示原幣金額；否則顯示台幣金額
  document.getElementById('qe-amount').value=r.fx?r.fx.origAmount:r.price;
  document.getElementById('qe-date').value=r.date||todayStr();
  document.getElementById('qe-tags').value=(r.tags||[]).join(', ');
  document.getElementById('qe-memo').value=r.memo||'';
  qeCat=r.cat||expCats[0]?.id||'food';
  renderQeCatOptions();
  document.querySelectorAll('#qePaySelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  document.querySelector('#qePaySelect [data-val="cash"]').classList.add('selected');
  document.getElementById('qeVoucherPicker').style.display='none';
  qePay='cash';
  // 幣別
  qeCur=r.fx?r.fx.currency:'TWD';
  renderQeCurrencyChips();
  updateFxHint();
  document.getElementById('quickExpenseOverlay').classList.add('open');
}
function selectQeCat(el){
  document.querySelectorAll('#qeCatSelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected'); qeCat=el.dataset.val;
}
function selectQeCur(el){
  document.querySelectorAll('#qeCurrencySelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected'); qeCur=el.dataset.val;
  updateFxHint();
}
function updateFxHint(){
  const hint=document.getElementById('qeFxHint');
  if(qeCur==='TWD'){ hint.style.display='none'; return; }
  const amt=parseFloat(document.getElementById('qe-amount').value)||0;
  const rate=fxRates[qeCur]||0;
  const ntd=Math.round(amt*rate);
  hint.style.display='block';
  hint.textContent=`💱 1 ${qeCur} = ${rate} TWD　|　${FX_META[qeCur].symbol}${amt.toLocaleString()} ≈ NT$${ntd.toLocaleString()}`;
}
function selectQePay(el, mode){
  document.querySelectorAll('#qePaySelect .cat-opt').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected'); qePay=el.dataset.val;
  const vp=document.getElementById('qeVoucherPicker');
  const cp=document.getElementById('qeCardPicker');
  if(mode==='voucher'){
    const avail=vouchers.filter(v=>(v.faceValue-(v.usedAmt||0))>0);
    const sel=document.getElementById('qeVoucherSel');
    sel.innerHTML=avail.length
      ? avail.map(v=>`<option value="${v.id}">${v.emoji||'🎫'} ${v.name} (剩$${(v.faceValue-(v.usedAmt||0)).toLocaleString()})</option>`).join('')
      : '<option value="">沒有可用的即享券</option>';
    vp.style.display='block'; cp.style.display='none';
  } else if(mode==='card'){
    const sel=document.getElementById('qeCardSel');
    if(!creditCards.length){
      sel.innerHTML='<option value="">尚無信用卡，請先到 ⚙️ 設定新增</option>';
    } else {
      sel.innerHTML=creditCards.map(c=>`<option value="${c.id}">💳 ${c.name}${c.last4?' ····'+c.last4:''}</option>`).join('');
      sel.onchange=updateCardBillingHint;
    }
    cp.style.display='block'; vp.style.display='none';
    updateCardBillingHint();
  } else {
    vp.style.display='none'; cp.style.display='none';
  }
  // 悠遊卡餘額提示
  const ecHint=document.getElementById('qeEasyCardHint');
  if(ecHint){
    if(mode==='easycard'){
      const bal=(easyCard&&easyCard.balance)||0;
      ecHint.style.display='block';
      ecHint.textContent=`🚇 目前悠遊卡餘額 $${bal.toLocaleString()}`;
      ecHint.style.color=bal<=100?'var(--danger)':'var(--accent)';
    } else {
      ecHint.style.display='none';
    }
  }
}
function updateCardBillingHint(){
  const sel=document.getElementById('qeCardSel');
  const hint=document.getElementById('qeCardBillingHint');
  if(!sel||!hint) return;
  const cid=parseInt(sel.value);
  const c=creditCards.find(x=>x.id===cid);
  const dateVal=document.getElementById('qe-date').value||todayStr();
  if(!c){ hint.textContent=''; return; }
  const bm=calcBillingMonth(dateVal,c);
  const [by,bmo]=bm.split('-');
  hint.textContent=`📅 將計入 ${by} 年 ${parseInt(bmo)} 月支出（${bmo}/${c.dueDay} 繳款）`;
}
function saveQuickExpense(){
  const name=document.getElementById('qe-name').value.trim();
  const rawAmount=parseFloat(document.getElementById('qe-amount').value)||0;
  const dateVal=document.getElementById('qe-date').value||todayStr();
  const tags=document.getElementById('qe-tags').value.split(',').map(s=>s.trim()).filter(Boolean);
  const memo=document.getElementById('qe-memo').value.trim();
  if(!name){showToast('請填寫花費項目','error');return;}
  if(rawAmount<=0){showToast('請填寫金額','error');return;}
  // 💱 幣別換算
  const rate=qeCur==='TWD'?1:(fxRates[qeCur]||0);
  if(qeCur!=='TWD' && rate<=0){showToast('請先設定 '+qeCur+' 匯率','error');return;}
  const amount=Math.round(rawAmount*rate);
  const fx=qeCur==='TWD'?null:{currency:qeCur,origAmount:rawAmount,rate};

  // 🐱 貓咪守門員：預算快爆 / 大額時跳冷靜期 modal
  if(!editingRecordId && !window._catGuardBypass){
    if(catGuardCheck(amount,'life',()=>{ window._catGuardBypass=true; saveQuickExpense(); window._catGuardBypass=false; })) return;
  }

  // ✏️ 編輯模式：更新既有 record
  if(editingRecordId){
    const r=records.find(x=>x.id===editingRecordId);
    if(r){
      r.name=name; r.price=amount; r.cat=qeCat; r.date=dateVal;
      r.emoji=catEmoji(qeCat); r.brand='生活花費';
      if(tags.length) r.tags=tags; else delete r.tags;
      if(memo) r.memo=memo; else delete r.memo;
      if(fx) r.fx=fx; else delete r.fx;
    }
    editingRecordId=null;
    save(); closeModal('quickExpenseOverlay'); renderAll();
    showToast('✓ 記錄已更新','ok');
    return;
  }

  const extras={tags:tags.length?tags:undefined, memo:memo||undefined, fx:fx||undefined};
  const today=todayStr();
  if(qePay==='voucher'){
    const vid=parseInt(document.getElementById('qeVoucherSel').value);
    const v=vouchers.find(x=>x.id===vid);
    if(!v){showToast('請選擇即享券','error');return;}
    const rem=v.faceValue-(v.usedAmt||0);
    if(amount>rem){showToast(`超過即享券剩餘金額 $${rem}`,'error');return;}
    v.usedAmt=(v.usedAmt||0)+amount;
    if(!v.history) v.history=[];
    v.history.push({date:dateVal,item:name,amount,cat:qeCat});
    records.push({id:Date.now(),name,emoji:'🎫',brand:`${v.name}折抵`,price:amount,cat:qeCat,date:dateVal,type:'voucher',pay:'voucher',...extras});
  } else if(qePay==='easycard'){
    const bal=(easyCard&&easyCard.balance)||0;
    if(bal<amount){showToast(`🚇 悠遊卡餘額不足（剩 $${bal.toLocaleString()}），請先儲值`,'error');return;}
    easyCard.balance=bal-amount;
    if(!easyCard.history) easyCard.history=[];
    const recId=Date.now();
    easyCard.history.push({date:dateVal,delta:-amount,balance:easyCard.balance,note:name,type:'spend',recId});
    records.push({id:recId,name,emoji:catEmoji(qeCat),brand:'🚇 悠遊卡',price:amount,cat:qeCat,date:dateVal,type:'easycard',pay:'easycard',...extras});
  } else if(qePay==='card'){
    const cid=parseInt(document.getElementById('qeCardSel').value);
    const card=creditCards.find(x=>x.id===cid);
    if(!card){showToast('請先到 ⚙️ 設定新增信用卡','error');return;}
    const billingMonth=calcBillingMonth(dateVal,card);
    records.push({id:Date.now(),name,emoji:catEmoji(qeCat),brand:`💳${card.name}`,price:amount,cat:qeCat,date:dateVal,type:'life',pay:'card',cardId:cid,billingMonth,...extras});
  } else {
    records.push({id:Date.now(),name,emoji:catEmoji(qeCat),brand:'生活花費',price:amount,cat:qeCat,date:dateVal,type:'life',pay:'cash',...extras});
  }
  save(); closeModal('quickExpenseOverlay'); renderAll();
  // 清空 home quick
  const hn=document.getElementById('hqName'); if(hn) hn.value='';
  const ha=document.getElementById('hqAmount'); if(ha) ha.value='';
  showToast(`已記錄 ${name} $${amount.toLocaleString()}！`,'ok');
  // 超支警示
  if(typeof checkOverageWarning==='function') checkOverageWarning();
  // 大額消費提示（挪用存款 / 分期）
  const newRec=records[records.length-1];
  if(newRec) setTimeout(()=>askLargeExpense(newRec),350);
}
// 🚀 home 一鍵記帳
function setHqCat(el){
  document.querySelectorAll('#hqCats .hq-cat').forEach(o=>o.classList.remove('active'));
  el.classList.add('active');
}
let hqPay='cash';
function setHqPay(el,mode){
  document.querySelectorAll('#hqPayRow .hq-pay').forEach(o=>o.classList.remove('active'));
  el.classList.add('active');
  hqPay=mode;
  const ec=document.getElementById('hqEasyCardHint');
  if(mode==='card'){
    const sel=document.getElementById('hqCardSel');
    if(!creditCards.length){
      sel.innerHTML='<option value="">尚無信用卡，請先到 ⚙️ 設定新增</option>';
    } else {
      sel.innerHTML=creditCards.map(c=>`<option value="${c.id}">💳 ${c.name}${c.last4?' ····'+c.last4:''}</option>`).join('');
      sel.onchange=updateHqCardHint;
    }
    cp.style.display='block'; vp.style.display='none'; if(ec)ec.style.display='none';
    updateHqCardHint();
  } else if(mode==='voucher'){
    const avail=vouchers.filter(v=>(v.faceValue-(v.usedAmt||0))>0);
    const sel=document.getElementById('hqVoucherSel');
    sel.innerHTML=avail.length
      ? avail.map(v=>`<option value="${v.id}">${v.emoji||'🎫'} ${v.name} (剩$${(v.faceValue-(v.usedAmt||0)).toLocaleString()})</option>`).join('')
      : '<option value="">沒有可用的即享券</option>';
    vp.style.display='block'; cp.style.display='none'; if(ec)ec.style.display='none';
  } else if(mode==='easycard'){
    const bal=(easyCard&&easyCard.balance)||0;
    if(ec){
      ec.innerHTML=bal>0
        ?`🚇 悠遊卡餘額 <strong style="color:var(--accent)">$${bal.toLocaleString()}</strong>　<a href="javascript:void(0)" onclick="openEasyCardTopup()" style="color:var(--accent);font-size:11px">＋ 儲值</a>`
        :`🚇 悠遊卡尚無餘額，<a href="javascript:void(0)" onclick="openEasyCardTopup()" style="color:var(--accent);font-weight:700">點此先儲值</a>`;
      ec.style.display='block';
    }
    cp.style.display='none'; vp.style.display='none';
  } else {
    cp.style.display='none'; vp.style.display='none'; if(ec)ec.style.display='none';
  }
}
function updateHqCardHint(){
  const sel=document.getElementById('hqCardSel');
  const hint=document.getElementById('hqCardHint');
  if(!sel||!hint) return;
  const cid=parseInt(sel.value);
  const c=creditCards.find(x=>x.id===cid);
  if(!c){ hint.textContent=''; return; }
  const bm=calcBillingMonth(todayStr(),c);
  const [by,bmo]=bm.split('-');
  hint.textContent=`📅 將計入 ${by} 年 ${parseInt(bmo)} 月支出（${bmo}/${c.dueDay} 繳款）`;
}
function saveHomeQuick(){
  const name=document.getElementById('hqName').value.trim();
  const amount=parseInt(document.getElementById('hqAmount').value)||0;
  if(!name){showToast('請填花了什麼','error');return;}
  if(amount<=0){showToast('請填金額','error');return;}
  // 🐱 貓咪守門員
  if(!window._catGuardBypass){
    if(catGuardCheck(amount,'life',()=>{ window._catGuardBypass=true; saveHomeQuick(); window._catGuardBypass=false; })) return;
  }
  const cat=document.querySelector('#hqCats .hq-cat.active')?.dataset.val||'food';
  const today=todayStr();
  if(hqPay==='card'){
    const cid=parseInt(document.getElementById('hqCardSel').value);
    const card=creditCards.find(x=>x.id===cid);
    if(!card){showToast('請先到 ⚙️ 設定新增信用卡','error');return;}
    const billingMonth=calcBillingMonth(today,card);
    records.push({id:Date.now(),name,emoji:catEmoji(cat),brand:`💳${card.name}`,price:amount,cat,date:today,type:'life',pay:'card',cardId:cid,billingMonth});
  } else if(hqPay==='easycard'){
    const bal=(easyCard&&easyCard.balance)||0;
    if(bal<amount){showToast(`🚇 悠遊卡餘額不足（剩 $${bal.toLocaleString()}），請先儲值`,'error');return;}
    easyCard.balance=bal-amount;
    if(!easyCard.history) easyCard.history=[];
    const recId=Date.now();
    easyCard.history.push({date:today,delta:-amount,balance:easyCard.balance,note:name,type:'spend',recId});
    records.push({id:recId,name,emoji:catEmoji(cat),brand:'🚇 悠遊卡',price:amount,cat,date:today,type:'easycard',pay:'easycard'});
  } else if(hqPay==='voucher'){
    const vid=parseInt(document.getElementById('hqVoucherSel').value);
    const v=vouchers.find(x=>x.id===vid);
    if(!v){showToast('請選擇即享券','error');return;}
    const rem=v.faceValue-(v.usedAmt||0);
    if(amount>rem){showToast(`超過即享券剩餘金額 $${rem}`,'error');return;}
    v.usedAmt=(v.usedAmt||0)+amount;
    if(!v.history) v.history=[];
    v.history.push({date:today,item:name,amount,cat});
    records.push({id:Date.now(),name,emoji:'🎫',brand:`${v.name}折抵`,price:amount,cat,date:today,type:'voucher',pay:'voucher'});
  } else {
    records.push({id:Date.now(),name,emoji:catEmoji(cat),brand:'生活花費',price:amount,cat,date:today,type:'life',pay:'cash'});
  }
  save(); renderAll();
  document.getElementById('hqName').value='';
  document.getElementById('hqAmount').value='';
  showToast(`✓ ${name} $${amount.toLocaleString()}`,'ok');
  if(typeof checkOverageWarning==='function') checkOverageWarning();
  // 大額消費提示
  const newRec=records[records.length-1];
  if(newRec) setTimeout(()=>askLargeExpense(newRec),350);
}

// � 喵造型 + 喵叫聲
const CAT_SKIN_LABELS={orange:'橘貓',tuxedo:'賓士',calico:'三花',black:'純黑',grey:'灰虎'};
let catSkin=localStorage.getItem('btCatSkin')||'orange';
function setCatSkin(s){
  catSkin=s;
  localStorage.setItem('btCatSkin',s);
  if(typeof renderCatMood==='function'){
    try{ renderCatMood({netRate:(window._lastNetRate??0.5)});}catch(e){}
  }
  if(typeof applyPrivacyMode==='function') applyPrivacyMode();
  document.querySelectorAll('.cat-skin-opt').forEach(b=>b.classList.toggle('active',b.dataset.skin===s));
  if(typeof showToast==='function') showToast('🐾 換造型：'+(CAT_SKIN_LABELS[s]||s),'ok');
  playMeow();
}
let _audioCtx=null;
function playMeow(){
  try{
    if(!_audioCtx) _audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const ctx=_audioCtx;
    if(ctx.state==='suspended') ctx.resume();
    const t0=ctx.currentTime;
    [[0,0.18,520,820],[0.16,0.32,640,380]].forEach(([s,e,f1,f2])=>{
      const osc=ctx.createOscillator(); osc.type='sawtooth';
      const gain=ctx.createGain();
      const filt=ctx.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=2200;
      osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(f1,t0+s);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40,f2),t0+e);
      gain.gain.setValueAtTime(0.0001,t0+s);
      gain.gain.exponentialRampToValueAtTime(0.18,t0+s+0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001,t0+e);
      osc.start(t0+s); osc.stop(t0+e+0.02);
    });
  }catch(e){}
}

// �🛡 防偷窺模式
let privacyMode=localStorage.getItem('btPrivacy')==='1';
function applyPrivacyMode(){
  document.body.classList.toggle('privacy-on',privacyMode);
  const btn=document.getElementById('privacyToggle');
  if(btn){
    btn.classList.toggle('on',privacyMode);
    btn.innerHTML=meowCatSvg(privacyMode?'peek':'look',24);
    btn.title=privacyMode?'已開啟防偷窺，點擊顯示金額':'防偷窺：模糊金額';
  }
}
// 🐱 貓咪守門員 — 大額消費冷靜期
const CG_SASS=[
  '本喵覺得你該再想想喔～',
  '罐罐基金又少了…😿',
  '錢錢飛走的聲音太刺耳了',
  '吃土不會比較浪漫喔',
  '冷靜深呼吸，再決定一次',
  '這個月的本喵已經要哭了',
];
function catGuardCheck(amount,scope,onConfirm){
  if(typeof lifeBudget==='undefined' || lifeBudget<=0) return false;
  const ym=(typeof getCurrentYM==='function')?getCurrentYM():new Date().toISOString().slice(0,7);
  const spent=records.filter(r=>{
    const m=(typeof getEffectiveMonth==='function')?getEffectiveMonth(r):(r.date||'').slice(0,7);
    return m===ym && (r.type==='life'||r.type==='voucher'||r.type==='easycard') && !r._travelBudget;
  }).reduce((s,r)=>s+(r.price||0),0);
  const after=spent+amount;
  const willOverflow=after>=lifeBudget*0.9;
  const isHuge=amount>=Math.max(1500,lifeBudget*0.3);
  if(!willOverflow && !isHuge) return false;
  const remain=lifeBudget-after;
  const overlay=document.getElementById('catGuardOverlay');
  if(!overlay) return false;
  document.getElementById('cgAmt').textContent='$'+amount.toLocaleString();
  document.getElementById('cgScope').textContent=scope==='life'?'生活預算':'預算';
  const remainEl=document.getElementById('cgRemain');
  if(remain>=0){ remainEl.textContent='$'+remain.toLocaleString(); remainEl.style.color=''; }
  else { remainEl.textContent='超支 $'+Math.abs(remain).toLocaleString(); remainEl.style.color='#D4533C'; }
  document.getElementById('cgSass').textContent=CG_SASS[Math.floor(Math.random()*CG_SASS.length)];
  const catEl=document.getElementById('cgCat');
  catEl.textContent=remain<0?'😾':'🙀';
  catEl.classList.remove('calm');
  overlay.classList.add('show');
  if(navigator.vibrate) navigator.vibrate([80,40,80]);
  window._cgOnConfirm=onConfirm;
  cgBindHold();
  return true;
}
function closeCatGuard(){
  const overlay=document.getElementById('catGuardOverlay');
  if(overlay) overlay.classList.remove('show');
  cgResetHold();
  window._cgOnConfirm=null;
}
let _cgTimer=null,_cgProg=0;
const _CG_HOLD_MS=2000,_CG_INT=24;
function cgBindHold(){
  const box=document.getElementById('cgHoldBox');
  if(!box || box._bound) return;
  box._bound=true;
  const start=(e)=>{
    e.preventDefault();
    box.classList.add('holding');
    document.getElementById('cgHoldTxt').textContent='正在硬掏錢包…';
    const cat=document.getElementById('cgCat');
    cat.textContent='😿'; cat.classList.add('calm');
    if(navigator.vibrate) navigator.vibrate(40);
    _cgTimer=setInterval(()=>{
      _cgProg+=(_CG_INT/_CG_HOLD_MS)*100;
      document.getElementById('cgHoldFill').style.width=Math.min(100,_cgProg)+'%';
      if(_cgProg>=100) cgComplete();
    },_CG_INT);
  };
  const end=()=>{ if(_cgProg<100) cgResetHold(); };
  box.addEventListener('mousedown',start);
  box.addEventListener('mouseup',end);
  box.addEventListener('mouseleave',end);
  box.addEventListener('touchstart',start,{passive:false});
  box.addEventListener('touchend',end);
  box.addEventListener('touchcancel',end);
}
function cgResetHold(){
  clearInterval(_cgTimer);_cgTimer=null;_cgProg=0;
  const fill=document.getElementById('cgHoldFill'); if(fill) fill.style.width='0%';
  const box=document.getElementById('cgHoldBox'); if(box) box.classList.remove('holding');
  const txt=document.getElementById('cgHoldTxt'); if(txt) txt.textContent='長按 2 秒堅持記帳';
  const cat=document.getElementById('cgCat');
  if(cat){ cat.textContent='🙀'; cat.classList.remove('calm'); }
}
function cgComplete(){
  clearInterval(_cgTimer);_cgTimer=null;
  document.getElementById('cgHoldTxt').textContent='記下去了 💸';
  document.getElementById('cgCat').textContent='👻';
  if(navigator.vibrate) navigator.vibrate(180);
  const cb=window._cgOnConfirm;
  setTimeout(()=>{ closeCatGuard(); if(typeof cb==='function') cb(); },420);
}

function togglePrivacy(){
  privacyMode=!privacyMode;
  localStorage.setItem('btPrivacy',privacyMode?'1':'0');
  applyPrivacyMode();
}
// 💱 FX 匯率管理
let fxRatesUpdatedAt=parseInt(localStorage.getItem('btFxRatesUpdatedAt')||'0')||0;
function fxSymbol(c){ return (FX_META[c]&&FX_META[c].symbol)||c; }
async function fetchFxRates(){
  const codes=Object.keys(fxRates||{});
  if(!codes.length){ showToast('尚無已加入的幣別','error'); return; }
  showToast('🔄 正在從網路抓取匯率…','ok');
  try{
    // ECB 開源端點（無需金鑰）
    const res=await fetch('https://open.er-api.com/v6/latest/TWD');
    if(!res.ok) throw new Error('HTTP '+res.status);
    const j=await res.json();
    if(j.result!=='success'||!j.rates) throw new Error('API 格式異常');
    let updated=0;
    codes.forEach(c=>{
      // open.er-api 回傳「1 TWD = X 該幣」 → 我們要「1 該幣 = ? TWD」
      const r=j.rates[c];
      if(r && r>0){ fxRates[c]=Math.round((1/r)*10000)/10000; updated++; }
    });
    fxRatesUpdatedAt=Date.now();
    localStorage.setItem('btFxRates',JSON.stringify(fxRates));
    localStorage.setItem('btFxRatesUpdatedAt',String(fxRatesUpdatedAt));
    showToast(`✓ 已更新 ${updated} 個幣別匯率`,'ok');
    openFxRatesModal();
    if(typeof renderQeCurrencyChips==='function') renderQeCurrencyChips();
  }catch(err){
    showToast('❌ 自動更新失敗：'+err.message,'error');
  }
}
function openFxRatesModal(){
  const list=document.getElementById('fxRatesList');
  const curs=Object.keys(fxRates||{});
  list.innerHTML=curs.map(c=>`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700">${c}</div>
        <div style="font-size:10px;color:var(--text3)">${fxSymbol(c)} → NT$</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:var(--text2)">1 ${c} =</span>
        <input class="form-input" id="fx-${c}" type="number" step="0.0001" value="${fxRates[c]||0}" style="width:90px;padding:6px 8px;font-family:'DM Mono',monospace;text-align:right"/>
        <span style="font-size:11px;color:var(--text2)">TWD</span>
        <button class="btn-sm" style="padding:5px 8px;font-size:11px;color:var(--danger);border-color:rgba(232,48,48,0.25)" onclick="removeFxCurrency('${c}')" title="刪除">×</button>
      </div>
    </div>`).join('');
  const upEl=document.getElementById('fxRatesUpdatedAt');
  if(upEl){
    upEl.textContent=fxRatesUpdatedAt
      ? `📡 上次自動更新：${new Date(fxRatesUpdatedAt).toLocaleString('zh-TW',{hour12:false})}`
      : '📡 尚未自動更新，顯示的是預設值';
  }
  document.getElementById('fxRatesOverlay').classList.add('open');
}
function saveFxRates(){
  Object.keys(fxRates||{}).forEach(c=>{
    const el=document.getElementById(`fx-${c}`); if(!el) return;
    const v=parseFloat(el.value)||0;
    if(v>0) fxRates[c]=v;
  });
  localStorage.setItem('btFxRates',JSON.stringify(fxRates));
  closeModal('fxRatesOverlay');
  if(typeof renderQeCurrencyChips==='function') renderQeCurrencyChips();
  updateFxHint();
  showToast('匯率已儲存','ok');
}
function addCustomFxCurrency(){
  const codeEl=document.getElementById('newFxCode');
  const rateEl=document.getElementById('newFxRate');
  const code=(codeEl?.value||'').trim().toUpperCase();
  const rate=parseFloat(rateEl?.value)||0;
  if(!/^[A-Z]{3,6}$/.test(code)){ showToast('幣别代碼需 3–6 個英文字母','error'); return; }
  if(code==='TWD'){ showToast('TWD 為本位幣，無需加入','error'); return; }
  if(rate<=0){ showToast('請輸入匯率（1 '+code+' = ? TWD）','error'); return; }
  fxRates[code]=rate;
  localStorage.setItem('btFxRates',JSON.stringify(fxRates));
  if(codeEl) codeEl.value='';
  if(rateEl) rateEl.value='';
  openFxRatesModal();
  if(typeof renderQeCurrencyChips==='function') renderQeCurrencyChips();
  showToast('✓ 已新增 '+code,'ok');
}
function removeFxCurrency(code){
  if(!fxRates[code]) return;
  // 檢查是否有記錄在使用
  const inUse=records.some(r=>r.fx&&r.fx.currency===code);
  const msg=inUse?`已有記錄使用 ${code}，刪除後舊記錄仍以原台幣金額保留。確定？`:`刪除 ${code}？`;
  if(!confirm(msg)) return;
  delete fxRates[code];
  localStorage.setItem('btFxRates',JSON.stringify(fxRates));
  openFxRatesModal();
  if(typeof renderQeCurrencyChips==='function') renderQeCurrencyChips();
  showToast('✓ 已刪除 '+code,'ok');
}
function catEmoji(cat){
  const c=expCats.find(x=>x.id===cat); if(c) return c.emoji;
  const m={food:'🍽',social:'🥂',clothing:'👗',transport:'🚗',entertainment:'🎮',
    travel:'✈️',health:'💊',medical:'🏥',skin:'🧴',other:'📦',daily:'🛒',voucher:'🎫'};
  return m[cat]||'📦';
}
function catLabel(cat){
  const c=expCats.find(x=>x.id===cat); if(c) return c.label;
  const m={food:'餐飲',social:'社交',clothing:'治裝',transport:'交通',entertainment:'娛樂',
    travel:'旅遊',health:'保健',medical:'醫藥保健',skin:'保養',other:'其他',daily:'日用品',voucher:'即享券'};
  return m[cat]||cat;
}
// 🏷 記帳類別管理
function openCatManagerModal(mode='expense'){
  window._catMgrMode=mode;
  // 切換標題與說明
  const titleEl=document.querySelector('#catManagerOverlay .modal-title');
  const descEl =document.querySelector('#catManagerOverlay .cat-mgr-desc');
  if(titleEl) titleEl.textContent=mode==='restock'?'🏷 管理補貨類別':'🏷 管理記帳類別';
  if(descEl)  descEl.textContent =mode==='restock'?'新增、編輯或刪除補貨商品的類別。已使用過的類別無法刪除。':'新增、編輯或刪除記帳類別。已使用過的類別無法刪除。';
  renderCatManagerList();
  document.getElementById('catManagerOverlay').classList.add('open');
}
function renderCatManagerList(){
  const el=document.getElementById('catManagerList'); if(!el) return;
  const mode=window._catMgrMode||'expense';
  if(mode==='restock'){
    const usedIds=new Set(products.map(p=>p.cat));
    el.innerHTML=categories.map((c,i)=>{
      const used=usedIds.has(c.id);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm)">
        <input value="${c.emoji}" maxlength="2" oninput="categories[${i}].emoji=this.value;saveCats()" style="width:42px;text-align:center;font-size:18px;border:1px solid var(--border2);border-radius:6px;padding:5px;background:var(--surface);color:var(--text)"/>
        <input value="${c.label}" oninput="categories[${i}].label=this.value;saveCats()" style="flex:1;border:1px solid var(--border2);border-radius:6px;padding:6px 8px;font-size:13px;background:var(--surface);color:var(--text)"/>
        ${used?`<span style="font-size:10px;color:var(--text3)">使用中</span>`:`<button onclick="deleteRestockCat('${c.id}')" style="background:none;border:none;color:var(--danger);font-size:16px;cursor:pointer;padding:0 4px">🗑</button>`}
      </div>`;
    }).join('');
    return;
  }
  const usedIds=new Set(records.filter(r=>r.type==='life'||r.type==='voucher'||r.type==='easycard').map(r=>r.cat));
  el.innerHTML=expCats.map((c,i)=>{
    const used=usedIds.has(c.id);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm)">
      <input value="${c.emoji}" maxlength="2" oninput="expCats[${i}].emoji=this.value" style="width:42px;text-align:center;font-size:18px;border:1px solid var(--border2);border-radius:6px;padding:5px;background:var(--surface);color:var(--text)"/>
      <input value="${c.label}" oninput="expCats[${i}].label=this.value" style="flex:1;border:1px solid var(--border2);border-radius:6px;padding:6px 8px;font-size:13px;background:var(--surface);color:var(--text)"/>
      ${used?`<span style="font-size:10px;color:var(--text3)">使用中</span>`:`<button onclick="deleteCustomCat('${c.id}')" style="background:none;border:none;color:var(--danger);font-size:16px;cursor:pointer;padding:0 4px">🗑</button>`}
    </div>`;
  }).join('');
}
function addCustomCat(){
  const mode=window._catMgrMode||'expense';
  const emoji=document.getElementById('newCatEmoji').value.trim()||'📦';
  const label=document.getElementById('newCatLabel').value.trim();
  if(!label){ showToast('請輸入類別名稱','error'); return; }
  if(mode==='restock'){
    if(categories.some(c=>c.label===label)){ showToast('類別名稱已存在','error'); return; }
    const id='custom_'+Date.now();
    const palette=['#F08A6B','#E5A234','#3FA985','#5C8DC4','#9B6BCB','#E55A4D'];
    const color=palette[categories.length%palette.length];
    categories.push({id,label,emoji,color});
    saveCats();
    document.getElementById('newCatEmoji').value='';
    document.getElementById('newCatLabel').value='';
    renderCatManagerList(); renderCatTabs(); renderProducts();
    showToast('已新增補貨類別：'+emoji+' '+label,'ok');
    return;
  }
  if(expCats.some(c=>c.label===label)){ showToast('類別名稱已存在','error'); return; }
  const id='custom_'+Date.now();
  expCats.push({id,emoji,label});
  saveExpCats();
  document.getElementById('newCatEmoji').value='';
  document.getElementById('newCatLabel').value='';
  renderCatManagerList(); renderHqCats();
  showToast('已新增類別：'+emoji+' '+label,'ok');
}
function deleteCustomCat(id){
  if(expCats.length<=1){ showToast('至少需保留一個類別','error'); return; }
  expCats=expCats.filter(c=>c.id!==id);
  saveExpCats();
  renderCatManagerList(); renderHqCats();
}
function deleteRestockCat(id){
  if(categories.length<=1){ showToast('至少需保留一個類別','error'); return; }
  categories=categories.filter(c=>c.id!==id);
  saveCats();
  renderCatManagerList(); renderCatTabs(); renderProducts();
}
function saveLifeBudget(){
  const v=parseInt(document.getElementById('lifeBudgetInput').value)||0;
  lifeBudget=v; localStorage.setItem('btLifeBudget',v.toString()); renderAll();
  showToast('生活費預算已儲存','ok');
}
let fixedBudget=parseInt(localStorage.getItem('btFixedBudget')||'0');
function saveFixedBudget(){
  const v=parseInt(document.getElementById('fixedBudgetInput').value)||0;
  fixedBudget=v; localStorage.setItem('btFixedBudget',v.toString());
  renderAll(); showToast('固定支出預算已儲存','ok');
}

// ── RECORD + PRICE COMBINED ──
function openRecordAndPrice(pid){
  const p=products.find(x=>x.id===pid); if(!p) return;
  document.getElementById('rp-pid').value=pid;
  document.getElementById('rpTitle').textContent=`📝 ${p.name}`;
  document.getElementById('rp-price').value=p.price||'';
  document.getElementById('rpPriceHint').textContent=`上次記錄：$${p.price.toLocaleString()}`;
  const hist=getPriceHistory(pid);
  const histSec=document.getElementById('rpHistorySection');
  if(hist.length){
    histSec.style.display='block';
    const maxP=Math.max(...hist.map(h=>h.price));
    // 取最後 5 筆並反向；計算各項在原 priceHistory[pid] 中的索引以利刪除
    const recent=hist.slice(-5);
    const startIdx=hist.length-recent.length;
    const reversed=recent.map((h,i)=>({h,origIdx:startIdx+i})).reverse();
    document.getElementById('rpHistoryList').innerHTML=reversed.map((item,i,arr)=>{
      const h=item.h;
      const prev=arr[i+1]?arr[i+1].h:null;
      const delta=prev?h.price-prev.price:null;
      const deltaHtml=delta!==null?(delta>0?`<span style="color:var(--danger);font-size:10px;font-weight:700">▲${delta}</span>`:(delta<0?`<span style="color:var(--accent3);font-size:10px;font-weight:700">▼${Math.abs(delta)}</span>`:'<span style="color:var(--text3);font-size:10px">—</span>')):'' ;
      const barW=Math.round((h.price/maxP)*100);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;color:var(--text3);min-width:40px;font-family:'DM Mono',monospace">${fmtDate(h.date)}</span>
        <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${barW}%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px"></div></div>
        <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;min-width:52px;text-align:right">$${h.price.toLocaleString()}</span>
        ${deltaHtml}
        <button onclick="deletePriceHistory(${pid},${item.origIdx})" title="刪除這筆價格紀錄" style="border:none;background:transparent;color:var(--text3);cursor:pointer;font-size:14px;padding:2px 4px;line-height:1">×</button>
      </div>`;
    }).join('');
  } else { histSec.style.display='none'; }
  document.getElementById('recordPriceOverlay').classList.add('open');
}
function saveRecordAndPrice(){
  const pid=parseInt(document.getElementById('rp-pid').value);
  const price=parseInt(document.getElementById('rp-price').value)||0;
  const p=products.find(x=>x.id===pid); if(!p) return;
  const today=todayStr();
  const dup=records.find(r=>r.productId===pid && r.date===today);
  const doSave=()=>{
    records.push({id:Date.now(),productId:p.id,name:p.name,emoji:p.emoji,brand:p.brand,
      price:price||p.price,cat:p.cat,date:today,type:'var'});
    if(price>0){
      if(!priceHistory[pid]) priceHistory[pid]=[];
      priceHistory[pid].push({date:today,price});
      p.price=price;
    }
    p.boughtDate=today;
    save(); closeModal('recordPriceOverlay'); renderAll();
    showToast(`✓ 補貨完成，已重置使用天數${price>0?`，價格更新為 $${price}`:''}`,'ok');
  };
  if(dup){
    showConfirm(`今天已記錄過「${p.name}」一次。<br><span style="font-size:11px;color:var(--text2)">確認要再記一筆嗎？</span>`,doSave);
  } else { doSave(); }
}
function saveRecordOnly(){
  const pid=parseInt(document.getElementById('rp-pid').value);
  const p=products.find(x=>x.id===pid); if(!p) return;
  const today=todayStr();
  const dup=records.find(r=>r.productId===pid && r.date===today);
  const doSave=()=>{
    records.push({id:Date.now(),productId:p.id,name:p.name,emoji:p.emoji,brand:p.brand,
      price:p.price,cat:p.cat,date:today,type:'var'});
    save(); closeModal('recordPriceOverlay'); renderAll();
    showToast('已記錄花費（未重置使用天數）','ok');
  };
  if(dup){
    showConfirm(`今天已記錄過「${p.name}」一次。<br><span style="font-size:11px;color:var(--text2)">確認要再記一筆嗎？</span>`,doSave);
  } else { doSave(); }
}
function deletePriceHistory(pid,idx){
  const list=priceHistory[pid]; if(!list||!list[idx]) return;
  const removed=list.splice(idx,1)[0];
  save();
  // 重新渲染歷史 mini chart
  const p=products.find(x=>x.id===pid);
  if(p) openRecordAndPrice(pid);
  showUndoToast(`已刪除價格紀錄 $${removed.price}`,()=>{
    if(!priceHistory[pid]) priceHistory[pid]=[];
    priceHistory[pid].splice(idx,0,removed);
    save();
    if(p) openRecordAndPrice(pid);
    showToast('✓ 已復原','ok');
  });
}

// ── YEARLY SAVINGS ──
function renderYearlySavings(){
  const el=document.getElementById('yearlySavingsContent');
  if(!el) return;
  const now=getNow(); const yr=now.getFullYear();
  const months=[];
  let cumulative=0;
  for(let m=1;m<=12;m++){
    const ym=`${yr}-${String(m).padStart(2,'0')}`;
    const sal=salaryRecords.find(s=>salaryMatchesYM(s,yr,m));
    const bonus=bonusExpected.filter(b=>b.month===m).reduce((s,b)=>s+b.amount,0);
    const income=(sal?sal.netPay:0)+bonus;
    const varSpend=records.filter(r=>getEffectiveMonth(r)===ym&&r.type!=='fixed'&&r.type!=='voucher').reduce((s,r)=>s+r.price,0);
    const fixedRecs=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='fixed');
    const fixedSpend=fixedRecs.length>0
      ? fixedRecs.reduce((s,r)=>s+r.price,0)
      : getMonthlyFixed();
    const cashOut=varSpend+fixedSpend;
    const surplus=income>0?income-cashOut:null;
    if(surplus!==null) cumulative+=surplus;
    const isCur=m===now.getMonth()+1, isFuture=m>now.getMonth()+1;
    months.push({m,income,cashOut,surplus,cumulative,isCur,isFuture,hasData:income>0||varSpend>0});
  }
  const recorded=months.filter(x=>x.hasData);
  const totalSaved=months.filter(x=>x.surplus!==null).reduce((s,x)=>s+x.surplus,0);
  const avgMonthly=recorded.length?Math.round(totalSaved/recorded.length):0;

  el.innerHTML=`
    <div style="background:linear-gradient(135deg,rgba(24,184,124,0.1),rgba(240,138,107,0.07));border:1.5px solid rgba(24,184,124,0.25);border-radius:var(--r);padding:14px;margin-bottom:12px;text-align:center">
      <div style="font-size:11px;color:var(--text2);margin-bottom:4px">${yr}年 累計結餘</div>
      <div style="font-family:'DM Mono',monospace;font-size:30px;font-weight:700;color:${totalSaved>=0?'var(--accent3)':'var(--danger)'}">
        ${totalSaved>=0?'+':''}$${totalSaved.toLocaleString()}
      </div>
      ${recorded.length>0?`<div style="font-size:11px;color:var(--text2);margin-top:4px">已記錄 ${recorded.length} 個月 · 月均結餘 $${avgMonthly.toLocaleString()}</div>`:''}
    </div>
    <div class="chart-card">
      <div class="chart-title">每月結餘 <span style="color:var(--text2);font-size:11px">綠=結餘 紅=超支</span></div>
      <div style="display:flex;align-items:flex-end;gap:3px;height:70px;margin-bottom:6px">
        ${months.map(mo=>{
          if(!mo.hasData&&!mo.isCur) return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="flex:1"></div><div style="font-size:9px;color:var(--text3)">${mo.m}月</div></div>`;
          const s=mo.surplus||0;
          const maxAbs=Math.max(...months.filter(x=>x.surplus!==null).map(x=>Math.abs(x.surplus||0)),1);
          const h=Math.round((Math.abs(s)/maxAbs)*60);
          const col=s>=0?'var(--accent3)':'var(--danger)';
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
            ${s>=0?`<div style="width:100%;height:${h}px;background:${col};border-radius:3px 3px 0 0;min-height:3px"></div><div style="flex:1"></div>`:
              `<div style="flex:1"></div><div style="width:100%;height:${h}px;background:${col};border-radius:0 0 3px 3px;min-height:3px"></div>`}
            <div style="font-size:9px;color:${mo.isCur?'var(--accent)':'var(--text3)'};font-weight:${mo.isCur?'700':'400'}">${mo.m}月</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    ${recorded.length===0?`<div style="text-align:center;padding:16px;color:var(--text3);font-size:12px">記錄每月薪資後，這裡會自動計算全年結餘</div>`:''}
  `;
}

// ── UPDATED renderRecords (life expenses support) ──
function renderRecords(){
  const ym=`${recordMonth.y}-${String(recordMonth.m+1).padStart(2,'0')}`;
  const filter=document.getElementById('recordFilterCat')?.value||'all';

  const varRecs=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='var');
  const lifeRecs=records.filter(r=>getEffectiveMonth(r)===ym&&(r.type==='life'||r.type==='voucher'||r.type==='easycard'));
  const varTotal=varRecs.filter(r=>!r._travelBudget).reduce((s,r)=>s+r.price,0);
  const lifeTotal=lifeRecs.filter(r=>r.type==='life'&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
  const fixedTotal=getMonthlyFixed();
  const grandTotal=varTotal+lifeTotal+fixedTotal;

  document.getElementById('recordMonthLabel').textContent=`${recordMonth.y}年${recordMonth.m+1}月`;
  document.getElementById('recordTotal').textContent=`$${grandTotal.toLocaleString()}`;
  document.getElementById('recordVarTotal').textContent=`$${varTotal.toLocaleString()}`;
  document.getElementById('recordFixTotal').textContent=`$${fixedTotal.toLocaleString()}`;
  document.getElementById('recordLifeTotal').textContent=`$${lifeTotal.toLocaleString()}`;

  // sub label: vs 上月
  const subEl=document.getElementById('recordTotalSub');
  if(subEl){
    const prevDate=new Date(recordMonth.y, recordMonth.m-1, 1);
    const prevYm=`${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
    const prevVar=records.filter(r=>getEffectiveMonth(r)===prevYm&&r.type==='var'&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
    const prevLife=records.filter(r=>getEffectiveMonth(r)===prevYm&&r.type==='life'&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
    const prevTotal=prevVar+prevLife+fixedTotal;
    if(prevTotal>0){
      const diff=grandTotal-prevTotal;
      const pct=Math.round(diff/prevTotal*100);
      const arrow=diff>0?'↑':(diff<0?'↓':'=');
      subEl.textContent=`vs 上月 ${arrow} ${Math.abs(pct)}%`;
    } else {
      subEl.textContent='';
    }
  }

  // life budget warning
  const warnEl=document.getElementById('lifeBudgetWarn');
  if(warnEl&&lifeBudget>0){
    const pct=lifeTotal/lifeBudget;
    if(pct>=0.8){
      warnEl.style.display='block';
      warnEl.innerHTML=`<div class="${pct>=1?'budget-alert danger-a':'budget-alert warn-a'}" style="margin-bottom:10px">
        <div class="ba-icon">${pct>=1?'🚨':'⚠️'}</div>
        <div class="ba-text">生活費預算已用 ${Math.round(pct*100)}%${pct>=1?'，已超支 $'+(lifeTotal-lifeBudget):'，剩餘 $'+(lifeBudget-lifeTotal)}</div>
      </div>`;
    } else { warnEl.style.display='none'; }
  }

  // cat breakdown — now includes life cats
  const catMap={};
  categories.forEach(c=>{catMap[c.id]={...c,total:0};});
  const lifeCats=['food','social','clothing','transport','entertainment','travel'];
  lifeCats.forEach(c=>{if(!catMap[c])catMap[c]={id:c,label:catLabel(c),emoji:catEmoji(c),color:'#e8488a',total:0};});
  catMap['__fixed']={label:'固定支出',emoji:'💳',color:'var(--fixed)',total:fixedTotal};
  [...varRecs,...lifeRecs].forEach(r=>{if(catMap[r.cat])catMap[r.cat].total+=r.price;});
  const catBdEl=document.getElementById('catBreakdown'); if(!catBdEl) return;
  catBdEl.innerHTML=Object.values(catMap).filter(c=>c.total>0).map(c=>
    `<div class="cat-item"><div class="cat-dot" style="background:${c.color}"></div><div class="cat-info"><div class="ci-name">${c.emoji}${c.label}</div><div class="ci-amt">$${c.total.toLocaleString()}</div></div></div>`
  ).join('');

  // record list with filter
  const fixedItems=fixedExpenses.map(f=>{
    const card=f.pay==='card'&&f.cardId?creditCards.find(c=>c.id===f.cardId):null;
    const isInstallment=!!f._linkedDebtId;
    return {
      id:'fx'+f.id, name:f.name, emoji:f.emoji,
      brand:card?`💳${card.name}`:'固定支出',
      price:f.cycle==='yearly'?Math.round(f.amount/12):(f.cycle==='weekly'?Math.round(f.amount*52/12):f.amount),
      date:`${recordMonth.y}-${String(recordMonth.m+1).padStart(2,'0')}-${String(f.day).padStart(2,'0')}`,
      type:isInstallment?'installment':'fixed', cat:'fixed', pay:f.pay||'cash', cardId:f.cardId,
      _isInstallment:isInstallment
    };
  });

  let allRecs=[...varRecs,...lifeRecs,...fixedItems].sort((a,b)=>b.date.localeCompare(a.date));
  if(filter==='all'){
    // 全部都顯示
  } else if(filter==='var'){
    allRecs=allRecs.filter(r=>r.type==='var');
  } else if(filter==='life'){
    allRecs=allRecs.filter(r=>(r.type==='life'||r.type==='voucher'||r.type==='easycard')&&!r._travelBudget);
  } else if(filter==='fixed'){
    allRecs=allRecs.filter(r=>r.type==='fixed');
  } else if(filter==='installment'){
    allRecs=allRecs.filter(r=>r.type==='installment');
  } else if(filter==='travel'){
    allRecs=allRecs.filter(r=>r._travelBudget);
  }

  const typeTag={var:'',life:`<span class="record-tag" style="background:#fde9f2;color:#e8488a">生活</span>`,voucher:`<span class="record-tag" style="background:var(--accent-light);color:var(--accent)">即享券</span>`,easycard:`<span class="record-tag" style="background:#dbeafe;color:#0891b2">🚇 悠遊卡</span>`,fixed:`<span class="record-tag fix">固定</span>`,installment:`<span class="record-tag" style="background:#ede9fe;color:#7c3aed">分期</span>`};
  const recListEl=document.getElementById('recordList'); if(!recListEl) return;

  // 批次選取模式：清掉已不存在的選取 id
  if(recordSelectMode){
    const validIds=new Set(allRecs.filter(r=>r.type==='var'||r.type==='life').map(r=>r.id));
    recordSelectedIds.forEach(id=>{ if(!validIds.has(id)) recordSelectedIds.delete(id); });
    const bar=document.getElementById('recordBatchBar');
    if(bar){ bar.style.display='flex'; document.getElementById('recordSelCount').textContent=recordSelectedIds.size; }
  } else {
    const bar=document.getElementById('recordBatchBar');
    if(bar) bar.style.display='none';
  }

  recListEl.innerHTML=!allRecs.length
    ?emptyState({cat:'sleeping',title:'本月還沒有敗家紀錄',sub:'主子睡得很香，要不要記一筆喚醒牠？'})
    :allRecs.map(r=>{
      const fxBadge=r.fx?`<span class="fx-badge">${r.fx.origAmount} ${r.fx.currency}</span>`:'';
      const chipsHtml=(r.tags&&r.tags.length)?`<div style="margin-top:2px">${r.tags.map(t=>`<span class="record-chip">🏷 ${t}</span>`).join('')}</div>`:'';
      const memoHtml=r.memo?`<div class="record-memo">📝 ${r.memo}</div>`:'';
      const payInfo=(r.type==='var'||r.type==='life'||r.type==='easycard'||r.type==='voucher')?(function(){
        if(r.pay==='cash') return '💵 現金';
        if(r.pay==='easycard') return '🚇 悠遊卡';
        if(r.pay==='voucher') return '🎫 即享券';
        if(r.pay==='card'){
          const c=creditCards.find(x=>x.id===r.cardId);
          return c?`💳 ${c.name}${c.last4?' ('+c.last4+')':''}`:'💳 信用卡';
        }
        return '';
      })():'';
      const payHtml=payInfo?`<div style="font-size:10px;color:var(--text3);margin-top:2px">${payInfo}</div>`:'';

      const selectable=(r.type==='var'||r.type==='life');
      const checked=recordSelectedIds.has(r.id);
      const checkboxHtml=(recordSelectMode&&selectable)
        ?`<div onclick="event.stopPropagation();toggleRecordSelect('${r.id}')" style="flex:0 0 22px;width:22px;height:22px;border-radius:6px;border:2px solid ${checked?'var(--accent)':'var(--border2)'};background:${checked?'var(--accent)':'transparent'};color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-weight:800;margin-right:8px">${checked?'✓':''}</div>`
        :'';
      const rowClick=(recordSelectMode&&selectable)?` onclick="toggleRecordSelect('${r.id}')" style="cursor:pointer"`:'';
      const actionBtns=recordSelectMode?'':`${r.type==='life'?`<button onclick="editRecord('${r.id}')" style="flex:0;background:none;border:none;color:var(--text3);font-size:14px;cursor:pointer;padding:0 4px;line-height:1" title="編輯">✏️</button>`:''}${(r.type!=='fixed'&&r.type!=='installment')?`<button onclick="deleteRecord('${r.id}')" style="flex:0;background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:0 4px;line-height:1" title="刪除">✕</button>`:''}`;

      return `<div class="record-item" id="rec-${r.id}"${rowClick}>
        ${checkboxHtml}<div class="ri-emoji">${r.emoji}</div>
        <div class="ri-info">
          <div class="ri-name">${r.name}${typeTag[r.type]||''}${r._travelBudget?'<span class="record-tag" style="background:#dbeafe;color:#2563eb">✈️ 旅遊預算</span>':''}${fxBadge}</div>
          <div class="ri-date">${r.brand} · ${fmtDate(r.date)}</div>
          ${payHtml}${chipsHtml}${memoHtml}
        </div>
        <div class="ri-amt ${r.type==='fixed'||r.type==='installment'?'fix':'var'}">$${r.price.toLocaleString()}</div>
        ${actionBtns}
      </div>`;
    }).join('');
}

// 批次選取模式
let recordSelectMode=false;

function setRecordFilter(val, btn){
  const sel=document.getElementById('recordFilterCat');
  if(sel) sel.value=val;
  document.querySelectorAll('#recordFilterChips .chip').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  recordsCatFilter=null;
  recordsVisible=RECORDS_PAGE_SIZE;
  renderRecords();
}
let recordSelectedIds=new Set();
function toggleRecordSelectMode(){
  recordSelectMode=!recordSelectMode;
  recordSelectedIds.clear();
  const btn=document.getElementById('recordSelectBtn');
  if(btn){ btn.textContent=recordSelectMode?'✕ 結束選取':'✏️ 選取'; btn.classList.toggle('primary',recordSelectMode); }
  renderRecords();
}
function toggleRecordSelect(id){
  const sid=String(id);
  // records 的 id 可能是 number 或 string，統一比較字串
  let hit=null;
  for(const k of recordSelectedIds){ if(String(k)===sid){ hit=k; break; } }
  if(hit!==null) recordSelectedIds.delete(hit);
  else {
    const r=records.find(x=>String(x.id)===sid);
    if(r) recordSelectedIds.add(r.id);
  }
  renderRecords();
}
function selectAllRecordsVisible(){
  const ym=`${recordMonth.y}-${String(recordMonth.m+1).padStart(2,'0')}`;
  const filter=document.getElementById('recordFilterCat')?.value||'all';
  let list=records.filter(r=>getEffectiveMonth(r)===ym&&(r.type==='var'||r.type==='life'||r.type==='voucher'||r.type==='easycard'));
  if(filter==='var') list=list.filter(r=>r.type==='var');
  else if(filter==='life') list=list.filter(r=>r.type==='life'||r.type==='voucher'||r.type==='easycard');
  else if(filter==='fixed') list=[]; // 固定支出不可批次選
  // 全選 / 全不選 切換
  const allSelected=list.length>0&&list.every(r=>recordSelectedIds.has(r.id));
  if(allSelected) list.forEach(r=>recordSelectedIds.delete(r.id));
  else list.forEach(r=>recordSelectedIds.add(r.id));
  renderRecords();
}
function openBatchPayModal(){
  if(!recordSelectedIds.size){ showToast('請先勾選要修改的記錄','warn'); return; }
  document.getElementById('batchPayCount').textContent=recordSelectedIds.size;
  const opts=document.getElementById('batchPayOptions');
  const btnStyle='padding:12px 14px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--r-md);font-size:13px;color:var(--text);cursor:pointer;text-align:left;font-family:inherit;display:flex;align-items:center;gap:10px';
  let html=`<button style="${btnStyle}" onclick="applyBatchPay('cash',null)">
    <span style="font-size:20px">💵</span><span style="font-weight:700">現金</span>
  </button>`;
  creditCards.forEach(c=>{
    html+=`<button style="${btnStyle}" onclick="applyBatchPay('card',${c.id})">
      <span style="font-size:20px">💳</span>
      <div style="flex:1"><div style="font-weight:700">${c.name}</div>${c.last4?`<div style="font-size:11px;color:var(--text3)">**** ${c.last4}</div>`:''}</div>
    </button>`;
  });
  if(!creditCards.length){
    html+=`<div style="font-size:11px;color:var(--text3);padding:8px;text-align:center">還沒新增信用卡，可至「⚙️ 設定 → 💳 帳戶」新增</div>`;
  }
  opts.innerHTML=html;
  document.getElementById('batchPayOverlay').classList.add('open');
}
function applyBatchPay(pay,cardId){
  if(!recordSelectedIds.size){ closeModal('batchPayOverlay'); return; }
  const card=cardId?creditCards.find(c=>c.id===cardId):null;
  let changed=0;
  records.forEach(r=>{
    if(!recordSelectedIds.has(r.id)) return;
    if(r.type!=='var'&&r.type!=='life'&&r.type!=='voucher') return;
    r.pay=pay;
    if(pay==='card'&&card){
      r.cardId=card.id;
      r.billingMonth=typeof calcBillingMonth==='function'?calcBillingMonth(r.date,card):'';
    } else {
      delete r.cardId;
      delete r.billingMonth;
    }
    changed++;
  });
  save();
  closeModal('batchPayOverlay');
  const label=pay==='cash'?'現金':(card?card.name:'信用卡');
  showToast(`✓ 已將 ${changed} 筆改為 ${label}`,'ok');
  // 結束選取模式
  recordSelectMode=false; recordSelectedIds.clear();
  const btn=document.getElementById('recordSelectBtn');
  if(btn){ btn.textContent='✏️ 選取'; btn.classList.remove('primary'); }
  if(typeof renderAll==='function') renderAll();
  else renderRecords();
}

let msRows={income:[{label:'底薪',amount:0}],deduction:[{label:'健保費',amount:0},{label:'勞保費',amount:0},{label:'所得稅',amount:0}]};

function openManualSalaryModal(){
  const now=getNow();
  document.getElementById('ms-year').value=now.getFullYear();
  document.getElementById('ms-month').value=now.getMonth()+1;
  const pdEl=document.getElementById('ms-payday'); if(pdEl) pdEl.value=25;
  msRows={income:[{label:'底薪',amount:0}],deduction:[{label:'健保費',amount:0},{label:'勞保費',amount:0},{label:'所得稅',amount:0}]};
  renderManualRows();
  document.getElementById('manualSalaryOverlay').classList.add('open');
}
function renderManualRows(){
  ['income','deduction'].forEach(type=>{
    document.getElementById(`ms-${type}-rows`).innerHTML=msRows[type].map((r,i)=>`
      <div style="display:flex;gap:7px;margin-bottom:7px">
        <input style="flex:1;padding:8px 10px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--r-sm);font-size:12px;color:var(--text);outline:none;font-family:'Noto Sans TC',sans-serif"
          value="${r.label}" oninput="msRows['${type}'][${i}].label=this.value"/>
        <input type="number" style="width:100px;padding:8px 10px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--r-sm);font-size:12px;font-family:'DM Mono',monospace;color:${type==='income'?'var(--accent3)':'var(--danger)'};outline:none;text-align:right"
          value="${r.amount||''}" placeholder="0" oninput="msRows['${type}'][${i}].amount=parseInt(this.value)||0;recalcMs()"/>
        ${msRows[type].length>1?`<button onclick="removeMsRow('${type}',${i})" style="color:var(--text3);background:none;border:none;cursor:pointer;font-size:18px;padding:0 4px">✕</button>`:''}
      </div>`).join('');
  });
  recalcMs();
}
function addManualRow(type){
  msRows[type].push({label:'',amount:0});
  renderManualRows();
}
function removeMsRow(type,idx){
  msRows[type].splice(idx,1);
  renderManualRows();
}
function recalcMs(){
  const ti=msRows.income.reduce((s,r)=>s+r.amount,0);
  const td=msRows.deduction.reduce((s,r)=>s+r.amount,0);
  const el=document.getElementById('ms-net');
  if(el) el.textContent=`$${(ti-td).toLocaleString()}`;
}
function saveManualSalary(){
  const year=parseInt(document.getElementById('ms-year').value)||getNow().getFullYear();
  const month=parseInt(document.getElementById('ms-month').value)||getNow().getMonth()+1;
  const payDay=Math.min(31,Math.max(1,parseInt(document.getElementById('ms-payday').value)||25));
  const ti=msRows.income.reduce((s,r)=>s+r.amount,0);
  const td=msRows.deduction.reduce((s,r)=>s+r.amount,0);
  const net=ti-td;
  if(net<=0){showToast('實領薪資不能為 0','error');return;}
  const allFields=[...msRows.income.map(r=>({...r,type:'income'})),...msRows.deduction.map(r=>({...r,type:'deduction'}))];
  salaryRecords=salaryRecords.filter(s=>!(s.year===year&&s.month===month));
  salaryRecords.push({id:Date.now(),year,month,payDay,fields:allFields,netPay:net,date:getNow().toISOString().split('T')[0],source:'manual'});
  recomputeMonthlyIncome();
  save();closeModal('manualSalaryOverlay');
  showToast(`${year}年${month}月薪資已儲存！實領 $${net.toLocaleString()}`,'ok');
  renderIncomeSalary();
  if(typeof renderAll==='function') renderAll();
}

// payslip scan
function openPayslipModal(){resetPayslip();document.getElementById('payslipModalOverlay').classList.add('open');}
function resetPayslip(){
  psFields=[];
  document.getElementById('psStep1').style.display='block';
  ['psStep2','psStep3','psStep4'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('psFileInput').value='';
}
function handlePayslipFile(e){
  const file=e.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async(ev)=>{
    const b64url=ev.target.result;
    document.getElementById('psStep1').style.display='none';
    document.getElementById('psStep2').style.display='block';
    document.getElementById('psPreviewImg').src=b64url;
    try{
      const result=await analyzePayslip(b64url);
      psFields=result.fields;
      document.getElementById('psStep2').style.display='none';
      document.getElementById('psStep3').style.display='block';
      const _psNow=getNow();document.getElementById('ps-year').value=_psNow.getFullYear();
      document.getElementById('ps-month').value=_psNow.getMonth()+1;
      renderPsFields();
    }catch(err){
      document.getElementById('psStep2').style.display='none';
      document.getElementById('psStep1').style.display='block';
      showToast('辨識失敗：'+err.message,'error');
    }
  };
  reader.readAsDataURL(file);
}
async function analyzePayslip(b64url){
  const prompt=`你是薪資單辨識 AI。分析這張薪資單，提取所有金額項目。
以 JSON 格式回傳：{"fields":[{"label":"底薪","amount":40000,"type":"income"},{"label":"健保費","amount":800,"type":"deduction"}]}
type 只能是 "income"（收入/加項）或 "deduction"（扣項）。只回傳 JSON，不加說明。看不清楚回傳 {"fields":[]}.`;
  const text=await aiAnalyzeImage(b64url,prompt,1000);
  const clean=text.replace(/```json|```/g,'').trim();
  let parsed;
  try{parsed=JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0]||clean);}catch{throw new Error('AI回傳格式錯誤，請重試');}
  if(!parsed.fields?.length) throw new Error('未辨識到薪資項目，請確認截圖清晰');
  return parsed;
}

// ── 🧾 收據辨識記帳 ──
let rcItems=[];
let rcMeta={shop:'',date:'',total:0};
function openReceiptScanModal(){
  if(!getActiveAiProvider()){
    showToast('請先到「⚙️ → 🤖 AI」設定 Claude 或 Gemini 金鑰','error');
    return;
  }
  resetReceiptScan();
  document.getElementById('receiptScanOverlay').classList.add('open');
}
function resetReceiptScan(){
  ['rcStep1','rcStep2','rcStep3'].forEach((id,i)=>
    document.getElementById(id).style.display=i===0?'block':'none');
  document.getElementById('rcFileInput').value='';
}
function handleReceiptFile(e){
  const file=e.target.files[0]; if(!file) return;
  document.getElementById('rcFileInput').value='';
  document.getElementById('rcStep1').style.display='none';
  document.getElementById('rcStep2').style.display='block';
  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const result=await analyzeReceiptImage(ev.target.result);
      rcItems=result.items.map((it,i)=>({...it,_id:i,_checked:true}));
      const total=result.total||rcItems.reduce((s,it)=>s+it.amount,0);
      rcMeta={shop:result.shop||'收據', date:result.date||todayStr(), total};
      document.getElementById('rcStep2').style.display='none';
      document.getElementById('rcStep3').style.display='block';
      document.getElementById('rcShopInfo').innerHTML=`
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="flex:1;min-width:0">
            <input id="rcShopName" value="${rcMeta.shop}" oninput="rcMeta.shop=this.value"
              style="width:100%;padding:5px 8px;background:transparent;border:1px solid var(--border);border-radius:var(--r-sm);font-size:14px;font-weight:700;color:var(--text);outline:none;font-family:inherit"/>
            <input id="rcShopDate" type="date" value="${rcMeta.date}" oninput="rcMeta.date=this.value"
              style="width:100%;margin-top:4px;padding:4px 8px;background:transparent;border:1px solid var(--border);border-radius:var(--r-sm);font-size:12px;color:var(--text2);outline:none;font-family:inherit"/>
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:var(--accent2);flex-shrink:0">
            NT$${total.toLocaleString()}
          </div>
        </div>`;
      renderRcItems();
    }catch(err){
      document.getElementById('rcStep2').style.display='none';
      document.getElementById('rcStep1').style.display='block';
      showToast('辨識失敗：'+err.message,'error');
    }
  };
  reader.readAsDataURL(file);
}
function renderRcItems(){
  document.getElementById('rcItemList').innerHTML=rcItems.map((it,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" ${it._checked?'checked':''} onchange="rcItems[${i}]._checked=this.checked"
        style="width:16px;height:16px;accent-color:var(--accent);flex-shrink:0"/>
      <input style="flex:1;padding:7px 9px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--r-sm);font-size:13px;color:var(--text);outline:none;font-family:inherit"
        value="${it.name}" oninput="rcItems[${i}].name=this.value"/>
      <input type="number" style="width:80px;padding:7px 8px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--r-sm);font-size:13px;font-family:'DM Mono',monospace;color:var(--accent2);outline:none;text-align:right"
        value="${it.amount}" oninput="rcItems[${i}].amount=parseInt(this.value)||0"/>
    </div>`).join('');
}
async function analyzeReceiptImage(b64url){
  const today=todayStr();
  const catList=expCats.map(c=>`"${c.id}"`).join('/');
  const prompt=`你是收據辨識 AI。分析這張收據/發票照片（超商、餐廳、手寫收據均可）。
以 JSON 格式回傳（只回 JSON，不加說明）：
{"shop":"全家便利商店","date":"${today}","total":120,"items":[{"name":"御飯糰鮭魚","amount":35,"cat":"food"},{"name":"礦泉水","amount":20,"cat":"food"}]}
欄位說明：
- shop: 商店/餐廳名稱（找不到填空字串）
- date: 交易日期 YYYY-MM-DD（找不到用 ${today}）
- total: 總金額（找不到填0）
- items: 明細，每項 name（品項）、amount（金額數字）、cat（分類）
- cat 只能是以下之一：${catList}
- 餐食/吃喝→food；交通/乘車/加油→transport；衣服/鞋裝→clothing；社交/聚餐→social；娛樂/電影→entertainment；藥品/診所→medical；其他→other
- 看不清楚或非收據回：{"shop":"","date":"${today}","total":0,"items":[]}`;
  const text=await aiAnalyzeImage(b64url,prompt,1000);
  const clean=text.replace(/```json|```/g,'').trim();
  let parsed;
  try{parsed=JSON.parse(clean.match(/\{[\s\S]*\}/)?.[0]||clean);}catch{
    console.warn('AI 原始回傳:', text);
    throw new Error(`AI回傳格式錯誤：${text.slice(0,80)}…`);
  }
  if(!parsed.items?.length) throw new Error('未辨識到明細，請確認圖片清晰或嘗試手動輸入');
  return parsed;
}
function confirmReceiptItems(){
  const checked=rcItems.filter(it=>it._checked&&it.name&&it.amount>0);
  if(!checked.length){showToast('請至少勾選一筆明細','error');return;}
  const shopName=(rcMeta.shop||'收據').trim();
  const dateStr=rcMeta.date||todayStr();
  checked.forEach(it=>{
    records.push({
      id:Date.now()+Math.floor(Math.random()*1000),
      name:it.name, emoji:catEmoji(it.cat)||'🧾',
      brand:shopName, price:it.amount,
      cat:it.cat||'other', date:dateStr,
      type:'life', pay:'cash'
    });
  });
  save(); renderAll();
  closeModal('receiptScanOverlay');
  showToast(`✓ 已加入 ${checked.length} 筆記帳`,'ok');
}

function renderPsFields(){
  const inc=psFields.filter(f=>f.type==='income');
  const ded=psFields.filter(f=>f.type==='deduction');
  const mkRow=(f,globalIdx)=>`<div style="display:flex;align-items:center;gap:7px;margin-bottom:7px">
    <input style="flex:1;padding:8px 10px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--r-sm);font-size:12px;color:var(--text);outline:none;font-family:'Noto Sans TC',sans-serif"
      value="${f.label}" oninput="psFields[${globalIdx}].label=this.value"/>
    <input type="number" style="width:95px;padding:8px 8px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--r-sm);font-size:12px;font-family:'DM Mono',monospace;color:${f.type==='income'?'var(--accent3)':'var(--danger)'};outline:none;text-align:right"
      value="${f.amount}" oninput="psFields[${globalIdx}].amount=parseInt(this.value)||0;recalcPsNet()"/>
  </div>`;
  const incHtml=`<div style="font-size:11px;font-weight:700;color:var(--accent3);letter-spacing:0.8px;margin-bottom:8px">💚 收入項目</div>
    ${inc.map((f)=>mkRow(f,psFields.indexOf(f))).join('')}
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;padding:6px 0;border-top:1px solid var(--border);margin-bottom:14px;color:var(--accent3)"><span>小計</span><span id="psIncSubtotal">$${inc.reduce((s,f)=>s+f.amount,0).toLocaleString()}</span></div>`;
  const dedHtml=`<div style="font-size:11px;font-weight:700;color:var(--danger);letter-spacing:0.8px;margin-bottom:8px">🔴 扣除項目</div>
    ${ded.map((f)=>mkRow(f,psFields.indexOf(f))).join('')}
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;padding:6px 0;border-top:1px solid var(--border);margin-bottom:4px;color:var(--danger)"><span>小計</span><span id="psDedSubtotal">$${ded.reduce((s,f)=>s+f.amount,0).toLocaleString()}</span></div>`;
  document.getElementById('psFieldList').innerHTML=incHtml+dedHtml;
  recalcPsNet();
}
function recalcPsNet(){
  const ti=psFields.filter(f=>f.type==='income').reduce((s,f)=>s+f.amount,0);
  const td=psFields.filter(f=>f.type==='deduction').reduce((s,f)=>s+f.amount,0);
  const netEl=document.getElementById('psNetPay');
  if(netEl) netEl.textContent=`$${(ti-td).toLocaleString()}`;
  const incSub=document.getElementById('psIncSubtotal');
  const dedSub=document.getElementById('psDedSubtotal');
  if(incSub) incSub.textContent=`$${ti.toLocaleString()}`;
  if(dedSub) dedSub.textContent=`$${td.toLocaleString()}`;
}
// ── 本地日期字串 helper（避免 toISOString UTC 跨日問題）──
function todayStr(){
  const n=getNow();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function confirmPayslip(){
  const now=getNow();
  const year=parseInt(document.getElementById('ps-year').value)||now.getFullYear();
  const month=parseInt(document.getElementById('ps-month').value)||now.getMonth()+1;
  const ti=psFields.filter(f=>f.type==='income').reduce((s,f)=>s+f.amount,0);
  const td=psFields.filter(f=>f.type==='deduction').reduce((s,f)=>s+f.amount,0);
  const net=ti-td;
  salaryRecords=salaryRecords.filter(s=>!(s.year===year&&s.month===month));
  salaryRecords.push({id:Date.now(),year,month,payDay:25,fields:[...psFields],netPay:net,date:todayStr(),source:'payslip'});
  recomputeMonthlyIncome();
  localStorage.setItem('btSalary',JSON.stringify(salaryRecords));
  save();
  document.getElementById('psStep3').style.display='none';
  document.getElementById('psStep4').style.display='block';
  document.getElementById('psDoneText').textContent=`${year}年${month}月薪資已儲存！實領 $${net.toLocaleString()}`;
  renderAll();
}
function deleteSalary(id){
  showConfirm('刪除此薪資記錄？',()=>{
    salaryRecords=salaryRecords.filter(s=>s.id!==id);
    localStorage.setItem('btSalary',JSON.stringify(salaryRecords));
    renderIncome();
  });
}

// ── SALARY DETAIL MODAL ──
let _salaryDetailId=null;
function openSalaryDetail(id){
  const s=salaryRecords.find(x=>x.id===id);
  if(!s) return;
  _salaryDetailId=id;
  document.getElementById('sdTitle').textContent=`💵 ${s.year}年${s.month}月 薪資明細`;
  const tag=s.source==='manual'?'✏️ 手動輸入':'📄 AI 辨識';
  document.getElementById('sdSourceTag').innerHTML=`${tag} · 記錄日期 ${s.date||'—'}`;
  document.getElementById('sdNetPay').textContent=`$${s.netPay.toLocaleString()}`;
  const fields=s.fields||[];
  const incomeFields=fields.filter(f=>f.type==='income');
  const deductFields=fields.filter(f=>f.type==='deduction');
  const incomeSum=incomeFields.reduce((a,b)=>a+(b.amount||0),0);
  const deductSum=deductFields.reduce((a,b)=>a+(b.amount||0),0);
  document.getElementById('sdIncomeTotal').textContent=`$${incomeSum.toLocaleString()}`;
  document.getElementById('sdDeductTotal').textContent=`$${deductSum.toLocaleString()}`;

  const list=document.getElementById('sdFieldList');
  if(!fields.length){
    list.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">無明細項目</div>`;
  } else {
    const renderRow=f=>{
      const isIn=f.type==='income';
      const sign=isIn?'+':'−';
      const color=isIn?'var(--accent3)':'var(--danger)';
      return `<div style="display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px">
        <span style="color:var(--text)">${f.label||'(未命名)'}</span>
        <span style="font-family:'DM Mono',monospace;font-weight:600;color:${color}">${sign}$${(f.amount||0).toLocaleString()}</span>
      </div>`;
    };
    let html='';
    if(incomeFields.length){
      html+=`<div style="font-size:10px;color:var(--text3);padding:6px 10px;background:var(--bg2);border-radius:6px 6px 0 0;font-weight:600">📈 加項</div>`;
      html+=incomeFields.map(renderRow).join('');
    }
    if(deductFields.length){
      html+=`<div style="font-size:10px;color:var(--text3);padding:6px 10px;background:var(--bg2);margin-top:10px;border-radius:6px 6px 0 0;font-weight:600">📉 扣項</div>`;
      html+=deductFields.map(renderRow).join('');
    }
    list.innerHTML=html;
  }
  document.getElementById('salaryDetailOverlay').classList.add('open');
}
function deleteSalaryFromDetail(){
  if(_salaryDetailId==null) return;
  const id=_salaryDetailId;
  closeModal('salaryDetailOverlay');
  setTimeout(()=>deleteSalary(id),200);
}
function openBonusModal(){
  _editingBonusId=null;
  _bonusMode='budget';
  document.getElementById('bonusModalTitle').textContent='🎁 新增獎金預期';
  document.getElementById('bonusSubmitBtn').textContent='新增獎金預期';
  ['bn-name','bn-amount','bn-emoji','bn-note'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
  document.getElementById('bn-month').value=getNow().getMonth()+1;
  document.getElementById('bn-payday').value=25;
  setBonusMode('budget');
  document.getElementById('bonusModalOverlay').classList.add('open');
}
function editBonus(id){
  const b=bonusExpected.find(x=>x.id===id); if(!b) return;
  _editingBonusId=id;
  document.getElementById('bonusModalTitle').textContent='✏️ 編輯獎金預期';
  document.getElementById('bonusSubmitBtn').textContent='✓ 儲存修改';
  document.getElementById('bn-name').value=b.name||'';
  document.getElementById('bn-month').value=b.month||1;
  document.getElementById('bn-amount').value=b.amount||0;
  document.getElementById('bn-emoji').value=b.emoji||'🎁';
  document.getElementById('bn-note').value=b.note||'';
  document.getElementById('bn-payday').value=b.payDay||25;
  // 取得 mode：相容舊資料
  let mode=b.mode;
  if(!mode) mode=(b.includeInBudget===false?'savings':'budget');
  setBonusMode(mode);
  document.getElementById('bonusModalOverlay').classList.add('open');
}
let _bonusMode='budget'; // 'budget' | 'travel' | 'savings'
let _editingBonusId=null;
function setBonusMode(m){
  if(!['budget','travel','savings'].includes(m)) m='budget';
  _bonusMode=m;
  ['budget','travel','savings'].forEach(k=>{
    const el=document.getElementById('bn-mode-'+k);
    if(el) el.classList.toggle('active', k===m);
  });
  const hint=document.getElementById('bn-mode-hint');
  if(hint){
    if(m==='budget') hint.textContent='📊 此筆獎金會加進當月可動用金額（拿到就可以花）';
    else if(m==='travel') hint.textContent='✈️ 發放後自動撥入年度旅遊資金，本月可用餘額不變動';
    else hint.textContent='🐷 發放後自動加入「現金存款」，本月可用餘額不變動';
  }
}
// 舊函式相容
function setBonusInclude(v){ setBonusMode(v?'budget':'savings'); }
function saveBonus(){
  const name=document.getElementById('bn-name').value.trim();
  const month=parseInt(document.getElementById('bn-month').value);
  const amount=parseInt(document.getElementById('bn-amount').value)||0;
  const emoji=document.getElementById('bn-emoji').value.trim()||'🎁';
  const note=document.getElementById('bn-note').value.trim();
  const payDay=Math.min(31,Math.max(1,parseInt(document.getElementById('bn-payday').value)||25));
  if(!name){showToast('請輸入獎金名稱','error');return;}
  if(amount<=0){showToast('請輸入金額','error');return;}
  const mode=_bonusMode||'budget';
  const includeInBudget=(mode==='budget'); // 向下相容
  if(_editingBonusId!=null){
    const b=bonusExpected.find(x=>x.id===_editingBonusId);
    if(b){
      const prevMode=b.mode||(b.includeInBudget===false?'savings':'budget');
      const prevAmount=b.amount||0;
      b.name=name; b.emoji=emoji; b.month=month; b.amount=amount;
      b.note=note; b.payDay=payDay; b.mode=mode; b.includeInBudget=includeInBudget;
      // 若已撥款（_committed=true）且 mode/amount 改變，需要平衡帳：
      if(b._committed){
        // 退回舊的副作用
        if(prevMode==='travel'){
          travelFund=Math.max(0,(travelFund||0)-prevAmount);
          travelFundLog=travelFundLog.filter(l=>l.bonusId!==b.id);
        } else if(prevMode==='savings'){
          cashSavings.amount=Math.max(0,(cashSavings.amount||0)-prevAmount);
          if(cashSavings.history) cashSavings.history=cashSavings.history.filter(h=>h.bonusId!==b.id);
        }
        // 套用新的副作用
        if(mode==='travel'){
          travelFund=(travelFund||0)+amount;
          travelFundLog.push({id:Date.now(),date:new Date().toISOString().split('T')[0],amount,source:'bonus',note:`${emoji} ${name}（編輯）`,bonusId:b.id});
        } else if(mode==='savings'){
          cashSavings.amount=(cashSavings.amount||0)+amount;
          if(!cashSavings.history) cashSavings.history=[];
          cashSavings.history.push({date:todayStr(),delta:amount,amount:cashSavings.amount,note:`🎁 ${name}（編輯）`,bonusId:b.id});
        }
        localStorage.setItem('btTravelFund',(travelFund||0).toString());
        localStorage.setItem('btTravelFundLog',JSON.stringify(travelFundLog));
        localStorage.setItem('btCashSavings',JSON.stringify(cashSavings));
      }
    }
    showToast('✓ 已修改','ok');
  } else {
    const newB={id:Date.now(),name,emoji,month,year:getNow().getFullYear(),amount,note,payDay,mode,includeInBudget};
    // 旅遊額度 / 存款 → 立刻撥款（_committed=true）
    if(mode==='travel'){
      travelFund=(travelFund||0)+amount;
      travelFundLog.push({id:Date.now()+1,date:new Date().toISOString().split('T')[0],amount,source:'bonus',note:`${emoji} ${name}`,bonusId:newB.id});
      localStorage.setItem('btTravelFund',(travelFund||0).toString());
      localStorage.setItem('btTravelFundLog',JSON.stringify(travelFundLog));
      newB._committed=true;
      showToast(`✈️ 已撥入 $${amount.toLocaleString()} 到旅遊資金`,'ok');
    } else if(mode==='savings'){
      cashSavings.amount=(cashSavings.amount||0)+amount;
      if(!cashSavings.history) cashSavings.history=[];
      cashSavings.history.push({date:todayStr(),delta:amount,amount:cashSavings.amount,note:`🎁 ${name}`,bonusId:newB.id});
      localStorage.setItem('btCashSavings',JSON.stringify(cashSavings));
      newB._committed=true;
      showToast(`🐷 已加入 $${amount.toLocaleString()} 到現金存款`,'ok');
    }
    bonusExpected.push(newB);
  }
  localStorage.setItem('btBonus',JSON.stringify(bonusExpected));
  recomputeMonthlyIncome();
  closeModal('bonusModalOverlay');
  _editingBonusId=null;
  renderIncome();
  if(typeof renderAll==='function') renderAll();
}
// 舊函式相容
function addBonus(){ saveBonus(); }
function deleteBonus(id){
  const b=bonusExpected.find(x=>x.id===id);
  if(b && b._committed){
    const m=b.mode||(b.includeInBudget===false?'savings':'budget');
    if(m==='travel'){
      travelFund=Math.max(0,(travelFund||0)-(b.amount||0));
      travelFundLog=travelFundLog.filter(l=>l.bonusId!==b.id);
      localStorage.setItem('btTravelFund',(travelFund||0).toString());
      localStorage.setItem('btTravelFundLog',JSON.stringify(travelFundLog));
    } else if(m==='savings'){
      cashSavings.amount=Math.max(0,(cashSavings.amount||0)-(b.amount||0));
      if(cashSavings.history) cashSavings.history=cashSavings.history.filter(h=>h.bonusId!==b.id);
      localStorage.setItem('btCashSavings',JSON.stringify(cashSavings));
    }
  }
  bonusExpected=bonusExpected.filter(b=>b.id!==id);
  localStorage.setItem('btBonus',JSON.stringify(bonusExpected));
  recomputeMonthlyIncome();
  renderIncome();
  if(typeof renderAll==='function') renderAll();
}

// ── EXTRA INCOME (副業/投資/利息等) ──
const EXTRA_SOURCES={sidejob:{emoji:'💼',label:'副業/接案'},investment:{emoji:'📊',label:'投資/股利'},interest:{emoji:'🏦',label:'利息'},rebate:{emoji:'💸',label:'退稅/退款'},gift:{emoji:'🎁',label:'禮金/紅包'},other:{emoji:'📦',label:'其他'}};
let _eiSource='sidejob';
let _editingExtraId=null;
function selectEiSource(el){
  document.querySelectorAll('#eiSourceSelect .cat-opt').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  _eiSource=el.dataset.val;
}
function openExtraIncomeModal(){
  _editingExtraId=null;
  document.getElementById('extraIncomeTitle').textContent='📈 新增額外收入';
  document.getElementById('ei-submit').textContent='＋ 新增收入';
  document.getElementById('ei-id').value='';
  document.getElementById('ei-name').value='';
  document.getElementById('ei-amount').value='';
  document.getElementById('ei-note').value='';
  document.getElementById('ei-date').value=new Date().toISOString().split('T')[0];
  _eiSource='sidejob';
  document.querySelectorAll('#eiSourceSelect .cat-opt').forEach(c=>c.classList.toggle('selected',c.dataset.val==='sidejob'));
  document.getElementById('extraIncomeOverlay').classList.add('open');
}
function editExtraIncome(id){
  const r=extraIncome.find(x=>x.id===id); if(!r) return;
  _editingExtraId=id;
  document.getElementById('extraIncomeTitle').textContent='✏️ 編輯額外收入';
  document.getElementById('ei-submit').textContent='✓ 儲存修改';
  document.getElementById('ei-name').value=r.name;
  document.getElementById('ei-amount').value=r.amount;
  document.getElementById('ei-date').value=r.date;
  document.getElementById('ei-note').value=r.note||'';
  _eiSource=r.source||'other';
  document.querySelectorAll('#eiSourceSelect .cat-opt').forEach(c=>c.classList.toggle('selected',c.dataset.val===_eiSource));
  document.getElementById('extraIncomeOverlay').classList.add('open');
}
function saveExtraIncome(){
  const name=document.getElementById('ei-name').value.trim();
  const amount=parseInt(document.getElementById('ei-amount').value)||0;
  const date=document.getElementById('ei-date').value||new Date().toISOString().split('T')[0];
  const note=document.getElementById('ei-note').value.trim();
  if(!name){showToast('請輸入名稱','error');return;}
  if(amount<=0){showToast('請輸入金額','error');return;}
  if(_editingExtraId!=null){
    const r=extraIncome.find(x=>x.id===_editingExtraId);
    if(r){r.name=name;r.amount=amount;r.date=date;r.note=note;r.source=_eiSource;}
  } else {
    extraIncome.push({id:Date.now(),name,source:_eiSource,amount,date,note});
  }
  localStorage.setItem('btExtraIncome',JSON.stringify(extraIncome));
  closeModal('extraIncomeOverlay');
  showToast(_editingExtraId!=null?'✓ 已修改':'✓ 已記錄','ok');
  const isNew=_editingExtraId==null;
  _editingExtraId=null;
  renderAll();
  // 新增（非編輯）時詢問是否撥入旅遊資金
  if(isNew && typeof askAllocateTravelFund==='function'){
    const src=EXTRA_SOURCES[_eiSource]||EXTRA_SOURCES.other;
    askAllocateTravelFund(amount,'extra',`${src.emoji} ${name}`);
  }
}
function deleteExtraIncome(id){
  showConfirm('確定要刪除這筆收入嗎？',()=>{
    extraIncome=extraIncome.filter(x=>x.id!==id);
    localStorage.setItem('btExtraIncome',JSON.stringify(extraIncome));
    renderAll();
    showToast('✓ 已刪除','ok');
  });
}
function getExtraIncomeMonth(ym){ // ym='YYYY-MM'
  return extraIncome.filter(r=>r.date.startsWith(ym)).reduce((s,r)=>s+r.amount,0);
}
function renderExtraIncome(){
  const now=getNow();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const yr=now.getFullYear().toString();
  const monthTotal=getExtraIncomeMonth(ym);
  const yearTotal=extraIncome.filter(r=>r.date.startsWith(yr)).reduce((s,r)=>s+r.amount,0);
  const el1=document.getElementById('extraThisMonth'); if(el1) el1.textContent=`$${monthTotal.toLocaleString()}`;
  const el2=document.getElementById('extraYearTotal'); if(el2) el2.textContent=`$${yearTotal.toLocaleString()}`;
  // 月均（已記錄月份）+ hero sub
  const monthsSet=new Set(extraIncome.filter(r=>r.date.startsWith(yr)).map(r=>r.date.slice(0,7)));
  const monthsCount=monthsSet.size;
  const avg=monthsCount>0?Math.round(yearTotal/monthsCount):0;
  const el3=document.getElementById('extraMonthAvg'); if(el3) el3.textContent=`$${avg.toLocaleString()}`;
  const heroSub=document.getElementById('extraHeroSub');
  if(heroSub) heroSub.textContent=monthTotal>0?`本月已入帳 · 不納入主預算`:'尚無副業收入 · 點 ＋ 新增';
  const list=document.getElementById('extraIncomeList'); if(!list) return;
  const sorted=[...extraIncome].sort((a,b)=>b.date.localeCompare(a.date));
  if(typeof _extraShown==='undefined') _extraShown=15;
  const exTotal=sorted.length;
  const exVisible=sorted.slice(0,_extraShown);
  const exItems=exVisible.map(r=>{
      const src=EXTRA_SOURCES[r.source]||EXTRA_SOURCES.other;
      return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:11px 13px;margin-bottom:7px;display:flex;align-items:center;gap:11px;box-shadow:var(--shadow)">
        <div style="font-size:20px">${src.emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600">${r.name}</div>
          <div style="font-size:10px;color:var(--text2);margin-top:2px">${src.label} · ${r.date}${r.note?' · '+r.note:''}</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <div style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:var(--accent2)">+$${r.amount.toLocaleString()}</div>
          <div style="display:flex;gap:6px">
            <button onclick="editExtraIncome(${r.id})" style="font-size:10px;color:var(--accent);background:none;border:none;cursor:pointer">✏️</button>
            <button onclick="deleteExtraIncome(${r.id})" style="font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer">✕</button>
          </div>
        </div>
      </div>`;
    }).join('');
  const exMore=exTotal>_extraShown
    ?`<div style="text-align:center;margin-top:8px"><button class="btn-sm primary" style="padding:7px 14px;font-size:12px" onclick="loadMoreExtra()">▼ 載入更多（剩 ${exTotal-_extraShown} 筆）</button></div>`
    :(exTotal>15?`<div style="text-align:center;margin-top:8px;font-size:11px;color:var(--text3)"><a href="javascript:void(0)" onclick="resetExtraPage()" style="color:var(--accent)">收合</a></div>`:'');
  list.innerHTML=!sorted.length
    ?emptyState({emoji:'📈',title:'還沒有額外收入記錄',sub:'副業、投資、利息都可記入這裡',ctaLabel:'＋ 新增額外收入',ctaOnClick:'openExtraIncomeModal()'})
    :exItems+exMore;
}
let _extraShown=15;
function loadMoreExtra(){ _extraShown+=15; renderExtraIncome(); }
function resetExtraPage(){ _extraShown=15; renderExtraIncome(); }

// ── SAVING GOAL HELPERS ──
function getMainSalaryMonth(ym){
  // ym='YYYY-MM' → 主業薪資（不含獎金、不含副業）
  const [y,m]=ym.split('-').map(Number);
  const rec=salaryRecords.find(s=>salaryMatchesYM(s,y,m));
  return rec?rec.netPay:(monthlyIncome||0); // fallback to current monthlyIncome
}
function getSavingGoalAmount(){
  if(!savingGoal||!savingGoal.value) return 0;
  if(savingGoal.mode==='amount') return savingGoal.value;
  // percent of 本月主業
  const now=getNow();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const main=getMainSalaryMonth(ym);
  return Math.round(main*savingGoal.value/100);
}

// ── 💳 信用卡管理 ──
function calcBillingMonth(dateStr,card){
  // 結帳日：dateStr 那一天 ≤ statementDay → 入該月帳單 → 下月繳款
  // > statementDay → 入下月帳單 → 下下月繳款
  if(!card||!card.statementDay) return dateStr.substring(0,7);
  const [y,m,d]=dateStr.split('-').map(Number);
  const day=d, sd=Number(card.statementDay)||5;
  let bm=m+1; let by=y;
  if(day>sd) bm+=1;
  while(bm>12){ bm-=12; by+=1; }
  return `${by}-${String(bm).padStart(2,'0')}`;
}
function getEffectiveMonth(r){
  // 信用卡刷的算到 billingMonth；其他依 date
  if(r&&r.pay==='card'&&r.billingMonth) return r.billingMonth;
  return (r&&r.date)?r.date.substring(0,7):'';
}
function getCardPendingByMonth(ym){
  // 該月的「信用卡待扣款」總額
  return records.filter(r=>r.pay==='card'&&getEffectiveMonth(r)===ym&&r.type!=='fixed').reduce((s,r)=>s+(r.price||0),0);
}
function renderCreditCardList(){
  const el=document.getElementById('creditCardList'); if(!el) return;
  if(!creditCards.length){
    el.innerHTML='<div style="font-size:11px;color:var(--text3);text-align:center;padding:14px;background:var(--surface2);border-radius:var(--r-sm);border:1px dashed var(--border)">尚未新增信用卡</div>';
    return;
  }
  el.innerHTML=creditCards.map(c=>{
    const last=c.last4?` ····${c.last4}`:'';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer" onclick="editCard(${c.id})">
      <div style="font-size:18px">💳</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${c.name}${last}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${c.bank||''} · 結帳 ${c.statementDay} 號 · 繳款 ${c.dueDay} 號</div>
      </div>
      <div style="font-size:11px;color:var(--text3)">›</div>
    </div>`;
  }).join('');
}
let _editingCardId=null;
function openCardModal(){
  _editingCardId=null;
  document.getElementById('cardModalTitle').textContent='💳 新增信用卡';
  document.getElementById('cd-id').value='';
  document.getElementById('cd-name').value='';
  document.getElementById('cd-bank').value='';
  document.getElementById('cd-last4').value='';
  document.getElementById('cd-stmt').value='';
  document.getElementById('cd-due').value='';
  document.getElementById('cardDelBtn').style.display='none';
  document.getElementById('cardOverlay').classList.add('open');
}
function editCard(id){
  const c=creditCards.find(x=>x.id===id); if(!c) return;
  _editingCardId=id;
  document.getElementById('cardModalTitle').textContent='✏️ 編輯信用卡';
  document.getElementById('cd-id').value=id;
  document.getElementById('cd-name').value=c.name||'';
  document.getElementById('cd-bank').value=c.bank||'';
  document.getElementById('cd-last4').value=c.last4||'';
  document.getElementById('cd-stmt').value=c.statementDay||'';
  document.getElementById('cd-due').value=c.dueDay||'';
  document.getElementById('cardDelBtn').style.display='block';
  document.getElementById('cardOverlay').classList.add('open');
}
function saveCard(){
  const name=document.getElementById('cd-name').value.trim();
  const bank=document.getElementById('cd-bank').value.trim();
  const last4=document.getElementById('cd-last4').value.trim();
  const sd=parseInt(document.getElementById('cd-stmt').value)||0;
  const due=parseInt(document.getElementById('cd-due').value)||0;
  if(!name){showToast('請輸入卡片名稱','error');return;}
  if(sd<1||sd>28){showToast('結帳日請填 1-28','error');return;}
  if(due<1||due>28){showToast('繳款日請填 1-28','error');return;}
  if(_editingCardId){
    const c=creditCards.find(x=>x.id===_editingCardId);
    if(c){ c.name=name;c.bank=bank;c.last4=last4;c.statementDay=sd;c.dueDay=due; }
    showToast('✓ 卡片已更新','ok');
  } else {
    creditCards.push({id:Date.now(),name,bank,last4,statementDay:sd,dueDay:due});
    showToast('✓ 已新增信用卡','ok');
  }
  save(); closeModal('cardOverlay'); renderCreditCardList();
}
function deleteCardConfirm(){
  if(!_editingCardId) return;
  const c=creditCards.find(x=>x.id===_editingCardId); if(!c) return;
  // 檢查是否有刷卡紀錄
  const used=records.filter(r=>r.cardId===_editingCardId).length;
  const msg=used>0?`此卡有 ${used} 筆紀錄，刪除卡片後這些紀錄會改成「現金」結算。<br>確定刪除？`:'確定刪除這張卡？';
  showConfirm(msg,()=>{
    records.forEach(r=>{
      if(r.cardId===_editingCardId){ r.pay='cash'; delete r.cardId; delete r.billingMonth; }
    });
    creditCards=creditCards.filter(x=>x.id!==_editingCardId);
    _editingCardId=null;
    save(); closeModal('cardOverlay'); renderCreditCardList(); renderAll();
  });
}

// ── 💰 現金存款 ──
function saveCashSavings(){
  const v=parseInt(document.getElementById('cashSavingsInput').value);
  if(isNaN(v)||v<0){showToast('請輸入有效金額','error');return;}
  const old=cashSavings.amount||0;
  cashSavings.amount=v;
  if(!cashSavings.history) cashSavings.history=[];
  cashSavings.history.push({date:todayStr(),delta:v-old,amount:v,note:'手動更新'});
  save();
  document.getElementById('cashSavingsHint').textContent=`✓ 已儲存：$${v.toLocaleString()}`;
  showToast('✓ 現金存款已更新','ok');
  renderAll();
}
function renderCashSavingsUI(){
  const inp=document.getElementById('cashSavingsInput'); if(!inp) return;
  if(inp.value==='') inp.value=cashSavings.amount||'';
  const hint=document.getElementById('cashSavingsHint');
  if(hint&&cashSavings.amount>0){
    hint.textContent=`目前：$${(cashSavings.amount).toLocaleString()}`;
  }
}

// ── 💵 INCOME EFFECTIVE-MONTH HELPERS ──
// 發放日 ≥ 25 → 視為「下個月」可用；否則歸屬發放當月
// Legacy 記錄（沒有 payDay 欄位）一律歸屬該記錄填入的月份（保持舊行為）
function getEffectiveYM(year, month, payDay){
  if(payDay==null||payDay===undefined) return {year, month};
  const pd=Number(payDay)||25;
  if(pd>=25){
    let y=year, m=month+1;
    if(m>12){ m=1; y++; }
    return {year:y, month:m};
  }
  return {year, month};
}
function recomputeMonthlyIncome(){
  const now=getNow();
  const cy=now.getFullYear(), cm=now.getMonth()+1;
  // 加總所有 effective YM 落在本月的薪資
  let sum=0;
  salaryRecords.forEach(s=>{
    const eff=getEffectiveYM(s.year, s.month, s.payDay);
    if(eff.year===cy && eff.month===cm) sum+=(s.netPay||0);
  });
  // 加總本月「計入可用」的獎金
  bonusExpected.forEach(b=>{
    if(b.includeInBudget===false) return;
    const by=b.year||cy;
    const eff=getEffectiveYM(by, b.month, b.payDay);
    if(eff.year===cy && eff.month===cm) sum+=(b.amount||0);
  });
  // 加總本月「從存款提款」加進可用額度
  const ym=`${cy}-${String(cm).padStart(2,'0')}`;
  (cashSavings.history||[]).forEach(h=>{
    if(h.type==='withdraw' && h.date && h.date.startsWith(ym)) sum+=(h.withdrawAmount||(-h.delta)||0);
  });
  monthlyIncome=sum;
  localStorage.setItem('btIncome',sum.toString());
}

// ── 🤖 PAYDAY 自動入帳：薪資 + 固定支出 ──
window._pendingSalaryTemplate=null;

function tryAutoFillSalary(){
  // 已被略過 / 已有本月 effective 薪資 → 不問
  const now=getNow();
  const cy=now.getFullYear(), cm=now.getMonth()+1, today=now.getDate();
  const curYM=`${cy}-${String(cm).padStart(2,'0')}`;
  const skipMap=JSON.parse(localStorage.getItem('btSalaryAutoSkip')||'{}');
  if(skipMap[curYM]) return;
  const hasCurr=salaryRecords.some(s=>{
    const eff=getEffectiveYM(s.year,s.month,s.payDay);
    return eff.year===cy && eff.month===cm;
  });
  if(hasCurr) return;
  // 找上一個 effective 月份的薪資當模板
  const prevM=cm===1?12:cm-1, prevY=cm===1?cy-1:cy;
  const prev=[...salaryRecords].reverse().find(s=>{
    const eff=getEffectiveYM(s.year,s.month,s.payDay);
    return eff.year===prevY && eff.month===prevM;
  });
  if(!prev) return;
  // 若使用者設了 payDay 但今天還沒到 → 等之後再彈
  const pd=Number(prev.payDay);
  if(pd && pd<25 && today<pd) return; // 早於 25 號的 payDay 邏輯：未到不問
  if(pd>=25){
    // payday 在本月（屬於上月薪、撥到本月用）→ 25 號之後問
    if(today<25) return;
  }
  window._pendingSalaryTemplate=prev;
  document.getElementById('salaryAutoTitle').textContent=`📅 ${cm}月薪資自動入帳？`;
  document.getElementById('salaryAutoBody').innerHTML=
    `偵測到上月薪資 <strong style="color:var(--accent3);font-size:16px">$${(prev.netPay||0).toLocaleString()}</strong>，<br>是否同樣套用到本月？`;
  document.getElementById('salaryAutoOverlay').classList.add('open');
}

function confirmAutoSalary(){
  const t=window._pendingSalaryTemplate; if(!t) return;
  const now=getNow();
  const cy=now.getFullYear(), cm=now.getMonth()+1;
  const pd=Number(t.payDay)||0;
  // effective YM 須等於本月 → 反推紀錄的 (year,month)
  let recY=cy, recM=cm;
  if(pd>=25){ recM=cm-1; if(recM<1){ recM=12; recY=cy-1; } }
  const newRec={...t, id:Date.now(), year:recY, month:recM, source:'auto', createdAt:new Date().toISOString()};
  // 深拷貝 fields 避免共用參考
  if(t.fields) newRec.fields={...t.fields};
  salaryRecords.push(newRec);
  recomputeMonthlyIncome();
  save();
  closeModal('salaryAutoOverlay');
  showToast(`🤖 ${cm}月薪資 $${(t.netPay||0).toLocaleString()} 已自動入帳`,'ok');
  if(typeof renderAll==='function') renderAll();
  window._pendingSalaryTemplate=null;
}

function skipAutoSalary(){
  const now=getNow();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const skipMap=JSON.parse(localStorage.getItem('btSalaryAutoSkip')||'{}');
  skipMap[ym]=true;
  localStorage.setItem('btSalaryAutoSkip',JSON.stringify(skipMap));
  closeModal('salaryAutoOverlay');
  showToast('已略過，本月不再詢問','info');
  window._pendingSalaryTemplate=null;
}

function editAutoSalary(){
  const t=window._pendingSalaryTemplate; if(!t) return;
  closeModal('salaryAutoOverlay');
  if(typeof openManualSalaryModal!=='function'){ showToast('找不到手動輸入視窗','error'); return; }
  openManualSalaryModal();
  setTimeout(()=>{
    if(t.fields){
      Object.entries(t.fields).forEach(([k,v])=>{
        const el=document.getElementById('ms-'+k); if(el) el.value=v;
      });
    }
    if(t.payDay){ const pd=document.getElementById('ms-payday'); if(pd) pd.value=t.payDay; }
  },80);
}

// 自動 confirm 已過扣款日的固定支出
function autoConfirmFixedExpenses(){
  const optOut=localStorage.getItem('btAutoConfirmFixedOff')==='1';
  if(optOut) return;
  const now=getNow();
  const today=now.getDate();
  let count=0,total=0;
  fixedExpenses.forEach(f=>{
    if(f.cycle!=='monthly') return;
    if(today>=f.day && !isConfirmed(f.id)){
      const k=deductionKey(f.id);
      if(confirmedDeductions[k+'_skip']) return; // 使用者本月已主動取消
      confirmedDeductions[k]=true;
      confirmedDeductions[k+'_auto']=true;
      // 若是負債分期 → 同步推進負債 paidMonths（idempotent）
      if(f._linkedDebtId && !confirmedDeductions[k+'_debtPaid']){
        const d=debts.find(x=>x.id===f._linkedDebtId);
        if(d && d.paidMonths<d.totalMonths){
          d.paidMonths++;
          if(d.paidMonths>=d.totalMonths){
            d.status='paid';
            // 還清 → 從 fixedExpenses 移除（下個迴圈不會再 auto-confirm）
            d.linkedFixedId=null;
          } else {
            f.note=`負債分期：剩 ${d.totalMonths-d.paidMonths} 期`;
          }
          confirmedDeductions[k+'_debtPaid']=true;
        }
      }
      count++;
      total+=f.amount||0;
    }
  });
  // 清掉已標記 paid 的 linkedFixed
  fixedExpenses=fixedExpenses.filter(f=>{
    if(!f._linkedDebtId) return true;
    const d=debts.find(x=>x.id===f._linkedDebtId);
    return d && d.status!=='paid';
  });
  if(count){
    save();
    showToast(`🤖 自動確認 ${count} 筆固定支出（共 $${total.toLocaleString()}）`,'ok');
  }
}

function runPaydayAutomations(){
  try{ autoConfirmFixedExpenses(); }catch(e){ console.warn('autoConfirmFixed:',e); }
  try{ tryAutoFillSalary(); }catch(e){ console.warn('autoFillSalary:',e); }
}

// ── 🏦 SAVINGS WITHDRAW / DEPOSIT ──
function openSavWithdrawModal(){
  document.getElementById('sw-amount').value='';
  document.getElementById('sw-note').value='';
  document.getElementById('savWithdrawBalance').textContent=`目前存款：$${(cashSavings.amount||0).toLocaleString()}`;
  document.getElementById('savWithdrawOverlay').classList.add('open');
}
function confirmSavWithdraw(){
  const amt=parseInt(document.getElementById('sw-amount').value)||0;
  const note=document.getElementById('sw-note').value.trim();
  if(amt<=0){showToast('請輸入提款金額','error');return;}
  const cur=cashSavings.amount||0;
  if(amt>cur){showToast(`存款不足（剩 $${cur.toLocaleString()}）`,'error');return;}
  cashSavings.amount=cur-amt;
  if(!cashSavings.history) cashSavings.history=[];
  cashSavings.history.push({date:todayStr(),delta:-amt,withdrawAmount:amt,amount:cashSavings.amount,note:note||'提款動用',type:'withdraw'});
  recomputeMonthlyIncome();
  save();
  closeModal('savWithdrawOverlay');
  showToast(`✓ 已提款 $${amt.toLocaleString()}，本月可用 +$${amt.toLocaleString()}`,'ok');
  renderAll();
  if(typeof renderSavingsTab==='function') renderSavingsTab();
}
function openSavDepositModal(){
  document.getElementById('sd-amount').value='';
  document.getElementById('sd-note').value='';
  document.getElementById('savDepositOverlay').classList.add('open');
}
function confirmSavDeposit(){
  const amt=parseInt(document.getElementById('sd-amount').value)||0;
  const note=document.getElementById('sd-note').value.trim();
  if(amt<=0){showToast('請輸入存入金額','error');return;}
  cashSavings.amount=(cashSavings.amount||0)+amt;
  if(!cashSavings.history) cashSavings.history=[];
  cashSavings.history.push({date:todayStr(),delta:amt,amount:cashSavings.amount,note:note||'手動存入',type:'deposit'});
  save();
  closeModal('savDepositOverlay');
  showToast(`✓ 已存入 $${amt.toLocaleString()}`,'ok');
  renderAll();
  if(typeof renderSavingsTab==='function') renderSavingsTab();
}
function deleteSavHistory(idx){
  if(!confirm('確定刪除這筆異動？金額會回沖到存款。')) return;
  const h=cashSavings.history[idx]; if(!h) return;
  // 反向沖銷：若是 deposit/surplus → 扣回；withdraw → 加回；invest → 不影響金額
  if(h.type==='withdraw'){
    cashSavings.amount=(cashSavings.amount||0)+(h.withdrawAmount||(-h.delta)||0);
  } else if(h.type==='deposit'||h.type==='surplus'){
    cashSavings.amount=(cashSavings.amount||0)-(h.delta||0);
  }
  cashSavings.history.splice(idx,1);
  recomputeMonthlyIncome();
  save();
  showToast('✓ 已刪除','ok');
  renderAll();
  renderSavingsTab();
}
function renderSavingsTab(){
  const balEl=document.getElementById('savBalance'); if(!balEl) return;
  const cur=cashSavings.amount||0;
  balEl.textContent=`$${cur.toLocaleString()}`;
  const hintEl=document.getElementById('savBalanceHint');
  if(hintEl){
    hintEl.textContent=cur>0?`最後更新：${(cashSavings.history&&cashSavings.history.length)?cashSavings.history[cashSavings.history.length-1].date:'—'}`:'尚未設定起始金額，前往「⚙️ 設定 → 帳戶」填入';
  }
  // 月統計
  const now=getNow();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const yr=now.getFullYear();
  let mIn=0,mOut=0,yInvest=0;
  (cashSavings.history||[]).forEach(h=>{
    if(!h.date) return;
    if(h.date.startsWith(ym)){
      if(h.type==='withdraw') mOut+=(h.withdrawAmount||(-h.delta)||0);
      else if((h.delta||0)>0) mIn+=h.delta;
    }
    if(h.type==='invest' && h.date.startsWith(String(yr))) yInvest+=(h.investAmount||0);
  });
  // 加上手動投資 entries 今年累計
  (investments.entries||[]).forEach(e=>{
    if(e.date && e.date.startsWith(String(yr))) yInvest+=(e.amount||0);
  });
  document.getElementById('savMonthIn').textContent=`$${mIn.toLocaleString()}`;
  document.getElementById('savMonthOut').textContent=`$${mOut.toLocaleString()}`;
  document.getElementById('savInvested').textContent=`$${yInvest.toLocaleString()}`;
  renderInvestmentCard();
  // 異動記錄
  const list=document.getElementById('savHistoryList');
  const hist=[...(cashSavings.history||[])].reverse();
  if(!hist.length){
    list.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">還沒有異動記錄</div>`;
    return;
  }
  list.innerHTML=hist.map((h,i)=>{
    const realIdx=cashSavings.history.length-1-i;
    const isOut=h.type==='withdraw';
    const isInvest=h.type==='invest';
    const icon=isOut?'📤':isInvest?'📊':(h.delta>0?'📥':'✏️');
    const tagMap={withdraw:{label:'提款',color:'var(--danger)',bg:'var(--danger-light)'},
                  deposit:{label:'存入',color:'var(--accent3)',bg:'var(--accent3-light)'},
                  surplus:{label:'月結餘',color:'var(--accent3)',bg:'var(--accent3-light)'},
                  invest:{label:'投資標記',color:'var(--accent2)',bg:'rgba(232,72,138,0.08)'}};
    const tag=tagMap[h.type]||{label:'手動',color:'var(--text2)',bg:'var(--bg2)'};
    const amt=isInvest?h.investAmount||0:Math.abs(h.delta||0);
    const sign=isInvest?'':(h.delta>0?'+':'−');
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:6px;box-shadow:var(--shadow)">
      <div style="font-size:18px">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text)">${h.note||tag.label}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${h.date} · <span style="background:${tag.bg};color:${tag.color};padding:1px 6px;border-radius:4px;font-weight:600">${tag.label}</span></div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:${isInvest?'var(--accent2)':(h.delta>0?'var(--accent3)':isOut?'var(--danger)':'var(--text)')}">${sign}$${amt.toLocaleString()}</div>
        ${!isInvest?`<div style="font-size:10px;color:var(--text3);margin-top:1px">餘 $${(h.amount||0).toLocaleString()}</div>`:''}
      </div>
      <button onclick="deleteSavHistory(${realIdx})" style="font-size:13px;color:var(--text3);background:none;border:none;cursor:pointer;padding:0 4px">✕</button>
    </div>`;
  }).join('');
}

// ── 📊 INVESTMENT TRACKING ──
function getInvestTotalIn(){
  return (investments.entries||[]).reduce((s,e)=>s+(e.amount||0),0);
}
function getInvestCurValue(){
  const vh=investments.valueHistory||[];
  if(vh.length) return vh[vh.length-1].value||0;
  return getInvestTotalIn(); // 沒填過市值就先當作 = 投入
}
function openInvAddModal(){
  document.getElementById('iv-name').value='';
  document.getElementById('iv-amount').value='';
  document.getElementById('iv-date').value=todayStr();
  document.getElementById('iv-note').value='';
  document.getElementById('invAddOverlay').classList.add('open');
}
function confirmAddInv(){
  const name=document.getElementById('iv-name').value.trim();
  const amount=parseInt(document.getElementById('iv-amount').value)||0;
  const date=document.getElementById('iv-date').value||todayStr();
  const note=document.getElementById('iv-note').value.trim();
  if(!name){showToast('請輸入投資標的','error');return;}
  if(amount<=0){showToast('請輸入投入金額','error');return;}
  if(!investments.entries) investments.entries=[];
  investments.entries.push({id:Date.now(),name,amount,date,note});
  save();
  closeModal('invAddOverlay');
  showToast(`✓ 已新增 ${name} $${amount.toLocaleString()}`,'ok');
  renderSavingsTab();
  if(typeof renderAll==='function') renderAll();
}
function openInvUpdateModal(){
  const totalIn=getInvestTotalIn();
  const cur=getInvestCurValue();
  document.getElementById('invUpdateBalance').innerHTML=`累計投入 <b>$${totalIn.toLocaleString()}</b> · 上次市值 <b>$${cur.toLocaleString()}</b>`;
  document.getElementById('iu-value').value=cur||'';
  document.getElementById('iu-note').value='';
  document.getElementById('invUpdateOverlay').classList.add('open');
}
function confirmUpdateInv(){
  const value=parseInt(document.getElementById('iu-value').value)||0;
  const note=document.getElementById('iu-note').value.trim();
  if(value<0){showToast('市值不能為負','error');return;}
  if(!investments.valueHistory) investments.valueHistory=[];
  investments.valueHistory.push({id:Date.now(),date:todayStr(),value,note});
  save();
  closeModal('invUpdateOverlay');
  showToast(`✓ 市值已更新 $${value.toLocaleString()}`,'ok');
  renderSavingsTab();
  if(typeof renderAll==='function') renderAll();
}
function deleteInvEntry(id){
  if(!confirm('確定刪除這筆投資紀錄？')) return;
  investments.entries=(investments.entries||[]).filter(e=>e.id!==id);
  save();
  showToast('✓ 已刪除','ok');
  renderSavingsTab();
  if(typeof renderAll==='function') renderAll();
}
function deleteInvValue(id){
  if(!confirm('確定刪除這筆市值更新？')) return;
  investments.valueHistory=(investments.valueHistory||[]).filter(v=>v.id!==id);
  save();
  renderSavingsTab();
  if(typeof renderAll==='function') renderAll();
}
function renderInvestmentCard(){
  const totalIn=getInvestTotalIn();
  const curVal=getInvestCurValue();
  const totalInEl=document.getElementById('invTotalIn');
  const curValEl=document.getElementById('invCurValue');
  if(totalInEl) totalInEl.textContent=`$${totalIn.toLocaleString()}`;
  if(curValEl) curValEl.textContent=`$${curVal.toLocaleString()}`;
  // 損益
  const row=document.getElementById('invReturnRow');
  const valEl=document.getElementById('invReturnVal');
  const vh=investments.valueHistory||[];
  if(row && valEl){
    if(totalIn>0 && vh.length>0){
      const diff=curVal-totalIn;
      const pct=(diff/totalIn)*100;
      const isUp=diff>=0;
      row.style.display='flex';
      valEl.innerHTML=`<span style="color:${isUp?'var(--accent3)':'var(--danger)'}">${isUp?'+':''}$${diff.toLocaleString()} (${isUp?'+':''}${pct.toFixed(1)}%)</span>`;
    } else {
      row.style.display='none';
    }
  }
  // 列表
  const list=document.getElementById('invHistoryList');
  if(!list) return;
  const entries=[...(investments.entries||[])].sort((a,b)=>b.date.localeCompare(a.date));
  const lastValue=vh.length?vh[vh.length-1]:null;
  let html='';
  if(lastValue){
    html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow)">
      <div style="font-size:18px">📈</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600">市值更新 · $${lastValue.value.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${lastValue.date}${lastValue.note?' · '+lastValue.note:''}</div>
      </div>
      <button onclick="deleteInvValue(${lastValue.id})" style="font-size:13px;color:var(--text3);background:none;border:none;cursor:pointer">✕</button>
    </div>`;
  }
  if(entries.length){
    html+=entries.map(e=>`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;box-shadow:var(--shadow)">
      <div style="font-size:18px">📊</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600">${e.name}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">${e.date}${e.note?' · '+e.note:''}</div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--accent)">$${e.amount.toLocaleString()}</div>
      <button onclick="deleteInvEntry(${e.id})" style="font-size:13px;color:var(--text3);background:none;border:none;cursor:pointer">✕</button>
    </div>`).join('');
  }
  if(!html){
    html=`<div style="text-align:center;padding:14px;color:var(--text3);font-size:11px">還沒有投資紀錄</div>`;
  }
  list.innerHTML=html;
}

// ── 💳 下月信用卡待扣（home page card） ──
function renderCardPendingHome(){
  const card=document.getElementById('cardPendingCard'); if(!card) return;
  if(!creditCards.length){ card.style.display='none'; return; }
  const now=getNow();
  const curYM=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  // 找出所有「未來月份」（含下月、下下月）尚未繳的信用卡刷卡
  const pendingByYM={}; // ym -> total
  const pendingByCard={}; // ym -> {cid -> total}
  records.filter(r=>r.pay==='card'&&r.billingMonth&&r.billingMonth>curYM&&r.type!=='fixed').forEach(r=>{
    const m=r.billingMonth;
    pendingByYM[m]=(pendingByYM[m]||0)+(r.price||0);
    if(!pendingByCard[m]) pendingByCard[m]={};
    pendingByCard[m][r.cardId]=(pendingByCard[m][r.cardId]||0)+(r.price||0);
  });
  // 信用卡支付的固定支出 / 分期負債：估算未來 2 期扣款月份
  (typeof fixedExpenses!=='undefined'?fixedExpenses:[]).forEach(f=>{
    if(f.pay!=='card'||!f.cardId) return;
    const c=creditCards.find(x=>x.id===f.cardId); if(!c) return;
    if(f.cycle&&f.cycle!=='monthly') return; // 只估算每月扣款
    // 推算接下來 2 次扣款日（從本月或下月的 fx.day 起）
    const day=Math.min(28, Math.max(1, Number(f.day)||1));
    for(let i=0;i<2;i++){
      const dt=new Date(now.getFullYear(), now.getMonth()+i, day);
      if(dt < new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue; // 已過則略過本期
      const ds=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      const bm=calcBillingMonth(ds, c);
      if(bm<=curYM) continue;
      // 若此期已標記已扣款（_debtPaid）則略過
      if(typeof confirmedDeductions!=='undefined'){
        const k=`${f.id}_${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        if(confirmedDeductions[k+'_skip']) continue;
      }
      pendingByYM[bm]=(pendingByYM[bm]||0)+(f.amount||0);
      if(!pendingByCard[bm]) pendingByCard[bm]={};
      pendingByCard[bm][f.cardId]=(pendingByCard[bm][f.cardId]||0)+(f.amount||0);
    }
  });
  const total=Object.values(pendingByYM).reduce((s,v)=>s+v,0);
  // 即使 total=0，只要有信用卡就顯示卡片（讓使用者知道沒有待扣）
  card.style.display='block';
  document.getElementById('cardPendingAmount').textContent='$'+total.toLocaleString();
  if(total<=0){
    document.getElementById('cardPendingDetail').innerHTML='<span style="color:var(--text3)">目前沒有未來月份的信用卡待扣款 ✓</span>';
    return;
  }
  // 依月份排序，每月一行
  const lines=Object.keys(pendingByYM).sort().map(ym=>{
    const [y,m]=ym.split('-');
    const sum=pendingByYM[ym];
    const byCardStr=Object.entries(pendingByCard[ym]).map(([cid,amt])=>{
      const c=creditCards.find(x=>x.id===parseInt(cid));
      return c?`${c.name} $${amt.toLocaleString()}`:`未知卡 $${amt.toLocaleString()}`;
    }).join('、');
    return `📅 ${parseInt(m)}月帳單 $${sum.toLocaleString()}　${byCardStr}`;
  });
  document.getElementById('cardPendingDetail').innerHTML=lines.join('<br>');
}

// ── ⚠️ 超支警示 ──
function checkOverageWarning(){
  if(!monthlyIncome||monthlyIncome<=0) return;
  const now=getNow();
  const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const varTotal=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='var'&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
  const lifeTotal=records.filter(r=>getEffectiveMonth(r)===ym&&(r.type==='life'||r.type==='voucher'||r.type==='easycard')&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
  const fixedTotal=getMonthlyFixed();
  const spent=varTotal+lifeTotal+fixedTotal;
  const goal=getSavingGoalAmount();
  const overage=spent+goal-monthlyIncome; // >0 表示超支
  if(overage<=0) return;
  // 計算副業可 cover 多少
  const extra=extraIncome.filter(r=>r.date.startsWith(ym)).reduce((s,r)=>s+r.amount,0);
  const cash=cashSavings.amount||0;
  const ov=document.getElementById('overageOverlay');
  if(!ov) return;
  const msg=document.getElementById('overageMsg');
  msg.innerHTML=`本月支出 <b>$${spent.toLocaleString()}</b> + 存款目標 <b>$${goal.toLocaleString()}</b> 已超出主業收入 <b>$${monthlyIncome.toLocaleString()}</b>。<br>
    <span style="color:var(--danger);font-weight:700">超支 $${overage.toLocaleString()}</span>`;
  const actBox=document.getElementById('overageActions');
  const acts=[];
  if(extra>=overage){
    acts.push({label:`💎 用副業收入 cover（本月副業 $${extra.toLocaleString()}）`,style:'primary',cb:()=>{ closeModal('overageOverlay'); showToast('已標記為副業 cover','ok'); }});
  } else if(extra>0){
    acts.push({label:`💎 副業可 cover $${extra.toLocaleString()}（不足 $${(overage-extra).toLocaleString()}）`,cb:()=>{ closeModal('overageOverlay'); showToast(`副業 cover $${extra}，仍差 $${overage-extra}`,'error'); }});
  }
  if(cash>=overage){
    acts.push({label:`🏦 動用現金存款 cover（剩 $${cash.toLocaleString()}）`,style:'primary',cb:()=>{
      cashSavings.amount=cash-overage;
      if(!cashSavings.history) cashSavings.history=[];
      cashSavings.history.push({date:todayStr(),delta:-overage,amount:cashSavings.amount,note:`${ym} 超支 cover`});
      save(); closeModal('overageOverlay'); renderAll();
      showToast(`已從現金存款扣 $${overage}`,'ok');
    }});
  } else if(cash>0){
    acts.push({label:`🏦 現金存款僅 $${cash.toLocaleString()}（不足 $${(overage-cash).toLocaleString()}）`,cb:()=>closeModal('overageOverlay')});
  }
  acts.push({label:'⚠️ 接受超支（自我提醒，下月收斂）',cb:()=>{ closeModal('overageOverlay'); showToast('已記錄為本月超支','error'); }});
  actBox.innerHTML='';
  acts.forEach(a=>{
    const btn=document.createElement('button');
    btn.className='btn-sm '+(a.style==='primary'?'primary':'');
    btn.style.cssText='padding:11px;font-size:13px;width:100%;text-align:left';
    if(a.style==='primary') btn.classList.add('primary');
    btn.innerHTML=a.label;
    btn.onclick=a.cb;
    actBox.appendChild(btn);
  });
  ov.classList.add('open');
}

// ── 🎉 月底結餘提示 ──
function checkMonthSurplusPrompt(){
  if(!monthlyIncome||monthlyIncome<=0) return;
  const now=getNow();
  // 只在每月 1-5 號開啟時提示上月結餘
  if(now.getDate()>5) return;
  const lastDate=new Date(now.getFullYear(),now.getMonth()-1,1);
  const lastYM=`${lastDate.getFullYear()}-${String(lastDate.getMonth()+1).padStart(2,'0')}`;
  if(cashSavings.lastSurplusPromptYM===lastYM) return; // 已提示過
  // 計算上月結餘 = 上月主業薪資 - 上月支出
  const sal=salaryRecords.find(s=>s.year===lastDate.getFullYear()&&s.month===lastDate.getMonth()+1);
  if(!sal||!sal.netPay) return;
  const lastVar=records.filter(r=>getEffectiveMonth(r)===lastYM&&r.type==='var').reduce((s,r)=>s+r.price,0);
  const lastLife=records.filter(r=>getEffectiveMonth(r)===lastYM&&(r.type==='life'||r.type==='voucher'||r.type==='easycard')).reduce((s,r)=>s+r.price,0);
  const lastFixed=records.filter(r=>getEffectiveMonth(r)===lastYM&&r.type==='fixed').reduce((s,r)=>s+r.price,0);
  const surplus=sal.netPay-lastVar-lastLife-lastFixed;
  if(surplus<=0){
    cashSavings.lastSurplusPromptYM=lastYM; save(); return;
  }
  _pendingSurplus={amount:surplus,ym:lastYM};
  const msg=document.getElementById('surplusMsg');
  msg.innerHTML=`${lastDate.getMonth()+1} 月主業 $${sal.netPay.toLocaleString()}<br>
    支出合計 $${(lastVar+lastLife+lastFixed).toLocaleString()}<br>
    <span style="color:var(--accent3);font-weight:700;font-size:16px">結餘 $${surplus.toLocaleString()}</span>`;
  document.getElementById('surplusOverlay').classList.add('open');
}
let _pendingSurplus=null;
function dismissSurplus(){
  if(_pendingSurplus){ cashSavings.lastSurplusPromptYM=_pendingSurplus.ym; save(); }
  _pendingSurplus=null;
  closeModal('surplusOverlay');
}
function acceptSurplus(){
  if(!_pendingSurplus) return closeModal('surplusOverlay');
  cashSavings.amount=(cashSavings.amount||0)+_pendingSurplus.amount;
  if(!cashSavings.history) cashSavings.history=[];
  cashSavings.history.push({date:todayStr(),delta:_pendingSurplus.amount,amount:cashSavings.amount,note:`${_pendingSurplus.ym} 月結餘`,type:'surplus'});
  cashSavings.lastSurplusPromptYM=_pendingSurplus.ym;
  _pendingSurplus=null;
  save(); closeModal('surplusOverlay'); renderAll();
  showToast('✓ 已加入現金存款','ok');
}
function investSurplus(){
  if(!_pendingSurplus) return closeModal('surplusOverlay');
  if(!cashSavings.history) cashSavings.history=[];
  cashSavings.history.push({date:todayStr(),delta:0,amount:cashSavings.amount||0,note:`${_pendingSurplus.ym} 月結餘 → 投資 $${_pendingSurplus.amount.toLocaleString()}（未計入存款）`,type:'invest',investAmount:_pendingSurplus.amount,ym:_pendingSurplus.ym});
  cashSavings.lastSurplusPromptYM=_pendingSurplus.ym;
  _pendingSurplus=null;
  save(); closeModal('surplusOverlay'); renderAll();
  showToast('📊 已標記為投資','ok');
}

function setSavingGoalMode(mode){
  savingGoal.mode=mode;
  document.getElementById('sg-mode-percent').classList.toggle('active',mode==='percent');
  document.getElementById('sg-mode-amount').classList.toggle('active',mode==='amount');
  document.getElementById('sg-suffix').textContent=mode==='percent'?'%':'$';
  document.getElementById('savingGoalInput').placeholder=mode==='percent'?'例：20':'例：5000';
}
function saveSavingGoal(){
  const v=parseFloat(document.getElementById('savingGoalInput').value)||0;
  if(v<0||(savingGoal.mode==='percent'&&v>100)){showToast('數值不正確','error');return;}
  savingGoal.value=v;
  localStorage.setItem('btSavingGoal',JSON.stringify(savingGoal));
  showToast(v>0?'✓ 存款目標已設定':'✓ 已清除目標','ok');
  renderAll();
}

// ── ✈️ 年度旅遊預算 / 旅遊資金 ──
function saveTravelBudgetYearly(){
  const v=parseInt(document.getElementById('travelBudgetYearlyInput').value)||0;
  if(v<0){ showToast('數值不正確','error'); return; }
  travelBudgetYearly=v;
  localStorage.setItem('btTravelBudgetYearly',v.toString());
  showToast(v>0?`✈️ 年度旅遊預算 $${v.toLocaleString()} 已設定`:'✈️ 已清除年度旅遊預算','ok');
  renderTravelFundUI();
}
function getTravelFundUsedThisYear(){
  const yr=getNow().getFullYear().toString();
  return records.filter(r=>r._travelBudget&&r.date&&r.date.startsWith(yr)).reduce((s,r)=>s+(r.price||0),0);
}
function addTravelFund(amount, source, note){
  amount=Math.max(0,Math.round(parseFloat(amount)||0));
  if(amount<=0) return;
  travelFund=(travelFund||0)+amount;
  travelFundLog.push({id:Date.now(),date:new Date().toISOString().split('T')[0],amount,source:source||'manual',note:note||''});
  localStorage.setItem('btTravelFund',travelFund.toString());
  localStorage.setItem('btTravelFundLog',JSON.stringify(travelFundLog));
  renderTravelFundUI();
}
function manualAddTravelFund(){
  const remain=Math.max(0,(travelBudgetYearly||0)-(travelFund||0));
  showChoice(
    '✈️ 手動撥入旅遊資金',
    `目前累積 $${(travelFund||0).toLocaleString()} / 目標 $${(travelBudgetYearly||0).toLocaleString()}（差 $${remain.toLocaleString()}）<br><span style="font-size:11px;color:var(--text3)">選擇金額</span>`,
    [
      {label:'＋ $1,000', style:'', onClick:()=>{addTravelFund(1000,'manual','手動撥入'); showToast('✈️ 已撥入 $1,000','ok');}},
      {label:'＋ $5,000', style:'', onClick:()=>{addTravelFund(5000,'manual','手動撥入'); showToast('✈️ 已撥入 $5,000','ok');}},
      {label:'＋ $10,000', style:'primary', onClick:()=>{addTravelFund(10000,'manual','手動撥入'); showToast('✈️ 已撥入 $10,000','ok');}},
      {label:'🚫 取消', style:'', onClick:()=>{}},
    ]
  );
}
function openTravelFundLog(){
  if(!travelFundLog.length){ showToast('尚無旅遊資金撥款記錄','warn'); return; }
  const sourceLabel={bonus:'🎁 獎金',extra:'📈 額外收入',manual:'✏️ 手動'};
  const lines=[...travelFundLog].sort((a,b)=>b.date.localeCompare(a.date)).map(l=>
    `${l.date} ${sourceLabel[l.source]||'📦'} +$${l.amount.toLocaleString()}${l.note?' · '+l.note:''}`
  ).join('\n');
  const used=getTravelFundUsedThisYear();
  showToast(`✈️ 旅遊資金（合計 $${(travelFund||0).toLocaleString()}，今年已用 $${used.toLocaleString()}）\n${lines}`,'ok');
}
function renderTravelFundUI(){
  const inp=document.getElementById('travelBudgetYearlyInput');
  if(inp) inp.value=travelBudgetYearly||'';
  const prog=document.getElementById('travelFundProgress');
  if(!prog) return;
  if(travelBudgetYearly<=0 && (travelFund||0)<=0){ prog.style.display='none'; return; }
  prog.style.display='block';
  const target=Math.max(travelBudgetYearly,1);
  const fund=travelFund||0;
  const used=getTravelFundUsedThisYear();
  const remain=Math.max(0,fund-used);
  const pct=Math.min(100,Math.max(0,fund/target*100));
  const fill=document.getElementById('travelFundBarFill');
  if(fill){ fill.style.width=pct+'%'; }
  const a=document.getElementById('travelFundActualLabel'); if(a) a.textContent=`已撥入 $${fund.toLocaleString()}`;
  const t=document.getElementById('travelFundTargetLabel'); if(t) t.textContent=`目標 $${(travelBudgetYearly||0).toLocaleString()}`;
  const u=document.getElementById('travelFundUsedLabel'); if(u) u.textContent=`已用 $${used.toLocaleString()}`;
  const r=document.getElementById('travelFundRemainLabel'); if(r) r.textContent=`餘額 $${remain.toLocaleString()}`;
}
// 詢問是否撥入旅遊資金（金額 amt，來源 source: 'bonus'|'extra'，名稱 name）
function askAllocateTravelFund(amt, source, name){
  if(!amt||amt<=0) return;
  if(travelBudgetYearly<=0) return; // 沒設目標就不問
  const fund=travelFund||0;
  const remainGoal=Math.max(0,travelBudgetYearly-fund);
  if(remainGoal<=0) return; // 已達標
  const half=Math.round(amt/2);
  const suggest=Math.min(amt,remainGoal);
  showChoice(
    `✈️ 撥入旅遊資金？`,
    `「${name}」這筆 <strong>$${amt.toLocaleString()}</strong>，要撥多少到年度旅遊資金？<br><span style="font-size:11px;color:var(--text3)">目前累積 $${fund.toLocaleString()} / 目標 $${travelBudgetYearly.toLocaleString()}（差 $${remainGoal.toLocaleString()}）</span>`,
    [
      {label:`✈️ 全額撥入 $${suggest.toLocaleString()}`, style:'primary', onClick:()=>{addTravelFund(suggest,source,name); showToast(`✈️ 已撥入 $${suggest.toLocaleString()} 到旅遊資金`,'ok');}},
      {label:`📊 撥入一半 $${half.toLocaleString()}`, style:'', onClick:()=>{addTravelFund(half,source,name); showToast(`✈️ 已撥入 $${half.toLocaleString()} 到旅遊資金`,'ok');}},
      {label:`🚫 不撥入`, style:'', onClick:()=>{}},
    ]
  );
}
function renderSavingGoalUI(){
  // 設定頁
  const sgInput=document.getElementById('savingGoalInput');
  const sgProg=document.getElementById('savingGoalProgress');
  if(sgInput){
    sgInput.value=savingGoal.value||'';
    setSavingGoalMode(savingGoal.mode||'percent');
    if(savingGoal.value>0){
      const target=getSavingGoalAmount();
      const now=getNow();
      const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const main=getMainSalaryMonth(ym);
      const varTotal=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='var'&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
      const lifeTotal=records.filter(r=>getEffectiveMonth(r)===ym&&(r.type==='life'||r.type==='voucher'||r.type==='easycard')&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
      const fixedTotal=getMonthlyFixed();
      const actual=main-varTotal-lifeTotal-fixedTotal;
      sgProg.style.display='block';
      const pct=target>0?Math.min(100,Math.max(0,actual/target*100)):0;
      const fill=document.getElementById('savingGoalBarFill');
      fill.style.width=pct+'%';
      fill.className='budget-bar-fill '+(actual>=target?'ok':actual>=target*0.7?'warn':'danger');
      document.getElementById('savingGoalActualLabel').textContent=`實存 $${actual.toLocaleString()}`;
      document.getElementById('savingGoalTargetLabel').textContent=`目標 $${target.toLocaleString()}`;
    } else { sgProg.style.display='none'; }
  }
  // 總覽 saving goal card
  const card=document.getElementById('savingGoalCard');
  if(card){
    if(savingGoal.value>0&&monthlyIncome>0){
      const target=getSavingGoalAmount();
      const now=getNow();
      const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const main=getMainSalaryMonth(ym);
      const varTotal=records.filter(r=>getEffectiveMonth(r)===ym&&r.type==='var'&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
      const lifeTotal=records.filter(r=>getEffectiveMonth(r)===ym&&(r.type==='life'||r.type==='voucher'||r.type==='easycard')&&!r._travelBudget).reduce((s,r)=>s+r.price,0);
      const fixedTotal=getMonthlyFixed();
      const actualMain=main-varTotal-lifeTotal-fixedTotal;
      const extraThis=getExtraIncomeMonth(ym);
      card.style.display='block';
      const pct=target>0?Math.min(100,Math.max(0,actualMain/target*100)):0;
      const fill=document.getElementById('sgCardFill');
      fill.style.width=pct+'%';
      const reached=actualMain>=target;
      fill.className='budget-bar-fill '+(reached?'ok':actualMain>=target*0.7?'warn':'danger');
      document.getElementById('sgCardSummary').textContent=savingGoal.mode==='percent'?`主業 ${savingGoal.value}%`:`固定 $${savingGoal.value.toLocaleString()}`;
      document.getElementById('sgCardActual').textContent=`${reached?'✓':''}實存 $${actualMain.toLocaleString()}`;
      document.getElementById('sgCardActual').style.color=reached?'var(--accent3)':actualMain<0?'var(--danger)':'var(--warn)';
      document.getElementById('sgCardTarget').textContent=`目標 $${target.toLocaleString()} (${Math.round(pct)}%)`;
      const extraEl=document.getElementById('sgCardExtra');
      if(extraThis>0){
        extraEl.style.display='block';
        extraEl.innerHTML=`💎 加上副業 +$${extraThis.toLocaleString()} → 實際可存 <strong style="color:var(--accent2)">$${(actualMain+extraThis).toLocaleString()}</strong>`;
      } else { extraEl.style.display='none'; }
    } else { card.style.display='none'; }
  }
}

// ── NEW INCOME SUB-TAB RENDERERS ──
function renderBonusTab(){
  const total=bonusExpected.reduce((s,b)=>s+b.amount,0);
  document.getElementById('bonusTotalLabel').textContent=`$${total.toLocaleString()}`;
  const now=getNow(); const mo=now.getMonth()+1;
  const sorted=[...bonusExpected].sort((a,b)=>a.month-b.month);

  // Timeline: 12 months row
  const months=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const tl=document.getElementById('bonusTimeline');
  tl.innerHTML=`<div style="display:flex;gap:3px;margin-bottom:12px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none">
    ${months.map((m,i)=>{
      const mNum=i+1; const isCur=mNum===mo;
      const bonuses=bonusExpected.filter(b=>b.month===mNum);
      const hasBon=bonuses.length>0;
      return `<div style="flex-shrink:0;width:${isCur?'40px':'32px'};text-align:center;cursor:${hasBon?'pointer':'default'}"
        onclick="${hasBon?`openBonusDetail(${mNum})`:''}">
        <div style="width:${isCur?'40px':'32px'};height:${isCur?'40px':'32px'};border-radius:50%;
          background:${hasBon?'var(--accent)':isCur?'var(--accent-light)':'var(--bg2)'};
          display:flex;align-items:center;justify-content:center;
          border:${isCur?'2px solid var(--accent)':'1.5px solid var(--border2)'};
          font-size:${hasBon?'16px':'11px'};color:${hasBon?'white':isCur?'var(--accent)':'var(--text3)'}">
          ${hasBon?bonuses[0].emoji:m.replace('月','')}
        </div>
        <div style="font-size:9px;color:${hasBon?'var(--accent)':isCur?'var(--accent)':'var(--text3)'};margin-top:3px;font-weight:${hasBon||isCur?'700':'400'}">${m}</div>
        ${hasBon?`<div style="font-size:8px;color:var(--text2)">$${Math.round(bonuses.reduce((s,b)=>s+b.amount,0)/1000)}K</div>`:''}
      </div>`;
    }).join('')}
  </div>`;

  // Compact list
  const bc=document.getElementById('bonusCalendar'); if(!bc) return;
  bc.innerHTML=!sorted.length
    ?emptyState({emoji:'🎁',title:'還沒有獎金預期',sub:'預計年終、年中、三節獎金可事先設定',ctaLabel:'＋ 新增獎金預期',ctaOnClick:'openBonusModal()'})
    :sorted.map(b=>{
      const diff=b.month-mo;
      const isCur=diff===0; const isPast=diff<0;
      const label=isCur?'🎉 本月':(isPast?`${Math.abs(diff)}月前`:`${diff}月後`);
      const mode=b.mode||(b.includeInBudget===false?'savings':'budget');
      const modeBadge={budget:'<span class="record-tag" style="background:#ddd6fe;color:#F08A6B">📊 當月可用</span>',travel:'<span class="record-tag" style="background:#dbeafe;color:#2563eb">✈️ 旅遊額度</span>',savings:'<span class="record-tag" style="background:#fde9f2;color:#e8488a">🐷 存款</span>'}[mode]||'';
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:${isCur?'var(--accent3-light)':'var(--surface)'};border:1.5px solid ${isCur?'rgba(24,184,124,0.3)':'var(--border)'};border-radius:var(--r-sm);margin-bottom:7px;box-shadow:var(--shadow)">
        <div style="font-size:18px;flex-shrink:0">${b.emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.name} ${modeBadge}</div>
          <div style="font-size:10px;color:var(--text2)">${b.month}月${b.note?' · '+b.note:''}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:${isCur?'var(--accent3)':'var(--accent)'}">$${b.amount.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--text2);min-width:32px;text-align:right">${label}</div>
        <button onclick="editBonus(${b.id})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:0 2px" title="編輯">✏️</button>
        <button onclick="deleteBonus(${b.id})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px" title="刪除">✕</button>
      </div>`;
    }).join('');
}

// ── CONFIRM MODAL (replaces confirm()) ──
let _confirmCb=null;



// ── INVENTORY SYSTEM ──
// inventory: { [productId]: [{unitId, openedDate, usedDays}] }
// stock: { [productId]: count }  — how many sealed units
let inventory=JSON.parse(localStorage.getItem('btInventory')||'{}');
let stockCount=JSON.parse(localStorage.getItem('btStock')||'{}');

function getStock(pid){ return stockCount[pid]||0; }
function getOpenUnit(pid){ return (inventory[pid]||[]).find(u=>!u.finished); }

function saveInventory(){
  localStorage.setItem('btInventory',JSON.stringify(inventory));
  localStorage.setItem('btStock',JSON.stringify(stockCount));
  save(); // 同步 products（boughtDate 等）
}

function openInventoryModal(pid){
  const p=products.find(x=>x.id===pid);if(!p)return;
  document.getElementById('invModalTitle').textContent=`${p.emoji} 庫存管理`;
  renderInvModal(pid);
  document.getElementById('inventoryModalOverlay').classList.add('open');
}

function renderInvModal(pid){
  const p=products.find(x=>x.id===pid);if(!p)return;
  const stock=getStock(pid);
  const open=getOpenUnit(pid);
  const hist=(inventory[pid]||[]).filter(u=>u.finished).slice(-5).reverse();

  // 校正提示：歷史平均使用天數
  const finishedUnits=(inventory[pid]||[]).filter(u=>u.finished&&u.actualDays>0);
  const recent=finishedUnits.slice(-3);
  const avgDays=recent.length?Math.round(recent.reduce((s,u)=>s+u.actualDays,0)/recent.length):0;
  const calibrateBanner=(avgDays>0&&Math.abs(avgDays-p.totalDays)/p.totalDays>=0.25)?`
    <div style="background:linear-gradient(135deg,rgba(240,138,107,0.08),rgba(240,138,107,0.02));border:1px solid rgba(240,138,107,0.25);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:12px;display:flex;gap:10px;align-items:center">
      <div style="font-size:18px">📊</div>
      <div style="flex:1;font-size:11px;line-height:1.5">
        <div style="color:var(--accent);font-weight:600;margin-bottom:2px">建議校正使用週期</div>
        <div style="color:var(--text2)">近 ${recent.length} 罐平均 <strong style="color:var(--accent)">${avgDays} 天</strong>（目前設定 ${p.totalDays} 天）</div>
      </div>
      <button class="btn-sm primary" style="padding:6px 10px;font-size:11px;flex:0" onclick="applyAvgDays(${pid},${avgDays})">套用</button>
    </div>`:'';

  let html=`
    ${calibrateBanner}
    <!-- currently open unit -->
    <div style="background:var(--surface2);border-radius:var(--r);padding:14px;margin-bottom:14px;border:1.5px solid var(--border)">
      <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:10px">目前使用中${p.volume?` · 規格 ${p.volume}${p.unit||''}`:''}</div>
      ${open ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div>
            <div style="font-size:13px;font-weight:600">第 ${(inventory[pid]||[]).indexOf(open)+1} 罐</div>
            <div style="font-size:11px;color:var(--text2)">開封：${open.openedDate} · 預計 ${p.totalDays} 天</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:600;color:var(--accent3)">(剩 ${getDaysLeft(p)} 天)</div>
          </div>
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:11px;color:var(--text2);margin-bottom:4px">調整使用天數</div>
          <div style="display:flex;gap:8px">
            <input type="number" id="inv-days-${pid}" value="${p.totalDays}" class="form-input" style="flex:1"/>
            <button class="btn-sm primary" style="flex:0;padding:8px 14px" onclick="updateUseDays(${pid})">更新</button>
          </div>
        </div>
        <button class="btn-sm" style="width:100%;background:var(--danger-light);border-color:rgba(232,48,48,0.25);color:var(--danger)" onclick="finishUnit(${pid})">✓ 這罐用完了，開下一罐</button>
      ` : `<div style="text-align:center;color:var(--text3);padding:12px;font-size:13px">目前沒有開封的品項</div>`}
    </div>

    <!-- sealed stock -->
    <div style="background:var(--surface2);border-radius:var(--r);padding:14px;margin-bottom:14px;border:1.5px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px">封存庫存</div>
        <div style="font-family:'DM Mono',monospace;font-size:18px;font-weight:700;color:var(--accent)">${stock} 罐</div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px">
        <button class="btn-sm" onclick="adjustStock(${pid},-1)" style="flex:0;padding:8px 16px;font-size:16px">－</button>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px">
          ${Array.from({length:Math.min(stock,8)},()=>`<div style="width:20px;height:28px;background:var(--accent-light);border:1.5px solid var(--accent);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px">${p.emoji}</div>`).join('')}
          ${stock>8?`<span style="font-size:11px;color:var(--text2)">+${stock-8}</span>`:''}
          ${stock===0?`<span style="font-size:12px;color:var(--text3)">無庫存</span>`:''}
        </div>
        <button class="btn-sm primary" onclick="adjustStock(${pid},1)" style="flex:0;padding:8px 16px;font-size:16px">＋</button>
      </div>
      ${!open&&stock>0?`<button class="btn-sm primary" style="width:100%;margin-top:4px" onclick="openNewUnit(${pid})">📦 拆封使用</button>`:''}
      ${!open&&stock===0?`<button class="btn-sm restock" style="width:100%" onclick="closeModal('inventoryModalOverlay');markRestocked(${pid})">🛒 去補貨</button>`:''}
    </div>

    <!-- history -->
    ${hist.length?`
    <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:8px">使用歷史</div>
    ${hist.map((u,i)=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:6px 0;border-bottom:1px solid var(--border);color:var(--text2)">
      <span>第 ${(inventory[pid]||[]).indexOf(u)+1} 罐 · ${u.openedDate}</span>
      <span style="color:var(--accent3)">使用 ${u.actualDays||p.totalDays} 天</span>
    </div>`).join('')}`:''}
  `;
  document.getElementById('invModalContent').innerHTML=html;
}

function adjustStock(pid,delta){
  stockCount[pid]=(stockCount[pid]||0)+delta;
  if(stockCount[pid]<0)stockCount[pid]=0;
  saveInventory();renderInvModal(pid);renderProducts();
}

function openNewUnit(pid){
  const p=products.find(x=>x.id===pid);if(!p)return;
  const today=todayStr();
  if(!inventory[pid])inventory[pid]=[];
  inventory[pid].push({unitId:Date.now(),openedDate:today,finished:false});
  stockCount[pid]=Math.max(0,(stockCount[pid]||0)-1);
  p.boughtDate=today;
  saveInventory();renderInvModal(pid);renderProducts();
}

function finishUnit(pid){
  const p=products.find(x=>x.id===pid);if(!p)return;
  const open=getOpenUnit(pid);if(!open)return;
  const openedD=parseLocalDate(open.openedDate);
  open.finished=true;
  open.actualDays=Math.ceil((getNow()-openedD)/86400000);
  saveInventory();

  // 自動學習：用最近 3 罐（含這次）平均 actualDays 比對 totalDays，差 25%+ 提示更新
  const finishedUnits=(inventory[pid]||[]).filter(u=>u.finished&&u.actualDays>0);
  if(finishedUnits.length>=1){
    const recent=finishedUnits.slice(-3);
    const avg=Math.round(recent.reduce((s,u)=>s+u.actualDays,0)/recent.length);
    const diff=Math.abs(avg-p.totalDays)/p.totalDays;
    if(avg>0&&diff>=0.25){
      const dir=avg>p.totalDays?'比預期久':'比預期快';
      showConfirm(
        `📊 <strong>${p.emoji} ${p.name}</strong> 實際使用了 <strong>${open.actualDays} 天</strong><br>近 ${recent.length} 罐平均 ${avg} 天 ${dir}（目前設定 ${p.totalDays} 天）<br><span style="color:var(--text3);font-size:11px">是否將補貨週期校正為 ${avg} 天？</span>`,
        ()=>{
          p.totalDays=avg; save();
          if((stockCount[pid]||0)>0){ openNewUnit(pid); }
          else { renderInvModal(pid); renderProducts(); }
          showToast(`✓ 已校正為 ${avg} 天`,'ok');
        }
      );
      // 若用戶取消，仍要照原邏輯開下一罐 / 重繪（confirmOverlay 取消時不會 callback，所以這裡先繪一次）
      if((stockCount[pid]||0)>0){ openNewUnit(pid); } else { renderInvModal(pid); renderProducts(); }
      return;
    }
  }
  // 預設行為：自動開下一罐
  if((stockCount[pid]||0)>0){
    openNewUnit(pid);
  } else {
    renderInvModal(pid);renderProducts();
  }
}

function updateUseDays(pid){
  const p=products.find(x=>x.id===pid);if(!p)return;
  const val=parseInt(document.getElementById(`inv-days-${pid}`).value)||30;
  p.totalDays=val;save();renderInvModal(pid);renderProducts();
}

function applyAvgDays(pid, days){
  const p=products.find(x=>x.id===pid);if(!p||!days)return;
  p.totalDays=days; save();
  renderInvModal(pid); renderProducts();
  showToast(`✓ 已校正為 ${days} 天`,'ok');
}

// ── PRICE COMPARE ──
function openCompareModal(pid){
  const p=products.find(x=>x.id===pid);if(!p)return;
  document.getElementById('cmpTitle').textContent=`🛒 ${p.name}`;
  const q=encodeURIComponent((p.brand?p.brand+' ':'')+p.name);
  const lastPrice=p.price;
  const platforms=[
    { icon:'🛍', name:'蝦皮購物', key:'shopee', url:`https://shopee.tw/search?keyword=${q}` },
    { icon:'🟥', name:'momo購物', key:'momo',   url:`https://www.momoshop.com.tw/search/searchShop.jsp?keyword=${q}` },
    { icon:'🔵', name:'PChome',   key:'pchome', url:`https://search.pchome.com.tw/?q=${q}` },
    { icon:'🟡', name:'Yahoo購物',key:'yahoo',  url:`https://tw.buy.yahoo.com/search/product?p=${q}` },
    { icon:'📦', name:'博客來',   key:'books',  url:`https://search.books.com.tw/search/query/key/${q}` },
  ];
  const linkClass={'shopee':'shopee-l','momo':'momo-l','pchome':'pchome-l','yahoo':'shopee-l','books':'pchome-l'};
  document.getElementById('cmpContent').innerHTML=`
    <div style="background:var(--accent-light);border:1px solid rgba(240,138,107,0.2);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--accent);font-weight:500;line-height:1.5">
      💡 上次購買價格：<strong style="font-family:'DM Mono',monospace">$${lastPrice.toLocaleString()}</strong><br>
      點擊各平台按鈕搜尋，實際價格以各平台為準
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:0.8px;margin-bottom:10px">前往各平台搜尋比價</div>
    ${platforms.map(pl=>`
      <div class="compare-item" style="margin-bottom:4px">
        <div class="cmp-icon">${pl.icon}</div>
        <div class="cmp-info"><div class="cmp-name">${pl.name}</div></div>
        <button class="cmp-link ${linkClass[pl.key]||'search-l'}" style="width:auto;padding:8px 16px;margin:0"
          onclick="window.open('${escapeJS(pl.url)}','_blank')">前往搜尋 →</button>
      </div>
    `).join('')}
    <div style="margin-top:14px;padding:12px;background:var(--surface2);border-radius:var(--r-sm);font-size:11px;color:var(--text2);line-height:1.6">
      📝 找到好價格後，記得在「📈 價格記錄」裡更新，下次就能看到趨勢變化
    </div>
  `;
  document.getElementById('compareModalOverlay').classList.add('open');
}

// ── RECOMMEND BANNER（已合併進 renderHomeRestockSummary）──

// ── CARD ACTION MENU (••• button) ──
function openCardMenu(pid, e){
  e.stopPropagation();
  closeCardMenu();
  const p=products.find(x=>x.id===pid); if(!p) return;
  const histCount=getPriceHistory(pid).length;
  const rect=e.currentTarget.getBoundingClientRect();
  const overlay=document.createElement('div');
  overlay.className='card-menu-overlay';
  overlay.onclick=closeCardMenu;
  const menu=document.createElement('div');
  menu.className='card-menu'; menu.id='_cardMenu';
  menu.innerHTML=`
    <button class="card-menu-item" onclick="closeCardMenu();openRecordAndPrice(${pid})">📝 記錄購買${histCount>0?` (${histCount}筆價格記錄)`:''}</button>
    ${p.shopeeUrl?`<button class="card-menu-item" onclick="closeCardMenu();openShopee(${pid})">${p.shopeeUrl.includes('shopee')?'🛍 前往蝦皮':p.shopeeUrl.includes('momo')?'🔴 前往 momo':'🔗 前往補貨連結'}</button>`:''}
    <div style="height:1px;background:var(--border);margin:2px 0"></div>
    <button class="card-menu-item danger" onclick="closeCardMenu();deleteProduct(${pid})">🗑️ 刪除品項</button>
  `;
  const menuH=160, menuW=200;
  let top=rect.bottom+6, left=rect.right-menuW;
  if(top+menuH>window.innerHeight) top=rect.top-menuH-6;
  if(left<8) left=8;
  menu.style.top=top+'px'; menu.style.left=left+'px';
  document.body.appendChild(overlay);
  document.body.appendChild(menu);
}
function closeCardMenu(){
  document.getElementById('_cardMenu')?.remove();
  document.querySelector('.card-menu-overlay')?.remove();
}

// ── SWIPE GESTURE (inline, no patch) ──
function initSwipe(wrapEl, pid){
  const inner=wrapEl.querySelector('.swipe-inner');
  if(!inner) return;
  let startX=0,startY=0,curX=0,dragging=false,lockDir=null;
  const THRESHOLD=60,MAX=85;
  function onStart(x,y){ startX=x;startY=y;dragging=true;lockDir=null;curX=0;inner.style.transition='none'; }
  function onMove(x,y){
    if(!dragging)return;
    const dx=x-startX,dy=y-startY;
    if(!lockDir){if(Math.abs(dx)<6&&Math.abs(dy)<6)return;lockDir=Math.abs(dx)>Math.abs(dy)?'h':'v';}
    if(lockDir==='v')return;
    curX=Math.max(-MAX,Math.min(MAX,dx));
    inner.style.transform=`translateX(${curX}px)`;
  }
  function onEnd(){
    if(!dragging||lockDir!=='h'){dragging=false;return;}
    dragging=false;inner.style.transition='';
    if(curX<-THRESHOLD) inner.style.transform=`translateX(-${MAX}px)`;
    else if(curX>THRESHOLD) inner.style.transform=`translateX(${MAX}px)`;
    else inner.style.transform='translateX(0)';
    curX=0;
  }
  inner.addEventListener('touchstart',e=>onStart(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  inner.addEventListener('touchmove', e=>onMove(e.touches[0].clientX,e.touches[0].clientY),{passive:true});
  inner.addEventListener('touchend',  ()=>onEnd());
  // touchcancel: 來電/通知打斷時重置狀態
  inner.addEventListener('touchcancel',()=>{dragging=false;inner.style.transition='';inner.style.transform='translateX(0)';});
  wrapEl.querySelector('.swipe-bg-right')?.addEventListener('click',()=>{ inner.style.transform='translateX(0)'; deleteProduct(pid); });
  wrapEl.querySelector('.swipe-bg-left')?.addEventListener('click',()=>{ inner.style.transform='translateX(0)'; openCompareModal(pid); });
  inner.addEventListener('click',e=>{
    const t=inner.style.transform;
    if(t&&t!=='translateX(0px)'&&t!==''){e.stopPropagation();inner.style.transform='translateX(0)';}
  });
}

// ── APPLY SWIPE TO PRODUCT LIST ──
function applySwipeToProducts(){
  const list=document.getElementById('productList');
  if(!list) return;
  list.querySelectorAll('.product-card:not([data-swipe])').forEach(card=>{
    // read pid from data attribute instead of fragile onclick parsing
    const pid=parseInt(card.dataset.pid);
    if(!pid) return;
    card.setAttribute('data-swipe','1');
    const wrap=document.createElement('div');
    wrap.className='swipe-wrap';
    wrap.innerHTML='<div class="swipe-bg-left">✏️<span>比價</span></div><div class="swipe-bg-right">🗑️<span>刪除</span></div>';
    card.classList.add('swipe-inner');
    card.style.marginBottom='0';
    card.parentNode.insertBefore(wrap,card);
    wrap.appendChild(card);
    initSwipe(wrap,pid);
  });
}


// ── UNDO TOAST（軟刪除後 5 秒內可撤銷）──
let _undoTimer=null;
function showUndoToast(msg,undoCb,duration=5000){
  let t=document.getElementById('_undoToast');
  if(!t){ t=document.createElement('div'); t.id='_undoToast';
    t.style.cssText='position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:white;padding:10px 8px 10px 16px;border-radius:24px;font-size:13px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.35);max-width:320px;opacity:0;transition:opacity 0.2s';
    document.body.appendChild(t);
  }
  t.innerHTML=`<span style="flex:1">${msg}</span><button style="background:var(--accent3);color:white;border:none;padding:6px 14px;border-radius:16px;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit">↶ 復原</button>`;
  t.querySelector('button').onclick=()=>{ clearTimeout(_undoTimer); t.style.opacity='0'; undoCb&&undoCb(); };
  t.style.opacity='1';
  clearTimeout(_undoTimer);
  _undoTimer=setTimeout(()=>{ t.style.opacity='0'; },duration);
}

// ── TOAST (replaces alert() for non-destructive messages) ──
function showToast(msg,type='warn'){
  let t=document.getElementById('_toast');
  if(!t){ t=document.createElement('div'); t.id='_toast'; document.body.appendChild(t); }
  const icons={ok:'✅',error:'❌',warn:'⚠️',info:'ℹ️'};
  const icon=icons[type]||icons.warn;
  t.className='toast-'+(type in icons?type:'warn');
  // 移除既有訊息中重複的 emoji（避免雙 icon）
  const cleaned=String(msg).replace(/^[\u2705\u274C\u26A0\uFE0F\u2139\uFE0F\u2728\u{1F389}\u{1F44C}\u{1F4A1}]+\s*/u,'');
  t.innerHTML=`<span class="t-icon">${icon}</span><span class="t-msg"></span>`;
  t.querySelector('.t-msg').textContent=cleaned;
  // 強制 reflow 才能觸發 transition
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  // 觸覺回饋（支援的瀏覽器）
  if(type==='error') navigator.vibrate?.([12,40,12]);
  else if(type==='ok') navigator.vibrate?.(10);
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),2600);
}
// ── EMPTY STATE 元件：emptyState({emoji, title, sub, ctaLabel, ctaOnClick, accent}) ──
function emptyState(opts={}){
  const {emoji='📭',title='還沒有資料',sub='',ctaLabel='',ctaOnClick='',accent=false,cat=''}=opts;
  const cta=ctaLabel
    ? `<button class="es-cta${accent?' accent':''}" onclick="${escapeAttr(ctaOnClick)}">${escapeHTML(ctaLabel)}</button>`
    : '';
  // 🐱 互動貓咪 empty state
  const catBlock=cat==='sleeping'?sleepingCatsSvg():(cat==='box'?boxCatSvg(true):(cat==='pawcoin'?pawCoinSvg():''));
  return `<div class="empty-state${cat?' es-with-cat':''}">
    ${catBlock || `<div class="es-emoji">${emoji}</div>`}
    <div class="es-title">${escapeHTML(title)}</div>
    ${sub?`<div class="es-sub">${sub}</div>`:''}
    ${cta}
  </div>`;
}

// 🛌 兩隻睡覺的貓咪（empty state 裝飾）— 點擊驚醒
function sleepingCatsSvg(){
  return `<div class="sleeping-cats" onclick="wakeUpCats(this)" title="戳一下試試">
    <div class="sc-zzz sc-z1">Z</div>
    <div class="sc-zzz sc-z2">Z</div>
    <div class="sc-zzz sc-z3">Z</div>
    <svg viewBox="0 0 100 70" class="sc-svg" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="60" rx="45" ry="11" fill="rgba(255,255,255,0.85)"/>
      <g class="sc-breathe">
        <!-- 灰貓 -->
        <polygon points="35,40 28,25 42,32" fill="#6B5F52"/>
        <polygon points="50,38 60,22 62,35" fill="#6B5F52"/>
        <circle cx="48" cy="45" r="14" fill="#A89D8E"/>
        <path class="sc-eye-sleep" d="M40 45 Q43 48 46 45" stroke="#3A2A1F" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <path class="sc-eye-sleep" d="M50 45 Q53 48 56 45" stroke="#3A2A1F" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <circle class="sc-eye-awake" cx="43" cy="44" r="2.5" fill="#E5A234"/>
        <circle class="sc-eye-awake" cx="53" cy="44" r="2.5" fill="#E5A234"/>
        <!-- 橘貓 -->
        <ellipse cx="58" cy="55" rx="26" ry="13" fill="#FFB874"/>
        <path d="M45 50 Q58 42 72 52" stroke="#D27A3C" stroke-width="2" fill="none" opacity="0.5"/>
        <path d="M40 55 Q58 48 78 58" stroke="#D27A3C" stroke-width="2" fill="none" opacity="0.5"/>
        <circle cx="38" cy="54" r="12" fill="#FFB874"/>
        <polygon points="32,48 24,35 38,42" fill="#D27A3C"/>
        <polygon points="45,45 50,32 50,44" fill="#D27A3C"/>
        <path class="sc-eye-sleep" d="M32 54 Q35 57 38 54" stroke="#7A4F2F" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <path class="sc-eye-sleep" d="M40 54 Q43 57 46 54" stroke="#7A4F2F" stroke-width="1.5" stroke-linecap="round" fill="none"/>
        <circle class="sc-eye-awake" cx="35" cy="53" r="2.5" fill="#3A2A1F"/>
        <circle class="sc-eye-awake" cx="43" cy="53" r="2.5" fill="#3A2A1F"/>
        <ellipse cx="39" cy="58" rx="1.4" ry="1" fill="#FF9F8A"/>
      </g>
    </svg>
  </div>`;
}
function wakeUpCats(el){
  if(!el || el.classList.contains('is-awake')) return;
  el.classList.add('is-awake');
  if(navigator.vibrate) navigator.vibrate([20,30,20]);
  if(typeof playMeow==='function') playMeow();
  setTimeout(()=>el.classList.remove('is-awake'),2400);
}

// 📦 紙箱貓（小尺寸裝飾）— 點擊探頭
function boxCatSvg(big=false){
  const sz=big?72:42;
  return `<div class="box-cat" style="width:${sz}px;height:${sz}px" onclick="peekBoxCat(this)" title="戳一下">
    <svg viewBox="0 0 100 100" class="bc-svg" xmlns="http://www.w3.org/2000/svg">
      <g class="bc-head">
        <polygon points="35,45 25,25 50,40" fill="#3A2A1F"/>
        <polygon points="65,45 75,25 50,40" fill="#3A2A1F"/>
        <circle cx="50" cy="55" r="22" fill="#3A2A1F"/>
        <ellipse cx="40" cy="50" rx="3" ry="5" fill="#E5A234"/>
        <ellipse cx="60" cy="50" rx="3" ry="5" fill="#E5A234"/>
      </g>
      <polygon points="20,60 80,60 70,95 30,95" fill="#D27A3C"/>
      <polygon points="20,60 80,60 85,70 15,70" fill="#E5A234"/>
      <path d="M45 80 Q50 85 55 80" stroke="#7A4F2F" stroke-width="2" fill="none" opacity="0.6"/>
    </svg>
  </div>`;
}
function peekBoxCat(el){
  if(!el) return;
  el.classList.add('peek');
  if(navigator.vibrate) navigator.vibrate(40);
  if(typeof playMeow==='function') playMeow();
  setTimeout(()=>el.classList.remove('peek'),1500);
}
window.sleepingCatsSvg=sleepingCatsSvg; window.wakeUpCats=wakeUpCats;
window.boxCatSvg=boxCatSvg; window.peekBoxCat=peekBoxCat;

// 🪙 招財金幣肉球（收入頁無記錄空狀態）
function pawCoinSvg(){
  return `<div class="paw-coin" onclick="bumpPawCoin(this)" title="戳一下">
    <span class="pc-plus">+1</span>
    <svg viewBox="0 0 110 110" class="pc-svg" xmlns="http://www.w3.org/2000/svg">
      <g class="pc-coin">
        <circle cx="55" cy="32" r="24" fill="#FFD86B" stroke="#C28B1E" stroke-width="2"/>
        <circle cx="55" cy="32" r="18" fill="none" stroke="#C28B1E" stroke-width="1.5" stroke-dasharray="4 2"/>
        <text x="55" y="40" font-size="20" font-weight="900" fill="#C28B1E" text-anchor="middle">$</text>
      </g>
      <path d="M28 110 L34 64 Q34 44 55 44 Q76 44 76 64 L82 110 Z" fill="#FFFEF8" stroke="#E5DCC9" stroke-width="2"/>
      <ellipse cx="55" cy="74" rx="14" ry="9" fill="#FF9F8A"/>
      <ellipse cx="42" cy="58" rx="5" ry="6" fill="#FF9F8A"/>
      <ellipse cx="55" cy="52" rx="5" ry="6" fill="#FF9F8A"/>
      <ellipse cx="68" cy="58" rx="5" ry="6" fill="#FF9F8A"/>
    </svg>
  </div>`;
}
function bumpPawCoin(el){
  if(!el) return;
  const coin=el.querySelector('.pc-coin'); const plus=el.querySelector('.pc-plus');
  if(coin){ coin.classList.remove('pc-spin'); void coin.getBBox?.(); coin.classList.add('pc-spin'); }
  if(plus){ plus.classList.remove('pc-float'); void plus.offsetWidth; plus.classList.add('pc-float'); }
  if(navigator.vibrate) navigator.vibrate([30,50,30]);
  if(typeof playMeow==='function') playMeow();
}
window.pawCoinSvg=pawCoinSvg; window.bumpPawCoin=bumpPawCoin;

// 💰 揮手招財貓（設定頁角落）
function bumpLuckyCat(el){
  if(!el) return;
  el.classList.add('lc-bump');
  if(navigator.vibrate) navigator.vibrate(40);
  if(typeof playMeow==='function') playMeow();
  setTimeout(()=>el.classList.remove('lc-bump'),900);
}
window.bumpLuckyCat=bumpLuckyCat;
// ── SKELETON：skeletonList(count) 給載入中的清單佔位 ──
function skeletonList(count=3){
  return Array.from({length:count},()=>`<div class="skeleton skel-card"></div>`).join('');
}
window.emptyState=emptyState; window.skeletonList=skeletonList;

// ── Bug Fix: showConfirm 實作（先前被呼叫但未定義）──
function showConfirm(msg, okCb){
  let ov=document.getElementById('confirmOverlay');
  if(!ov){ console.error('confirmOverlay missing'); if(confirm(msg.replace(/<[^>]+>/g,''))) okCb&&okCb(); return; }
  document.getElementById('confirmMsg').innerHTML=msg;
  _confirmCb=okCb||null;
  const okBtn=document.getElementById('confirmOkBtn');
  // 以複製節點方式清掉舊 listener，避免重複綁定
  const newOk=okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk,okBtn);
  newOk.addEventListener('click',()=>{
    ov.classList.remove('open');
    if(typeof _confirmCb==='function') _confirmCb();
    _confirmCb=null;
  });
  // 點遮罩關閉
  ov.onclick=(e)=>{ if(e.target===ov){ ov.classList.remove('open'); _confirmCb=null; } };
  ov.classList.add('open');
}

// 三選項對話框：choices = [{label, style, onClick}]
function showChoice(title, msg, choices){
  const ov=document.getElementById('choiceOverlay');
  if(!ov) return;
  document.getElementById('choiceTitle').innerHTML=title;
  document.getElementById('choiceMsg').innerHTML=msg;
  const box=document.getElementById('choiceBtns');
  box.innerHTML='';
  choices.forEach(c=>{
    const btn=document.createElement('button');
    btn.className='btn-sm '+(c.style||'');
    btn.style.cssText='padding:11px;font-size:13px;width:100%';
    btn.innerHTML=c.label;
    btn.onclick=()=>{ ov.classList.remove('open'); if(typeof c.onClick==='function') c.onClick(); };
    box.appendChild(btn);
  });
  ov.onclick=(e)=>{ if(e.target===ov) ov.classList.remove('open'); };
  ov.classList.add('open');
}

// ── 💸 大額消費提示（現金問挪用存款 / 信用卡問分期）──
const LARGE_EXPENSE_THRESHOLD=5000;
function askLargeExpense(record){
  if(!record || !record.price || record.price<LARGE_EXPENSE_THRESHOLD) return;
  if(record.pay==='voucher') return; // 即享券不需要問
  // 旅遊類大額：先問是否獨立列為旅遊預算（不算入本月生活費）
  if(record.cat==='travel' && !record._travelBudget){
    showChoice(
      `✈️ 這是一筆大額旅遊消費 $${record.price.toLocaleString()}`,
      `「${record.name}」是否要<strong style="color:var(--accent2)">獨立列為旅遊預算</strong>？<br><span style="font-size:11px;color:var(--text3)">標記後此筆不會計入本月生活費 / 超支判斷，常用於用獎金或存款支付的旅遊</span>`,
      [
        {label:`✈️ 是，列為旅遊預算（不算當月超支）`, style:'primary', onClick:()=>markAsTravelBudget(record.id)},
        {label:`📊 不用，當作本月一般生活花費`, style:'', onClick:()=>askLargeExpenseInner(record)},
      ]
    );
    return;
  }
  askLargeExpenseInner(record);
}
function askLargeExpenseInner(record){
  const amt=record.price;
  if(record.pay==='cash'){
    const cashLeft=(typeof cashSavings!=='undefined'&&cashSavings.amount)?cashSavings.amount:0;
    showChoice(
      `💰 這是一筆大額消費 $${amt.toLocaleString()}`,
      `「${record.name}」是要從<strong style="color:var(--accent3)">存款</strong>支付，還是計入<strong style="color:var(--danger)">本月超支</strong>？<br><span style="font-size:11px;color:var(--text3)">目前現金存款：$${cashLeft.toLocaleString()}</span>`,
      [
        {label:`💎 從存款扣除（不算當月超支）<div style="font-size:10px;opacity:0.85;margin-top:2px">存款 $${cashLeft.toLocaleString()} → $${Math.max(0,cashLeft-amt).toLocaleString()}</div>`, style:'primary', onClick:()=>useSavingsForRecord(record.id)},
        {label:`📊 計入本月超支（保留為一般支出）`, style:'', onClick:()=>{ /* 不動 */ }},
      ]
    );
  } else if(record.pay==='card'){
    showChoice(
      `💳 這是一筆大額信用卡消費 $${amt.toLocaleString()}`,
      `「${record.name}」是否要做<strong style="color:var(--accent)">分期付款</strong>？<br><span style="font-size:11px;color:var(--text3)">分期會自動建立負債並列入每月固定支出</span>`,
      [
        {label:`💸 是，建立分期負債`, style:'primary', onClick:()=>openDebtFromExpense(record)},
        {label:`一次付清（不分期）`, style:'', onClick:()=>{ /* 不動 */ }},
      ]
    );
  }
}
function markAsTravelBudget(recordId){
  const r=records.find(x=>x.id===recordId);
  if(!r) return;
  r._travelBudget=true;
  save(); renderAll();
  showToast('✈️ 已列為旅遊預算（本筆不計入當月生活費）','ok');
}
function useSavingsForRecord(recordId){
  const r=records.find(x=>x.id===recordId);
  if(!r) return;
  if(typeof cashSavings==='undefined' || !cashSavings) return;
  const before=cashSavings.amount||0;
  cashSavings.amount=Math.max(0, before - r.price);
  r._fromSavings=true;
  if(!cashSavings.history) cashSavings.history=[];
  cashSavings.history.push({id:Date.now(),date:r.date||todayStr(),delta:-r.price,note:`挪用存款：${r.name}`,balance:cashSavings.amount});
  save(); renderAll();
  showToast(`💎 已從存款扣除 $${r.price.toLocaleString()}（餘 $${cashSavings.amount.toLocaleString()}）`,'ok');
}
let _debtSourceRecordId=null;
function openDebtFromExpense(record){
  if(typeof openDebtModal!=='function'){ showToast('找不到負債視窗','error'); return; }
  openDebtModal();
  _debtSourceRecordId=record.id; // 標記：saveDebt 後要刪掉原 record，避免重複計算
  // 預填欄位
  setTimeout(()=>{
    const setVal=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
    setVal('debt-name', record.name||'');
    setVal('debt-emoji', record.emoji||'💳');
    setVal('debt-total', record.price);
    setVal('debt-months', 12);
    setVal('debt-monthly', Math.ceil(record.price/12));
    setVal('debt-paid', 0);
    setVal('debt-day', 8);
    setVal('debt-note', `來自信用卡消費：${record.name}`);
    // 預設付款方式 = 信用卡
    const cardBtn=document.querySelector('#debtPaySelect [data-val="card"]');
    if(cardBtn && typeof selectDebtPay==='function') selectDebtPay(cardBtn);
    if(record.cardId){
      const sel=document.getElementById('debt-cardId');
      if(sel) sel.value=record.cardId;
    }
  },50);
  showToast('已預填分期資料，請確認月數與金額','warn');
}

// ── Bug Fix: 補獎金時間軸缺失函式 ──
function toggleBonusMonth(mNum){ openBonusDetail(mNum); }
function openBonusDetail(mNum){
  const list=bonusExpected.filter(b=>b.month===mNum);
  if(!list.length){ showToast('該月份暫無獎金','warn'); return; }
  const total=list.reduce((s,b)=>s+b.amount,0);
  const lines=list.map(b=>`• ${b.emoji} ${b.name} $${b.amount.toLocaleString()}`).join('\n');
  showToast(`${mNum}月獎金（合計 $${total.toLocaleString()}）\n${lines}`,'ok');
}

// ── 🌙 THEME (dark / light / auto) ──
function applyTheme(pref){
  const mql=window.matchMedia('(prefers-color-scheme: dark)');
  const actual=pref==='auto'?(mql.matches?'dark':'light'):pref;
  document.documentElement.setAttribute('data-theme',actual);
  document.querySelectorAll('#themeSwitch button').forEach(b=>
    b.classList.toggle('active',b.dataset.theme===pref));
}
function setTheme(pref){
  localStorage.setItem('btTheme',pref);
  applyTheme(pref);
  updateThemeCycleBtn(pref);
}
function updateThemeCycleBtn(pref){
  const btn=document.getElementById('themeCycleBtn');
  if(!btn) return;
  const map={auto:{icon:'🖥️',title:'目前：跟隨系統（點擊切換到 ☀️ 淺色）'},
             light:{icon:'☀️',title:'目前：淺色（點擊切換到 🌙 深色）'},
             dark:{icon:'🌙',title:'目前：深色（點擊切換到 🖥️ 系統）'}};
  const cur=map[pref]||map.auto;
  btn.textContent=cur.icon;
  btn.title=cur.title;
}
function cycleTheme(){
  const cur=localStorage.getItem('btTheme')||'auto';
  const next=cur==='auto'?'light':cur==='light'?'dark':'auto';
  setTheme(next);
}
function switchSetSub(name,btn){
  document.querySelectorAll('#settingsSubtabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.set-sub').forEach(s=>s.style.display='none');
  const target=document.getElementById('setSub-'+name);
  if(target) target.style.display='block';
  if(name==='data' && typeof renderBackupSettings==='function') renderBackupSettings();
}
function switchFixedSub(name,btn){
  document.querySelectorAll('#fixedSubtabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.fixed-sub').forEach(s=>s.style.display='none');
  const target=document.getElementById('fixedSub-'+name);
  if(target) target.style.display='block';
  if(name==='debt' && typeof renderDebts==='function') renderDebts();
}
(function initTheme(){
  const pref=localStorage.getItem('btTheme')||'auto';
  applyTheme(pref);
  setTimeout(()=>updateThemeCycleBtn(pref),0);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{
    if((localStorage.getItem('btTheme')||'auto')==='auto') applyTheme('auto');
  });
})();

// ── 📤 EXPORT / IMPORT DATA ──
const BACKUP_KEYS=['btProducts','btRecords','btCats','btFixed','btIncome','btBudget',
  'btLifeBudget','btFixedBudget','btPriceHistory','btConfirmed','btInventory','btStock',
  'btSalary','btBonus','btVouchers','btExtraIncome','btSavingGoal','btTheme',
  'btCreditCards','btCashSavings','btInvestments','btDebts','btInvoiceSeen','btLotteryNumbers'];
function exportData(){
  const data={__app:'life-tracker',__version:19,__exportedAt:new Date().toISOString()};
  BACKUP_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!==null) data[k]=v; });
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const d=new Date(); const ymd=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  a.href=url; a.download=`life-tracker-backup-${ymd}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast('✅ 已匯出備份檔','ok');
}
function importData(e){
  const file=e.target.files&&e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=(ev)=>{
    let data;
    try{ data=JSON.parse(ev.target.result); }
    catch{ showToast('JSON 解析失敗','error'); return; }
    if(data.__app!=='life-tracker'){
      showConfirm('此檔案不是本 App 的備份，仍要嘗試匯入？',()=>applyImport(data));
    } else applyImport(data);
  };
  reader.readAsText(file);
  e.target.value=''; // 允許重複選同檔
}
function applyImport(data){
  showConfirm('匯入會覆蓋目前所有資料，確定？',()=>{
    BACKUP_KEYS.forEach(k=>{
      if(Object.prototype.hasOwnProperty.call(data,k)) localStorage.setItem(k,data[k]);
    });
    showToast('✅ 匯入成功，重新載入...','ok');
    setTimeout(()=>location.reload(),600);
  });
}

// ── 💾 QUICK BACKUP (File System Access API) ──
// 把檔案 handle 存在 IndexedDB（localStorage 不能存 handle）
const IDB_NAME='lifeTrackerBackup', IDB_STORE='fsHandles';
function idbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(IDB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(IDB_STORE);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function idbSet(key,val){
  const db=await idbOpen();
  return new Promise((r,j)=>{
    const tx=db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put(val,key);
    tx.oncomplete=()=>r(); tx.onerror=()=>j(tx.error);
  });
}
async function idbGet(key){
  const db=await idbOpen();
  return new Promise((r,j)=>{
    const tx=db.transaction(IDB_STORE,'readonly');
    const req=tx.objectStore(IDB_STORE).get(key);
    req.onsuccess=()=>r(req.result); req.onerror=()=>j(req.error);
  });
}
async function idbDel(key){
  const db=await idbOpen();
  return new Promise((r,j)=>{
    const tx=db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete=()=>r(); tx.onerror=()=>j(tx.error);
  });
}

function getBackupMeta(){
  try{ return JSON.parse(localStorage.getItem('btBackupMeta')||'{}'); } catch{ return {}; }
}
function setBackupMeta(meta){
  localStorage.setItem('btBackupMeta',JSON.stringify(meta));
}
function getBackupDataStr(){
  const data={__app:'life-tracker',__version:19,__exportedAt:new Date().toISOString()};
  BACKUP_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!==null) data[k]=v; });
  return JSON.stringify(data,null,2);
}

// 是否支援 File System Access（Chrome/Edge 桌面有；手機/Safari/Firefox 沒有）
function supportsFSAccess(){
  return typeof window.showSaveFilePicker==='function';
}

async function pickBackupLocation(){
  if(!supportsFSAccess()){
    showToast('此瀏覽器不支援「記住位置」，改用一般下載','warn');
    return;
  }
  try{
    const d=new Date(); const ymd=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const handle=await window.showSaveFilePicker({
      suggestedName:`life-tracker-backup.json`,
      types:[{description:'JSON 備份檔',accept:{'application/json':['.json']}}]
    });
    await idbSet('backupFile',handle);
    const meta=getBackupMeta();
    meta.fileName=handle.name;
    setBackupMeta(meta);
    showToast('✓ 已設定備份位置，現在可一鍵備份','ok');
    renderBackupSettings();
    // 立刻寫一次
    await doWriteBackup(handle);
  } catch(e){
    if(e.name!=='AbortError') showToast('設定失敗：'+e.message,'error');
  }
}

async function clearBackupLocation(){
  await idbDel('backupFile');
  const meta=getBackupMeta(); delete meta.fileName; setBackupMeta(meta);
  showToast('已清除備份位置','ok');
  renderBackupSettings();
}

async function doWriteBackup(handle){
  // 確認仍有寫入權限
  const opts={mode:'readwrite'};
  let perm=await handle.queryPermission(opts);
  if(perm!=='granted') perm=await handle.requestPermission(opts);
  if(perm!=='granted') throw new Error('沒有寫入權限');
  const w=await handle.createWritable();
  await w.write(getBackupDataStr());
  await w.close();
  const meta=getBackupMeta();
  meta.lastBackupAt=new Date().toISOString();
  meta.lastBackupMethod='fs';
  setBackupMeta(meta);
}

async function quickBackup(){
  // 有記住檔案 → 直接覆寫
  try{
    const handle=await idbGet('backupFile');
    if(handle && supportsFSAccess()){
      await doWriteBackup(handle);
      showToast('✅ 已覆寫備份檔','ok');
      renderBackupReminder(); renderBackupSettings();
      return;
    }
  } catch(e){
    console.warn('quickBackup fs failed',e);
    showToast('覆寫失敗，改用下載：'+(e.message||''),'warn');
  }
  // 否則走傳統下載，並更新時間戳
  exportData();
  const meta=getBackupMeta();
  meta.lastBackupAt=new Date().toISOString();
  meta.lastBackupMethod='download';
  setBackupMeta(meta);
  renderBackupReminder(); renderBackupSettings();
}

// 原 exportData 不改，但在成功後也更新時間戳
const _origExportData=exportData;
exportData=function(){
  _origExportData();
  const meta=getBackupMeta();
  meta.lastBackupAt=new Date().toISOString();
  if(!meta.lastBackupMethod) meta.lastBackupMethod='download';
  setBackupMeta(meta);
  renderBackupReminder();
};

function daysSinceBackup(){
  const meta=getBackupMeta();
  if(!meta.lastBackupAt) return null;
  const diff=Date.now()-new Date(meta.lastBackupAt).getTime();
  return Math.floor(diff/(24*3600*1000));
}

function renderBackupReminder(){
  const el=document.getElementById('backupReminder'); if(!el) return;
  const meta=getBackupMeta();
  const freq=meta.reminderDays??14; // 預設 14 天
  if(freq===0){ el.style.display='none'; return; }
  const days=daysSinceBackup();
  // 從未備份且已用一段時間
  const hasData=(JSON.parse(localStorage.getItem('btRecords')||'[]')).length>5;
  if(days===null && !hasData){ el.style.display='none'; return; }
  const shouldShow=(days===null && hasData) || (days!==null && days>=freq);
  if(!shouldShow){ el.style.display='none'; return; }
  const msg=days===null?'還沒備份過資料':`已 ${days} 天沒備份`;
  el.style.display='block';
  el.innerHTML=`
    <div style="background:linear-gradient(135deg,#fff4e1,#fef9f0);border:1.5px solid #f0c674;border-radius:var(--r-md);padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="goBackupSettings()">
      <div style="font-size:20px">💾</div>
      <div style="flex:1;font-size:12px;line-height:1.5">
        <div style="font-weight:700;color:#c47a00">${msg}</div>
        <div style="color:var(--text2);font-size:11px;margin-top:2px">點此一鍵備份</div>
      </div>
      <button class="btn-sm primary" style="padding:6px 12px;font-size:11px" onclick="event.stopPropagation();quickBackup()">⚡ 備份</button>
    </div>`;
}

function goBackupSettings(){
  navTab('settings');
  setTimeout(()=>{
    const btn=Array.from(document.querySelectorAll('.set-tabs button')).find(b=>b.textContent.includes('資料'));
    if(btn) btn.click();
  },50);
}

function openBackupSettings(){
  renderBackupSettings();
  document.getElementById('backupSettingsOverlay').classList.add('open');
}

function renderBackupSettings(){
  const meta=getBackupMeta();
  // 位置資訊
  const locEl=document.getElementById('backupLocInfo');
  if(locEl){
    if(!supportsFSAccess()){
      locEl.innerHTML=`<div style="color:var(--text3)">⚠️ 此瀏覽器不支援「記住位置」功能<br>請用桌面版 Chrome / Edge，或使用「📤 下載 JSON」</div>`;
    } else if(meta.fileName){
      locEl.innerHTML=`📄 <strong>${meta.fileName}</strong><br><span style="color:var(--text3);font-size:11px">每次備份會直接覆寫這個檔案</span>`;
    } else {
      locEl.innerHTML=`<span style="color:var(--text3)">尚未選擇，點「📂 選擇檔案」設定</span>`;
    }
  }
  // 提醒頻率按鈕
  const freqEl=document.getElementById('backupFreqBtns');
  if(freqEl){
    const current=meta.reminderDays??14;
    const opts=[{v:0,l:'關閉'},{v:7,l:'7 天'},{v:14,l:'14 天'},{v:30,l:'30 天'}];
    freqEl.innerHTML=opts.map(o=>{
      const sel=o.v===current;
      return `<button class="btn-sm${sel?' primary':''}" style="flex:1;padding:8px 6px;font-size:12px" onclick="setBackupFreq(${o.v})">${o.l}</button>`;
    }).join('');
  }
  // 歷史
  const histEl=document.getElementById('backupHistory');
  if(histEl){
    const days=daysSinceBackup();
    const lastStr=meta.lastBackupAt
      ?`${new Date(meta.lastBackupAt).toLocaleString('zh-TW',{hour12:false})} <span style="color:var(--text3)">(${days} 天前)</span>`
      :'<span style="color:var(--text3)">從未備份</span>';
    const methodMap={fs:'⚡ 一鍵覆寫',download:'📤 下載'};
    histEl.innerHTML=`
      <div>📅 最後備份：${lastStr}</div>
      <div>🔧 方式：${methodMap[meta.lastBackupMethod]||'—'}</div>
      <div>💾 資料大小：${Math.round(getBackupDataStr().length/1024)} KB</div>`;
  }
  // 設定頁卡片
  const card=document.getElementById('backupStatusCard');
  if(card){
    const days=daysSinceBackup();
    if(days===null){
      card.style.background='#fff4e1'; card.style.color='#c47a00';
      card.innerHTML='💾 <strong>從未備份</strong>　建議先選一個備份位置';
    } else if(days>=30){
      card.style.background='#ffe4e4'; card.style.color='#b93838';
      card.innerHTML=`⚠️ <strong>已 ${days} 天沒備份</strong>　強烈建議馬上備份`;
    } else if(days>=14){
      card.style.background='#fff4e1'; card.style.color='#c47a00';
      card.innerHTML=`⏰ 已 ${days} 天沒備份`;
    } else {
      card.style.background='#e3f7e5'; card.style.color='#2d7d3a';
      card.innerHTML=`✅ ${days===0?'今天':days+' 天前'}剛備份過`;
    }
  }
  const hintEl=document.getElementById('backupHint');
  if(hintEl){
    if(!supportsFSAccess()){
      hintEl.innerHTML='💡 此瀏覽器不支援一鍵覆寫，每次都會下載新檔案';
    } else if(meta.fileName){
      hintEl.innerHTML=`💡 會覆寫：<strong>${meta.fileName}</strong>`;
    } else {
      hintEl.innerHTML='💡 先按「⚙️ 備份設定」選擇檔案位置，之後就能一鍵覆寫';
    }
  }
}

function setBackupFreq(days){
  const meta=getBackupMeta();
  meta.reminderDays=days;
  setBackupMeta(meta);
  renderBackupSettings();
  renderBackupReminder();
  showToast(days===0?'已關閉提醒':`已設定為每 ${days} 天提醒`,'ok');
}

// ── ⌨️ ESC 關閉最上層 modal ──
document.addEventListener('keydown',(e)=>{
  if(e.key!=='Escape') return;
  // 關卡片選單
  if(document.getElementById('_cardMenu')){ closeCardMenu(); return; }
  // 關 FAB
  if(fabOpen){ closeFab(); return; }
  // 關最後開啟的 modal
  const opens=document.querySelectorAll('.modal-overlay.open');
  if(opens.length){ opens[opens.length-1].classList.remove('open'); }
});

// ── 📅 FIXED mini calendar ──
function renderFixedCalendar(){
  const el=document.getElementById('fixedCalendar');
  if(!el) return;
  const now=getNow();
  const year=now.getFullYear(), month=now.getMonth(); // 0-indexed
  const today=now.getDate();
  const firstDow=new Date(year,month,1).getDay(); // 0=Sun
  const daysInMonth=new Date(year,month+1,0).getDate();
  const monthlyFx=fixedExpenses.filter(f=>f.cycle==='monthly');
  // 依日期分組
  const byDay={};
  monthlyFx.forEach(f=>{
    const d=Math.min(f.day,daysInMonth);
    (byDay[d]=byDay[d]||[]).push(f);
  });
  const dow=['日','一','二','三','四','五','六'];
  window._fxByDay=byDay;
  let cells='';
  for(let i=0;i<firstDow;i++) cells+=`<div class="mini-cal-cell empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const fxs=byDay[d]||[];
    const hasFx=fxs.length>0;
    const allConfirmed=hasFx&&fxs.every(f=>isConfirmed(f.id));
    const isSoon=hasFx&&!allConfirmed&&d>=today&&d-today<=5;
    const cls=['mini-cal-cell'];
    if(d===today) cls.push('today');
    if(hasFx) cls.push('has-fx');
    if(allConfirmed) cls.push('done');
    else if(isSoon) cls.push('soon');
    const dataAttr=hasFx?`data-fx-day="${d}"`:'';
    cells+=`<div class="${cls.join(' ')}" ${dataAttr}>${d}${hasFx?`<span class="fx-dot"></span>`:''}</div>`;
  }
  const total=monthlyFx.reduce((s,f)=>s+f.amount,0);
  const doneCount=monthlyFx.filter(f=>isConfirmed(f.id)).length;
  el.innerHTML=`<div class="mini-cal">
    <div class="mini-cal-head">
      <div>
        <div class="mini-cal-title">📅 ${year}年${month+1}月 扣款日</div>
        <div class="mini-cal-sub">共 ${monthlyFx.length} 項 · 已確認 ${doneCount}/${monthlyFx.length} · 合計 $${total.toLocaleString()}</div>
      </div>
    </div>
    <div class="mini-cal-grid">
      ${dow.map(d=>`<div class="mini-cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    <div class="mini-cal-legend">
      <span><span class="dot" style="background:var(--fixed-light);border:1px solid var(--fixed)"></span>未確認</span>
      <span><span class="dot" style="background:var(--warn-light);border:1px solid var(--warn)"></span>5日內</span>
      <span><span class="dot" style="background:var(--accent3-light);border:1px solid var(--accent3)"></span>已確認</span>
      <span><span class="dot" style="border:1.5px solid var(--accent)"></span>今日</span>
    </div>
  </div>`;
  // 委派點擊
  el.querySelector('.mini-cal-grid')?.addEventListener('click',(ev)=>{
    const cell=ev.target.closest('.mini-cal-cell[data-fx-day]'); if(!cell) return;
    const day=+cell.dataset.fxDay; const fxs=(window._fxByDay||{})[day]||[]; if(!fxs.length) return;
    const lines=fxs.map(f=>(isConfirmed(f.id)?'✓ ':'○ ')+f.emoji+' '+f.name+' $'+f.amount.toLocaleString()).join('\n');
    showToast(`${day}號扣款\n${lines}`,'ok');
  });
}
// 掛鉤：原 renderFixed 不動，透過 MutationObserver 不必要，改為在 renderFixed 執行時呼叫
const _origRenderFixed=renderFixed;
renderFixed=function(){ _origRenderFixed(); renderFixedCalendar(); };

// ── 📊 CAT BREAKDOWN drill-down ──
const CAT_FILTER_MAP={
  __fixed:'fixed',
  food:'life',social:'life',clothing:'life',transport:'life',entertainment:'life',travel:'life',medical:'life'
};
function filterRecordsByCat(catId){
  const sel=document.getElementById('recordFilterCat');
  if(!sel) return;
  // __fixed → fixed; life cats → life; 其餘（健保/保養/日用品）→ var
  const newFilter=CAT_FILTER_MAP[catId]||'var';
  sel.value=newFilter;
  // sync filter chip active state
  document.querySelectorAll('#recordFilterChips .chip').forEach(b=>{
    b.classList.toggle('active', b.dataset.val===newFilter);
  });
  recordsCatFilter=catId; // 更細：再依 cat id 過濾
  recordsVisible=RECORDS_PAGE_SIZE;
  renderRecords();
  // 滾到明細列表
  document.getElementById('recordList')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function clearCatDrilldown(){
  recordsCatFilter=null;
  recordsVisible=RECORDS_PAGE_SIZE;
  renderRecords();
}

// ── 🧾 RECORDS pagination ──
const RECORDS_PAGE_SIZE=30;
let recordsVisible=RECORDS_PAGE_SIZE;
let recordsCatFilter=null;
function loadMoreRecords(){
  recordsVisible+=RECORDS_PAGE_SIZE;
  renderRecords();
}
// 包裝 renderRecords：分頁 + 下鑽 filter + cat-item 可點
const _origRenderRecords=renderRecords;
renderRecords=function(){
  _origRenderRecords();
  // 在 cat-breakdown 項目加上 data + click
  const catBd=document.getElementById('catBreakdown');
  if(catBd){
    Array.from(catBd.children).forEach(node=>{
      const name=node.querySelector('.ci-name')?.textContent||'';
      node.classList.toggle('active',recordsCatFilter&&(name.includes(catById(recordsCatFilter).label)||(recordsCatFilter==='__fixed'&&name.includes('固定'))));
    });
    // 用事件委派（避免重覆綁）
    if(!catBd._bound){
      catBd._bound=true;
      catBd.addEventListener('click',(e)=>{
        const item=e.target.closest('.cat-item'); if(!item) return;
        const name=item.querySelector('.ci-name')?.textContent||'';
        // 反查 id
        const fromCats=categories.find(c=>name.includes(c.label));
        let id=null;
        if(fromCats) id=fromCats.id;
        else if(name.includes('固定')) id='__fixed';
        else {
          const m={餐飲:'food',社交:'social',治裝:'clothing',交通:'transport',娛樂:'entertainment',旅遊:'travel',保健:'health',醫藥保健:'medical',保養:'skin',日用品:'daily'};
          id=Object.keys(m).find(k=>name.includes(k));
          if(id) id=m[id];
        }
        if(!id) return;
        if(recordsCatFilter===id) clearCatDrilldown(); else filterRecordsByCat(id);
      });
    }
  }
  // 套用下鑽 + 分頁
  const list=document.getElementById('recordList');
  if(!list) return;
  const items=Array.from(list.children);
  // 下鑽：隱藏不符合 cat 的列（但「本月無消費記錄」那種 placeholder 保留）
  if(recordsCatFilter){
    items.forEach(node=>{
      const recId=(node.id||'').replace('rec-','');
      // 尋找原始 record 以比對 cat
      let r=records.find(x=>String(x.id)===recId);
      if(!r && recId.startsWith('fx')){
        // 固定支出列
        if(recordsCatFilter==='__fixed') return;
        node.style.display='none'; return;
      }
      if(!r) return;
      if(recordsCatFilter==='__fixed'){ node.style.display='none'; return; }
      node.style.display=(r.cat===recordsCatFilter||
        (recordsCatFilter==='life'&&r.type==='life'))?'':'none';
    });
  }
  // 分頁
  const visibleItems=items.filter(n=>n.style.display!=='none');
  visibleItems.forEach((n,i)=>{ if(i>=recordsVisible) n.style.display='none'; });
  // 載入更多按鈕
  document.getElementById('_loadMoreBtn')?.remove();
  document.getElementById('_clearDrillBtn')?.remove();
  if(recordsCatFilter){
    const clearBtn=document.createElement('button');
    clearBtn.id='_clearDrillBtn';
    clearBtn.className='load-more-btn';
    clearBtn.textContent=`✕ 清除分類篩選（${catById(recordsCatFilter).label||recordsCatFilter}）`;
    clearBtn.onclick=clearCatDrilldown;
    list.parentNode.insertBefore(clearBtn,list);
  }
  if(visibleItems.length>recordsVisible){
    const btn=document.createElement('button');
    btn.id='_loadMoreBtn';
    btn.className='load-more-btn';
    btn.textContent=`📜 載入更多（還有 ${visibleItems.length-recordsVisible} 筆）`;
    btn.onclick=loadMoreRecords;
    list.appendChild(btn);
  }
};

// 切月份時重設分頁
const _origChangeRecordMonth=changeRecordMonth;
changeRecordMonth=function(d){ recordsVisible=RECORDS_PAGE_SIZE; recordsCatFilter=null; _origChangeRecordMonth(d); };

// ── 🔔 PWA: Service Worker 已改由 index.html 註冊外部 sw.js（HTTPS GitHub Pages 有 manifest.json + sw.js + icons）；保留此處為 no-op 避免 blob: SW 註冊失敗噴錯 ──
(function registerSW(){
  // intentionally empty — see <script> in index.html for `navigator.serviceWorker.register('sw.js')`
})();

// 👋 ONBOARDING（首次使用引導）
const ONB_STEPS=[
  {key:'welcome',title:'快速設定 3 件事',desc:'預算 → 收入 → 起始現金。隨時可在「⚙️ 設定」修改。'},
  {key:'budget',title:'每月預算上限',desc:'分三類管理花費（可填 0 略過）',inputs:[
    {id:'onbVar',label:'🛍 採購預算（保健品/保養品）',ph:'例：8000',type:'number'},
    {id:'onbLife',label:'💸 生活預算（餐飲/娛樂/交通）',ph:'例：8000',type:'number'},
    {id:'onbFix',label:'💳 固定支出預算（訂閱/房租）',ph:'例：8000',type:'number'}
  ]},
  {key:'income',title:'每月主業薪資',desc:'用來計算可支配金額與儲蓄目標（可略過稍後再設）',inputs:[
    {id:'onbSalary',label:'💵 主業淨收入（NT$）',ph:'例：53000',type:'number'},
    {id:'onbSaveRate',label:'🎯 每月想存（佔薪資 %）',ph:'例：10',type:'number'}
  ]},
  {key:'cash',title:'目前可動用現金',desc:'活存 + 現金 + 未投資 USDT，存款頁面會以此為起點',inputs:[
    {id:'onbCash',label:'💰 起始現金存款（NT$，可略過）',ph:'例：120000',type:'number'}
  ]},
  {key:'ai',title:'🤖 啟用 AI 辨識（強烈推薦）',desc:'貼上薪資單、訂單截圖、發票中獎號碼，AI 自動填好欄位。Google Gemini 提供免費額度，幾分鐘就能申請。',inputs:[
    {id:'onbGemini',label:'🔑 Gemini API Key（可略過）',ph:'AIza... 貼上即可',type:'text'}
  ]},
  {key:'done',title:'完成！',desc:'右下角 ＋ 按鈕可快速記帳。建議：定期到 ⚙️ → 📊 資料 一鍵備份。'}
];
let _onbStep=0;
function shouldShowOnboarding(){
  if(localStorage.getItem('btOnboarded')==='1') return false;
  // 已有資料就視為老用戶，不打擾
  const hasData=(records&&records.length>0)
    || (salaryRecords&&salaryRecords.length>0)
    || monthlyBudget>0 || lifeBudget>0
    || (typeof fixedBudget!=='undefined'&&fixedBudget>0)
    || (cashSavings&&cashSavings.amount>0);
  if(hasData){ localStorage.setItem('btOnboarded','1'); return false; }
  return true;
}
function renderOnboardBanner(){
  const el=document.getElementById('onboardBanner');
  if(!el) return;
  // 條件：未引導 或 (引導過但預算/收入仍空)
  const noBudget=!monthlyBudget && !lifeBudget && (typeof fixedBudget==='undefined'||!fixedBudget);
  const noIncome=!salaryRecords||!salaryRecords.length;
  const notDone=localStorage.getItem('btOnboarded')!=='1';
  const hint=document.getElementById('onboardBannerHint');
  if(notDone){
    if(hint) hint.textContent='30 秒設定預算與收入，APP 會幫你算好可用餘額';
    el.style.display='block';
  } else if(noBudget && noIncome){
    if(hint) hint.textContent='尚未設定預算與收入，點此重新引導';
    el.style.display='block';
  } else {
    el.style.display='none';
  }
}
function startOnboarding(){
  _onbStep=0;
  renderOnboardStep();
  document.getElementById('onboardOverlay').classList.add('open');
}
function renderOnboardStep(){
  const step=ONB_STEPS[_onbStep];
  // 進度條
  document.getElementById('onbProgress').innerHTML=ONB_STEPS.map((_,i)=>
    `<div style="flex:1;height:3px;border-radius:2px;background:${i<=_onbStep?'#fff':'rgba(255,255,255,0.3)'}"></div>`
  ).join('');
  // 內容
  let html=`<div style="font-size:15px;font-weight:700;margin-bottom:6px">${step.title}</div>
    <div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:14px">${step.desc}</div>`;
  if(step.inputs){
    html+=step.inputs.map(f=>`
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label" style="font-size:11px">${f.label}</label>
        <input class="form-input" id="${f.id}" type="${f.type}" placeholder="${f.ph}"/>
      </div>`).join('');
  }
  if(step.key==='welcome'){
    html+=`<div style="background:var(--bg2);border-radius:12px;padding:12px;font-size:11px;line-height:1.8;color:var(--text2)">
      <div>📊 自動分類採購／生活／固定支出</div>
      <div>💱 多幣別記帳（USDT、JPY、EUR...）</div>
      <div>📷 AI 辨識發票 / 螢幕截圖 / QR Code</div>
      <div>🏦 每月儲蓄達成率追蹤</div>
      <div>💾 一鍵備份到 Google Drive / iCloud 同步資料夾</div>
    </div>`;
  }
  if(step.key==='ai'){
    html+=`<div style="background:linear-gradient(135deg,#F08A6B,#E5A234);color:#fff;border-radius:12px;padding:12px 14px;font-size:11px;line-height:1.7;margin-bottom:10px">
      <div style="font-weight:700;margin-bottom:4px">📌 申請步驟（約 1 分鐘）</div>
      <div>1. 點下方藍色連結 → 用 Google 帳號登入</div>
      <div>2. 點「Create API Key」→ 選擇任一專案</div>
      <div>3. 複製 AIza... 開頭的金鑰，貼回上方欄位</div>
    </div>
    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style="display:block;text-align:center;background:var(--accent);color:#fff;padding:10px;border-radius:10px;text-decoration:none;font-weight:700;font-size:12px;margin-bottom:8px">🚀 前往免費申請 Gemini API Key</a>
    <div style="font-size:10px;color:var(--text3);text-align:center;line-height:1.6">💡 Gemini Flash 免費額度：每分鐘 15 次、每日 1,500 次<br>金鑰僅儲存於此裝置，不會上傳</div>`;
  }
  if(step.key==='done'){
    html+=`<div style="text-align:center;padding:14px 0;font-size:48px">🎉</div>
      <div style="background:var(--accent3-light);color:var(--accent3);border-radius:12px;padding:10px 12px;font-size:11px;line-height:1.6;text-align:center">
        所有設定完成！按下方「開始記帳」進入主畫面。
      </div>`;
  }
  document.getElementById('onbBody').innerHTML=html;
  // restore 上次輸入
  if(step.inputs){
    step.inputs.forEach(f=>{
      const el=document.getElementById(f.id);
      if(el && _onbCache[f.id]!=null) el.value=_onbCache[f.id];
    });
  }
  // 按鈕
  const back=document.getElementById('onbBack');
  const next=document.getElementById('onbNext');
  back.style.visibility=_onbStep===0?'hidden':'visible';
  if(_onbStep===ONB_STEPS.length-1){
    next.textContent='✓ 開始記帳';
  } else if(_onbStep===0){
    next.textContent='開始設定 →';
  } else {
    next.textContent='下一步 →';
  }
}
const _onbCache={};
function onboardCacheCurrent(){
  const step=ONB_STEPS[_onbStep];
  if(!step.inputs) return;
  step.inputs.forEach(f=>{
    const el=document.getElementById(f.id);
    if(el) _onbCache[f.id]=el.value;
  });
}
function onboardBack(){
  onboardCacheCurrent();
  if(_onbStep>0){ _onbStep--; renderOnboardStep(); }
}
function onboardNext(){
  onboardCacheCurrent();
  if(_onbStep<ONB_STEPS.length-1){
    _onbStep++; renderOnboardStep();
  } else {
    finishOnboarding();
  }
}
function skipOnboard(){
  localStorage.setItem('btOnboarded','1');
  document.getElementById('onboardOverlay').classList.remove('open');
}
function finishOnboarding(){
  // 套用設定
  const v=k=>parseInt(_onbCache[k])||0;
  const varB=v('onbVar'), lifeB=v('onbLife'), fixB=v('onbFix');
  if(varB>0){ monthlyBudget=varB; localStorage.setItem('btMonthlyBudget',varB.toString()); }
  if(lifeB>0){ lifeBudget=lifeB; localStorage.setItem('btLifeBudget',lifeB.toString()); }
  if(fixB>0 && typeof fixedBudget!=='undefined'){ fixedBudget=fixB; localStorage.setItem('btFixedBudget',fixB.toString()); }

  const sal=v('onbSalary');
  if(sal>0){
    const today=new Date();
    const y=today.getFullYear(), m=today.getMonth();
    if(typeof salaryRecords!=='undefined'){
      // 避免重複
      if(!salaryRecords.find(s=>s.year===y&&s.month===m)){
        salaryRecords.push({id:Date.now(),year:y,month:m,netPay:sal,gross:sal,bonus:0,fields:[],payDay:25});
      }
    }
  }
  const rate=v('onbSaveRate');
  if(rate>0 && rate<=100){
    if(typeof savingsTarget!=='undefined'){
      savingsTarget.mode='percent';
      savingsTarget.percent=rate;
      localStorage.setItem('btSavingsTarget',JSON.stringify(savingsTarget));
    }
  }
  const cash=v('onbCash');
  if(cash>0){
    if(typeof cashSavings!=='undefined'){
      cashSavings.amount=cash;
      if(!cashSavings.history) cashSavings.history=[];
      cashSavings.history.push({date:todayStr(),delta:cash,amount:cash,note:'初始設定'});
      localStorage.setItem('btCashSavings',JSON.stringify(cashSavings));
    }
  }
  // 儲存 Gemini API Key
  const gKey=(_onbCache['onbGemini']||'').trim();
  if(gKey && /^AIza[\w-]{20,}$/.test(gKey)){
    localStorage.setItem('btGeminiKey',gKey);
    localStorage.setItem('btAiProvider','gemini');
    if(typeof aiProvider!=='undefined') aiProvider='gemini';
  }
  if(typeof save==='function') save();
  if(typeof recomputeMonthlyIncome==='function') recomputeMonthlyIncome();
  localStorage.setItem('btOnboarded','1');
  document.getElementById('onboardOverlay').classList.remove('open');
  if(typeof renderAll==='function') renderAll();
  showToast('🎉 設定完成！開始記帳吧','ok');
  // 接著彈出功能巡禮（首次完成才自動跳）
  if(!localStorage.getItem('btTourSeen')){
    setTimeout(()=>{ startTour(); }, 600);
  }
}

// 📖 QUICK TOUR（功能巡禮：4 步介紹核心 UI）
const TOUR_STEPS=[
  {emoji:'🏠',title:'本月概況一眼看完',desc:'首頁顯示本月可用餘額、預算進度、補貨重點與最近交易。所有數字都會自動計算，不用手動加總。'},
  {emoji:'➕',title:'右下角＋＝快速記帳',desc:'點擊右下角紫色 ＋ 按鈕，可記錄花費、補貨購買、收入薪資、外幣消費。AI 也能自動辨識訂單截圖、發票 QR Code。'},
  {emoji:'📅',title:'底部 5 個分頁',desc:'<b>主頁</b>看總覽 / <b>記錄</b>看明細並可批次編輯 / <b>固定</b>管訂閱與信用卡 / <b>收入</b>記薪資與儲蓄 / <b>⋯</b>是補貨、設定、負債等更多功能。'},
  {emoji:'🤖',title:'善用 AI 與備份',desc:'⚙️ 設定 → 🤖 AI 可開啟 Claude / Gemini 自動分類；⚙️ 設定 → 📊 資料 可一鍵備份匯出，建議定期執行。'},
];
let _tourStep=0;
function startTour(){
  _tourStep=0;
  renderTourStep();
  document.getElementById('tourOverlay').classList.add('open');
}
function renderTourStep(){
  const s=TOUR_STEPS[_tourStep]; if(!s) return;
  const isLast=_tourStep===TOUR_STEPS.length-1;
  const dots=TOUR_STEPS.map((_,i)=>`<div style="width:6px;height:6px;border-radius:50%;background:${i===_tourStep?'var(--accent)':'var(--border2)'}"></div>`).join('');
  document.getElementById('tourBody').innerHTML=`
    <div style="display:flex;justify-content:center;gap:6px;margin-bottom:14px">${dots}</div>
    <div style="text-align:center;font-size:48px;margin-bottom:10px">${s.emoji}</div>
    <div style="font-size:16px;font-weight:700;text-align:center;margin-bottom:8px">${s.title}</div>
    <div style="font-size:12px;color:var(--text2);line-height:1.7;text-align:center">${s.desc}</div>`;
  document.getElementById('tourNextBtn').textContent=isLast?'✓ 開始使用':'下一個 →';
}
function tourNext(){
  if(_tourStep<TOUR_STEPS.length-1){
    _tourStep++; renderTourStep();
  } else {
    closeTour();
    localStorage.setItem('btTourSeen','1');
    showToast('🎉 巡禮完成，開始記帳吧！','ok');
  }
}
function closeTour(){
  document.getElementById('tourOverlay').classList.remove('open');
  localStorage.setItem('btTourSeen','1');
}

// Fix file input for mobile — handled by label+onchange
// Ensure full DOM is ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    if(typeof recomputeMonthlyIncome==='function') recomputeMonthlyIncome();
    if(typeof runPaydayAutomations==='function') runPaydayAutomations();
    renderAll();
    if(typeof applyPrivacyMode==='function') applyPrivacyMode();
    if(typeof renderInvSeenHint==='function') renderInvSeenHint();
    setTimeout(applySwipeToProducts, 50);
    setTimeout(()=>{ if(typeof checkMonthSurplusPrompt==='function') checkMonthSurplusPrompt(); }, 800);
    setTimeout(()=>{ if(typeof maybePromptDemoData==='function') maybePromptDemoData(); }, 300);
    setTimeout(()=>{ if(typeof shouldShowOnboarding==='function' && shouldShowOnboarding() && !document.getElementById('demoDataModal')) startOnboarding(); }, 600);
  });
} else {
  if(typeof recomputeMonthlyIncome==='function') recomputeMonthlyIncome();
  if(typeof runPaydayAutomations==='function') runPaydayAutomations();
  renderAll();
  if(typeof applyPrivacyMode==='function') applyPrivacyMode();
  if(typeof renderInvSeenHint==='function') renderInvSeenHint();
  setTimeout(applySwipeToProducts, 50);
  setTimeout(()=>{ if(typeof checkMonthSurplusPrompt==='function') checkMonthSurplusPrompt(); }, 800);
  setTimeout(()=>{ if(typeof maybePromptDemoData==='function') maybePromptDemoData(); }, 300);
  setTimeout(()=>{ if(typeof shouldShowOnboarding==='function' && shouldShowOnboarding() && !document.getElementById('demoDataModal')) startOnboarding(); }, 600);
}

// ─────────────────────────────────────────────────────
// EXPORT CENTER — Excel (HTML→.xls) / PDF (browser print) / Auto-lottery
// ─────────────────────────────────────────────────────
function openExportCenter(){
  document.getElementById('exportCenterOverlay').classList.add('open');
}
window.openExportCenter=openExportCenter;

function _todayStr(){ const d=getNow(); return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0'); }

function _buildXlsHtml(sheetName, headers, rows){
  const headHtml=headers.map(h=>`<th style="background:#F08A6B;color:#fff;padding:6px 10px;text-align:left">${escapeHTML(h)}</th>`).join('');
  const bodyHtml=rows.map(r=>'<tr>'+r.map(c=>`<td style="padding:4px 10px;border:1px solid #ccc">${c==null?'':c}</td>`).join('')+'</tr>').join('');
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${sheetName}</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table border="1" style="border-collapse:collapse;font-family:sans-serif;font-size:12px"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></body></html>`;
}
function _downloadXls(filename, html){
  const blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); },120);
}

function exportRecordsExcel(){
  if(!records || !records.length){ showToast('沒有消費記錄可匯出','warn'); return; }
  const cats=(typeof CATS!=='undefined'?CATS:DEFAULT_CATS).reduce((m,c)=>{m[c.id]=c.label;return m;},{});
  const sorted=[...records].filter(r=>!r._travelBudget).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const rows=sorted.map(r=>[
    r.date||'',
    r.emoji||'',
    escapeHTML(r.name||''),
    escapeHTML(r.brand||''),
    escapeHTML(cats[r.catId]||r.catId||''),
    r.type||'',
    r.price||0,
    r.payMethod||'',
    escapeHTML(r.note||'')
  ]);
  _downloadXls(`records-${_todayStr()}.xls`, _buildXlsHtml('消費明細', ['日期','圖示','名稱','品牌','分類','類型','金額','付款方式','備註'], rows));
  showToast(`✅ 已匯出 ${sorted.length} 筆消費記錄`,'ok');
}
function exportSalaryExcel(){
  if(!salaryRecords || !salaryRecords.length){ showToast('沒有薪資記錄可匯出','warn'); return; }
  const rows=[...salaryRecords].sort((a,b)=>b.year!==a.year?b.year-a.year:b.month-a.month).map(s=>{
    const attr=getSalaryAttrYM(s);
    const incomes=(s.fields||[]).filter(f=>f.type==='income').map(f=>`${f.label}:${f.amount}`).join('; ');
    const dedu=(s.fields||[]).filter(f=>f.type==='deduction').map(f=>`${f.label}:${f.amount}`).join('; ');
    return [`${s.year}-${String(s.month).padStart(2,'0')}`, `${attr.y}-${String(attr.m).padStart(2,'0')}`, s.payDay||'', s.netPay||0, s.source==='manual'?'手動':'AI', escapeHTML(incomes), escapeHTML(dedu)];
  });
  _downloadXls(`salary-${_todayStr()}.xls`, _buildXlsHtml('薪資記錄', ['領薪月','結算月','發薪日','實領','來源','收入項目','扣繳項目'], rows));
  showToast(`✅ 已匯出 ${salaryRecords.length} 筆薪資`,'ok');
}

// PDF — 開新視窗用 print 模式（使用者選「儲存為 PDF」即可）
function _printHtml(title, bodyHtml){
  const w=window.open('', '_blank', 'width=900,height=1200');
  if(!w){ showToast('請允許彈出視窗以列印 PDF','error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title>
    <style>
      @page{margin:18mm}
      body{font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#222;margin:0;padding:24px;}
      h1{font-size:22px;margin:0 0 4px;color:#F08A6B}
      h2{font-size:14px;margin:18px 0 8px;border-left:4px solid #F08A6B;padding-left:8px}
      .sub{font-size:11px;color:#666;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:14px}
      th{background:#f0eef9;color:#F08A6B;text-align:left;padding:6px 8px;border:1px solid #ddd;font-weight:700}
      td{padding:5px 8px;border:1px solid #eee}
      tr:nth-child(even) td{background:#fafafa}
      .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
      .kpi .c{border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center}
      .kpi .l{font-size:10px;color:#666}
      .kpi .v{font-family:'DM Mono',monospace;font-size:16px;font-weight:700;color:#F08A6B;margin-top:3px}
      .pos{color:#16a974} .neg{color:#e83030}
      .footer{margin-top:24px;font-size:10px;color:#888;text-align:center;border-top:1px solid #eee;padding-top:8px}
      @media print { .no-print{display:none} }
    </style></head><body>
    <button class="no-print" onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:8px 14px;background:#F08A6B;color:#fff;border:0;border-radius:6px;cursor:pointer">🖨️ 列印 / 存為 PDF</button>
    ${bodyHtml}
    <div class="footer">📱 TheTrack · 產生於 ${new Date().toLocaleString('zh-TW')}</div>
    </body></html>`);
  w.document.close();
  setTimeout(()=>{ try{ w.focus(); }catch(e){} }, 300);
}

function exportMonthPDF(){
  const {y,m}=summaryMonth||{y:getNow().getFullYear(),m:getNow().getMonth()};
  const mo=m+1;
  const ym=`${y}-${String(mo).padStart(2,'0')}`;
  const salRec=salaryRecords.find(s=>salaryMatchesYM(s,y,mo));
  const sal=salRec?salRec.netPay:0;
  const bonus=bonusExpected.filter(b=>b.month===mo).reduce((s,b)=>s+b.amount,0);
  const income=sal+bonus;
  const ofMonth=records.filter(r=>getEffectiveMonth(r)===ym && !r._travelBudget);
  const total=ofMonth.reduce((s,r)=>s+r.price,0);
  const surplus=income-total;
  // 分類統計
  const cats=(typeof CATS!=='undefined'?CATS:DEFAULT_CATS).reduce((m,c)=>{m[c.id]={label:c.label,emoji:c.emoji,total:0,count:0};return m;},{});
  ofMonth.forEach(r=>{ const k=cats[r.catId]; if(k){ k.total+=r.price; k.count++; } });
  const catRows=Object.entries(cats).filter(([_,v])=>v.total>0).sort((a,b)=>b[1].total-a[1].total)
    .map(([_,v])=>`<tr><td>${v.emoji} ${escapeHTML(v.label)}</td><td>${v.count}</td><td style="text-align:right">$${v.total.toLocaleString()}</td><td style="text-align:right">${total>0?(v.total/total*100).toFixed(1):'0.0'}%</td></tr>`).join('');
  const list=[...ofMonth].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
    .map(r=>`<tr><td>${r.date||''}</td><td>${r.emoji||''} ${escapeHTML(r.name||'')}</td><td>${escapeHTML(cats[r.catId]?cats[r.catId].label:r.catId||'')}</td><td style="text-align:right">$${r.price.toLocaleString()}</td><td>${escapeHTML(r.note||'')}</td></tr>`).join('');
  const body=`
    <h1>📅 ${y} 年 ${mo} 月 結算報表</h1>
    <div class="sub">期間：${ym} · 共 ${ofMonth.length} 筆消費</div>
    <div class="kpi">
      <div class="c"><div class="l">💚 收入</div><div class="v pos">$${income.toLocaleString()}</div></div>
      <div class="c"><div class="l">🔴 支出</div><div class="v neg">$${total.toLocaleString()}</div></div>
      <div class="c"><div class="l">${surplus>=0?'💰 結餘':'⚠️ 超支'}</div><div class="v ${surplus>=0?'pos':'neg'}">${surplus>=0?'+':'-'}$${Math.abs(surplus).toLocaleString()}</div></div>
      <div class="c"><div class="l">🎯 儲蓄率</div><div class="v">${income>0?Math.round(surplus/income*100):0}%</div></div>
    </div>
    <h2>📊 分類統計</h2>
    <table><thead><tr><th>類別</th><th>筆數</th><th style="text-align:right">金額</th><th style="text-align:right">佔比</th></tr></thead><tbody>${catRows||'<tr><td colspan="4" style="text-align:center;color:#999">無資料</td></tr>'}</tbody></table>
    <h2>📋 消費明細</h2>
    <table><thead><tr><th>日期</th><th>項目</th><th>分類</th><th style="text-align:right">金額</th><th>備註</th></tr></thead><tbody>${list||'<tr><td colspan="5" style="text-align:center;color:#999">無資料</td></tr>'}</tbody></table>
  `;
  _printHtml(`${y}年${mo}月結算報表`, body);
}

function exportYearPDF(){
  const y=(summaryMonth?summaryMonth.y:getNow().getFullYear());
  let ti=0,ts=0;
  const monthly=[];
  for(let m=1;m<=12;m++){
    const ym=`${y}-${String(m).padStart(2,'0')}`;
    const sal=(salaryRecords.find(s=>salaryMatchesYM(s,y,m))||{}).netPay||0;
    const bon=bonusExpected.filter(b=>b.month===m).reduce((s,b)=>s+b.amount,0);
    const inc=sal+bon;
    const sp=records.filter(r=>getEffectiveMonth(r)===ym && !r._travelBudget).reduce((s,r)=>s+r.price,0);
    monthly.push({m,inc,sp,sur:inc-sp});
    ti+=inc; ts+=sp;
  }
  const sur=ti-ts;
  const monthRows=monthly.map(x=>`<tr><td>${x.m}月</td><td style="text-align:right">$${x.inc.toLocaleString()}</td><td style="text-align:right">$${x.sp.toLocaleString()}</td><td style="text-align:right" class="${x.sur>=0?'pos':'neg'}">${x.sur>=0?'+':'-'}$${Math.abs(x.sur).toLocaleString()}</td></tr>`).join('');
  // Top 10 cats
  const cats=(typeof CATS!=='undefined'?CATS:DEFAULT_CATS).reduce((mp,c)=>{mp[c.id]={label:c.label,emoji:c.emoji,total:0,count:0};return mp;},{});
  records.forEach(r=>{
    if(r._travelBudget) return;
    if(!r.date || !r.date.startsWith(String(y))) return;
    const k=cats[r.catId]; if(k){ k.total+=r.price; k.count++; }
  });
  const catRows=Object.entries(cats).filter(([_,v])=>v.total>0).sort((a,b)=>b[1].total-a[1].total).slice(0,10)
    .map(([_,v])=>`<tr><td>${v.emoji} ${escapeHTML(v.label)}</td><td>${v.count}</td><td style="text-align:right">$${v.total.toLocaleString()}</td><td style="text-align:right">${ts>0?(v.total/ts*100).toFixed(1):'0.0'}%</td></tr>`).join('');
  const body=`
    <h1>📈 ${y} 年度結算報表</h1>
    <div class="sub">期間：${y}-01 ~ ${y}-12</div>
    <div class="kpi">
      <div class="c"><div class="l">💚 年度收入</div><div class="v pos">$${ti.toLocaleString()}</div></div>
      <div class="c"><div class="l">🔴 年度支出</div><div class="v neg">$${ts.toLocaleString()}</div></div>
      <div class="c"><div class="l">${sur>=0?'💰 結餘':'⚠️ 超支'}</div><div class="v ${sur>=0?'pos':'neg'}">${sur>=0?'+':'-'}$${Math.abs(sur).toLocaleString()}</div></div>
      <div class="c"><div class="l">🎯 儲蓄率</div><div class="v">${ti>0?Math.round(sur/ti*100):0}%</div></div>
    </div>
    <h2>📅 逐月結算</h2>
    <table><thead><tr><th>月份</th><th style="text-align:right">收入</th><th style="text-align:right">支出</th><th style="text-align:right">結餘</th></tr></thead><tbody>${monthRows}</tbody></table>
    <h2>🏆 Top 10 分類</h2>
    <table><thead><tr><th>類別</th><th>筆數</th><th style="text-align:right">金額</th><th style="text-align:right">佔比</th></tr></thead><tbody>${catRows||'<tr><td colspan="4" style="text-align:center;color:#999">無資料</td></tr>'}</tbody></table>
  `;
  _printHtml(`${y}年度結算報表`, body);
}

window.exportRecordsExcel=exportRecordsExcel;
window.exportSalaryExcel=exportSalaryExcel;
window.exportMonthPDF=exportMonthPDF;
window.exportYearPDF=exportYearPDF;

// ─────────────────────────────────────────────────────
// AUTO-FETCH 統一發票中獎號碼（透過 CORS proxy 抓財政部開放資料）
// ─────────────────────────────────────────────────────
async function autoFetchLotteryNumbers(){
  showToast('🌐 正在抓取最新獎號…','ok');
  const url='https://invoice.etax.nat.gov.tw/invoice.xml';
  // 多個 CORS proxy 備援，依序嘗試
  const proxies=[
    u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u=>`https://corsproxy.io/?${encodeURIComponent(u)}`,
    u=>`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];
  let xml='';
  for(const px of proxies){
    try{
      const res=await fetch(px(url),{cache:'no-store'});
      if(!res.ok) continue;
      xml=await res.text();
      if(xml && xml.includes('<item')) break;
    }catch(e){ /* try next */ }
  }
  if(!xml || !xml.includes('<item')){
    showToast('自動抓取失敗，請改用「📸 AI 辨識」或手動輸入','error');
    return false;
  }
  try{
    const parsed=parseLotteryRSS(xml);
    if(!parsed || (!parsed.special && !parsed.grand && !(parsed.first||[]).length)){
      throw new Error('解析結果為空');
    }
    lotteryNumbers={
      period:parsed.period||'',
      special:parsed.special||'',
      grand:parsed.grand||'',
      first:parsed.first||[],
      sixth:parsed.sixth||[],
      updatedAt:new Date().toISOString()
    };
    save();
    showToast(`✓ 已抓取 ${lotteryNumbers.period||'最新期'} 獎號`,'ok');
    if(typeof openLotteryModal==='function') openLotteryModal();
    return true;
  }catch(e){
    showToast('解析失敗：'+e.message,'error');
    return false;
  }
}

function parseLotteryRSS(xml){
  // 取第一個 <item> 的 <title> 與 <description>
  const itemM=xml.match(/<item>([\s\S]*?)<\/item>/);
  if(!itemM) return null;
  const block=itemM[1];
  const title=(block.match(/<title>([\s\S]*?)<\/title>/)||[])[1]||'';
  let desc=(block.match(/<description>([\s\S]*?)<\/description>/)||[])[1]||'';
  // 解 CDATA
  desc=desc.replace(/<!\[CDATA\[/g,'').replace(/\]\]>/g,'');
  // 期別：title 例如「112年09-10月」或「11410」
  const period=(title.match(/[\d]{2,4}\s*年\s*[\d]{1,2}-[\d]{1,2}\s*月/)||title.match(/\d{5,6}/)||[''])[0];
  // 從描述中抓 8 碼數字字串
  const eight=Array.from(desc.matchAll(/\b(\d{8})\b/g)).map(x=>x[1]);
  // 描述常見格式：特別獎xxxxxxxx 特獎xxxxxxxx 頭獎 xxxxxxxx、xxxxxxxx、xxxxxxxx
  let special='', grand='', first=[];
  // 嘗試結構化解析
  const sM=desc.match(/特別獎[^0-9]*(\d{8})/);
  const gM=desc.match(/特獎[^0-9]*(\d{8})/);
  if(sM) special=sM[1];
  if(gM) grand=gM[1];
  // 頭獎：取「頭獎」之後的所有 8 碼
  const fM=desc.match(/頭獎([\s\S]+?)(增開|$)/);
  if(fM){ first=Array.from(fM[1].matchAll(/(\d{8})/g)).map(x=>x[1]).slice(0,3); }
  // 增開六獎 3 碼
  const sixthM=desc.match(/增開六獎[^0-9]*([\d、,，\s]+)/);
  let sixth=[];
  if(sixthM){ sixth=Array.from(sixthM[1].matchAll(/(\d{3})/g)).map(x=>x[1]); }
  // Fallback：若結構化失敗，至少把 8 碼依序填入
  if(!special && eight[0]) special=eight[0];
  if(!grand && eight[1]) grand=eight[1];
  if(!first.length && eight.length>=5) first=eight.slice(2,5);
  return {period, special, grand, first, sixth};
}
window.autoFetchLotteryNumbers=autoFetchLotteryNumbers;

// ── scroll helper：4 格儀表板「待扣款」點擊時跳到下方信用卡待扣卡 ──
function scrollToCardPending(){
  const el=document.getElementById('cardPendingCard');
  if(!el || el.style.display==='none'){
    if(typeof showToast==='function') showToast('💳 目前沒有信用卡待扣款','ok');
    return;
  }
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.classList.remove('flash-once'); void el.offsetWidth; el.classList.add('flash-once');
}
window.scrollToCardPending=scrollToCardPending;

// ─────────────────────────────────────────────────────
// 📦 DEMO DATA — 首次啟動詢問是否載入示範資料
// ─────────────────────────────────────────────────────
function loadDemoData(){
  try{
    if(typeof DEMO_PRODUCTS!=='undefined' && DEMO_PRODUCTS.length){
      products=JSON.parse(JSON.stringify(DEMO_PRODUCTS));
    }
    if(typeof DEMO_FIXED!=='undefined' && DEMO_FIXED.length){
      fixedExpenses=JSON.parse(JSON.stringify(DEMO_FIXED));
    }
    // 模擬最近 6 個月的補貨採購記錄
    const _now=getNow();
    records=[];
    for(let i=5;i>=0;i--){
      const d=new Date(_now.getFullYear(),_now.getMonth()-i,15).toISOString().split('T')[0];
      products.slice(0,3+(i%4)).forEach(p=>records.push({
        id:Date.now()+Math.floor(Math.random()*100000),
        productId:p.id,name:p.name,emoji:p.emoji,brand:p.brand,
        price:p.price,cat:p.cat,date:d,type:'var'
      }));
    }
    if(typeof save==='function') save();
    localStorage.setItem('btDemoChoice','loaded');
    if(typeof showToast==='function') showToast('🎁 已載入示範資料，可隨時於設定→資料→清空','ok');
    if(typeof renderAll==='function') renderAll();
  }catch(e){ console.warn('loadDemoData failed:',e); }
}
function dismissDemoData(){
  localStorage.setItem('btDemoChoice','skip');
  const m=document.getElementById('demoDataModal');
  if(m) m.remove();
}
function maybePromptDemoData(){
  // 已選擇過 / 已有任何資料 / 已 onboarding 過 → 不問
  if(localStorage.getItem('btDemoChoice')) return;
  if(localStorage.getItem('btOnboarded')==='1') { localStorage.setItem('btDemoChoice','skip'); return; }
  if(products.length||records.length||fixedExpenses.length) { localStorage.setItem('btDemoChoice','skip'); return; }
  // 動態建立彈窗
  const m=document.createElement('div');
  m.id='demoDataModal';
  m.style.cssText='position:fixed;inset:0;background:rgba(60,40,20,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;backdrop-filter:blur(6px)';
  m.innerHTML=`
    <div style="background:var(--surface,#fff);border-radius:24px;max-width:340px;width:100%;padding:26px 22px 20px;box-shadow:0 20px 50px rgba(60,30,10,.3);text-align:center">
      <div style="font-size:48px;margin-bottom:8px">🎁</div>
      <div style="font-size:18px;font-weight:900;color:var(--text,#3D2817);margin-bottom:6px">歡迎使用喵算</div>
      <div style="font-size:13px;color:var(--text2,#7A5A40);line-height:1.6;margin-bottom:18px">
        要不要載入一份<strong>示範資料</strong>（13 件補貨品、3 筆固定支出、半年消費紀錄）讓你體驗看看？<br>
        <span style="font-size:11px;color:var(--text3,#A8927A)">隨時可在 設定 → 資料 → 清空全部資料</span>
      </div>
      <button onclick="loadDemoData();document.getElementById('demoDataModal').remove();" style="width:100%;padding:12px;background:linear-gradient(135deg,#F08A6B,#E55A4D);color:#fff;border:none;border-radius:14px;font-size:14px;font-weight:800;cursor:pointer;margin-bottom:8px;box-shadow:0 6px 16px rgba(229,90,77,.35)">🎁 載入示範資料</button>
      <button onclick="dismissDemoData();" style="width:100%;padding:11px;background:transparent;color:var(--text2,#7A5A40);border:1.5px solid var(--border,#E8DDD0);border-radius:14px;font-size:13px;font-weight:700;cursor:pointer">從空白開始 →</button>
    </div>
  `;
  document.body.appendChild(m);
}
window.loadDemoData=loadDemoData;
window.dismissDemoData=dismissDemoData;
window.maybePromptDemoData=maybePromptDemoData;
