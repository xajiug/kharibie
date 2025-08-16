/* === CONFIG === */
const DEFAULT_PAY_SERVER = "https://6117f804-7d7a-4ade-add6-ccd915af353b-00-3loijhr2zu3uh.kirk.replit.dev"; // без слеша в конце
const PRICES = { common: 50, rare: 200, epic: 1000, mythic: 5000 };

/* === helpers === */
function resolvePayServer() {
  try {
    const u = new URL(location.href);
    const fromQuery = u.searchParams.get("api");
    if (fromQuery) localStorage.setItem("PAY_SERVER", fromQuery.replace(/\/$/, ""));
    return (fromQuery?.replace(/\/$/, "")) || localStorage.getItem("PAY_SERVER") || DEFAULT_PAY_SERVER;
  } catch { return DEFAULT_PAY_SERVER; }
}
let PAY_SERVER = resolvePayServer();

function showToast(text) {
  if (Telegram?.WebApp?.showPopup) Telegram.WebApp.showPopup({ title: "Сообщение", message: text, buttons: [{ type: "close" }] });
  else if (Telegram?.WebApp?.showToast) Telegram.WebApp.showToast(text);
  else alert(text);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* === state === */
const LS = {
  COLLECTION: "app_collection_v1",
  FREE: "app_free_v1"
};
let collection = [];
let free = { date: todayStr(), left: 3 };

/* === core === */
async function checkHealth() {
  try {
    console.log("PAY_SERVER =", PAY_SERVER);
    const r = await fetch(`${PAY_SERVER}/api/health`, { cache: "no-store" });
    const t = await r.text();
    console.log("health raw:", t);
    const j = JSON.parse(t);
    if (!j.success) throw new Error("health not ok");
  } catch (e) {
    showToast(`Сервер оплаты недоступен\n${PAY_SERVER}\n${e.message}`);
  }
}

function loadState() {
  try { collection = JSON.parse(localStorage.getItem(LS.COLLECTION)) || []; } catch { collection = []; }
  try {
    free = JSON.parse(localStorage.getItem(LS.FREE)) || { date: todayStr(), left: 3 };
    const ts = todayStr();
    if (free.date !== ts) free = { date: ts, left: 3 };
  } catch { free = { date: todayStr(), left: 3 }; }
}
function saveState() {
  localStorage.setItem(LS.COLLECTION, JSON.stringify(collection));
  localStorage.setItem(LS.FREE, JSON.stringify(free));
}

function render() {
  const leftEl = document.querySelector("#free-left");
  if (leftEl) leftEl.textContent = String(free.left);

  const root = document.querySelector("#collection");
  const filter = document.querySelector("#filter")?.value || "all";
  if (root) {
    const items = collection.filter(c => filter === "all" ? true : c.rarity === filter);
    root.innerHTML = items.length ? items.map(c => `
      <div class="card card-${c.rarity}">
        <div class="title">${c.name}</div>
        <div class="rarity">${c.rarity}</div>
      </div>`).join("") : `<div class="empty">Пока пусто</div>`;
  }
}

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
  const card = randomCard(r);
  collection.push(card);
  saveState();
  render();
}

async function logPurchase(type) {
  const user = Telegram?.WebApp?.initDataUnsafe?.user || {};
  const body = { user_id: user.id || null, type, price: PRICES[type] || 0, currency: "XTR", ts: Date.now() };
  try {
    const r = await fetch(`${PAY_SERVER}/api/log-purchase`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    console.log("log-purchase:", r.status);
  } catch (e) { console.warn("log-purchase failed", e); }
}

/* === payment === */
let invoiceListenerAttached = false;
function attachInvoiceListenerOnce() {
  if (invoiceListenerAttached || !Telegram?.WebApp?.onEvent) return;
  invoiceListenerAttached = true;
  Telegram.WebApp.onEvent("invoiceClosed", (e) => {
    console.log("invoiceClosed:", e);
    // e.status: "paid" | "failed" | "cancelled"
    const pendingType = window.__lastBuyType;
    if (!pendingType) return;
    if (e.status === "paid") {
      showToast("Оплата прошла ✅ Сундук открыт!");
      openChestLocally(pendingType);
      logPurchase(pendingType);
    } else if (e.status === "cancelled") {
      showToast("Оплата отменена ❌");
    } else {
      showToast("Оплата не завершена");
    }
    window.__lastBuyType = null;
  });
}

async function buyChest(type) {
  try {
    const res = await fetch(`${PAY_SERVER}/api/create-invoice?type=${encodeURIComponent(type)}`);
    if (!res.ok) throw new Error(`create-invoice ${res.status}`);
    const data = await res.json();
    if (!data.ok || !data.invoice_link) throw new Error("no invoice_link");
    window.__lastBuyType = type;

    attachInvoiceListenerOnce(); // на всякий случай

    // 1) колбэк (часть клиентов)
    try {
      Telegram.WebApp.openInvoice(data.invoice_link, (status) => {
        console.log("openInvoice callback:", status);
        if (status === "paid") {
          showToast("Оплата прошла ✅ Сундук открыт!");
          openChestLocally(type);
          logPurchase(type);
          window.__lastBuyType = null;
        } else if (status === "cancelled") {
          showToast("Оплата отменена ❌");
          window.__lastBuyType = null;
        }
      });
    } catch (e) {
      console.warn("openInvoice callback failed", e);
    }

    // 2) промис (на будущих клиентах)
    if (typeof Telegram?.WebApp?.openInvoice === "function") {
      try {
        const result = await Telegram.WebApp.openInvoice(data.invoice_link);
        console.log("openInvoice promise:", result);
        // некоторые клиенты резолвят промис — оставляем обработку через invoiceClosed/callback
      } catch (e) {
        console.warn("openInvoice promise rejected", e);
      }
    }
  } catch (err) {
    console.error(err);
    showToast("Ошибка оплаты. Повтори позже.");
  }
}

/* === init === */
function initUI() {
  // бесплатная карта
  const btnFree = document.querySelector("#btn-free");
  if (btnFree) {
    btnFree.addEventListener("click", () => {
      // важно: обработчик точно прикреплён после DOMContentLoaded
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

  // кнопки сундуков
  document.querySelectorAll("[data-chest]").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-chest");
      if (!PRICES[type]) return;
      buyChest(type);
    });
  });

  render();
}

function init() {
  try { Telegram?.WebApp?.expand?.(); Telegram?.WebApp?.ready?.(); } catch {}
  loadState();
  checkHealth();
  initUI();
  attachInvoiceListenerOnce();
}

/* === старт после загрузки DOM === */
document.addEventListener("DOMContentLoaded", init);
