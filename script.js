/***** ДАННЫЕ И НАСТРОЙКИ *****/
const RARITIES = ["common", "rare", "epic", "mythic"];
const POOLS = {
  common: ["Goblin", "Slime", "Bat", "Rat", "Imp"],
  rare: ["Orc", "Wolf Rider", "Golem", "Harpy"],
  epic: ["Dragon", "Hydra", "Lich", "Kraken"],
  mythic: ["Phoenix", "Leviathan", "Titan"]
};

// Шансы сундуков
const CHEST_ODDS = {
  common:  { common: 0.80, rare: 0.20, epic: 0.00, mythic: 0.00 },   // 50⭐
  rare:    { common: 0.00, rare: 0.60, epic: 0.40, mythic: 0.00 },   // 100⭐
  epic:    { common: 0.00, rare: 0.00, epic: 0.70, mythic: 0.30 },   // 500⭐
  mythic:  { common: 0.00, rare: 0.00, epic: 0.00, mythic: 1.00 }    // 1000⭐
};

// Ежедневные бесплатные открытия
const DAILY_FREE = 3;

// Хранилище
const LS_KEY = "mc_save_v1";

/***** СОСТОЯНИЕ *****/
let state = loadState();

/***** ХЕЛПЕРЫ *****/
function todayStr() { return new Date().toISOString().slice(0,10); }

function loadState() {
  let s = {
    date: todayStr(),
    freeLeft: DAILY_FREE,
    collection: {}, // { "Goblin": { rarity:'common', qty: 1 } }
    filter: "all"
  };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch {}
  // Сброс бесплатных по дате
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
    const p = odds[rar] || 0;
    acc += p;
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

/***** ЛОГИКА ВЫПАДЕНИЯ *****/
function randomCardByRarity(rarity) {
  const pool = POOLS[rarity];
  const name = pick(pool);
  addCardToCollection(name, rarity);
  return { name, rarity };
}

// Бесплатная карта (для простоты — в основном common, с маленьким шансом редкости)
function openFreeCard() {
  if (state.freeLeft <= 0) {
    notify("На сегодня лимит бесплатных карточек исчерпан!");
    return;
  }
  state.freeLeft--;
  saveState();
  updateFreeLeft();

  // базовые шансы для бесплатной
  // (можно потом подкрутить)
  const r = Math.random();
  let rarity = "common";
  if (r < 0.02) rarity = "mythic";
  else if (r < 0.08) rarity = "epic";
  else if (r < 0.25) rarity = "rare";

  const c = randomCardByRarity(rarity);
  showResult("cardResult", `Выпала карта: <b>${c.name}</b> <span class="badge ${c.rarity}">${c.rarity}</span>`);
}

// Сундук
function openChest(type) {
  const rarity = rollRarityByChest(type);
  const c = randomCardByRarity(rarity);
  showResult("chestResult", `Из сундука выпала: <b>${c.name}</b> <span class="badge ${c.rarity}">${c.rarity}</span>`);
}

/***** АПГРЕЙД 10 → 1 ВЫШЕ *****/
function canUpgrade(name) {
  const card = state.collection[name];
  if (!card) return false;
  if (card.qty < 10) return false;
  const r = card.rarity;
  return r !== "mythic"; // мифик апнуть не во что
}

function upgrade(name) {
  if (!canUpgrade(name)) {
    notify("Для апгрейда нужно 10 одинаковых карт и редкость ниже мифической.");
    return;
  }
  const { rarity } = state.collection[name];
  state.collection[name].qty -= 10; // «сжигаем» 10
  // Следующая редкость
  const nextR = {
    common: "rare",
    rare: "epic",
    epic: "mythic"
  }[rarity] || "mythic";

  const newCardName = pick(POOLS[nextR]);
  addCardToCollection(newCardName, nextR);
  saveState();
  renderCollection();
  showResult(
    "upgradeInfo",
    `Апгрейд: 10× <b>${name}</b> (${rarity}) → новая карта <b>${newCardName}</b> <span class="badge ${nextR}">${nextR}</span>`
  );
}

/***** РЕНДЕР *****/
function rarityLabel(r) {
  return {
    common: "Обычная",
    rare: "Редкая",
    epic: "Эпическая",
    mythic: "Мифическая"
  }[r] || r;
}

function updateFreeLeft() {
  document.getElementById("cardsLeft").textContent = state.freeLeft;
}

function showResult(id, html) {
  const el = document.getElementById(id);
  el.innerHTML = html;
}

function notify(text) {
  alert(text);
}

function renderCollection() {
  const list = document.getElementById("collectionList");
  const filter = state.filter;
  // Собрать все карты в список
  const entries = Object.entries(state.collection)
    .sort((a,b) => a[0].localeCompare(b[0]));

  let html = "";
  for (const [name, data] of entries) {
    if (filter !== "all" && data.rarity !== filter) continue;
    html += `
      <div class="card">
        <div class="name">${name}</div>
        <div class="row">
          <span class="badge ${data.rarity}">${rarityLabel(data.rarity)}</span>
          <span class="qty">× ${data.qty}</span>
        </div>
        <div class="row">
          <div class="btns">
            <button class="btn-light" onclick="destroyCard('${name}')">Уничтожить 1</button>
            <button onclick="upgrade('${name}')" ${canUpgrade(name) ? "" : "disabled"}>Апгрейд (10→1)</button>
          </div>
        </div>
      </div>
    `;
  }
  list.innerHTML = html;
}

function destroyCard(name) {
  const card = state.collection[name];
  if (!card) return;
  if (card.qty <= 0) return;
  card.qty--;
  if (card.qty === 0) delete state.collection[name];
  saveState();
  renderCollection();
}

/***** СЛУШАТЕЛИ *****/
document.getElementById("openCardBtn").addEventListener("click", openFreeCard);

// сундуки
document.querySelectorAll("#chests button[data-chest]").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-chest");
    openChest(type);
  });
});

// фильтры
document.querySelectorAll("#filters button[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#filters button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.getAttribute("data-filter");
    saveState();
    renderCollection();
  });
});

/***** СТАРТ *****/
updateFreeLeft();
renderCollection();
showResult("upgradeInfo", "Подсказка: если у карты ≥10 копий — кнопка «Апгрейд» станет активной.");
