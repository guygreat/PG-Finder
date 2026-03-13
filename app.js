const STORAGE_KEY = "quest-habit-rpg-state-v3";
const DIFFICULTY_POINTS = { easy: 5, normal: 10, hard: 20 };
const SLOT_LABELS = { head: "Helmet", armor: "Armor", shield: "Shield", pet: "Pet" };

const defaultInventory = [
  { id: "head-1", slot: "head", name: "Bronze Helmet", icon: "⛑️", cost: 100 },
  { id: "armor-1", slot: "armor", name: "Knight Armor", icon: "🦺", cost: 250 },
  { id: "shield-1", slot: "shield", name: "Guardian Shield", icon: "🛡️", cost: 250 },
  { id: "pet-1", slot: "pet", name: "Wolf Pet", icon: "🐺", cost: 400 }
];

const initialState = {
  character: { health: 100, mana: 60, experience: 0, level: 1, rewardPoints: 0, unlocked: [], equipped: {}, setbackMessage: "", streakBonus: 0 },
  habits: [],
  todos: [],
  history: {},
  completedHabitCount: 0,
  completedTodoCount: 0,
  achievements: [],
  dailyQuest: { target: 3, completed: false, date: todayISO() },
  lastOverdueCheck: todayISO(),
  theme: "dark",
  customItems: []
};

let state = loadState();
const el = (id) => document.getElementById(id);

setup();
render();

function setup() {
  el("today-label").textContent = new Date().toLocaleDateString();
  document.documentElement.dataset.theme = state.theme;

  el("theme-toggle").onclick = () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    save();
  };

  el("open-habit-modal").onclick = () => openModal("Create Habit", "habit-form-template", bindHabitForm);
  el("open-todo-modal").onclick = () => openModal("Create To-Do", "todo-form-template", bindTodoForm);
  el("open-completed-view").onclick = openCompletedView;
  el("open-collection").onclick = openCollectionView;
  el("open-custom-item-modal").onclick = () => openModal("Create Custom Item", "custom-item-form-template", bindCustomItemForm);

  el("close-modal").onclick = closeModal;
  el("overlay").onclick = (e) => {
    if (e.target.id === "overlay") closeModal();
  };

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });

  el("habit-filter").oninput = renderHabits;
  el("todo-filter").oninput = renderTodos;

  checkDailyCycle();
}

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  el("tab-habits").classList.toggle("active", name === "habits");
  el("tab-todos").classList.toggle("active", name === "todos");
}

function openModal(title, templateId, binder) {
  el("modal-title").textContent = title;
  const body = el("modal-body");
  body.innerHTML = "";
  body.appendChild(el(templateId).content.cloneNode(true));
  if (binder) binder();
  el("overlay").classList.remove("hidden");
}

function closeModal() {
  el("overlay").classList.add("hidden");
}

function bindHabitForm() {
  const form = el("habit-form");
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    state.habits.unshift({
      id: crypto.randomUUID(),
      title: f.get("title"),
      description: f.get("description"),
      type: f.get("type"),
      difficulty: f.get("difficulty"),
      frequency: f.get("frequency"),
      stat: f.get("stat"),
      tags: splitTags(f.get("tags")),
      target: Number(f.get("target") || 1),
      progressByDate: {},
      completedCount: 0
    });
    closeModal();
    saveAndRender();
  };
}

function bindTodoForm() {
  const form = el("todo-form");
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    state.todos.unshift({
      id: crypto.randomUUID(),
      title: f.get("title"),
      description: f.get("description"),
      difficulty: f.get("difficulty"),
      stat: f.get("stat"),
      dueDate: f.get("dueDate") || null,
      tags: splitTags(f.get("tags")),
      completed: false,
      penalized: false,
      subtasks: String(f.get("subtasks") || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((text) => ({ text, done: false }))
    });
    closeModal();
    saveAndRender();
  };
}

