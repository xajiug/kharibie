/* ===============================
   Mini App — ПОЛНЫЙ РАБОЧИЙ СКРИПТ
   =============================== */

/** 0) Telegram init (без ошибок, если не в Telegram) */
try { Telegram.WebApp.expand(); Telegram.WebApp.ready(); } catch {}
// Синхронизация цветов с темой Telegram через CSS-переменные
(function applyTgTheme(){
  const tp = Telegram?.WebApp?.themeParams || {};
  const set = (k, v) => v && document.documentElement.style.setProperty(k, v);
  // Telegram отдаёт цвета, например, "#RRGGBB"
  set('--bg', tp.bg_color);
  set('--text', tp.text_color);
  set('--card', tp.secondary_bg_color);
  set('--border', tp.section_separator_color);
  set('--primary', tp.button_color);
  set('--primary-cta', tp.button_color); // тёмный градиент можно оставить тем же
  set('--muted', tp.hint_color);
  Telegram?.WebApp?.onEvent?.('themeChanged', applyTgTheme);
})();


/** 1) Адрес сервера (Dev URL Replit) */
const DEFAULT_PAY_SERVER = "https://6117f804-7d7a-4ade-add6-ccd915af353b-00-3loijhr2zu3uh.kirk.replit.dev"; // ← ЗАМЕНИ без / в конце

function resolvePayServer() {
  const u = new URL(location.href);
  const q = u.searchParams.get("api");
  if (q) localStorage.setItem("PAY_SERVER", q.replace(/\/$/, ""));
  return (
    (q && q.replace(/\/$/, "")) ||
    localStorage.getItem("PAY_SERVER") ||
    DEFAULT_PAY_SERVER.replace(/\/$/, "")
  );
}
let PAY_SERVER = resolvePayServer();

/** 2) Простые утилиты */
const PRICES = { common: 50, rare: 200, epic: 1000, mythic: 5000 };
const RARITIES = ["common", "rare", "epic", "mythic"];

