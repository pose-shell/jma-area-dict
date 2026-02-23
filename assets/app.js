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

  function renderDetail(detailEl, it) {
    const raw = it.raw || {};
    const parent = raw.parent || raw.parentCode || "";
    const children = raw.children || raw.child || raw.childCode || [];
    detailEl.innerHTML = `
      <h2><code>${it.code}</code> ${escapeHtml(it.name)}</h2>
      <p><small>group: ${escapeHtml(it.group)}</small></p>
      <p>parent: ${parent ? `<code>${escapeHtml(String(parent))}</code>` : "-"}</p>
      <p>children: ${Array.isArray(children) && children.length ? children.map(c => `<code>${escapeHtml(String(c))}</code>`).join(" ") : "-"}</p>
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
    try {
      const areaJson = await loadAreaJson();
      items = flattenArea(areaJson);
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

      renderList(listEl, filtered, it => renderDetail(detailEl, it));
    }

    qEl.addEventListener("input", apply);
    apply();
  }

  return { initCodesPage };
})();
