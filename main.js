/* KEYED landing. Long-scroll page: the key hangs in the hero (key.js, WebGL2),
   the passport card is cut to the key's record, the rest is plain HTML. */
(function () {
  "use strict";

  var root = document.documentElement;
  var scene = window.KEYS_SCENE;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- the record: how deep each tooth goes (centres live in the shader) ---------- */
  var DEPTH = [0.22, 0.34, 0.44, 0.27, 0.38];

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function ease(x) { return x * x * (3 - 2 * x); }

  /* ---------- deployment config (config.js) ---------- */
  var CONFIG = window.KEYS_CONFIG || {};
  var API = (CONFIG.api || "http://localhost:8797").replace(/\/$/, "");
  if (CONFIG.app) {
    Array.prototype.forEach.call(document.querySelectorAll("#appLink, [data-app-link]"), function (a) { a.href = CONFIG.app; });
  }
  var X = (CONFIG.x || "").replace(/^@/, "");
  var xLink = document.getElementById("xLink");
  if (X && xLink) {
    xLink.href = "https://x.com/" + X;
    xLink.textContent = "@" + X + " on X";
    xLink.hidden = false;
  }

  /* ---------- waitlist form → verifier ---------- */
  var form = document.getElementById("form");
  var msg = document.getElementById("msg");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var input = form.querySelector("input");
    var v = input.value.trim();
    msg.classList.remove("is-error");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      msg.textContent = "Enter a valid email address.";
      msg.classList.add("is-error");
      input.focus();
      return;
    }
    msg.textContent = "Saving…";
    var button = form.querySelector("button");
    button.disabled = true;
    fetch(API + "/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: v })
    })
      .then(function (r) {
        if (!r.ok) throw new Error("waitlist " + r.status);
        input.value = "";
        msg.textContent = "Noted. We'll write to you on November 19.";
      })
      .catch(function () {
        // The list lives on the verifier; while that host is down, point at X instead of a dead end.
        if (X) {
          msg.innerHTML = "";
          msg.appendChild(document.createTextNode("The list is not open yet. Follow "));
          var a = document.createElement("a");
          a.href = "https://x.com/" + X; a.rel = "noopener"; a.target = "_blank"; a.textContent = "@" + X;
          msg.appendChild(a);
          msg.appendChild(document.createTextNode(" for launch day."));
        } else {
          msg.textContent = "We couldn't save that. Try again in a minute.";
        }
        msg.classList.add("is-error");
      })
      .then(function () { button.disabled = false; });
  });

  /* ---------- days left (real date: 19 Nov 2026, 00:00 Paris) ---------- */
  var left = Math.ceil((Date.UTC(2026, 10, 18, 23) - Date.now()) / 864e5);
  if (left > 1) document.getElementById("days").textContent = "in " + left + " days, your key";

  /* ---------- "Join the list" links focus the form ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('a[href="#join"]'), function (a) {
    a.addEventListener("click", function () {
      setTimeout(function () { document.getElementById("email").focus({ preventScroll: true }); }, 600);
    });
  });

  /* ---------- reveal on scroll ---------- */
  Array.prototype.forEach.call(document.querySelectorAll(".section__head, .ticks li, .foot__in"), function (el) { el.classList.add("reveal"); });
  var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- the hero: the key over the causeway, drawn by key.js ---------- */
  if (!scene) return;

  var hero = document.getElementById("hero");
  var canvas = document.getElementById("key");
  var PICTURE = { src: "assets/print/hero.jpg", fx: 0.5, fy: 0.5, nx: 0.3 };
  var cuts = new Float32Array(DEPTH);
  var S = { cuts: cuts, roll: 0, clip: 1e5, fade: 1, dim: 0.5, mix: 0, pa: PICTURE, pb: PICTURE, hole: 0 };
  var m = { x: 0, y: 0, tx: 0, ty: 0, cx: -9999, cy: -9999, px: -9999, py: -9999 };
  var vw = 0, vh = 0, narrow = false, pose = null, born = 0, clock = 0, visible = true, loaded = false;

  function layoutHero() {
    vw = canvas.clientWidth;
    vh = canvas.clientHeight;
    if (!vw || !vh) return;
    narrow = vw < 760;
    S.solid = narrow ? 0.38 : 0.5;
    S.dim = narrow ? 0.4 : 0.5;
    PICTURE.fx = narrow ? PICTURE.nx : 0.5;
    PICTURE.rect = { x: 0, y: 0, w: vw, h: vh };
    PICTURE.stop = vh;
    // The key hangs on the centre line above the words, on every screen.
    var k = narrow ? (vw - 72) / 8.2 : Math.min((vw * 0.46) / 8.2, (vh * 0.27) / 2.5);
    pose = { x: vw / 2 + 0.1 * k, y: narrow ? vh * 0.2 : vh * 0.21, k: k };
    scene.resize();
  }

  hero.addEventListener("pointermove", function (e) {
    var r = canvas.getBoundingClientRect();
    m.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    m.ty = 1 - ((e.clientY - r.top) / r.height) * 2;
    m.cx = e.clientX - r.left;
    m.cy = e.clientY - r.top;
    if (m.px < -999) { m.px = m.cx; m.py = m.cy; }
  }, { passive: true });
  hero.addEventListener("pointerleave", function () { m.tx = 0; m.ty = 0; m.cx = -9999; m.cy = -9999; }, { passive: true });

  function frame(now) {
    requestAnimationFrame(frame);
    if (!pose) { layoutHero(); return; }
    if (!visible || document.hidden) return;
    scene.pace(now);
    var time = now / 1000;
    if (!born) { born = time; clock = time; }
    var dt = Math.min(0.1, time - clock);
    clock = time;
    var intro = ease(Math.min(1, (time - born) / 2.4));
    var slow = 1 - Math.exp(-dt * 3), quick = 1 - Math.exp(-dt * 8);
    m.x += (m.tx - m.x) * slow;
    m.y += (m.ty - m.y) * slow;
    m.px += (m.cx - m.px) * quick;
    m.py += (m.cy - m.py) * quick;

    S.x = pose.x;
    S.y = pose.y + Math.sin(time * 0.6) * 3;
    S.k = pose.k;
    S.fade = intro;
    S.show = intro;
    S.turn = 0.26 + Math.sin(time * 0.45) * 0.09 - m.y * 0.14;
    S.yaw = Math.sin(time * 0.3) * 0.05 + m.x * 0.1;
    S.sweep = -4 + ((time * 0.22) % 9);
    S.lx = -0.5 + m.x * 0.9;
    S.ly = 0.75 + m.y * 0.6;
    S.cx = m.px;
    S.cy = m.py;
    scene.render(time, S);
  }

  function still() {
    layoutHero();
    if (!pose) return;
    S.x = pose.x; S.y = pose.y; S.k = pose.k; S.fade = 1; S.show = 1; S.turn = 0.26; S.yaw = 0; S.sweep = 1;
    S.lx = -0.4; S.ly = 0.7; S.cx = -9999; S.cy = -9999;
    scene.render(4, S);
  }

  root.classList.add("has-key");
  layoutHero();
  scene.load([PICTURE], function () {
    loaded = true;
    if (reduce) still();
  });

  var lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    // Phones fire resize when the address bar slides; the hero does not need to follow it.
    if (window.innerWidth === lastW && narrow) return;
    lastW = window.innerWidth;
    layoutHero();
    if (reduce) still();
  });

  if (reduce) {
    still();
    return;
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  }
  requestAnimationFrame(frame);
})();