function bindCustomItemForm() {
  const form = el("custom-item-form");
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const imageInput = f.get("markdownImage");
    const parsedImage = parseMarkdownImage(imageInput);

    state.customItems.push({
      id: `custom-${crypto.randomUUID()}`,
      slot: f.get("slot"),
      name: f.get("name"),
      cost: Number(f.get("cost")),
      image: parsedImage,
      icon: "✨",
      custom: true
    });

    closeModal();
    saveAndRender();
  };
}

function openCompletedView() {
  openModal("Completed To-Dos", "blank-template", null);
  const body = el("modal-body");
  body.innerHTML = `
    <input id="completed-search" placeholder="Search completed by title or tag" />
    <div id="completed-list" class="list"></div>
  `;

  const renderCompleted = () => {
    const q = el("completed-search").value.toLowerCase().trim();
    const list = el("completed-list");
    list.innerHTML = "";
    state.todos
      .filter((t) => t.completed)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || t.tags.join(" ").toLowerCase().includes(q))
      .forEach((todo) => list.appendChild(todoCard(todo, false)));
  };

  el("completed-search").oninput = renderCompleted;
  renderCompleted();
}

function openCollectionView() {
  openModal("Collection Gallery", "blank-template", null);
  const body = el("modal-body");
  body.innerHTML = `
    <h4>Unlocked Items & Pets</h4>
    <div id="collection-list" class="inventory-grid"></div>
    <button id="modal-add-custom" type="button">+ Add Custom Item</button>
  `;
  renderCollectionList();
  el("modal-add-custom").onclick = () => openModal("Create Custom Item", "custom-item-form-template", bindCustomItemForm);
}

function renderCollectionList() {
  const wrap = el("collection-list");
  if (!wrap) return;
  wrap.innerHTML = "";

  const unlockedItems = allInventory().filter((item) => state.character.unlocked.includes(item.id));
  if (!unlockedItems.length) {
    const empty = document.createElement("p");
    empty.textContent = "No unlocked items yet.";
    wrap.appendChild(empty);
    return;
  }

  unlockedItems.forEach((item) => wrap.appendChild(inventoryCard(item, false)));
}

function parseMarkdownImage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return match ? match[1].trim() : raw;
}

