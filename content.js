/**
 * VK group-chat image helper.
 * Does NOT rewrite width/height/quality query params into guessed values.
 * Prefers the page's own viewer; falls back to opening an already-present URL.
 */
(() => {
  "use strict";

  const IMAGE_HOST_RE =
    /(^|\.)(userapi\.com|vk-cdn\.(net|me)|mycdn\.me|okcdn\.ru|vk\.(com|ru))$/i;
  const SKIP_HOST_RE = /(^|\.)(login\.|api\.|oauth\.)/i;
  const BIND_FLAG = "__vkDpiImgClickBound";

  if (window[BIND_FLAG]) return;
  window[BIND_FLAG] = true;

  const ATTR_CANDIDATES = [
    "data-original",
    "data-orig-src",
    "data-src-original",
    "data-src",
    "data-large",
    "data-full",
    "data-max-src",
    "data-photo-src",
    "data-image",
    "href",
  ];

  function isImageHost(url) {
    try {
      const u = new URL(url, location.href);
      if (!/^https?:$/i.test(u.protocol)) return false;
      if (u.username || u.password) return false;
      const h = u.hostname.toLowerCase();
      if (SKIP_HOST_RE.test(h)) return false;
      return IMAGE_HOST_RE.test(h);
    } catch {
      return false;
    }
  }

  function sanitizeUrlForLog(url) {
    try {
      const u = new URL(url, location.href);
      const segs = u.pathname.split("/").filter(Boolean);
      const head = segs[0] || "";
      return `${u.hostname}/${head ? head + "/*" : ""}`;
    } catch {
      return "(bad-url)";
    }
  }

  function parseSrcset(srcset) {
    if (!srcset) return [];
    return String(srcset)
      .split(",")
      .map((part) => {
        const bits = part.trim().split(/\s+/);
        const url = bits[0];
        let score = 0;
        const desc = bits[1] || "";
        const m = /^(\d+(?:\.\d+)?)(w|x)?$/i.exec(desc);
        if (m) score = parseFloat(m[1]) * (m[2] === "x" ? 1000 : 1);
        return { url, score };
      })
      .filter((x) => x.url && isImageHost(x.url));
  }

  function cssBgUrl(el) {
    try {
      const bg = getComputedStyle(el).backgroundImage || "";
      const m = /url\(["']?(https?:\/\/[^"')]+)["']?\)/i.exec(bg);
      return m ? m[1] : "";
    } catch {
      return "";
    }
  }

  function collectUrls(el) {
    const found = [];
    const push = (url, score, source) => {
      if (!url || !isImageHost(url)) return;
      found.push({ url, score: score || 0, source });
    };

    if (el instanceof HTMLImageElement) {
      push(el.currentSrc || el.src, 10, "img.src");
      for (const { url, score } of parseSrcset(el.srcset)) {
        push(url, 1000 + score, "img.srcset");
      }
      if (el.dataset) {
        for (const [k, v] of Object.entries(el.dataset)) {
          if (/src|original|photo|image|large|full/i.test(k) && v) {
            push(v, 500, `data-${k}`);
          }
        }
      }
    }

    if (el instanceof HTMLAnchorElement) {
      push(el.href, 50, "a.href");
    }

    for (const name of ATTR_CANDIDATES) {
      const v = el.getAttribute?.(name);
      if (v) push(v, name.includes("original") || name.includes("orig") ? 800 : 200, name);
    }

    const bg = cssBgUrl(el);
    if (bg) push(bg, 80, "css.bg");

    return found;
  }

  function pickBestUrl(candidates) {
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  function looksLikeAvatarOrEmoji(el) {
    if (!(el instanceof Element)) return true;
    const cls = `${el.className || ""} ${el.getAttribute?.("class") || ""}`.toLowerCase();
    const aria = (el.getAttribute?.("aria-label") || "").toLowerCase();
    const alt = (el.getAttribute?.("alt") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const blob = `${cls} ${aria} ${alt} ${id}`;
    if (
      /avatar|sticker|emoji|reaction|smiles|owner_photo|peer_avatar|im_avatar|video_thumb|preview_video|ads?_|advert/.test(
        blob
      )
    ) {
      return true;
    }
    if (el instanceof HTMLImageElement) {
      const w = el.naturalWidth || el.width || 0;
      const h = el.naturalHeight || el.height || 0;
      // Tiny assets are almost never chat photos.
      if (w > 0 && h > 0 && w <= 64 && h <= 64) return true;
    }
    return false;
  }

  function inMessageContext(el) {
    // Avoid brittle VK class names: use role / semantic hints + chat history roots.
    let cur = el;
    for (let i = 0; i < 12 && cur; i++) {
      if (!(cur instanceof Element)) break;
      const role = (cur.getAttribute("role") || "").toLowerCase();
      const cls = `${cur.className || ""}`.toLowerCase();
      const tag = cur.tagName;
      if (role === "listitem" || role === "article" || role === "row") return true;
      if (/message|msg|im[-_]?hist|bubble|attachment|conv|peer/.test(cls)) return true;
      if (tag === "ARTICLE") return true;
      cur = cur.parentElement;
    }
    // Fallback: large enough image on messaging routes.
    const path = location.pathname || "";
    if (/\/im|\/messenger|\/write|\/mail/i.test(path)) return true;
    return false;
  }

  function hasOpenViewer() {
    const nodes = document.querySelectorAll(
      '[class*="Photo"],[class*="photo"],[class*="Viewer"],[class*="viewer"],[role="dialog"]'
    );
    for (const n of nodes) {
      const style = getComputedStyle(n);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = n.getBoundingClientRect();
      if (r.width > 200 && r.height > 200) return true;
    }
    return false;
  }

  function composedTargets(ev) {
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
    if (path && path.length) return path.filter((n) => n instanceof Element);
    const out = [];
    let n = ev.target;
    while (n) {
      if (n instanceof Element) out.push(n);
      n = n.parentElement || n.host || null;
    }
    return out;
  }

  function findPhotoTarget(ev) {
    const path = composedTargets(ev);
    for (const el of path) {
      if (looksLikeAvatarOrEmoji(el)) continue;
      const urls = collectUrls(el);
      if (!urls.length) continue;
      if (!inMessageContext(el) && !(el instanceof HTMLImageElement && (el.naturalWidth || 0) > 120)) {
        continue;
      }
      const best = pickBestUrl(urls);
      if (!best) continue;
      return { el, best, all: urls };
    }
    return null;
  }

  function tryNativeOpen(el) {
    // If VK already wired a viewer on an ancestor button/link, let it run.
    if (hasOpenViewer()) return true;
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
      if (cur instanceof HTMLAnchorElement && cur.href && isImageHost(cur.href)) {
        // Let the browser / VK handler follow the link first.
        return false;
      }
      const role = (cur.getAttribute?.("role") || "").toLowerCase();
      if (role === "button" || cur.tagName === "BUTTON") {
        return false; // do not steal — VK button may open viewer
      }
      cur = cur.parentElement;
    }
    return false;
  }

  function openFallback(url) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      return false;
    }
  }

  function dumpDiag(hit) {
    const attrs = {};
    if (hit?.el?.attributes) {
      for (const a of hit.el.attributes) {
        if (/src|href|original|photo|image|large|full|srcset/i.test(a.name)) {
          attrs[a.name] = isImageHost(a.value)
            ? sanitizeUrlForLog(a.value)
            : "(non-image-or-relative)";
        }
      }
    }
    // eslint-disable-next-line no-console
    console.info("[vk-dpi-img]", {
      host: location.hostname,
      picked: hit?.best ? sanitizeUrlForLog(hit.best.url) : null,
      source: hit?.best?.source || null,
      candidates: (hit?.all || []).map((c) => ({
        src: sanitizeUrlForLog(c.url),
        score: c.score,
        source: c.source,
      })),
      attrs,
      note: "No query tokens logged. Alt+Click for this dump.",
    });
  }

  document.addEventListener(
    "click",
    (ev) => {
      if (ev.defaultPrevented) return;
      if (ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;

      const hit = findPhotoTarget(ev);
      if (!hit) return;

      if (ev.altKey) {
        dumpDiag(hit);
        return;
      }

      // Prefer not to break VK's own viewer when a dialog already exists
      // or when the click target is an interactive control VK owns.
      if (tryNativeOpen(hit.el)) return;

      // Soft approach: only intervene when the page did not navigate / open
      // a viewer shortly after the native handlers run.
      const url = hit.best.url;
      const before = hasOpenViewer();
      window.setTimeout(() => {
        if (hasOpenViewer() && !before) return;
        if (hasOpenViewer() && before) return;
        // Still no viewer — open the largest URL already present on the node.
        openFallback(url);
      }, 280);

      // Do not preventDefault on first pass so VK's listener can run.
      // If a second click arrives with prevent needed, user can Alt+Click diag.
    },
    true
  );

  // Explicit open: double-click forces best available URL without waiting.
  document.addEventListener(
    "dblclick",
    (ev) => {
      const hit = findPhotoTarget(ev);
      if (!hit) return;
      ev.preventDefault();
      ev.stopPropagation();
      openFallback(hit.best.url);
    },
    true
  );
})();
