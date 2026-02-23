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

  // childCode -> parentCode を逆引きで作る（親→children しか無いケースに対応）
  function buildParentMap(areaJson) {
    const parentMap = {}; // childCode -> parentCode

    for (const group of Object.values(areaJson)) {
      if (!group || typeof group !== "object") continue;

      for (const [parentCode, node] of Object.entries(group)) {
        if (!node || typeof node !== "object") continue;

        const children =
          node.children || node.child || node.childCode || node.childCodes || [];

        if (Array.isArray(children)) {
          for (const childCode of children) {
            const c = String(childCode);
            if (!parentMap[c]) parentMap[c] = String(parentCode);
          }
        }
      }
    }
    return parentMap;
  }

  function getParentCode(raw, code, parentMap) {
    if (raw && typeof raw === "object") {
      const p = raw.parent || raw.parentCode;
      if (p) return String(p);
    }
    if (parentMap && parentMap[String(code)]) return parentMap[String(code)];
    return "";
  }

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
      div.onclick = () => {
      try {
        onPick(it);
      } catch (e) {
        alert("クリック処理でエラー: " + (e?.message || e));
        console.error(e);
        }
      };
      listEl.appendChild(div);
    }
  }

  function renderDetail(detailEl, it, byCode, parentMap) {
    const raw = it.raw || {};
    const parent = getParentCode(raw, it.code, parentMap);

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

    let items;
    let byCode;
    let parentMap;

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

      renderList(listEl, filtered, it => renderDetail(detailEl, it, byCode, parentMap));
    }

    qEl.addEventListener("input", apply);
    apply();
  }

  return { initCodesPage };
})();