function splitTags(raw) {
  return String(raw || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function allInventory() {
  return [...defaultInventory, ...(state.customItems || [])];
}

function findItemById(id) {
  return allInventory().find((i) => i.id === id);
}

function checkDailyCycle() {
  const today = todayISO();
  if (state.lastOverdueCheck === today) return;

  state.todos.forEach((todo) => {
    if (!todo.completed && todo.dueDate && todo.dueDate < today && !todo.penalized) {
      applyStatDelta("health", -10);
      todo.penalized = true;
    }
  });

  if (state.dailyQuest.date !== today) {
    state.dailyQuest = { target: 3, completed: false, date: today };
  }

  state.lastOverdueCheck = today;
  save();
}

function render() {
  renderCharacter();
  renderHabits();
  renderTodos();
  renderInventory();
  renderAchievements();
  renderAnalytics();
}

function renderCharacter() {
  const c = state.character;
  const xpNeeded = levelRequirement(c.level);

  el("health-bar").value = c.health;
  el("mana-bar").value = c.mana;
  el("xp-bar").value = c.experience;
  el("xp-bar").max = xpNeeded;

  el("health-text").textContent = `${c.health} / 100`;
  el("mana-text").textContent = `${c.mana} / 100`;
  el("xp-text").textContent = `${c.experience} / ${xpNeeded}`;

  el("level-text").textContent = c.level;
  el("points-text").textContent = c.rewardPoints;
  el("streak-text").textContent = `+${c.streakBonus}`;
  el("daily-quest-text").textContent = state.dailyQuest.completed ? "Completed ✅" : `${countTodayHabitFinishes()} / ${state.dailyQuest.target}`;

  ["head", "armor", "shield", "pet"].forEach((slot) => {
    const item = findItemById(c.equipped[slot]);
    const box = el(`slot-${slot}`);
    if (!box) return;
    box.innerHTML = item
      ? item.image
        ? `<img src="${item.image}" alt="${item.name}" />`
        : `<span class="slot-icon">${item.icon || "✨"}</span>`
      : `<span class="slot-empty">Empty</span>`;
  });

  el("setback-message").textContent = c.setbackMessage;
}

function renderHabits() {
  const q = el("habit-filter").value.toLowerCase().trim();
  const list = el("habit-list");
  list.innerHTML = "";

  state.habits
    .filter((h) => !q || h.title.toLowerCase().includes(q) || h.tags.join(" ").toLowerCase().includes(q))
    .forEach((habit) => {
      const node = el("habit-card-template").content.firstElementChild.cloneNode(true);
      const today = todayISO();
      const progress = habit.progressByDate[today] || 0;

      node.querySelector(".title").textContent = habit.title;
      node.querySelector(".difficulty").textContent = habit.difficulty;
      node.querySelector(".description").innerHTML = `<div class='markdown'>${md(habit.description || "")}</div>`;

      const badges = node.querySelector(".badge-row");
      [
        `Type: ${habit.type}`,
        `Stat: ${habit.stat}`,
        `Frequency: ${habit.frequency}`,
        `Progress: ${progress}/${habit.target}`,
        `Completed: ${habit.completedCount}`,
        ...habit.tags.map((t) => `#${t}`)
      ].forEach((txt) => badges.appendChild(badge(txt)));

      const actions = node.querySelector(".actions");
      actions.append(button("+ Progress", () => updateHabit(habit.id, today)));
      actions.append(button("Missed Habit", () => {
        const d = prompt("Missed date YYYY-MM-DD", today);
        if (d) updateHabit(habit.id, d);
      }));

      list.appendChild(node);
    });
}

function renderTodos() {
  const q = el("todo-filter").value.toLowerCase().trim();
  const active = el("todo-active");
  active.innerHTML = "";

  state.todos
    .filter((t) => !t.completed)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.tags.join(" ").toLowerCase().includes(q))
    .forEach((todo) => active.appendChild(todoCard(todo, true)));
}

function todoCard(todo, showComplete) {
  const node = el("todo-card-template").content.firstElementChild.cloneNode(true);
  node.querySelector(".title").textContent = todo.title;
  node.querySelector(".difficulty").textContent = todo.difficulty;
  node.querySelector(".description").innerHTML = `<div class='markdown'>${md(todo.description || "")}</div>`;

  const subtasks = node.querySelector(".subtasks");
  todo.subtasks.forEach((s) => {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = s.done;
    cb.onchange = () => {
      s.done = cb.checked;
      saveAndRender();
    };
    li.append(cb, ` ${s.text}`);
    subtasks.appendChild(li);
  });

  const badges = node.querySelector(".badge-row");
  const overdue = !todo.completed && todo.dueDate && todo.dueDate < todayISO();
  [
    `Stat: ${todo.stat}`,
    `Due: ${todo.dueDate || "No due"}`,
    overdue ? "Overdue" : "On time",
    ...todo.tags.map((t) => `#${t}`)
  ].forEach((txt) => badges.appendChild(badge(txt)));

  const actions = node.querySelector(".actions");
  if (showComplete) actions.append(button("Complete", () => completeTodo(todo.id)));
  actions.append(button("Delete", () => {
    state.todos = state.todos.filter((t) => t.id !== todo.id);
    saveAndRender();
  }));

  return node;
}

function badge(text) {
  const s = document.createElement("span");
  s.className = "badge";
  s.textContent = text;
  return s;
}

function renderInventory() {
  const wrap = el("inventory-list");
  wrap.innerHTML = "";
  allInventory().forEach((item) => wrap.appendChild(inventoryCard(item, true)));
}

function inventoryCard(item, withActions) {
  const unlocked = state.character.unlocked.includes(item.id);
  const equipped = state.character.equipped[item.slot] === item.id;
  const card = document.createElement("article");
  card.className = `inv-item ${unlocked ? "" : "locked"}`;
  card.innerHTML = `
    <div class='inv-icon'>
      ${item.image ? `<img src='${item.image}' alt='${item.name}'/>` : `<span>${item.icon || "✨"}</span>`}
      <strong>${item.name}</strong>
    </div>
    <small>${SLOT_LABELS[item.slot] || item.slot} · Cost ${item.cost}</small>
    <div>${unlocked ? "Unlocked" : "Locked"}</div>
  `;

  if (!withActions) return card;

  const action = document.createElement("button");
  if (!unlocked) {
    action.textContent = "Unlock";
    action.onclick = () => unlockItem(item.id);
  } else if (equipped) {
    action.textContent = "Unequip";
    action.onclick = () => {
      delete state.character.equipped[item.slot];
      saveAndRender();
    };
  } else {
    action.textContent = "Equip";
    action.onclick = () => {
      state.character.equipped[item.slot] = item.id;
      saveAndRender();
    };
  }
  card.appendChild(action);
  return card;
}

function renderAchievements() {
  const list = el("achievement-list");
  list.innerHTML = "";
  getAchievements().forEach((a) => {
    const d = document.createElement("div");
    d.className = "achievement";
    d.textContent = a;
    list.appendChild(d);
  });
}

function renderAnalytics() {
  const totals = Object.values(state.history).reduce(
    (a, d) => ({ habits: a.habits + (d.habits || 0), todos: a.todos + (d.todos || 0) }),
    { habits: 0, todos: 0 }
  );

  el("summary-cards").innerHTML = `
    <div><strong>${totals.habits}</strong><span>Habits Completed</span></div>
    <div><strong>${totals.todos}</strong><span>To-Dos Completed</span></div>
    <div><strong>${currentStreak()}</strong><span>Day Streak</span></div>
  `;

  const bars = el("weekly-bars");
  bars.innerHTML = "";
  lastNDays(7).forEach((date) => {
    const v = state.history[date]?.habits || 0;
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<span>${date.slice(5)}</span><div class='bar'><span style='width:${Math.min(v * 20, 100)}%'></span></div><strong>${v}</strong>`;
    bars.appendChild(row);
  });

  const heat = el("heatmap");
  heat.innerHTML = "";
  lastNDays(30).forEach((date) => {
    const count = (state.history[date]?.habits || 0) + (state.history[date]?.todos || 0);
    const c = document.createElement("div");
    c.className = "heat";
    c.dataset.level = count >= 6 ? 3 : count >= 3 ? 2 : count >= 1 ? 1 : 0;
    heat.appendChild(c);
  });
}

function updateHabit(id, date) {
  const h = state.habits.find((x) => x.id === id);
  if (!h) return;

  const current = h.progressByDate[date] || 0;
  h.progressByDate[date] = current + 1;

  if (current + 1 >= h.target && current < h.target) {
    h.completedCount += 1;
    const base = DIFFICULTY_POINTS[h.difficulty] || 10;
    applyHabitReward(h.stat, h.type === "negative" ? -base : base);
    trackHistory(date, "habits", 1);
    state.completedHabitCount += 1;
    maybeCompleteDailyQuest();
    evaluateAchievements();
  }

  saveAndRender();
}

function applyHabitReward(stat, amount) {
  state.character.rewardPoints += amount > 0 ? amount : 0;
  applyStatDelta(stat, amount);
}

function completeTodo(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo || todo.completed) return;

  todo.completed = true;
  const points = DIFFICULTY_POINTS[todo.difficulty] || 10;
  state.character.rewardPoints += points;
  applyStatDelta(todo.stat, points);
  trackHistory(todayISO(), "todos", 1);
  state.completedTodoCount += 1;
  evaluateAchievements();
  saveAndRender();
}

function applyStatDelta(stat, amount) {
  const c = state.character;

  if (stat === "experience") {
    c.experience += amount;
    while (c.experience >= levelRequirement(c.level)) {
      c.experience -= levelRequirement(c.level);
      c.level += 1;
      c.mana = Math.min(100, c.mana + 5);
    }
    while (c.experience < 0 && c.level > 1) {
      c.level -= 1;
      c.experience += levelRequirement(c.level);
    }
  } else if (stat === "health") {
    c.health = clamp(c.health + amount, 0, 100);
  } else if (stat === "mana") {
    c.mana = clamp(c.mana + amount, 0, 100);
  }

  if (c.health <= 0) triggerSetback();
}

function triggerSetback() {
  const c = state.character;
  const slots = Object.keys(c.equipped);
  if (slots.length) {
    delete c.equipped[slots[Math.floor(Math.random() * slots.length)]];
  }
  c.level = Math.max(1, c.level - 1);
  c.health = 50;
  c.setbackMessage = "You neglected your quests. Your warrior has weakened and lost a piece of gear.";
}

function unlockItem(id) {
  const item = findItemById(id);
  if (!item) return;
  if (state.character.rewardPoints < item.cost) return alert("Not enough points.");
  state.character.rewardPoints -= item.cost;
  if (!state.character.unlocked.includes(id)) state.character.unlocked.push(id);
  saveAndRender();
}

function getAchievements() {
  const a = [];
  if (state.completedHabitCount >= 10) a.push("🏅 First 10 habits completed");
  if (currentStreak() >= 30) a.push("🔥 30 day streak");
  if (state.character.unlocked.some((id) => findItemById(id)?.slot === "pet")) a.push("🐾 First pet unlocked");
  if (state.completedTodoCount >= 20) a.push("📜 20 to-dos completed");
  return a.length ? a : ["No achievements yet — start questing!"];
}

function evaluateAchievements() {
  state.achievements = getAchievements();
}

function maybeCompleteDailyQuest() {
  const done = countTodayHabitFinishes();
  if (!state.dailyQuest.completed && done >= state.dailyQuest.target) {
    state.dailyQuest.completed = true;
    state.character.rewardPoints += 15;
    state.character.streakBonus += 15;
    applyStatDelta("experience", 15);
  }
}

function countTodayHabitFinishes() {
  const t = todayISO();
  return state.habits.filter((h) => (h.progressByDate[t] || 0) >= h.target).length;
}

function currentStreak() {
  let s = 0;
  for (const d of lastNDays(365).reverse()) {
    if ((state.history[d]?.habits || 0) > 0) s += 1;
    else if (s) break;
  }
  return s;
}

function trackHistory(date, kind, inc) {
  state.history[date] = state.history[date] || { habits: 0, todos: 0 };
  state.history[date][kind] += inc;
}

function lastNDays(n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - i - 1));
    return d.toISOString().slice(0, 10);
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function levelRequirement(level) {
  return 100 + (level - 1) * 25;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function button(label, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.onclick = fn;
  return b;
}

function md(text) {
  let out = escapeHtml(text);
  out = out.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  out = out.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  out = out.replace(/^# (.*$)/gim, "<h1>$1</h1>");
  out = out.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  out = out.replace(/\*(.*?)\*/gim, "<em>$1</em>");
  out = out.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/^\s*[-*] (.*)$/gim, "<li>$1</li>");
  out = out.replace(/(<li>.*<\/li>)/gims, "<ul>$1</ul>");
  return out.replace(/\n/g, "<br/>");
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function saveAndRender() {
  save();
  render();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(initialState);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(initialState),
      ...parsed,
      character: { ...structuredClone(initialState.character), ...(parsed.character || {}) },
      customItems: parsed.customItems || []
    };
  } catch {
    return structuredClone(initialState);
  }
}
