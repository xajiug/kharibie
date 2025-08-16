/* ============================
   Mini App — script.js (полный)
   ============================ */

/** 0) Telegram init */
window.Telegram?.WebApp?.expand?.();
window.Telegram?.WebApp?.ready?.();

/** 1) Гибкая подстановка адреса сервера оплаты */
const DEFAULT_PAY_SERVER = "https://6117f804-7d7a-4ade-add6-ccd915af353b-00-3loijhr2zu3uh.kirk.replit.dev"; // ← замени на актуальный Dev URL (без / в конце)

function resolvePayServer() {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("api");
  if (fromQuery) {
    const clean = fromQuery.replace(/\/$/, "");
    localStorage.setItem("PAY_SERVER", clean);
    return clean;
  }
  const saved = localStorage.getItem("PAY_SERVER");
  return (saved && saved.replace(/\/$/, "")) || DEFAULT_PAY_SERVER.replace(/\/$/, "");
}
let PAY_SERVER = resolvePayServer();

/** 2) Пинг сервера (понятная ошибка, если не доступен) */
async function checkHealth() {
  try {
    const r = await fetch(`${PAY_SERVER}/api/health`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    console.log("Server OK", j);
  } catch (e) {
    showToast("Сервер оплаты недоступен. Обнови Dev URL параметром ?api=…");
  }
}
checkHealth();

/** 3) Конфиг редкостей и цен (XTR = Stars) */
const RARITIES = ["common", "rare", "epic", "mythic"];
const PRICES = { common: 50, rare: 200, epic: 1000, mythic: 5000 };

/** 4) Состояние/хранилище */
const LS_KEYS = {
  COLLECTION: "app_collection_v1",
  FREE_COUNTER: "app_free_counter_v1", // { date: 'YYYY-MM-DD', left: 3 }
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadCollection() {
  try { return JSON.parse(localStorage.getItem(LS_KEYS.COLLECTION)) || []; } catch { return []; }
}
function saveCollection(arr) { localStorage.setItem(LS_KEYS.COLLECTION, JSON.stringify(arr)); }

function loadFreeCounter() {
  try {
    const obj = JSON.parse(localStorage.getItem(LS_KEYS.FREE_COUNTER)) || null;
    const today = todayStr();
    if (!obj || obj.date !== today) {
      const fresh = { date: today, left: 3 };
      localStorage.setItem(LS_KEYS.FREE_COUNTER, JSON.stringify(fresh));
      return fresh;
    }
    return obj;
  } catch {
    const fresh = { date: todayStr(), left: 3 };
    localStorage.setItem(LS_KEYS.FREE_COUNTER, JSON.stringify(fresh));
    return fresh;
  }
}
function saveFreeCounter(obj) { localStorage.setItem(LS_KEYS.FREE_COUNTER, JSON.stringify(obj)); }

/** 5) Примитивная модель карт */
function randomCardByRarity(rarity) {
  // Сгенерим тестовую карту (в реале — бери из своего пула)
  const id = `${rarity}_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
  return { id, name: `${rarity.toUpperCase()} #${id.slice(-4)}`, rarity };
}

/** 6) Рендер коллекции и фильтров */
const elCollection = document.querySelector("#collection");
const elFilter = document.querySelector("#filter");
const elFreeLeft = document.querySelector("#free-left");

let collection = loadCollection();
let currentFilter = "all"; // 'all' | 'common' | 'rare' | 'epic' | 'mythic'
let freeCounter = loadFreeCounter();

function renderFreeLeft() {
  if (elFreeLeft) elFreeLeft.textContent = String(freeCounter.left);
}

function renderCollection() {
  if (!elCollection) return;
  const items = collection.filter(c => (currentFilter === "all" ? true : c.rarity === currentFilter));
  elCollection.innerHTML = items.length
    ? items.map(c => `<div class="card card-${c.rarity}">
        <div class="title">${c.name}</div>
        <div class="rarity">${c.rarity}</div>
      </div>`).join("")
    : `<div class="empty">Пусто — открой сундук или используй бесплатную карту.</div>`;
}

if (elFilter) {
  elFilter.addEventListener("change", () => {
    currentFilter = elFilter.value;
    renderCollection();
  });
}

/** 7) Бесплатные карты (3/день) */
const btnFree = document.querySelector("#btn-free");
if (btnFree) {
  btnFree.addEventListener("click", () => {
    freeCounter = loadFreeCounter(); // вдруг дата сменилась
    if (freeCounter.left <= 0) {
      showToast("Лимит бесплатных карт на сегодня исчерпан");
      return;
    }
    // бесплатная = common
    const card = randomCardByRarity("common");
    collection.push(card);
    saveCollection(collection);
    freeCounter.left -= 1;
    saveFreeCounter(freeCounter);
    renderCollection();
    renderFreeLeft();
    showToast("Бесплатная карта добавлена 🎉");
  });
}

/** 8) Покупка сундуков Stars */
function chestPrice(type) { return PRICES[type] ?? 0; }

async function buyChest(type) {
  try {
    const res = await fetch(`${PAY_SERVER}/api/create-invoice?type=${encodeURIComponent(type)}`);
    if (!res.ok) throw new Error(`Create invoice failed: ${res.status}`);
    const data = await res.json();
    if (!data.ok || !data.invoice_link) throw new Error("No invoice_link");

    Telegram.WebApp.openInvoice(data.invoice_link, async (status) => {
      if (status === "paid") {
        showToast("Оплата прошла ✅ Сундук открыт!");
        openChestLocally(type);
        try { await logPurchase(type); } catch {}
      } else if (status === "cancelled") {
        showToast("Оплата отменена ❌");
      } else {
        showToast(`Статус оплаты: ${status}`);
      }
    });
  } catch (err) {
    console.error(err);
    showToast("Ошибка оплаты. Обнови страницу и попробуй снова.");
  }
}

/** 9) Открытие сундука локально (выпадение карты) */
function openChestLocally(type) {
  // Простейшие веса выпадения внутри сундука соответствующей редкости
  // (можешь заменить на свою таблицу)
  const table = {
    common: ["common"],
    rare: ["rare", "common", "rare"],
    epic: ["epic", "rare", "epic", "common"],
    mythic: ["mythic", "epic", "rare"],
  };
  const bag = table[type] || ["common"];
  const rarity = bag[Math.floor(Math.random() * bag.length)];
  const card = randomCardByRarity(rarity);
  collection.push(card);
  saveCollection(collection);
  renderCollection();
}

/** 10) Лог покупок на сервер (опционально, но полезно) */
async function logPurchase(type) {
  const user = Telegram?.WebApp?.initDataUnsafe?.user || {};
  const body = {
    user_id: user.id || null,
    type,
    price: chestPrice(type),
    currency: "XTR",
    ts: Date.now(),
  };
  await fetch(`${PAY_SERVER}/api/log-purchase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 11) Апгрейд «10 → 1 выше» */
const btnUpgrade = document.querySelector("#btn-upgrade");
if (btnUpgrade) {
  btnUpgrade.addEventListener("click", () => {
    // ищем 10 карт одной редкости, апгрейдим на 1 уровень выше
    const order = RARITIES; // from common -> mythic
    let upgraded = false;

    for (let i = 0; i < order.length - 1; i++) {
      const r = order[i];
      const next = order[i + 1];
      const idx = collection.reduce((acc, c, k) => (c.rarity === r ? (acc.push(k), acc) : acc), []);
      if (idx.length >= 10) {
        // удаляем первые 10 и добавляем 1 карту выше
        const toDelete = idx.slice(0, 10).sort((a, b) => b - a);
        for (const k of toDelete) collection.splice(k, 1);
        collection.push(randomCardByRarity(next));
        saveCollection(collection);
        renderCollection();
        showToast(`Апгрейд успешно: 10 × ${r} → 1 × ${next} 🎯`);
        upgraded = true;
        break;
      }
    }
    if (!upgraded) showToast("Недостаточно карт для апгрейда");
  });
}

/** 12) Привязка кнопок сундуков (по data-атрибуту) */
document.querySelectorAll("[data-chest]").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-chest");
    if (!["common", "rare", "epic", "mythic"].includes(type)) return;
    buyChest(type);
  });
});

/** 13) Утилиты UI */
function showToast(text) {
  if (window.Telegram?.WebApp?.showPopup) {
    window.Telegram.WebApp.showPopup({
      title: "Сообщение",
      message: text,
      buttons: [{ type: "close" }]
    });
  } else if (window.Telegram?.WebApp?.showToast) {
    window.Telegram.WebApp.showToast(text);
  } else {
    alert(text);
  }
}

/** 14) Первый рендер */
renderCollection();
renderFreeLeft();

/* ===== Конец файла ===== */


