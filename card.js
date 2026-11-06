/* KEYED passport card. The card is a stack of layers on two faces, cut to the key's record,
   lit by the pointer, flipped on click, and exported to PNG for sharing. */
(function () {
  "use strict";

  var root = document.documentElement;
  var plate = document.getElementById("plate");
  if (!plate) return;
  var stage = document.getElementById("stage3d");
  var wrap = document.getElementById("cardwrap");
  var card = document.getElementById("card");
  var front = document.getElementById("front");
  var back = document.getElementById("back");
  var shadow = document.getElementById("shadow");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hover = window.matchMedia("(hover: hover)").matches;

  /* ---------- the record: where each tooth sits and how deep it goes ---------- */
  var TEETH = [-0.85, 0.05, 1, 1.95, 2.85]; // same centres as the shader
  var DEPTH = [0.22, 0.34, 0.44, 0.27, 0.38];
  var HALF = 0.36, FLAT = 0.28, BLADE_START = -1.6, BLADE = 5.6;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function f1(n) { return (Math.round(n * 10) / 10).toString(); }

  var W = 0, H = 0, tall = false;

  function layout() {
    var cs = getComputedStyle(plate);
    var inner = plate.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var w = Math.min(inner, 740);
    if (w <= 0) return;
    tall = w < 480;
    var h = tall ? w * 1.3 : w / 1.586;
    W = w; H = h;
    root.style.setProperty("--card-w", w + "px");
    root.style.setProperty("--card-h", h + "px");
    root.classList.toggle("is-tall", tall);

    root.style.setProperty("--card-r", (tall ? w * 0.05 : w * 0.03) + "px");
    root.style.setProperty("--card-pad", Math.max(7, w * 0.014) + "px");
    cut();
  }

  /* ---------- the cut: the paper's edge follows the key's record ---------- */
  // Five teeth; depth per verified field (account, game, playtime, progress, crew). Units: card width.
  function cutGeometry(W, H, tall, back) {
    var E = W * 0.06, hw = tall ? W * 0.034 : W * 0.022, fl = hw * 0.32;
    var pts = [], local = [], ox, oy;
    function tooth(i) { return W * (0.03 + DEPTH[i] * 0.06); }
    if (!tall && !back) {
      // Paper box: x from 0.40W, full height. Edge at local x = E; teeth notch into the paper (+x).
      ox = W * 0.4; oy = 0;
      var pw = W - ox, y0 = H * 0.1, y1 = H * 0.58;
      local.push([E, 0], [pw, 0], [pw, H], [E, H]);
      for (var i = TEETH.length - 1; i >= 0; i--) {
        var y = y0 + (y1 - y0) * (i / (TEETH.length - 1)), d = tooth(i);
        local.push([E, y + hw], [E + d, y + fl], [E + d, y - fl], [E, y - hw]);
      }
    } else if (!tall && back) {
      // Mirrored: paper on the left, edge at local x = pw - E, teeth notch leftwards.
      ox = 0; oy = 0;
      var pw2 = W * 0.64, ex = pw2 - E, ya = H * 0.1, yb = H * 0.58;
      local.push([0, 0], [ex, 0]);
      for (var j = 0; j < TEETH.length; j++) {
        var yy = ya + (yb - ya) * (j / (TEETH.length - 1)), dd = tooth(j);
        local.push([ex, yy - hw], [ex - dd, yy - fl], [ex - dd, yy + fl], [ex, yy + hw]);
      }
      local.push([ex, H], [0, H]);
    } else {
      // Tall: paper box from y = 0.44W, full width. Edge at local y = E; teeth notch downwards.
      ox = 0; oy = W * 0.44;
      var ph = H - oy, x0 = W * 0.1, x1 = W * 0.6;
      local.push([0, E], [0, ph], [W, ph], [W, E]);
      for (var t = TEETH.length - 1; t >= 0; t--) {
        var x = x0 + (x1 - x0) * (t / (TEETH.length - 1)), dt = tooth(t);
        local.push([x + hw, E], [x + fl, E + dt], [x - fl, E + dt], [x - hw, E]);
      }
    }
    var clip = "polygon(" + local.map(function (p) { return f1(p[0]) + "px " + f1(p[1]) + "px"; }).join(",") + ")";
    // The visible edge only (everything but the outer box sides), in card coordinates.
    var edgePts = local.filter(function (p, k) {
      if (!tall && !back) return k === 0 || k >= 3;
      if (!tall && back) return k >= 1 && k <= local.length - 2;
      return k === 0 || k >= 3;
    });
    var d = "M" + edgePts.map(function (p) { return f1(p[0] + ox) + " " + f1(p[1] + oy); }).join("L");
    return { clip: clip, path: d };
  }
  /* The holder's name fills its line: long names shrink instead of wrapping. */
  function fitName() {
    var el = front.querySelector(".print__name");
    if (!el) return;
    el.style.fontSize = "";
    var cs = getComputedStyle(el), base = parseFloat(cs.fontSize), avail = el.clientWidth;
    if (!avail) return;
    var c = fitName.c || (fitName.c = document.createElement("canvas").getContext("2d"));
    c.font = cs.fontWeight + " " + base + "px " + cs.fontFamily;
    var w = c.measureText(el.textContent.toUpperCase()).width * 0.7 + base * 0.02 * el.textContent.length; // condensed 70%, -1% tracking
    if (w > avail) el.style.fontSize = Math.max(base * 0.45, base * avail / w) + "px";
  }
  function cut() {
    fitName();
    var g1 = cutGeometry(W, H, tall, false), g2 = cutGeometry(W, H, tall, true);
    var pf = document.getElementById("paperFront"), pb = document.getElementById("paperBack");
    pf.style.clipPath = g1.clip; pb.style.clipPath = g2.clip;
    [["edgeFront", g1.path], ["edgeBack", g2.path]].forEach(function (e) {
      var svg = document.getElementById(e[0]);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.firstElementChild.setAttribute("d", e[1]);
    });
  }

  /* ---------- microprint: rows of hex digits, drawn once the mono font is in ---------- */
  function seeded(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h += 0x6d2b79f5; var t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function microprint(ink, seed) {
    var c = document.createElement("canvas");
    var dpr = 2, cw = 240, ch = 120;
    c.width = cw * dpr; c.height = ch * dpr;
    var x = c.getContext("2d");
    x.scale(dpr, dpr);
    x.font = '500 5.2px "DM Mono", ui-monospace, monospace';
    x.textBaseline = "top";
    x.fillStyle = ink;
    var rnd = seeded(seed), hex = "0123456789abcdef";
    var cwid = x.measureText("0").width || 3.1, n = Math.ceil(cw / cwid) + 2;
    for (var row = 0; row < 12; row++) {
      var line = "";
      for (var i = 0; i < n; i++) line += hex[Math.floor(rnd() * 16)];
      x.fillText(line, (row % 2) * -cwid * 0.5, row * 10 + 2);
    }
    return 'url("' + c.toDataURL("image/png") + '")';
  }
  function textures() {
    card.style.setProperty("--micro-front", microprint("rgba(20,13,22,0.42)", "keys-front"));
    card.style.setProperty("--micro-back", microprint("rgba(242,232,220,0.16)", "keys-back"));
  }

  /* ---------- the record on the back: a hash laid out in bytes ---------- */
  (function () {
    var el = document.getElementById("backHex");
    if (!el) return;
    var rnd = seeded("causewaykid-kx-0427-91a"), hex = "0123456789abcdef", out = "";
    for (var r = 0; r < 6; r++) {
      var row = [];
      for (var i = 0; i < 12; i++) {
        var b = hex[Math.floor(rnd() * 16)] + hex[Math.floor(rnd() * 16)];
        row.push((r * 12 + i) % 17 === 3 ? "<b>" + b + "</b>" : b);
      }
      out += row.join(" ") + (r < 5 ? "\n" : "");
    }
    el.innerHTML = out;
  })();

  /* ---------- light and tilt follow the pointer; idle, the card floats ---------- */
  var m = { x: 0, y: 0, tx: 0, ty: 0, over: false };
  var visible = true, raf = 0, t0 = performance.now();

  function setVars(rx, ry, mx, my) {
    wrap.style.setProperty("--rx", rx.toFixed(2) + "deg");
    wrap.style.setProperty("--ry", ry.toFixed(2) + "deg");
    wrap.style.setProperty("--mx", mx.toFixed(1));
    wrap.style.setProperty("--my", my.toFixed(1));
    wrap.style.setProperty("--sx", (ry * -1.1).toFixed(1) + "px");
    wrap.style.setProperty("--sy", (28 + rx * 1.3).toFixed(1) + "px");
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    var t = (now - t0) / 1000;
    var k = 1 - Math.exp(-0.016 * 6);
    if (!m.over) {
      m.tx = Math.sin(t * 0.55) * 0.22 + Math.sin(t * 0.21) * 0.1;
      m.ty = Math.cos(t * 0.43) * 0.16;
    }
    m.x += (m.tx - m.x) * k;
    m.y += (m.ty - m.y) * k;
    var flipped = card.classList.contains("is-flipped");
    setVars(-m.y * 9, m.x * 13 * (flipped ? -1 : 1), 50 + m.x * 42, 42 - m.y * 42);
  }

  if (hover && !reduce) {
    stage.addEventListener("pointermove", function (e) {
      var r = wrap.getBoundingClientRect();
      m.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.2, 1.2);
      m.ty = clamp(1 - ((e.clientY - r.top) / r.height) * 2, -1.2, 1.2);
      m.over = true;
    }, { passive: true });
    stage.addEventListener("pointerleave", function () { m.over = false; }, { passive: true });
  }
  if (!reduce) {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0 }).observe(plate);
      // The card turns over to face the reader the first time it comes into view.
      var intro = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        intro.disconnect();
        if (card.classList.contains("is-flipped")) return;
        card.classList.add("is-intro");
        card.addEventListener("animationend", function () { card.classList.remove("is-intro"); }, { once: true });
      }, { threshold: 0.35 });
      intro.observe(plate);
    }
    raf = requestAnimationFrame(frame);
  } else {
    setVars(0, 0, 50, 40);
  }

  /* ---------- flip ---------- */
  function flip() { card.classList.toggle("is-flipped"); }
  card.addEventListener("click", flip);
  card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  document.getElementById("flipBtn").addEventListener("click", flip);
  if (/[?&]flip\b/.test(location.search)) card.classList.add("is-flipped");

  /* ---------- export to PNG: the front, rendered through an SVG with the fonts inlined ---------- */
  var dl = document.getElementById("dlBtn");
  var fontCss = null;

  function toDataURL(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.blob(); }).then(function (b) {
      return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
    });
  }

  // Google Fonts serves one @font-face per subset; keep the latin ones and inline their files.
  function fonts() {
    if (fontCss) return fontCss;
    var link = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
    fontCss = fetch(link.href).then(function (r) { return r.text(); }).then(function (css) {
      var blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
      var latin = blocks.filter(function (b) { return /U\+0000-00FF/i.test(b); });
      return Promise.all(latin.map(function (b) {
        var url = (b.match(/url\(([^)]+)\)/) || [])[1];
        return toDataURL(url).then(function (data) { return b.replace(url, data).replace(/unicode-range:[^;]+;/, ""); });
      })).then(function (parts) { return parts.join("\n"); });
    });
    return fontCss;
  }

  // Renders the front of the card into a canvas (2x), ready to save or share.
  function render(side) {
    var scale = 2, pad = 56;
    var ow = W + pad * 2, oh = H + pad * 2 + 24;
    var pageCss = fetch("styles.css").then(function (r) { return r.text(); });
    var scene = toDataURL(front.querySelector(".photo img").getAttribute("src"));
    return Promise.all([fonts(), pageCss, scene]).then(function (r) {
      var clone = wrap.cloneNode(true);
      var c = clone.querySelector(".card");
      c.classList.remove("is-intro");
      c.classList.toggle("is-flipped", side === "back");
      Array.prototype.forEach.call(clone.querySelectorAll("img"), function (img) { img.setAttribute("src", r[2]); });
      clone.querySelector(side === "back" ? ".face--front" : ".face--back").remove();
      if (side === "back") { c.style.transform = "none"; clone.querySelector(".face--back").style.transform = "none"; }
      clone.style.setProperty("--rx", "0deg"); clone.style.setProperty("--ry", "0deg");
      clone.style.setProperty("--mx", "38"); clone.style.setProperty("--my", "36");
      var holder = document.createElement("div");
      holder.className = "export" + (tall ? " is-tall" : "");
      holder.style.width = ow + "px"; holder.style.height = oh + "px";
      holder.appendChild(clone);
      var style = "<style>" + r[0] + "\n" + r[1] + "\n.export{--card-w:" + W + "px;--card-h:" + H + "px}</style>";
      var xml = new XMLSerializer().serializeToString(holder);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + ow * scale + '" height="' + oh * scale + '" viewBox="0 0 ' + ow + " " + oh + '">' +
        '<foreignObject width="' + ow + '" height="' + oh + '"><div xmlns="http://www.w3.org/1999/xhtml" class="' + (tall ? "is-tall" : "") + '">' + style + xml + "</div></foreignObject></svg>";
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          var cv = document.createElement("canvas");
          cv.width = ow * scale; cv.height = oh * scale;
          cv.getContext("2d").drawImage(img, 0, 0);
          res(cv);
        };
        img.onerror = function () { rej(new Error("svg")); };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      });
    });
  }

  function exportPNG() {
    dl.classList.add("is-busy");
    render(card.classList.contains("is-flipped") ? "back" : "front").then(function (cv) {
      return new Promise(function (res, rej) { cv.toBlob(function (b) { b ? res(b) : rej(new Error("blob")); }, "image/png"); });
    }).then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "keys-passport-causewaykid.png";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      dl.classList.remove("is-busy");
    }).catch(function () {
      dl.classList.remove("is-busy");
      dl.firstChild.textContent = "Screenshot it instead ";
      setTimeout(function () { dl.firstChild.textContent = "Download PNG "; }, 3000);
    });
  }
  window.KEYS_CARD = { render: render };
  dl.addEventListener("click", exportPNG);

  /* ---------- start ---------- */
  layout();
  if ("ResizeObserver" in window) new ResizeObserver(layout).observe(plate);
  else window.addEventListener("resize", layout);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { layout(); fitName(); textures(); });
    document.fonts.load('500 10px "DM Mono"').then(textures, textures);
  } else {
    textures();
  }
})();
