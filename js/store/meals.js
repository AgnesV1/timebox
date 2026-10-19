// 备餐（Meals 页；手机上只有「下次采购」那张单子）
// 都存在 Settings 页里，一样东西一行（不用改 Code.gs，一格也不会太长）：
//   meal-ing:<id> 常买的东西 / meal-box:<id> 一顿 / meal-week:<这周第一天> 这周：days（日期 → {boxes} / {off}）、
//   粗排 rough（[{box, n}]）、买了没有 got、手动加的 extra、shopped、skip、note / meal-prefs 目标
//   meal-sup:<id> 规律要换 / 要补的东西（Restock：价格、每隔多久、下次哪天）；这周的行里还有 notes（采购单上写的备注）
//   meal-gear:<id> 贵重的东西（Restock 页右边）：类目、什么钱买的、价钱、哪天买的、哪天不用了
//   meal-dish:<id> To try 里的一道菜（在外面吃过、想自己做的）：name、note、kind（box 打算做成 Box / once 只试一次）；
//     从任务那边记的还带着 from（在哪吃的）、date、taskId——只是抄下来的字，任务以后删了改了都不管它
//   （meal-pack:<id> 是 10-08 那版的 Day pack，现在只在读旧数据时展开成 Box）
// 这里不存东西：数据在 js/store.js 手里，core 是它递进来的那几样（读、写、撤销）。

