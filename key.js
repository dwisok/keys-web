/* KEYED background: one key, drawn in hexadecimal microprint.
   Pass 1 raymarches the key into a buffer with one sample per character cell.
   Pass 2 draws one digit per cell at full resolution.
   No dependencies. WebGL2 only: without it the page keeps its plain background.
   main.js drives it through window.KEYS_SCENE. */
(function () {
  "use strict";

  var canvas = document.getElementById("key");
  if (!canvas) return;
  var gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
  if (!gl) return;

  var DIGITS = "0123456789abcdef";
  var N = DIGITS.length;

  var VERT = "#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

  // Blade: x from -1.6 to 4, y from -.46 to .46. Tooth centres must match TEETH in main.js.
  var SCENE = `#version 300 es
precision highp float;
uniform vec2 uRes, uGrid, uCenter, uLight;
uniform float uK, uRoll, uTurn, uYaw, uClip, uSweep;
uniform float uCut[5];
out vec4 o;

const float T = .115;
const float CX[5] = float[5](-.85, .05, 1., 1.95, 2.85);
const vec2 BOW = vec2(-2.95, 0.);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float rounded(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r;
}

float tri(float t) { return clamp((1. - abs(t)) / .72, 0., 1.); }

float profile(float x) {
  float h = 0.;
  for (int i = 0; i < 5; i++) h = max(h, uCut[i] * tri((x - CX[i]) / .36));
  return h;
}

float map(vec3 p) {
  float d = rounded(p - vec3(1.2, 0., 0.), vec3(2.8, .46, T), .025);
  d = max(d, (abs(p.y) - (4. - p.x) * .62) * .85);
  d = max(d, (-.46 + profile(p.x) - p.y) * .72);
  float groove = max(abs(p.y - .25) - .045, T - .045 - abs(p.z));
  d = max(d, -groove);
  float shoulder = rounded(p - vec3(-1.76, 0., 0.), vec3(.2, .66, .14), .035);
  vec2 b = vec2(length(p.xy - BOW) - .935, p.z);
  vec2 q = abs(b) - vec2(.315, .14) + .05;
  float bow = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - .05;
  return min(d, min(shoulder, bow));
}

vec3 normal(vec3 p) {
  vec2 e = vec2(.004, -.004);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

void main() {
  o = vec4(0., 0., 0., 1.);
  vec2 px = gl_FragCoord.xy / uGrid * uRes;
  if (px.x > uClip) return;
  vec2 w = rot(uRoll) * ((px - uCenter) / uK);
  if (w.x < -4.8 || w.x > 4.6 || abs(w.y) > 1.8) return;

  vec3 ro = vec3(w, -3.), rd = vec3(0., 0., 1.);
  ro.yz = rot(uTurn) * ro.yz;
  rd.yz = rot(uTurn) * rd.yz;
  ro.xz = rot(uYaw) * ro.xz;
  rd.xz = rot(uYaw) * rd.xz;

  float t = 0.;
  bool hit = false;
  float near = 1.;
  vec3 p = ro;
  for (int i = 0; i < 34; i++) {
    p = ro + rd * t;
    float d = map(p);
    near = min(near, d);
    if (d < .003) { hit = true; break; }
    t += d;
    if (t > 6.) break;
  }
  // Alpha is a soft shadow around the key, read by the picture underneath.
  if (!hit) { o.a = smoothstep(.0, .42, near); return; }

  // The faces are flat; a slight dome gives the metal its gradient.
  vec3 n = normal(p);
  vec2 rc = p.xy - BOW;
  float r = length(rc);
  if (r < 1.32 && p.x < -1.9) n.xy += .75 * (r - .935) / .315 * rc / max(r, .001);
  else n.y += p.y * .5;
  n = normalize(n);

  vec3 l = normalize(vec3(uLight, -1.));
  float diff = max(dot(n, l), 0.);
  float spec = pow(max(dot(reflect(rd, n), l), 0.), 22.);
  float edge = pow(1. - abs(dot(normal(p), rd)), 2.5);
  float band = exp(-pow((p.x - uSweep) / 1.15, 2.));
  float lum = .1 + .52 * diff + .62 * edge + .6 * spec + .3 * band;

  float cut = profile(p.x);
  float pink = cut > .01 ? smoothstep(.17, .03, p.y - (-.46 + cut)) : 0.;
  o = vec4(lum + pink * .5, pink, 1., 0.);
}`;

  var GLYPHS = `#version 300 es
precision highp float;
uniform sampler2D uScene, uAtlas, uImgA, uImgB;
uniform vec2 uCell, uGrid, uCursor, uRes;
uniform vec3 uBg, uInk, uPink;
uniform vec4 uRectA, uRectB, uCropA, uCropB;
uniform float uN, uTime, uFade, uDim, uSolid, uRadius, uDpr, uMix, uLodA, uLodB, uWinA, uWinB, uShow, uStopA, uStopB, uHole;
out vec4 o;

const float EDGE = 72.; // px over which a picture's lower edge breaks up into digits
const float FILL = .84; // how much of the picture stays behind the digits
const float RIM = .55; // strength of the ink outline along the key's edge

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec4 picture(sampler2D img, vec4 rect, vec4 crop, float lod, float stop, vec2 at, float h) {
  vec2 r = (at - rect.xy) / rect.zw;
  if (r.x < 0. || r.x > 1. || r.y < 0. || r.y > 1.) return vec4(0.);
  vec3 c = smoothstep(.02, .94, textureLod(img, crop.zw + (r - .5) * crop.xy, lod).rgb);
  float e = smoothstep(0., EDGE, stop - at.y);
  return vec4(c, step(h, e) * (.45 + .55 * e));
}

void main() {
  vec2 g = gl_FragCoord.xy / uCell;
  vec2 c = floor(g);
  vec2 f = g - c;
  vec4 s = texture(uScene, (c + .5) / uGrid);
  float h = hash(c), h2 = hash(c + 17.);

  // Each digit changes on its own slow clock.
  float d = hash(c + floor(uTime * .35 + h * 40.));
  float m = texture(uAtlas, vec2((floor(d * uN) + f.x) / uN, 1. - f.y)).r;

  float dc = length((c + .5) * uCell - uCursor) / uRadius;
  float wake = exp(-dc * dc);
  float hit = s.b * smoothstep(h - .08, h + .08, uFade * 1.16 - .08);

  vec2 mid = (c + .5) * uCell / uDpr;
  vec2 at = vec2(mid.x, uRes.y - mid.y);
  vec4 a = picture(uImgA, uRectA, uCropA, uLodA, uStopA, at, h2);
  vec4 b = picture(uImgB, uRectB, uCropB, uLodB, uStopB, at, h2);

  // The closing picture is lit through the ring and only veiled around it; the hole stays plain.
  float lit = max(hit, .46 * step(uHole, length(at - uRes * .5)));
  a.a *= mix(1., lit, uWinA);
  b.a *= mix(1., lit, uWinB);
  float sw = smoothstep(h - .12, h + .12, uMix * 1.24 - .12);
  vec4 p = mix(a, b, sw);
  float win = mix(uWinA, uWinB, sw);

  // The picture stays whole from afar; up close, its light is made of digits.
  float shown = p.a * uShow * mix(1., .6 + .4 * s.a, uFade * (1. - win));
  float y = dot(p.rgb, vec3(.3, .59, .11));
  vec3 fill = mix(uBg, p.rgb, FILL);
  vec3 digit = p.rgb * (1.06 + .34 * y) + wake * .12;
  vec3 col = mix(uBg, mix(fill, digit, m), shown);
  col = mix(col, col * (.72 + .5 * s.r), win * s.b);

  // Outside the pictures, the pointer uncovers digits in the plum.
  col = mix(col, uInk, m * wake * .13 * (1. - shown) * (1. - s.b));

  // The key is a shadow cast into the picture, not a shape pasted on it: it darkens what is
  // behind by uSolid, its digits glow faintly with the light, and a thin line of ink digits
  // traces its outline (the mask's gradient across neighbouring cells).
  float solid = hit * (1. - win);
  float bl = texture(uScene, (c + vec2(-.5, .5)) / uGrid).b, br = texture(uScene, (c + vec2(1.5, .5)) / uGrid).b;
  float bu = texture(uScene, (c + vec2(.5, 1.5)) / uGrid).b, bd = texture(uScene, (c + vec2(.5, -.5)) / uGrid).b;
  float rim = clamp(abs(bl - br) + abs(bu - bd), 0., 1.) * (1. - win) * smoothstep(.2, .9, uFade);
  col = mix(col, uBg, solid * uSolid);
  col = mix(col, mix(uInk, uPink, s.g * .3), m * clamp(s.r * .8 + wake * .2, 0., 1.) * uDim * solid);
  col = mix(col, uInk, rim * m * RIM);
  o = vec4(col, 1.);
}`;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {};
    var count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var name = gl.getActiveUniform(p, i).name.replace("[0]", "");
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }

  var scene, glyphs;
  try {
    scene = program(SCENE);
    glyphs = program(GLYPHS);
  } catch (e) {
    console.warn("KEYED key disabled:", e.message);
    return;
  }

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function texture(min, mag) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  var sceneTex = texture();
  var atlasTex = texture(gl.LINEAR, gl.LINEAR);
  var fbo = gl.createFramebuffer();

  // Pictures load one after the other, the first one on screen first.
  function load(list, done) {
    var i = 0;
    (function next() {
      var pic = list[i++];
      if (!pic) return;
      var img = new Image();
      img.onerror = next;
      img.onload = function () {
        pic.tex = texture(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        pic.w = img.naturalWidth;
        pic.h = img.naturalHeight;
        if (done) done(pic);
        next();
      };
      img.src = pic.src;
    })();
  }

  // Cover-fit a picture into its rect, around its focal point.
  function crop(pic) {
    var r = pic.rect, ar = r.w / r.h, ia = pic.w / pic.h;
    var sx = ar > ia ? 1 : ar / ia, sy = ar > ia ? ia / ar : 1;
    var perCell = (pic.w * sx / r.w) * (cell.w / dpr);
    return {
      sx: sx, sy: sy,
      cx: Math.min(1 - sx / 2, Math.max(sx / 2, pic.fx)),
      cy: Math.min(1 - sy / 2, Math.max(sy / 2, pic.fy)),
      lod: Math.max(0, Math.log2(perCell) - 0.6)
    };
  }

  function bindPicture(unit, name, pic, tag) {
    var c = crop(pic);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, pic.tex);
    gl.uniform1i(glyphs.u[name], unit);
    gl.uniform4f(glyphs.u["uRect" + tag], pic.rect.x, pic.rect.y, pic.rect.w, pic.rect.h);
    gl.uniform4f(glyphs.u["uCrop" + tag], c.sx, c.sy, c.cx, c.cy);
    gl.uniform1f(glyphs.u["uLod" + tag], c.lod);
    gl.uniform1f(glyphs.u["uStop" + tag], pic.stop);
    gl.uniform1f(glyphs.u["uWin" + tag], pic.ring ? 1 : 0);
  }

  var cell = { w: 7, h: 12 };
  var quality = 0; // grows when the machine struggles
  var dpr = 1, gridW = 0, gridH = 0, vw = 0, vh = 0;

  // Drawn at exactly one cell per glyph, so digits stay crisp at any density.
  function buildAtlas() {
    var c = document.createElement("canvas");
    c.width = cell.w * N;
    c.height = cell.h;
    var x = c.getContext("2d");
    x.fillStyle = "#000";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#fff";
    x.font = "400 " + Math.round(cell.h * 0.76) + 'px "DM Mono", ui-monospace, monospace';
    x.textAlign = "center";
    x.textBaseline = "middle";
    for (var i = 0; i < N; i++) x.fillText(DIGITS[i], cell.w * (i + 0.5), cell.h * 0.54);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  function resize() {
    vw = canvas.clientWidth || window.innerWidth;
    vh = canvas.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    // Fine enough for the pictures to stay recognisable.
    var base = Math.max(5, Math.min(7, Math.round(vw / 260))) + quality;
    cell.w = Math.round(base * dpr);
    cell.h = Math.round(base * 1.6 * dpr);
    gridW = Math.ceil(canvas.width / cell.w);
    gridH = Math.ceil(canvas.height / cell.h);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gridW, gridH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    buildAtlas();
  }

  // Drops resolution rather than frames.
  var last = 0, slow = 0, seen = 0;
  function pace(now) {
    var dt = now - last;
    last = now;
    if (dt > 0 && dt < 1500 && ++seen > 30) {
      slow = dt > 30 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 40 && quality < 3) {
        quality++;
        slow = 0;
        resize();
      }
    }
  }

  function render(time, s) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, gridW, gridH);
    gl.useProgram(scene.p);
    gl.uniform2f(scene.u.uRes, vw, vh);
    gl.uniform2f(scene.u.uGrid, gridW, gridH);
    gl.uniform2f(scene.u.uCenter, s.x, vh - s.y);
    gl.uniform2f(scene.u.uLight, s.lx, s.ly);
    gl.uniform1f(scene.u.uK, s.k);
    gl.uniform1f(scene.u.uRoll, s.roll);
    gl.uniform1f(scene.u.uTurn, s.turn);
    gl.uniform1f(scene.u.uYaw, s.yaw);
    gl.uniform1f(scene.u.uClip, s.clip);
    gl.uniform1f(scene.u.uSweep, s.sweep);
    gl.uniform1fv(scene.u.uCut, s.cuts);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(glyphs.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(glyphs.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(glyphs.u.uAtlas, 1);
    var a = s.pa && s.pa.tex ? s.pa : s.pb && s.pb.tex ? s.pb : null;
    var b = s.pb && s.pb.tex ? s.pb : a;
    if (a) {
      bindPicture(2, "uImgA", a, "A");
      bindPicture(3, "uImgB", b, "B");
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(glyphs.u.uShow, a ? s.show : 0);
    gl.uniform1f(glyphs.u.uMix, s.mix);
    gl.uniform1f(glyphs.u.uHole, s.hole || 0);
    gl.uniform1f(glyphs.u.uDpr, dpr);
    gl.uniform2f(glyphs.u.uRes, vw, vh);
    gl.uniform2f(glyphs.u.uCell, cell.w, cell.h);
    gl.uniform2f(glyphs.u.uGrid, gridW, gridH);
    gl.uniform2f(glyphs.u.uCursor, s.cx * dpr, (vh - s.cy) * dpr);
    gl.uniform3f(glyphs.u.uBg, 20 / 255, 13 / 255, 22 / 255);
    gl.uniform3f(glyphs.u.uInk, 242 / 255, 232 / 255, 220 / 255);
    gl.uniform3f(glyphs.u.uPink, 1, 107 / 255, 143 / 255);
    gl.uniform1f(glyphs.u.uN, N);
    gl.uniform1f(glyphs.u.uTime, time);
    gl.uniform1f(glyphs.u.uFade, s.fade);
    gl.uniform1f(glyphs.u.uDim, s.dim);
    gl.uniform1f(glyphs.u.uSolid, s.solid == null ? 0.6 : s.solid);
    gl.uniform1f(glyphs.u.uRadius, 170 * dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    document.documentElement.classList.remove("has-key");
  });

  resize();
  // The glyphs need the mono font; redraw them once it has arrived.
  if (document.fonts && document.fonts.load) document.fonts.load('400 40px "DM Mono"').then(buildAtlas, function () {});

  window.KEYS_SCENE = { resize: resize, render: render, pace: pace, load: load };
})();
