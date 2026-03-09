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

  // childCode -> parentCode（親→children しか無い場合の逆引き）
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

      // ★安全化パッチ：クリック時の例外を見える化
      div.onclick = () => {
        try {
          onPick(it);
        } catch (e) {
          console.error(e);
          alert("クリック処理でエラー: " + (e?.message || e));
        }
      };

      listEl.appendChild(div);
    }
  }

  // ★安全化パッチ：renderDetail 全体を try/catch にして detail ペインにエラーを出す
  function renderDetail(detailEl, it, byCode, parentMap) {
    try {
      // ★安全化パッチ：クリックが生きているかを即確認できる
      detailEl.innerHTML = `<p>選択中: <code>${escapeHtml(it.code)}</code> ${escapeHtml(it.name)}</p>`;

      const raw = it.raw || {};
      const parent = getParentCode(raw, it.code, parentMap);

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
          <p><a href="./playground.html?code=${encodeURIComponent(office)}">Playgroundで開く（office）</a></p>
          <p><a href="./playground.html?code=${encodeURIComponent(it.code)}">Playgroundで開く（このコード）</a></p>
        ` : `
          <p><small>親を辿ってofficesに到達できませんでした（reason: ${escapeHtml(r.reason)}）</small></p>
        `}
        <p><small>探索経路: ${r.path.map(c => `<code>${escapeHtml(c)}</code>`).join(" ")}</small></p>

        <h3>階層</h3>
        <p>parent: ${parent ? `<code>${escapeHtml(String(parent))}</code>` : "-"}</p>

        <h3>raw</h3>
        <pre>${escapeHtml(JSON.stringify(raw, null, 2))}</pre>
      `;
    } catch (e) {
      console.error(e);
      detailEl.innerHTML = `
        <h3>detail表示でエラー</h3>
        <pre>${escapeHtml(e?.stack || e?.message || String(e))}</pre>
      `;
    }
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
      listEl.innerHTML = `<p>area.json の取得に失敗しました。</p><pre>${escapeHtml(e?.stack || e?.message || String(e))}</pre>`;
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

async function loadForecastJson(office) {
  const url = `https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`forecast HTTP ${res.status}`);
  return { url, json: await res.json() };
}
async function loadOverviewJson(office) {
  const url = `https://www.jma.go.jp/bosai/forecast/data/overview_forecast/${office}.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`overview HTTP ${res.status}`);
  return { url, json: await res.json() };
}

// JSON Pointer（RFC6901）ユーティリティ
function escapePtrToken(s) {
  return String(s).replaceAll("~", "~0").replaceAll("/", "~1");
}
function unescapePtrToken(s) {
  return String(s).replaceAll("~1", "/").replaceAll("~0", "~");
}
function getByPointer(obj, ptr) {
  if (!ptr || ptr === "/") return obj;
  if (!ptr.startsWith("/")) throw new Error("pointer must start with /");
  const parts = ptr.split("/").slice(1).map(unescapePtrToken);
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

function buildTreeDom(value, basePtr, onPick) {
  const wrap = document.createElement("div");

  function nodeLabel(k, v) {
    const t = Array.isArray(v) ? "array" : (v && typeof v === "object" ? "object" : typeof v);
    if (t === "object") return `${k}: {}`;
    if (t === "array") return `${k}: [] (${v.length})`;
    if (t === "string") return `${k}: "${v}"`;
    return `${k}: ${String(v)}`;
  }

  function build(v, ptr, keyLabel) {
    const isObj = v && typeof v === "object";
    const isArr = Array.isArray(v);

    const row = document.createElement("div");
    row.style.padding = "6px";
    row.style.borderRadius = "6px";
    row.style.cursor = "pointer";

    row.dataset.ptr = ptr;
    row.textContent = nodeLabel(keyLabel, v);

    row.onclick = (e) => {
      e.stopPropagation();
      onPick(ptr, v);
    };

    const childrenWrap = document.createElement("div");
    childrenWrap.style.marginLeft = "14px";
    childrenWrap.style.display = "none";

    if (isObj) {
      const keys = isArr ? v.map((_, i) => String(i)) : Object.keys(v);
      for (const k of keys) {
        const child = isArr ? v[Number(k)] : v[k];
        const childPtr = ptr + "/" + escapePtrToken(k);
        const childRow = build(child, childPtr, k);
        childrenWrap.appendChild(childRow);
      }

      // 展開トグル（ダブルクリックで開閉）
      row.ondblclick = (e) => {
        e.stopPropagation();
        childrenWrap.style.display = childrenWrap.style.display === "none" ? "block" : "none";
      };
    }

    const container = document.createElement("div");
    container.appendChild(row);
    if (isObj) container.appendChild(childrenWrap);
    return container;
  }

  wrap.appendChild(build(value, basePtr, "(root)"));
  return wrap;
}

function highlightPtr(treeEl, ptr) {
  // 全行の強調をリセット
  treeEl.querySelectorAll("[data-ptr]").forEach(el => {
    el.style.background = "";
    el.style.outline = "";
  });

  const target = treeEl.querySelector(`[data-ptr="${CSS.escape(ptr)}"]`);
  if (!target) return false;

  // 祖先の childrenWrap を展開（簡易：上に辿って前の兄弟が childrenWrap なら開ける、を繰り返す）
  let cur = target;
  while (cur && cur !== treeEl) {
    const parent = cur.parentElement;
    if (!parent) break;
    // container = row + childrenWrap の構造なので、親が childrenWrap なら表示blockにする
    if (parent.style && parent.style.marginLeft === "14px") {
      parent.style.display = "block";
    }
    cur = parent;
  }

  target.style.background = "#fff6cc";
  target.style.outline = "1px solid #e0c24f";
  target.scrollIntoView({ block: "center" });
  return true;
}

async function initPlaygroundPage() {
  const codeEl = document.getElementById("code");
  const goEl = document.getElementById("go");
  const ptrEl = document.getElementById("ptr");
  const jumpEl = document.getElementById("jump");
  const copyPtrEl = document.getElementById("copyPtr");
  const treeEl = document.getElementById("tree");
  const rawEl = document.getElementById("raw");

  let state = {
    office: "",
    forecast: null, // {url, json}
    overview: null, // {url, json}
    active: "forecast", // forecast | overview
  };

  // クエリから初期値（?code=2920900 のように渡せるように）
const params = new URLSearchParams(location.search);
const qcode = params.get("code");
const qactive = params.get("active"); // forecast / overview
const qptr = params.get("ptr");       // JSON Pointer

if (qcode) codeEl.value = qcode;

// ★active が正しい値のときだけ反映（事故防止）
if (qactive === "forecast" || qactive === "overview") {
  state.active = qactive;
}

// ★ptr はそのまま入力欄へ
if (qptr) ptrEl.value = qptr;

  async function resolveOfficeFromAnyCode(inputCode) {
    // 6桁なら office とみなす（最小ルール）
    if (/^\d{6}$/.test(inputCode)) return inputCode;

    // それ以外は area.json から辿る
    const areaJson = await loadAreaJson();
    const { byCode } = flattenArea(areaJson);
    const parentMap = buildParentMap(areaJson);

    const r = resolveOfficeCode(inputCode, byCode, parentMap);
    if (!r.office) throw new Error(`office未解決（reason: ${r.reason}）`);
    return r.office;
  }

  async function fetchAll() {
    const input = (codeEl.value || "").trim();
    if (!input) return;

    treeEl.innerHTML = "<p>取得中…</p>";
    rawEl.innerHTML = "<p>取得中…</p>";

    try {
      const office = await resolveOfficeFromAnyCode(input);
      state.office = office;

      const [forecast, overview] = await Promise.all([
        loadForecastJson(office),
        loadOverviewJson(office),
      ]);
      state.forecast = forecast;
      state.overview = overview;
      state.active = "forecast";

      // ツリー（forecastを表示）
      renderActive();
      // ★ptr が入っていれば自動で Selected 表示まで進める
　　　if (ptrEl.value.trim()) jumpEl.click();
    } catch (e) {
      const msg = e?.stack || e?.message || String(e);
      treeEl.innerHTML = `<p>エラー</p><pre>${escapeHtml(msg)}</pre>`;
      rawEl.innerHTML = `<p>エラー</p><pre>${escapeHtml(msg)}</pre>`;
    }
  }

  function renderActive() {
    const data = state.active === "forecast" ? state.forecast : state.overview;
    if (!data) return;

    // ツリー
    treeEl.innerHTML = "";
    const dom = buildTreeDom(data.json, "", (ptr, v) => {
      ptrEl.value = ptr || "/";
      rawEl.innerHTML = `
        <h3>${escapeHtml(state.active)} JSON</h3>
        <p><small>office: <code>${escapeHtml(state.office)}</code></small></p>
        <p><small>url: <code>${escapeHtml(data.url)}</code></small></p>
        <h4>Selected</h4>
        <pre>${escapeHtml(JSON.stringify(v, null, 2))}</pre>
      `;
      highlightPtr(treeEl, ptr);
    });
    treeEl.appendChild(dom);

    // 右ペイン：全体JSON（大きいので最初はメタ＋ルートだけ）
    rawEl.innerHTML = `
      <h3>${escapeHtml(state.active)} JSON</h3>
      <p><small>office: <code>${escapeHtml(state.office)}</code></small></p>
      <p><small>url: <code>${escapeHtml(data.url)}</code></small></p>
      <p><small>ツリーをクリックすると、その部分（Selected）を表示します。</small></p>
    `;
  }

  goEl.onclick = fetchAll;

  jumpEl.onclick = () => {
    const ptr = (ptrEl.value || "").trim();
    const data = state.active === "forecast" ? state.forecast : state.overview;
    if (!data) return;

    try {
      const v = getByPointer(data.json, ptr === "/" ? "" : ptr);
      if (v === undefined) throw new Error("pointerの指す値が見つかりません");
      highlightPtr(treeEl, ptr === "/" ? "" : ptr);
      rawEl.innerHTML = `
        <h3>${escapeHtml(state.active)} JSON</h3>
        <p><small>office: <code>${escapeHtml(state.office)}</code></small></p>
        <p><small>url: <code>${escapeHtml(data.url)}</code></small></p>
        <h4>Selected</h4>
        <pre>${escapeHtml(JSON.stringify(v, null, 2))}</pre>
      `;
    } catch (e) {
      alert("ハイライト失敗: " + (e?.message || e));
    }
  };

  copyPtrEl.onclick = async () => {
    try {
      await navigator.clipboard.writeText(ptrEl.value || "");
    } catch (e) {
      alert("コピーに失敗しました（ブラウザ権限の問題の可能性）");
    }
  };

  // 初期取得（クエリ指定があれば）
  if (codeEl.value.trim()) fetchAll();

  // active切替（最小：キーボード f/o で切替）
  document.addEventListener("keydown", (e) => {
    if (e.key === "f") { state.active = "forecast"; renderActive(); }
    if (e.key === "o") { state.active = "overview"; renderActive(); }
  });
}
const COMMON_PATHS = [
  {
    title: "forecast: 発表時刻（reportDatetime）",
    active: "forecast",
    ptr: "/0/reportDatetime",
    note: "配列0件目に入っていることが多い",
  },
  {
    title: "forecast: timeSeries（全体）",
    active: "forecast",
    ptr: "/0/timeSeries",
    note: "天気/降水確率/気温などのまとまり",
  },
  {
    title: "forecast: 1つ目のtimeSeries",
    active: "forecast",
    ptr: "/0/timeSeries/0",
    note: "areas配下に対象エリア別の値",
  },
  {
    title: "forecast: 1つ目のtimeSeriesのareas",
    active: "forecast",
    ptr: "/0/timeSeries/0/areas",
    note: "エリア別の値（weathers/pops/temps等）",
  },
  {
    title: "overview: 発表時刻（reportDatetime）",
    active: "overview",
    ptr: "/reportDatetime",
    note: "overviewは配列ではなくオブジェクトのことが多い",
  },
  {
    title: "overview: 概況本文（text）",
    active: "overview",
    ptr: "/text",
    note: "天気概況の文章",
  },
];

function initPathsPage() {
  const codeEl = document.getElementById("code");
  const useEl = document.getElementById("use");
  const listEl = document.getElementById("list");

  // 初期値
  codeEl.value = "2920900";

  function render(code) {
    const safeCode = encodeURIComponent(code || "");
    listEl.innerHTML = "";

    for (const p of COMMON_PATHS) {
      const div = document.createElement("div");
      div.className = "item";
      div.style.borderBottom = "1px solid #eee";

      // Playgroundに渡す：code, active, ptr
      const href = `./playground.html?code=${safeCode}&active=${encodeURIComponent(p.active)}&ptr=${encodeURIComponent(p.ptr)}`;

      div.innerHTML = `
        <div><a href="${href}">${escapeHtml(p.title)}</a></div>
        <small>pointer: <code>${escapeHtml(p.ptr)}</code> / ${escapeHtml(p.note)}</small>
      `;
      listEl.appendChild(div);
    }
  }

  useEl.onclick = () => render(codeEl.value.trim());
  render(codeEl.value.trim());
}
  return { initCodesPage, initPlaygroundPage, initPathsPage };
})();