export default function (core) {
  const { entries, put, drop, change, memo, newId, today, setting } = core;

  const MEAL_RE = /^meal-(ing|box|pack|week|sup|dish|gear):(.+)$/;
  const mealKey = (kind, id) => "meal-" + kind + ":" + id;
  const OLD_UNIT = { g: "g", kg: "g", oz: "g", lb: "g", ml: "ml", L: "ml", "fl oz": "ml", gal: "ml" };

  const meals = () => memo("meals", readMeals);
  function readMeals() {
    const D = { ing: {}, box: {}, pack: {}, week: {}, sup: {}, dish: {}, gear: {}, days: {} };
    for (const [key, r] of entries("settings")) {
      const m = MEAL_RE.exec(key);
      if (m && r.value && typeof r.value === "object") D[m[1]][m[2]] = { ...r.value, id: m[2] };
    }
    // 旧格式读的时候换成新的：用量的数字 → 文字；某天 {pack} → 那个 pack 里的 Box；粗排 {pack, n} → 每个 Box × n
    for (const b of Object.values(D.box)) {
      b.parts = (b.parts || []).map((p) => (p.amt !== undefined || p.qty === undefined ? p
        : { ing: p.ing, amt: p.qty === "" || p.qty === null ? "" : p.qty + (OLD_UNIT[D.ing[p.ing]?.packUnit] ? " " + OLD_UNIT[D.ing[p.ing].packUnit] : "") }));
    }
    const unpack = (id) => (D.pack[id]?.boxes || []).filter((b) => D.box[b]);
    for (const w of Object.values(D.week)) {
      const days = {};
      for (const [d, e] of Object.entries(w.days || {})) days[d] = e?.pack ? { boxes: unpack(e.pack) } : e;
      w.days = days;
      const rough = [];
      for (const r of w.rough || []) {
        for (const box of r.pack ? unpack(r.pack) : [r.box]) {
          const hit = rough.find((x) => x.box === box);
          if (hit) hit.n += Number(r.n) || 0;
          else rough.push({ box, n: Number(r.n) || 0 });
        }
      }
      w.rough = rough;
    }
    // 每天吃什么存在那周的行里；改过「一周从周几开始」也照样找得到
    for (const w of Object.values(D.week)) Object.assign(D.days, w.days);
    return D;
  }

  // high = 每周 High 的 Box 最多几个；budget = 每周预算（0 = 不比）；shopDay = 星期几去买
  const mealPrefs = () => ({ high: 3, budget: 0, shopDay: 0, ...(setting("meal-prefs", {}) || {}) });

  function putMeal(kind, id, row) {
    const { id: _id, ...value } = row;
    put("settings", { id: mealKey(kind, id), key: mealKey(kind, id), value });
  }

  function saveMeal(kind, row, label, opts) {
    const id = row.id || newId().replace(/-/g, "").slice(0, 10);
    change(() => putMeal(kind, id, row), label, opts);
    return id;
  }

  // 删一样东西，用到它的地方一起改（一次撤销全回来）：食材 → 从各个 Box 里拿掉；Box → 从每天和粗排里拿掉
  function removeMeal(kind, id) {
    const D = meals();
    if (kind === "ing") {
      for (const b of Object.values(D.box)) if (b.parts.some((p) => p.ing === id)) putMeal("box", b.id, { ...b, parts: b.parts.filter((p) => p.ing !== id) });
    }
    if (kind === "box") {
      for (const w of Object.values(D.week)) {
        let touched = false;
        const days = {};
        for (const [d, e] of Object.entries(w.days)) {
          if (!e?.boxes?.includes(id)) { days[d] = e; continue; }
          touched = true;
          const left = e.boxes.filter((x) => x !== id);
          if (left.length) days[d] = { ...e, boxes: left };
        }
        const rough = w.rough.filter((r) => r.box !== id);
        if (touched || rough.length !== w.rough.length) putMeal("week", w.id, { ...w, days, rough });
      }
    }
    drop("settings", mealKey(kind, id));
  }

  function deleteMeal(kind, id, label) {
    change(() => removeMeal(kind, id), label);
  }

  function saveWeek(start, patch, label, opts) {
    change(() => {
      const cur = meals().week[start] || {};
      putMeal("week", start, { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) });
    }, label, opts);
  }

  // 某天吃什么（entry = null 就清空）。别的周的行里要是也有这天（改过一周从周几开始），一起清掉
  function setMealDay(start, date, entry, label) {
    change(() => {
      const D = meals();
      for (const w of Object.values(D.week)) {
        if (w.id === start || !w.days?.[date]) continue;
        const days = { ...w.days };
        delete days[date];
        putMeal("week", w.id, { ...w, days });
      }
      const cur = D.week[start] || {};
      const days = { ...(cur.days || {}) };
      if (entry) days[date] = entry;
      else delete days[date];
      putMeal("week", start, { ...cur, days });
    }, label);
  }

  // 这一轮看过了：sale = {price, until} 在打折；null = 没打折。
  // 两周以上一轮的，这次打折当新一轮的开始，下次照这个往后推
  function checkDeal(id, sale) {
    const ing = meals().ing[id];
    if (!ing) return;
    const T = today();
    const next = { ...ing, checked: T, sale: sale ? { price: Number(sale.price) || 0, from: T, until: sale.until || T } : null };
    if (sale && (Number(ing.every) || 0) >= 2) next.from = T;
    change(() => putMeal("ing", id, next), (sale ? "On sale: " : "Checked: ") + ing.name);
  }

  function addMealExamples(rows) {
    change(() => { for (const kind of ["ing", "box", "pack", "week"]) for (const r of rows[kind] || []) putMeal(kind, r.id, r); }, "Examples added — remove them under Groceries");
  }

  function importMeals(rows) {
    const count = (k, one, many) => { const n = (rows[k] || []).length; return n ? n + " " + (n === 1 ? one : many) : ""; };
    change(() => { for (const kind of ["ing", "box", "sup", "gear"]) for (const r of rows[kind] || []) putMeal(kind, r.id, r); },
      "Imported " + ([count("ing", "grocery", "groceries"), count("box", "box", "boxes"), count("sup", "to restock", "to restock"), count("gear", "item", "items")].filter(Boolean).join(" · ") || "nothing"));
  }

  const shortId = () => newId().replace(/-/g, "").slice(0, 10);

  // To try 里一次加几道（rows = [{ name, note }]，fields = 这几道共用的：kind、from、date、taskId）
  function addDishes(rows, fields = {}) {
    const now = Date.now();
    change(() => rows.forEach((r, k) => putMeal("dish", shortId(), { note: "", kind: "once", ...fields, ...r, order: now + k })),
      rows.length > 1 ? "Added " + rows.length + " dishes" : "");
  }

  // 一道菜做成 Box：建一个同名的（备注带过去，食材空着等你加），这道菜从清单里拿掉。返回 Box 的 id
  function dishToBox(id) {
    const d = meals().dish[id];
    if (!d) return "";
    const box = shortId();
    change(() => {
      putMeal("box", box, { name: d.name, slot: "", level: "", parts: [{ ing: "", amt: "" }], note: [d.note, d.from ? "had at " + d.from : ""].filter(Boolean).join(" — ") });
      drop("settings", mealKey("dish", id));
    }, "Made a box from " + (d.name || "it"));
    return box;
  }

  function clearMealExamples() {
    change(() => {
      for (const kind of ["box", "ing", "pack"]) for (const id of Object.keys(meals()[kind])) if (id.startsWith("ex-")) removeMeal(kind, id);
    }, "Examples removed");
  }

  return { meals, mealPrefs, saveMeal, deleteMeal, saveWeek, setMealDay, checkDeal, addMealExamples, importMeals, clearMealExamples, addDishes, dishToBox };
}