function showToast(text) {
  try {
    if (Telegram?.WebApp?.showPopup) {
      Telegram.WebApp.showPopup({ title: "Сообщение", message: text, buttons: [{ type: "close" }] });
      return;
    }
    if (Telegram?.WebApp?.showToast) {
      Telegram.WebApp.showToast(text);
      return;
    }
  } catch {}
  alert(text);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/** 3) Локальное состояние */
const LS = { COLLECTION: "app_collection_v1", FREE: "app_free_v1" };
let collection = [];
let free = { date: todayStr(), left: 3 };

function loadState() {
  try { collection = JSON.parse(localStorage.getItem(LS.COLLECTION)) || []; } catch { collection = []; }
  try {
    free = JSON.parse(localStorage.getItem(LS.FREE)) || { date: todayStr(), left: 3 };
    if (free.date !== todayStr()) free = { date: todayStr(), left: 3 };
  } catch { free = { date: todayStr(), left: 3 }; }
}
function saveState() {
  localStorage.setItem(LS.COLLECTION, JSON.stringify(collection));
  localStorage.setItem(LS.FREE, JSON.stringify(free));
}

/** 4) Рендер */
function render() {
  const elLeft = document.querySelector("#free-left");
  if (elLeft) elLeft.textContent = String(free.left);

  const filter = document.querySelector("#filter")?.value || "all";
  const list = collection.filter(c => (filter === "all" ? true : c.rarity === filter));
  const root = document.querySelector("#collection");
  if (root) {
    root.innerHTML = list.length
      ? list.map(c => `<div class="card card-${c.rarity}">
          <div class="title">${c.name}</div>
          <div class="rarity">${c.rarity}</div>
        </div>`).join("")
      : `<div class="empty">Пока пусто — открой сундук или возьми бесплатную.</div>`;
  }
}

/** 5) Карточки */
function randomCard(r) {
  const id = `${r}_${Date.now()}_${Math.floor(Math.random()*9999)}`;
  return { id, name: `${r.toUpperCase()} #${id.slice(-4)}`, rarity: r };
}

function openChestLocally(type) {
  const table = {
    common: ["common"],
    rare: ["rare","common","rare"],
    epic: ["epic","rare","epic","common"],
    mythic: ["mythic","epic","rare"]
  };
  const bag = table[type] || ["common"];
  const r = bag[Math.floor(Math.random()*bag.length)];
  collection.push(randomCard(r));
  saveState();
  render();
}

/** 6) Логи покупок (опционально) */
async function logPurchase(type) {
  const user = Telegram?.WebApp?.initDataUnsafe?.user || {};
  const body = { user_id: user.id || null, type, price: PRICES[type] || 0, currency: "XTR", ts: Date.now() };
  try {
    await fetch(`${PAY_SERVER}/api/log-purchase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {}
}

/** 7) Оплата Stars (ловим и callback, и событие invoiceClosed) */
let invoiceListenerAttached = false;
function attachInvoiceListenerOnce() {
  if (invoiceListenerAttached || !Telegram?.WebApp?.onEvent) return;
  invoiceListenerAttached = true;
  Telegram.WebApp.onEvent("invoiceClosed", (e) => {
    const t = window.__lastBuyType;
    window.__lastBuyType = null;
    if (!t) return;
    if (e?.status === "paid") {
      showToast("Оплата прошла ✅ Сундук открыт!");
      openChestLocally(t);
      logPurchase(t);
    } else if (e?.status === "cancelled") {
      showToast("Оплата отменена ❌");
    } else {
      showToast("Оплата не завершена");
    }
  });
}

async function buyChest(type) {
  try {
    const res = await fetch(`${PAY_SERVER}/api/create-invoice?type=${encodeURIComponent(type)}`);
    if (!res.ok) throw new Error(`create-invoice ${res.status}`);
    const data = await res.json();
    if (!data.ok || !data.invoice_link) throw new Error("no invoice_link");

    window.__lastBuyType = type;
    attachInvoiceListenerOnce();

    // колбэк (часть клиентов)
    let callbackFired = false;
    try {
      Telegram.WebApp.openInvoice(data.invoice_link, (status) => {
        callbackFired = true;
        if (status === "paid") {
          window.__lastBuyType = null;
          showToast("Оплата прошла ✅ Сундук открыт!");
          openChestLocally(type);
          logPurchase(type);
        } else if (status === "cancelled") {
          window.__lastBuyType = null;
          showToast("Оплата отменена ❌");
        }
      });
    } catch {}

    // промис (некоторые клиенты так резолвят)
    try { await Telegram.WebApp.openInvoice?.(data.invoice_link); } catch {}

    // если ни одно не сработало — подстрахуемся событием invoiceClosed
    setTimeout(() => { if (!callbackFired) attachInvoiceListenerOnce(); }, 0);
  } catch (err) {
    showToast("Ошибка оплаты. Попробуй позже.");
  }
}

/** 8) Проверка окружения и запуск UI */
async function checkHealthAndEnv() {
  const envEl = document.querySelector("#env");
  const inTg = Boolean(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData);
  // пингуем сервер, но НЕ блокируем UI, даже если он недоступен
  let serverOk = false;
  try {
    const r = await fetch(`${PAY_SERVER}/api/health`, { cache: "no-store" });
    const j = await r.json();
    serverOk = Boolean(j?.success);
  } catch {}
  // выводим статус и разрешаем кнопки
  if (envEl) {
    envEl.textContent = `Окружение: ${inTg ? "Telegram" : "Браузер"} • Сервер: ${serverOk ? "OK" : "недоступен"}`;
    envEl.className = "env " + (serverOk ? "ok" : "warn");
  }
}

/** 9) ИНИЦИАЛИЗАЦИЯ ПОСЛЕ ЗАГРУЗКИ DOM */
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  render();

  // бесплатная карта
  const btnFree = document.querySelector("#btn-free");
  if (btnFree) {
    btnFree.addEventListener("click", () => {
      if (free.left <= 0) return showToast("Лимит бесплатных карт на сегодня исчерпан");
      collection.push(randomCard("common"));
      free.left -= 1;
      saveState();
      render();
      showToast("Бесплатная карта добавлена 🎉");
    });
  }

  // фильтр
  const sel = document.querySelector("#filter");
  if (sel) sel.addEventListener("change", render);

  // сундуки
  document.querySelectorAll("[data-chest]").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-chest");
      if (!PRICES[type]) return;
      buyChest(type);
    });
  });

  // проверка окружения (обновляет текст «идет проверка окружения»)
  checkHealthAndEnv();

  // слушатель invoiceClosed
  attachInvoiceListenerOnce();
});

