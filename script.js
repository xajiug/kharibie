// app.js
const tg = window.Telegram?.WebApp;

// --- Инициализация Mini App + тема из Telegram
function applyThemeFromTelegram() {
  try {
    const tp = tg?.themeParams || {};
    // Перекладываем базовые цвета из темы Telegram (если есть) в CSS-переменные
    if (tp.bg_color) document.documentElement.style.setProperty('--bg', `#${tp.bg_color}`);
    if (tp.text_color) document.documentElement.style.setProperty('--fg', `#${tp.text_color}`);
    if (tp.hint_color) document.documentElement.style.setProperty('--muted', `#${tp.hint_color}`);
    if (tp.secondary_bg_color) document.documentElement.style.setProperty('--card', `#${tp.secondary_bg_color}`);
    if (tp.button_color) document.documentElement.style.setProperty('--btn-primary', `#${tp.button_color}`);
    if (tp.button_text_color) document.documentElement.style.setProperty('--btn-primary-fg', `#${tp.button_text_color}`);
  } catch (_) {}
}

function initTelegram() {
  try {
    tg?.ready?.();
    tg?.expand?.();
    applyThemeFromTelegram();
  } catch (e) {
    console.warn('Telegram init warning:', e);
  }
}

// --- Примитивное локальное хранилище (заменим на API позже)
const store = {
  stars: 0,              // визуальный счётчик (информативно)
  chests: 0,
  collection: [],
  lastFreeAt: null
};

const els = {
  stars: document.getElementById('stars-balance'),
  chests: document.getElementById('chests-balance'),
  grid: document.getElementById('collection-grid'),
  empty: document.getElementById('empty-collection'),
  chestPrice: document.getElementById('chest-price'),
};

function renderBalances() {
  els.stars.textContent = String(store.stars);
  els.chests.textContent = String(store.chests);
}

function renderCollection() {
  els.grid.innerHTML = '';
  if (!store.collection.length) {
    els.empty.style.display = 'block';
    return;
  }
  els.empty.style.display = 'none';
  for (const card of store.collection) {
    const div = document.createElement('div');
    div.className = 'card-item';
    div.innerHTML = `
      <div class="title">${card.name}</div>
      <div class="rarity">${card.rarity}</div>
    `;
    els.grid.appendChild(div);
  }
}

// --- Табы
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const pages = {
    shop: document.getElementById('tab-shop'),
    collection: document.getElementById('tab-collection'),
  };
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.tab;
      Object.values(pages).forEach(p => p.classList.remove('active'));
      pages[key].classList.add('active');
    });
  });
}

// --- Бесплатная карта (1 в день)
function canGetFreeCard() {
  if (!store.lastFreeAt) return true;
  const last = new Date(store.lastFreeAt);
  const now = new Date();
  return last.toDateString() !== now.toDateString();
}
function giveFreeCard() {
  const now = new Date();
  store.lastFreeAt = now.toISOString();
  const rarities = ['Common', 'Uncommon', 'Rare', 'Epic'];
  const r = rarities[Math.floor(Math.random() * rarities.length)];
  const id = Math.floor(100000 + Math.random() * 900000);
  store.collection.push({ id, name: `Монстр #${id}`, rarity: r });
  renderCollection();
  tg?.HapticFeedback?.notificationOccurred?.('success');
  tg?.showPopup?.({ title: 'Есть карта!', message: 'Бесплатная карта добавлена в коллекцию.' });
}

// --- Покупка сундука за Stars через openInvoice(link)
async function buyChest() {
  try {
    tg?.HapticFeedback?.impactOccurred?.('light');
    const payload = `chest_${Date.now()}`;

    const body = {
      title: 'Сундук',
      description: 'Сундук с картами',
      amountStars: Number(els.chestPrice.textContent) || 100, // цена в звёздах
      payload
    };

    const resp = await fetch('/api/create-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json());

    if (!resp?.ok) {
      tg?.showAlert?.('Не удалось создать счёт');
      return;
    }

    const link = resp.link;
    window.Telegram.WebApp.openInvoice(link, (status) => {
      // status: "paid" | "cancelled" | "failed"
      if (status === 'paid') {
        tg?.showPopup?.({
          title: 'Оплачено',
          message: 'Платёж подтверждён, синхронизируем…'
        });
      } else if (status === 'cancelled') {
        // Пользователь закрыл окно — это нормально. Ничего не делаем.
      } else if (status === 'failed') {
        tg?.showAlert?.('Платёж не прошёл');
      }
    });
  } catch (e) {
    console.error(e);
    tg?.showAlert?.('Ошибка при оплате');
  }
}

// --- Навешиваем обработчики
function bindHandlers() {
  document.getElementById('btn-free')?.addEventListener('click', () => {
    if (!canGetFreeCard()) {
      tg?.showAlert?.('Сегодня бесплатная карта уже получена.');
      return;
    }
    giveFreeCard();
  });

  document.getElementById('buy-chest-btn')?.addEventListener('click', buyChest);
}

// --- Старт
(function start() {
  initTelegram();
  initTabs();
  renderBalances();
  renderCollection();
  bindHandlers();

  // Пример: звёзды неизвестны на клиенте (их даёт Telegram), поэтому отображаем 0/–.
  // Когда подключим бэкенд с /api/me, подставим реальные значения.
})();
