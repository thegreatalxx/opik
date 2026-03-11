const SNAPSHOT_MAX_LENGTH = 30_000;
const CELL_MAX = 80;
const TEXT_MAX = 200;
const TABLE_HEAD_ROWS = 30;
const TABLE_TAIL_ROWS = 5;
const TABLE_MAX_ROWS = 50;

const SKIP_TAGS = new Set([
  "script",
  "style",
  "svg",
  "noscript",
  "link",
  "meta",
]);

const SEMANTIC_ATTRS = [
  "role",
  "aria-label",
  "data-ollie-uid",
  "data-panel-id",
  "data-row-id",
];

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function textOf(el: Element): string {
  return el.textContent?.trim() || "";
}

function serializeSidebar(el: Element): string {
  const items: string[] = [];
  el.querySelectorAll("a, button").forEach((link) => {
    const text = textOf(link);
    if (text) items.push(text);
  });
  return items.length ? `[nav] ${items.join(" | ")}` : "";
}

function serializeBreadcrumb(el: Element): string {
  const parts: string[] = [];
  el.querySelectorAll("a, span, li").forEach((node) => {
    const t = node.childNodes.length === 1 &&
      node.childNodes[0].nodeType === Node.TEXT_NODE
      ? node.childNodes[0].textContent?.trim() || ""
      : "";
    if (t && !parts.includes(t)) parts.push(t);
  });
  return parts.length ? `[breadcrumb] ${parts.join(" / ")}` : "";
}

function serializeTable(el: Element): string {
  const lines: string[] = [];

  const headers: string[] = [];
  el.querySelectorAll("thead th").forEach((th) => {
    const wrapper = th.querySelector("[data-header-wrapper]");
    const span = wrapper?.querySelector("span");
    headers.push(span ? textOf(span) : textOf(th));
  });

  if (headers.length) {
    lines.push("| " + headers.join(" | ") + " |");
  }

  const rows = el.querySelectorAll("tbody tr[data-row-id]");
  const totalRows = rows.length;

  const serializeRow = (tr: Element) => {
    const cells: string[] = [];
    tr.querySelectorAll("td").forEach((td) => {
      const wrapper = td.querySelector("[data-cell-wrapper]");
      const raw = wrapper ? textOf(wrapper) : textOf(td);
      cells.push(truncate(raw, CELL_MAX));
    });
    const markers: string[] = [];
    if (tr.getAttribute("data-state") === "selected") markers.push("selected");
    if (tr.getAttribute("data-row-active") === "true") markers.push("active");
    const suffix = markers.length ? ` ← [${markers.join(", ")}]` : "";
    lines.push("| " + cells.join(" | ") + " |" + suffix);
  };

  if (totalRows <= TABLE_MAX_ROWS) {
    rows.forEach((tr) => serializeRow(tr));
  } else {
    for (let i = 0; i < TABLE_HEAD_ROWS; i++) serializeRow(rows[i]);
    lines.push(
      `... (${totalRows - TABLE_HEAD_ROWS - TABLE_TAIL_ROWS} more rows hidden)`,
    );
    for (let i = totalRows - TABLE_TAIL_ROWS; i < totalRows; i++)
      serializeRow(rows[i]);
  }

  return `[table: ${totalRows} rows]\n${lines.join("\n")}`;
}

function serializePanel(el: Element): string {
  const panelId = el.getAttribute("data-panel-id") || "";
  const text = truncate(textOf(el), 1500);
  return `[panel:${panelId}] ${text}`;
}

function shouldSkip(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return true;
  if ((el as HTMLElement).hidden) return true;
  if (tag === "footer") return true;
  if (el.hasAttribute("data-ollie-assist")) return true;
  return false;
}

type RegionMatch = { serializer: (el: Element) => string } | "skip" | null;

function matchRegion(el: Element): RegionMatch {
  if (el.matches("aside.comet-sidebar-width")) {
    return { serializer: serializeSidebar };
  }
  if (el.matches('nav[aria-label="breadcrumb"]')) {
    return { serializer: serializeBreadcrumb };
  }
  if (el.matches("nav.comet-header-height")) {
    return "skip";
  }
  if (el.matches(".comet-sticky-table") || el.tagName === "TABLE") {
    return { serializer: serializeTable };
  }
  if (el.hasAttribute("data-panel-id")) {
    return { serializer: serializePanel };
  }
  return null;
}

function isWrapperDiv(el: Element): boolean {
  if (el.tagName !== "DIV") return false;
  for (const attr of SEMANTIC_ATTRS) {
    if (el.hasAttribute(attr)) return false;
  }
  return true;
}

function walk(el: Element): string {
  if (shouldSkip(el)) return "";

  const region = matchRegion(el);
  if (region === "skip") return "";
  if (region) return region.serializer(el);

  if (isWrapperDiv(el)) {
    const parts: string[] = [];
    for (const child of el.children) {
      const r = walk(child);
      if (r) parts.push(r);
    }
    return parts.join("\n");
  }

  const tag = el.tagName.toLowerCase();
  const attrs: string[] = [];
  for (const attr of SEMANTIC_ATTRS) {
    const val = el.getAttribute(attr);
    if (val) {
      const name = attr === "data-ollie-uid" ? "uid" : attr;
      attrs.push(`${name}="${val}"`);
    }
  }

  const directText =
    el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE
      ? el.childNodes[0].textContent?.trim() || ""
      : "";

  if (directText) {
    const attrStr = attrs.length ? " " + attrs.join(" ") : "";
    return `<${tag}${attrStr}>${truncate(directText, TEXT_MAX)}`;
  }

  const childResults: string[] = [];
  for (const child of el.children) {
    const r = walk(child);
    if (r) childResults.push(r);
  }

  if (childResults.length) {
    const attrStr = attrs.length ? " " + attrs.join(" ") : "";
    return `<${tag}${attrStr}>\n${childResults.join("\n")}`;
  }

  const fallbackText = textOf(el);
  if (fallbackText) {
    const attrStr = attrs.length ? " " + attrs.join(" ") : "";
    return `<${tag}${attrStr}>${truncate(fallbackText, TEXT_MAX)}`;
  }

  return "";
}

export function captureSnapshot(): string {
  const snapshot = walk(document.body);
  if (snapshot.length > SNAPSHOT_MAX_LENGTH) {
    return snapshot.slice(0, SNAPSHOT_MAX_LENGTH) + "\n<!-- truncated -->";
  }
  return snapshot;
}
