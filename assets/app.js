window.JMA_DICT = (() => {
  const AREA_URL = "https://www.jma.go.jp/bosai/common/const/area.json";
  const CACHE_KEY = "area_json_v1";
  const CACHE_AT_KEY = "area_json_v1_saved_at";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  function now() { return Date.now(); }

  async function loadAreaJson() {
    const savedAt = Number(localStorage.getItem(CACHE_AT_KEY) || "0");
    const cached = localStorage.getItem(CACHE_KEY);
    const fresh = cached && (now() - savedAt) < CACHE_TTL_MS;

    if (fresh) return JSON.parse(cached);

    try {
      const res = await fetch(AREA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_AT_KEY, String(now()));
      return data;
    } catch (e) {
      if (cached) return JSON.parse(cached);
      throw e;
    }
  }

  function flattenArea(areaJson) {
  const items = [];
  const byCode = {}; // code -> { code, name, group, raw }

  for (const [groupName, group] of Object.entries(areaJson)) {
    if (!group || typeof group !== "object") continue;

    for (const [code, node] of Object.entries(group)) {
      if (!node || typeof node !== "object") continue;

      const item = {
        code,
        name: node.name || "",
        group: groupName,
        raw: node,
      };
      items.push(item);
      byCode[code] = item;
    }
  }
  return { items, byCode };
}
  
  function getParentCode(raw) {
  if (!raw || typeof raw !== "object") return "";
  return raw.parent || raw.parentCode || "";
}
  function resolveOfficeCode(startCode, byCode) {
  let cur = String(startCode || "");
  const visited = new Set();

  while (cur) {
    if (visited.has(cur)) return { office: "", path: [], reason: "loop" };
    visited.add(cur);

    const it = byCode[cur];
    if (!it) return { office: "", path: Array.from(visited), reason: "not_found" };

    if (it.group === "offices") {
      return { office: it.code, path: Array.from(visited), reason: "ok" };
    }

    const parent = getParentCode(it.raw);
    if (!parent) return { office: "", path: Array.from(visited), reason: "no_parent" };
    cur = String(parent);
  }

  return { office: "", path: Array.from(visited), reason: "unknown" };
}
  
  function renderList(listEl, items, onPick) {
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.innerHTML = "<p>該当なし</p>";
      return;
    }
    for (const it of items) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `<div><code>${it.code}</code> ${escapeHtml(it.name)}</div>
        <small>${escapeHtml(it.group)}</small>`;
      div.onclick = () => onPick(it);
      listEl.appendChild(div);
    }
  }

  function renderDetail(detailEl, it, byCode, parentMap) {
  const raw = it.raw || {};
  const parent = getParentCode(raw, it.code, parentMap);

  function resolveOfficeCode(startCode, byCode, parentMap) {
  let cur = String(startCode || "");
  const path = [];
  const visited = new Set();

  while (cur) {
    if (visited.has(cur)) return { office: "", path, reason: "loop" };
    visited.add(cur);
    path.push(cur);

    const it = byCode[cur];
    if (!it) return { office: "", path, reason: "not_found" };

    if (it.group === "offices") {
      return { office: it.code, path, reason: "ok" };
    }

    const parent = getParentCode(it.raw, it.code, parentMap);
    if (!parent) return { office: "", path, reason: "no_parent" };

    cur = parent;
  }

  return { office: "", path, reason: "unknown" };
}
  // office解決
  const r = resolveOfficeCode(it.code, byCode, parentMap);
  const office = r.office;
  const forecastUrl = office ? `https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json` : "";
  const overviewUrl = office ? `https://www.jma.go.jp/bosai/forecast/data/overview_forecast/${office}.json` : "";

  detailEl.innerHTML = `
    <h2><code>${it.code}</code> ${escapeHtml(it.name)}</h2>
    <p><small>group: ${escapeHtml(it.group)}</small></p>

    <h3>office解決（予報取得用）</h3>
    <p>office: ${office ? `<code>${escapeHtml(office)}</code>` : "<span>未解決</span>"}</p>
    ${office ? `
      <p>forecast: <code>${escapeHtml(forecastUrl)}</code></p>
      <p>overview: <code>${escapeHtml(overviewUrl)}</code></p>
    ` : `
      <p><small>親を辿ってofficesに到達できませんでした（reason: ${escapeHtml(r.reason)}）</small></p>
    `}
    <p><small>探索経路: ${r.path.map(c => `<code>${escapeHtml(c)}</code>`).join(" ")}</small></p>

    <h3>階層</h3>
    <p>parent: ${parent ? `<code>${escapeHtml(String(parent))}</code>` : "-"}</p>

    <h3>raw</h3>
    <pre>${escapeHtml(JSON.stringify(raw, null, 2))}</pre>
  `;
}

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function initCodesPage() {
    const qEl = document.getElementById("q");
    const listEl = document.getElementById("list");
    const detailEl = document.getElementById("detail");

    listEl.innerHTML = "<p>読み込み中…</p>";
    let byCode;
    let parentMap; 
    let items;
    try {
      const areaJson = await loadAreaJson();
      const flat = flattenArea(areaJson);
      items = flat.items;
      byCode = flat.byCode;
      parentMap = buildParentMap(areaJson); 
    } catch (e) {
      listEl.innerHTML = `<p>area.json の取得に失敗しました。</p><pre>${escapeHtml(e.message || e)}</pre>`;
      return;
    }

    function apply() {
      const q = (qEl.value || "").trim();
      const qLower = q.toLowerCase();
      const filtered = !q ? items.slice(0, 50) : items
        .filter(it =>
          it.code.includes(q) ||
          it.name.toLowerCase().includes(qLower)
        )
        .slice(0, 50);

      renderList(listEl, filtered, it => renderDetail(detailEl, it, byCode));
    }

    qEl.addEventListener("input", apply);
    apply();
  }

  return { initCodesPage };
})();
