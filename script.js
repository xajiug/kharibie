/***** === Telegram WebApp init === *****/
const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg && tg.ready) tg.ready();
if (tg && tg.expand) tg.expand();
const isInTelegram = !!tg && /Telegram/i.test(navigator.userAgent);

/***** === ДАННЫЕ И НАСТРОЙКИ === *****/
const RARITIES = ["common", "rare", "epic", "mythic"];
const POOLS = {
  common: ["Goblin", "Slime", "Bat", "Rat", "Imp"],
  rare: ["Orc", "Wolf Rider", "Golem", "Harpy"],
  epic: ["Dragon", "Hydra", "Lich", "Kraken"],
  mythic: ["Phoenix", "Leviathan", "Titan"]
};

// Шансы сундуков
const CHEST_ODDS = {
  common:  { common: 0.80, rare: 0.20, epic: 0.00, mythic: 0.00 },
  rare:    { common: 0.00, rare: 0.60, epic: 0.40, mythic: 0.00 },
  epic:    { common: 0.00, rare: 0.00, epic: 0.70, mythic: 0.30 },
  mythic:  { common: 0.00, rare: 0.00, epic: 0.00, mythic: 1.00 }
};

// Бесплатные карты
const DAILY_FREE = 3;

// Хранилище
const LS_KEY = "mc_save_v1";

/***** === СОСТОЯНИЕ === *****/
let state = loadState();

/***** === ХЕЛПЕРЫ === *****/
function todayStr() { return new Date().toISOString().slice(0,10); }

function loadState() {
  let s = {
    date: todayStr(),
    freeLeft: DAILY_FREE,
    collection: {},
    filter: "all"
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch {}
  if (s.date !== todayStr()) {
    s.date = todayStr();
    s.freeLeft = DAILY_FREE;
  }
  saveState(s);
  return s;
}

function saveState(s = state) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function rollRarityByChest(type) {
  const odds = CHEST_ODDS[type];
  const r = Math.random();
  let acc = 0;
  for (const rar of RARITIES) {
    acc += odds[rar] || 0;
    if (r <= acc) return rar;
  }
  return "common";
}

function addCardToCollection(name, rarity) {
  if (!state.collection[name]) state.collection[name] = { rarity, qty: 0 };
  state.collection[name].qty++;
  saveState();
  renderCollection();
}

/***** === ВЫПАДЕНИЕ КАРТ === *****/
function randomCardByRarity(rarity) {
  const pool = POOLS[rarity];
  const name = pick(pool);
  addCardToCollection(name, rarity);
  return { name, rarity };
}

function openFreeCard() {
  if (state.freeLeft <= 0) {
    notify("На сегодня лимит бесплатных карт исчерпан!");
    return;
  }
  state.freeLeft--;
  saveState();
  updateFreeLeft();

  const r = Math.random();
  let rarity = "common";
  if (r < 0.02) rarity = "mythic";
  else if (r < 0.08) rarity = "epic";
  else if (r < 0.25) rarity = "rare";

  const c = randomCardByRarity(rarity);
  showResult("cardResult", `Выпала карта: <b>${c.name}</b> <span class="badge ${c.rarity}">${c.rarity}</span>`);
}

function openChest(type) {
  const rarity = rollRarityByChest(type);
  const c = randomCardByRarity(rarity);
  showResult("chestResult", `Из сундука выпала: <b>${c.name}</b> <span class="badge ${c.rarity}">${c.rarity}</span>`);
}

/***** === АПГРЕЙД === *****/
function canUpgrade(name) {
  const card = state.collection[name];
  if (!card) return false;
  if (card.qty < 10) return false;
  return card.rarity !== "mythic";
}

function upgrade(name) {
  if (!canUpgrade(name)) {
    notify("Для апгрейда нужно 10 одинаковых карт (и не мифик).");
    return;
  }
  const { rarity } = state.collection[name];
  state.collection[name].qty -= 10;

  const nextR = { common:"rare", rare:"epic", epic:"mythic" }[rarity] || "mythic";
  const newCardName = pick(POOLS[nextR]);
  addCardToCollection(newCardName, nextR);
  saveState();
  renderCollection();
  showResult("upgradeInfo", `Апгрейд: 10× ${rarity} → новая карта <b>${newCardName}</b> (${nextR})`);
}

/***** === РЕНДЕР === *****/
function rarityLabel(r) {
  return { common:"Обычная", rare:"Редкая", epic:"Эпическая", mythic:"Мифическая" }[r] || r;
}
function updateFreeLeft() {
  document.getElementById("cardsLeft").textContent = state.freeLeft;
}
function showResult(id, html) {
  document.getElementById(id).innerHTML = html;
}
function notify(text) { alert(text); }

function renderCollection() {
  const list = document.getElementById("collectionList");
  const filter = state.filter;
  const entries = Object.entries(state.collection).sort((a,b)=>a[0].localeCompare(b[0]));

  list.innerHTML = entries.map(([name,data])=>{
    if (filter!=="all" && data.rarity!==filter) return "";
    return `
      <div class="card">
        <div class="name">${name}</div>
        <div class="row">
          <span class="badge ${data.rarity}">${rarityLabel(data.rarity)}</span>
          <span class="qty">× ${data.qty}</span>
        </div>
        <div class="row">
          <div class="btns">
            <button class="btn-light" onclick="destroyCard('${name}')">Уничтожить 1</button>
            <button onclick="upgrade('${name}')" ${canUpgrade(name)?"":"disabled"}>Апгрейд (10→1)</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

function destroyCard(name) {
  const card = state.collection[name];
  if (!card) return;
  card.qty--;
  if (card.qty<=0) delete state.collection[name];
  saveState();
  renderCollection();
}

/***** === СЛУШАТЕЛИ === *****/
document.getElementById("openCardBtn").addEventListener("click", openFreeCard);

// сундуки (с анти-двоением и sendData)
document.querySelectorAll("#chests button[data-chest]").forEach(btn=>{
  let lastClick = 0;
  btn.addEventListener("click",(e)=>{
    const now = Date.now();
    if (now - lastClick < 350) { e.preventDefault(); return; }
    lastClick = now;

    const type = btn.getAttribute("data-chest");

    if (isInTelegram && tg && typeof tg.sendData==="function") {
      tg.sendData(`BUY_CHEST_${type.toUpperCase()}`);
      showResult("chestResult","Открой чат с ботом: он пришлёт счёт на оплату Stars.");
    } else {
      openChest(type); // демо
    }
  }, { passive:false });
});

// фильтры
document.querySelectorAll("#filters button[data-filter]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll("#filters button").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.getAttribute("data-filter");
    saveState();
    renderCollection();
  });
});

// убираем зум по двойному тапу
let lastTouchEnd=0;
document.addEventListener('touchend',function(e){
  const now=Date.now();
  if(now-lastTouchEnd<=300){ e.preventDefault(); }
  lastTouchEnd=now;
},{passive:false});

/***** === СТАРТ === *****/
updateFreeLeft();
renderCollection();
showResult("upgradeInfo","Подсказка: если у карты ≥10 копий — кнопка «Апгрейд» станет активной.");
