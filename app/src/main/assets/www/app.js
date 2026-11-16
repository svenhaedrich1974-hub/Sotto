/* Sotto 1.0 – privates Tagebuch. Kein Framework, keine Netzwerkverbindung. */
(function () {
  "use strict";
  var VERSION = "1.1.1";
  var DB_KEY = "kammer-db-v1";          /* Schlüssel der nativen Hülle */
  var KDF = 600000;
  var PRO_TEST = true;                  /* Testversion: Pro freigeschaltet, bis Google Play Billing eingebaut ist */
  var FREE_PHOTOS = 1, PRO_PHOTOS = 10;
  var S = window.SOTTO_S || {}, P = window.SOTTO_P || {};
  var LANGS = [["de", "Deutsch"], ["en", "English"], ["fr", "Français"], ["es", "Español"], ["tr", "Türkçe"]];
  var LOC = { de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", tr: "tr-TR" };
  var LI = { de: 0, en: 1, fr: 2, es: 3, tr: 4 };
  var THEMES = ["light", "dark", "sepia", "forest"];

  function detectLang() { var s0 = ""; try { s0 = localStorage.getItem("sotto-lang") || ""; } catch (e) {} if (LOC[s0]) return s0; var n = String(navigator.language || "de").slice(0, 2).toLowerCase(); return LOC[n] ? n : "de"; }
  var LANG = detectLang();
  function t(k, a) { var r = S[k]; var s = r ? (r[LI[LANG]] || r[0]) : k; if (a) s = s.replace(/\{(\w+)\}/g, function (m, n) { return a[n] != null ? a[n] : m; }); return s; }

  /* ---------- Hilfen ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function uid(p) { var a = new Uint8Array(6); crypto.getRandomValues(a); return (p || "x") + "_" + Date.now().toString(36) + Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join(""); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return isoOf(new Date()); }
  function nowTime() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function dOf(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +(p[2] || 1), 12); }
  function isIso(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(dOf(s).getTime()); }
  function fmt(iso, o) { try { return new Intl.DateTimeFormat(LOC[LANG], o).format(dOf(iso)); } catch (e) { return iso; } }
  function longDate(iso) { return fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  function monthName(ym) { return fmt(ym + "-01", { month: "long", year: "numeric" }); }
  function addMonths(ym, n) { var d = dOf(ym + "-01"); d.setMonth(d.getMonth() + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function daysIn(ym) { var p = ym.split("-"); return new Date(+p[0], +p[1], 0).getDate(); }
  function safeParse(s) { return JSON.parse(s, function (k, v) { return k === "__proto__" || k === "constructor" || k === "prototype" ? undefined : v; }); }
  function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
  function str(s, n) { return typeof s === "string" ? s.slice(0, n) : ""; }
  function okId(s, p) { return typeof s === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : uid(p); }
  var NAT = window.KammerAndroid || null;
  function nat(fn) { try { return NAT && typeof NAT[fn] === "function"; } catch (e) { return false; } }
  var BILLING = nat("hasBilling") && (function () { try { return !!NAT.hasBilling(); } catch (e) { return false; } })();
  var REMIND = nat("setReminder");
  function isPro() { if (BILLING) { try { return !!NAT.isPro(); } catch (e) { return false; } } return PRO_TEST || (D && D.settings.pro === true); }
  function proPrice() { if (BILLING) { try { var p = NAT.proPrice(); if (p) return p; } catch (e) {} } return t("pro_price"); }
  function moodWord(m) { return m >= 1 && m <= 5 ? t("mood" + m) : t("no_mood"); }

  /* ---------- Zustand ---------- */
  function blank() { return { v: 1, app: "sotto", settings: { lang: LANG, theme: "light", name: "", onboarded: false, pro: false, remind: { on: false, time: "20:30" } }, books: [{ id: "b_me", name: "", type: "me" }], entries: [], photos: {} }; }
  var D = null, KEY = null;
  var ui = { tab: "today", sub: null, sheet: null, wiz: 0, locked: false, draft: null, promptIx: 0, q: "", qBook: "all", tView: "list", cal: today().slice(0, 7), lMode: "month", lMonth: today().slice(0, 7), lYear: new Date().getFullYear(), fails: 0, waitUntil: 0, pdf: { book: "all", range: "all", photos: true, busy: false }, toast: "" };
  function freshDraft(date) { return { id: null, date: date || today(), time: nowTime(), mood: 0, text: "", tags: "", photos: [], bookId: (D && D.books[0] && D.books[0].id) || "b_me" }; }

  function normalize(x) {
    var b = blank(); if (!isObj(x)) return b;
    var out = { v: 1, app: "sotto", settings: Object.assign({}, b.settings), books: [], entries: [], photos: {} };
    if (isObj(x.settings)) { var s = x.settings; out.settings.lang = LOC[s.lang] ? s.lang : LANG; out.settings.theme = THEMES.indexOf(s.theme) >= 0 ? s.theme : "light"; out.settings.name = str(s.name, 40); out.settings.onboarded = s.onboarded === true; out.settings.pro = s.pro === true; if (isObj(s.remind)) out.settings.remind = { on: s.remind.on === true, time: typeof s.remind.time === "string" && /^\d{2}:\d{2}$/.test(s.remind.time) ? s.remind.time : "20:30" }; }
    if (Array.isArray(x.books)) out.books = x.books.filter(isObj).slice(0, 200).map(function (k) { return { id: okId(k.id, "b"), name: str(k.name, 60), type: ["me", "kid", "trip", "family"].indexOf(k.type) >= 0 ? k.type : "me", birth: isIso(k.birth) ? k.birth : undefined }; });
    if (!out.books.length) out.books = b.books;
    var bookIds = {}; out.books.forEach(function (k) { bookIds[k.id] = 1; });
    if (isObj(x.photos)) Object.keys(x.photos).slice(0, 20000).forEach(function (k) { var v = x.photos[k]; if (/^[A-Za-z0-9_-]{1,64}$/.test(k) && typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 4e6) out.photos[k] = v; });
    if (Array.isArray(x.entries)) out.entries = x.entries.filter(isObj).slice(0, 100000).map(function (e) {
      return { id: okId(e.id, "e"), date: isIso(e.date) ? e.date : today(), time: typeof e.time === "string" && /^\d{2}:\d{2}$/.test(e.time) ? e.time : "12:00", mood: [0, 1, 2, 3, 4, 5].indexOf(e.mood) >= 0 ? e.mood : 0, text: str(e.text, 20000), tags: Array.isArray(e.tags) ? e.tags.filter(function (g) { return typeof g === "string"; }).map(function (g) { return g.slice(0, 40); }).slice(0, 20) : [], bookId: bookIds[e.bookId] ? e.bookId : out.books[0].id, photos: Array.isArray(e.photos) ? e.photos.filter(function (p) { return out.photos[p]; }).slice(0, PRO_PHOTOS) : [], created: +e.created || Date.now(), updated: +e.updated || Date.now() };
    });
    return out;
  }

  /* ---------- Speichern & Verschlüsselung ---------- */
  function b64(buf) { var s = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); }
  function unb64(s) { var r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  async function derive(pass, salt, iter) { var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
  async function makeKey(pass) { var salt = crypto.getRandomValues(new Uint8Array(16)); return { key: await derive(pass, salt, KDF), salt: salt, iter: KDF }; }
  async function seal(k, text) { var iv = crypto.getRandomValues(new Uint8Array(12)); var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k.key, new TextEncoder().encode(text)); return { salt: b64(k.salt), iv: b64(iv), ct: b64(ct), kdf: k.iter }; }
  async function unseal(env, pass) { try { var salt = unb64(env.salt), iter = +env.kdf || KDF; var key = await derive(pass, salt, iter); var pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct)); return { text: new TextDecoder().decode(pt), key: { key: key, salt: salt, iter: iter } }; } catch (e) { return null; } }
  function idb() { return new Promise(function (res) { if (typeof indexedDB === "undefined") return res(null); var r = indexedDB.open("sotto", 1); r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv"); }; r.onerror = function () { res(null); }; r.onsuccess = function () { res(r.result); }; }); }
  async function idbGet() { var db = await idb(); if (!db) return null; return new Promise(function (res) { try { var q = db.transaction("kv", "readonly").objectStore("kv").get(DB_KEY); q.onsuccess = function () { db.close(); res(typeof q.result === "string" ? q.result : null); }; q.onerror = function () { db.close(); res(null); }; } catch (e) { db.close(); res(null); } }); }
  async function idbPut(v) { var db = await idb(); if (!db) return; return new Promise(function (res) { try { var tr = db.transaction("kv", "readwrite"); tr.objectStore("kv").put(v, DB_KEY); tr.oncomplete = tr.onerror = tr.onabort = function () { db.close(); res(); }; } catch (e) { db.close(); res(); } }); }
  function parseEnv(raw) { if (!raw) return null; try { var o = safeParse(raw); if (!isObj(o) || o.app !== "sotto") return null; if (o.sealed && o.salt && o.iv && o.ct) return Object.assign({}, o, { sealed: true, savedAt: +o.savedAt || 0 }); if (isObj(o.state)) return Object.assign({}, o, { sealed: false, savedAt: +o.savedAt || 0 }); return null; } catch (e) { return null; } }
  function newer(a, b) { if (!a) return b; if (!b) return a; return a.savedAt >= b.savedAt ? a : b; }
  async function envelope() { var st = JSON.stringify(D); if (KEY) return Object.assign({ v: 1, app: "sotto", savedAt: Date.now(), sealed: true, appVersion: VERSION }, await seal(KEY, st)); return { v: 1, app: "sotto", savedAt: Date.now(), sealed: false, appVersion: VERSION, state: D }; }
  async function writeNow() {
    if (!D || ui.locked || !D.settings.onboarded) return;
    var raw = JSON.stringify(await envelope());
    try { localStorage.setItem(DB_KEY, raw); } catch (e) { try { localStorage.removeItem(DB_KEY); } catch (e2) {} }
    await idbPut(raw);
    try { var n = window.KammerAndroid; if (n && n.beginDb && n.appendDb && n.commitDb) { n.beginDb(); for (var i = 0; i < raw.length; i += 200000) n.appendDb(raw.slice(i, i + 200000)); n.commitDb(); } } catch (e) {}
  }
  var chain = Promise.resolve(), timer = null;
  function save(now) { clearTimeout(timer); var run = function () { chain = chain.then(writeNow).catch(function () {}); return chain; }; if (now) return run(); timer = setTimeout(run, 300); return chain; }
  window.__kammerFlush = function () { save(true); };
  window.addEventListener("pagehide", function () { save(true); });
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); syncDraft(); save(true); return; }
    if (KEY && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && !ui.locked) { save(true).then(function () { KEY = null; D = null; ui.locked = true; ui.sheet = null; render(); }); }
  });

  /* ---------- Fotos ---------- */
  function loadImage(file) { return new Promise(function (res, rej) { var url = URL.createObjectURL(file); var img = new Image(); img.onload = function () { res({ img: img, url: url }); }; img.onerror = function () { URL.revokeObjectURL(url); rej(); }; img.src = url; }); }
  async function shrink(file) {
    var o = await loadImage(file); var img = o.img; var max = 1280, w = img.naturalWidth, h = img.naturalHeight, f = Math.min(1, max / Math.max(w, h));
    var c = document.createElement("canvas"); c.width = Math.round(w * f); c.height = Math.round(h * f);
    var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(o.url); return c.toDataURL("image/jpeg", 0.78);
  }
  function photoSrc(p) { return p.src || (D.photos[p.id] || ""); }

  /* ---------- Auswertung ---------- */
  function entriesSorted(list) { return list.slice().sort(function (a, b) { return a.date === b.date ? (a.time < b.time ? 1 : -1) : (a.date < b.date ? 1 : -1); }); }
  function bookById(id) { for (var i = 0; i < D.books.length; i++) if (D.books[i].id === id) return D.books[i]; return D.books[0]; }
  function bookName(k) { return k.name || (k.type === "me" ? t("my_diary") : t("bt_" + k.type)); }
  function ageAt(birth, iso) { if (!birth || iso < birth) return ""; var a = dOf(birth), b = dOf(iso); var m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); if (b.getDate() < a.getDate()) m--; return t("age", { y: Math.floor(m / 12), m: m % 12 }); }
  function onThisDay() {
    var td = today(), md = td.slice(5), out = [];
    var y0 = +td.slice(0, 4);
    D.entries.forEach(function (e) { var y = +e.date.slice(0, 4); if (e.date.slice(5) === md && y < y0) out.push({ e: e, n: y0 - y }); });
    out.sort(function (a, b) { return a.n - b.n || (b.e.photos.length - a.e.photos.length) || (b.e.mood - a.e.mood) || (b.e.text.length - a.e.text.length); });
    if (out.length) return out;
    var m1 = addMonths(td.slice(0, 7), -1) + "-" + td.slice(8);
    var mo = D.entries.filter(function (e) { return e.date === m1; });
    return mo.map(function (e) { return { e: e, n: 0 }; });
  }
  function tagList(s) { return String(s || "").split(/[,;#]+/).map(function (x) { return x.trim(); }).filter(Boolean).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 20); }

  /* ---------- Icons ---------- */
  var MOODC = ["", "var(--m1)", "var(--m2)", "var(--m3)", "var(--m4)", "var(--m5)"];
  function face(m, size) {
    size = size || 28; var mouth = { 1: "M9 21q7-6 14 0", 2: "M9.5 20.5q6.5-3 13 0", 3: "M10 19.5h12", 4: "M9.5 18.5q6.5 4 13 0", 5: "M9 17.5q7 7 14 0" }[m] || "M11 19.5h10";
    var col = m ? MOODC[m] : "var(--line)";
    return '<svg class="face" width="' + size + '" height="' + size + '" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5" fill="' + col + '"/><circle cx="11.5" cy="13" r="1.8" fill="var(--faceink)"/><circle cx="20.5" cy="13" r="1.8" fill="var(--faceink)"/><path d="' + mouth + '" fill="none" stroke="var(--faceink)" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  var IC = {
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    cam: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    today: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
    time: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 4v16M6 7h12M6 12h9M6 17h11"/></svg>',
    look: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-6 4 3 4-6 5 5"/><path d="M3 21h18"/></svg>',
    more: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    left: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
    spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/></svg>'
  };

  /* ---------- Ansichten ---------- */
  function topbar(title, back) {
    return '<header class="top">' + (back ? '<button class="iconbtn" data-a="back" aria-label="' + esc(t("back")) + '">' + IC.left + '</button>' : '') + '<h1>' + esc(title) + '</h1><span class="privacy">' + IC.lock + ' ' + esc(t("local")) + '</span></header>';
  }
  function greeting() { var h = new Date().getHours(); var g = h < 5 ? t("hello_n") : h < 11 ? t("hello_m") : h < 18 ? t("hello_d") : h < 23 ? t("hello_e") : t("hello_n"); var nm = D.settings.name; var end = (h < 5 || h >= 23) ? "?" : ""; if (LANG === "es" && end) g = g + (nm ? ", " + nm : "") + "?"; else g = g + (nm ? ", " + nm : "") + end; return g; }

  function composer(dr, pre) {
    var max = isPro() ? PRO_PHOTOS : FREE_PHOTOS;
    var h = '<div class="moods" role="radiogroup" aria-label="' + esc(t("how")) + '">';
    for (var m = 1; m <= 5; m++) h += '<button class="mood' + (dr.mood === m ? " on" : "") + '" data-a="mood" data-m="' + m + '" role="radio" aria-checked="' + (dr.mood === m) + '">' + face(m, 34) + '<span>' + esc(t("mood" + m)) + '</span></button>';
    h += '</div>';
    if (pre === "c") { var pr = (P[LANG] || P.de); h += '<div class="prompt"><span class="pl">' + esc(t("prompt")) + '</span><span class="pq">' + esc(pr[ui.promptIx % pr.length]) + '</span><button class="link" data-a="nextprompt">' + esc(t("another")) + '</button></div>'; }
    h += '<textarea id="' + pre + 'text" aria-label="' + esc(t("ph_text")) + '" class="write" rows="' + (pre === "c" ? 4 : 6) + '" placeholder="' + esc(t("ph_text")) + '">' + esc(dr.text) + '</textarea>';
    h += '<div class="photos">';
    dr.photos.forEach(function (p, i) { h += '<div class="ph"><img src="' + esc(photoSrc(p)) + '" alt=""><button class="phx" data-a="rmphoto" data-i="' + i + '" aria-label="' + esc(t("del")) + '">' + IC.x + '</button></div>'; });
    if (dr.photos.length < max) h += '<label class="addph">' + IC.cam + '<span>' + esc(t("photo")) + '</span><input type="file" accept="image/*" data-pick="' + pre + '" ' + (isPro() ? "multiple" : "") + ' hidden></label>';
    h += '</div>';
    h += '<div class="row2"><input id="' + pre + 'tags" class="inp" placeholder="' + esc(t("ph_tags")) + '" value="' + esc(dr.tags) + '" aria-label="' + esc(t("tags")) + '">';
    if (D.books.length > 1) { h += '<select id="' + pre + 'book" class="inp" aria-label="' + esc(t("book")) + '">' + D.books.map(function (k) { return '<option value="' + esc(k.id) + '"' + (k.id === dr.bookId ? " selected" : "") + '>' + esc(bookName(k)) + '</option>'; }).join("") + '</select>'; }
    h += '</div>';
    if (pre === "e") h += '<div class="row2"><label class="fld"><span>' + esc(t("date")) + '</span><input id="edate" type="date" class="inp" value="' + esc(dr.date) + '" max="' + today() + '"></label><label class="fld"><span>' + esc(t("time")) + '</span><input id="etime" type="time" class="inp" value="' + esc(dr.time) + '"></label></div>';
    return h;
  }
  function syncDraft() {
    [["c", ui.draft], ["e", ui.sheet && ui.sheet.kind === "entry" ? ui.sheet.dr : null]].forEach(function (p) {
      var dr = p[1]; if (!dr) return; var pre = p[0];
      var el = document.getElementById(pre + "text"); if (el) dr.text = el.value;
      el = document.getElementById(pre + "tags"); if (el) dr.tags = el.value;
      el = document.getElementById(pre + "book"); if (el) dr.bookId = el.value;
      el = document.getElementById("edate"); if (el && pre === "e" && isIso(el.value)) dr.date = el.value;
      el = document.getElementById("etime"); if (el && pre === "e" && /^\d{2}:\d{2}$/.test(el.value)) dr.time = el.value;
    });
  }

  function entryCard(e, opts) {
    opts = opts || {}; var k = bookById(e.bookId);
    var h = '<article class="entry" data-a="open" data-id="' + esc(e.id) + '" tabindex="0"><div class="eh">' + face(e.mood, 26) + '<div class="em"><b>' + esc(opts.short ? e.time : longDate(e.date)) + '</b><span>' + esc(moodWord(e.mood)) + (opts.short ? "" : " · " + esc(e.time)) + (D.books.length > 1 ? " · " + esc(bookName(k)) : "") + (k.birth ? " · " + esc(ageAt(k.birth, e.date)) : "") + '</span></div></div>';
    if (e.text) h += '<p class="et' + (opts.full ? " full" : "") + '">' + esc(e.text) + '</p>';
    if (e.photos.length) h += '<div class="ephotos">' + e.photos.slice(0, opts.full ? 10 : 3).map(function (p) { return '<img src="' + esc(D.photos[p]) + '" alt="" loading="lazy">'; }).join("") + (!opts.full && e.photos.length > 3 ? '<span class="more">+' + (e.photos.length - 3) + '</span>' : '') + '</div>';
    if (e.tags.length) h += '<div class="tags">' + e.tags.map(function (g) { return '<span class="tag">#' + esc(g) + '</span>'; }).join("") + '</div>';
    return h + '</article>';
  }

  function vToday() {
    if (!ui.draft) ui.draft = freshDraft();
    var h = topbar("Sotto");
    h += '<section class="hero"><p class="date">' + esc(longDate(today())) + '</p><h2>' + esc(greeting()) + '</h2><p class="sub">' + esc(t("how")) + '</p></section>';
    h += '<section class="card compose">' + composer(ui.draft, "c") + '<button class="btn primary wide" data-a="savec">' + esc(t("save")) + '</button></section>';
    var otd = onThisDay();
    if (otd.length) { var o = otd[0]; h += '<section class="memory"><p class="ml">' + IC.spark + ' ' + esc(o.n === 0 ? t("ago_1m") : o.n === 1 ? t("ago_1y") : t("ago_ny", { n: o.n })) + '</p>' + entryCard(o.e) + (otd.length > 1 ? '<p class="mutedline">' + esc(t("more_entries", { n: otd.length - 1 })) + '</p>' : '') + '</section>'; }
    var td = entriesSorted(D.entries.filter(function (e) { return e.date === today(); }));
    if (td.length) h += '<section><h3 class="sh">' + esc(t("today_written")) + '</h3>' + td.map(function (e) { return entryCard(e, { short: true }); }).join("") + '</section>';
    else if (D.entries.length) h += '<p class="mutedline center">' + esc(t("welcome")) + '</p>';
    return h;
  }

  function filtered() {
    var q = ui.q.trim().toLowerCase();
    return entriesSorted(D.entries.filter(function (e) {
      if (ui.qBook !== "all" && e.bookId !== ui.qBook) return false;
      if (!q) return true;
      return e.text.toLowerCase().indexOf(q) >= 0 || e.tags.some(function (g) { return g.toLowerCase().indexOf(q.replace(/^#/, "")) >= 0; }) || longDate(e.date).toLowerCase().indexOf(q) >= 0;
    }));
  }
  function vTime() {
    var h = topbar(t("tab_time"));
    h += '<div class="tools"><input id="q" class="inp search" type="search" aria-label="' + esc(t("search")) + '" placeholder="' + esc(t("search")) + '" value="' + esc(ui.q) + '">';
    h += '<div class="seg"><button class="' + (ui.tView === "list" ? "on" : "") + '" data-a="tview" data-v="list">' + esc(t("list")) + '</button><button class="' + (ui.tView === "cal" ? "on" : "") + '" data-a="tview" data-v="cal">' + esc(t("calendar")) + '</button></div></div>';
    if (D.books.length > 1) h += '<div class="chips">' + [["all", t("all_books")]].concat(D.books.map(function (k) { return [k.id, bookName(k)]; })).map(function (p) { return '<button class="chip' + (ui.qBook === p[0] ? " on" : "") + '" data-a="qbook" data-v="' + esc(p[0]) + '">' + esc(p[1]) + '</button>'; }).join("") + '</div>';
    if (!D.entries.length) return h + '<p class="empty">' + esc(t("empty_time")) + '</p>';
    if (ui.tView === "cal") return h + calendar();
    var list = filtered(); if (!list.length) return h + '<p class="empty">' + esc(t("no_hits")) + '</p>';
    var cur = "", out = "";
    list.slice(0, 400).forEach(function (e) { var ym = e.date.slice(0, 7); if (ym !== cur) { cur = ym; var n = list.filter(function (x) { return x.date.slice(0, 7) === ym; }).length; out += '<h3 class="mh"><span>' + esc(monthName(ym)) + '</span><small>' + esc(n === 1 ? t("one_entry") : t("n_entries", { n: n })) + '</small></h3>'; } out += entryCard(e); });
    return h + '<div id="tlist">' + out + '</div>';
  }
  function dayMood(list) { var ms = list.filter(function (e) { return e.mood; }).map(function (e) { return e.mood; }); return ms.length ? Math.round(ms.reduce(function (a, b) { return a + b; }, 0) / ms.length) : 0; }
  function calendar() {
    var ym = ui.cal, n = daysIn(ym), first = (dOf(ym + "-01").getDay() + 6) % 7;
    var h = '<section class="card cal"><div class="calh"><button class="iconbtn" data-a="calm" data-v="-1" aria-label="-">' + IC.left + '</button><b>' + esc(monthName(ym)) + '</b><button class="iconbtn" data-a="calm" data-v="1" aria-label="+">' + IC.right + '</button></div><div class="grid">';
    for (var w = 0; w < 7; w++) h += '<span class="wd">' + esc(fmt("2024-01-" + pad(1 + w), { weekday: "narrow" })) + '</span>';
    for (var i = 0; i < first; i++) h += '<span></span>';
    for (var d = 1; d <= n; d++) {
      var iso = ym + "-" + pad(d), es = D.entries.filter(function (e) { return e.date === iso && (ui.qBook === "all" || e.bookId === ui.qBook); }), m = dayMood(es);
      h += '<button class="day' + (es.length ? " has" : "") + (iso === today() ? " td" : "") + '" data-a="day" data-v="' + iso + '"' + (iso > today() ? " disabled" : "") + ' style="' + (es.length ? "--dc:" + (m ? MOODC[m] : "var(--line)") : "") + '"><span>' + d + '</span></button>';
    }
    h += '</div></section>';
    var sel = ui.calDay && ui.calDay.slice(0, 7) === ym ? ui.calDay : null;
    if (sel) { var es2 = entriesSorted(D.entries.filter(function (e) { return e.date === sel; })); h += '<h3 class="sh">' + esc(longDate(sel)) + '</h3>' + es2.map(function (e) { return entryCard(e, { short: true }); }).join("") + '<button class="btn ghost wide" data-a="newfor" data-v="' + sel + '">' + esc(t("write_day")) + '</button>'; }
    return h;
  }

  function vLook() {
    var h = topbar(t("tab_look"));
    h += '<div class="seg big"><button class="' + (ui.lMode === "month" ? "on" : "") + '" data-a="lmode" data-v="month">' + esc(t("month")) + '</button><button class="' + (ui.lMode === "year" ? "on" : "") + '" data-a="lmode" data-v="year">' + esc(t("year")) + (isPro() ? "" : " · Pro") + '</button></div>';
    var isM = ui.lMode === "month", label = isM ? monthName(ui.lMonth) : String(ui.lYear);
    h += '<div class="calh"><button class="iconbtn" data-a="lstep" data-v="-1" aria-label="-">' + IC.left + '</button><b>' + esc(label) + '</b><button class="iconbtn" data-a="lstep" data-v="1" aria-label="+">' + IC.right + '</button></div>';
    if (!isM && !isPro()) return h + proTeaser();
    var list = D.entries.filter(function (e) { return isM ? e.date.slice(0, 7) === ui.lMonth : e.date.slice(0, 4) === String(ui.lYear); });
    if (!list.length) return h + '<p class="empty">' + esc(t("look_empty")) + '</p>';
    var days = {}; list.forEach(function (e) { days[e.date] = 1; });
    var ms = list.filter(function (e) { return e.mood; }), avg = ms.length ? ms.reduce(function (a, e) { return a + e.mood; }, 0) / ms.length : 0;
    h += '<div class="stats"><div class="stat"><b>' + list.length + '</b><span>' + esc(t("n_entries", { n: "" }).trim()) + '</span></div><div class="stat"><b>' + Object.keys(days).length + '</b><span>' + esc(t("days_written")) + '</span></div><div class="stat">' + (avg ? face(Math.round(avg), 30) : '<b>–</b>') + '<span>' + esc(t("avg_mood")) + '</span></div></div>';
    h += '<section class="card"><h3 class="sh">' + esc(t("mood_course")) + '</h3>' + moodChart(list, isM) + '</section>';
    var cnt = [0, 0, 0, 0, 0, 0]; ms.forEach(function (e) { cnt[e.mood]++; }); var mx = Math.max.apply(null, cnt) || 1;
    h += '<section class="card"><h3 class="sh">' + esc(t("mood_split")) + '</h3>';
    for (var m = 5; m >= 1; m--) h += '<div class="bar">' + face(m, 22) + '<span class="bl">' + esc(t("mood" + m)) + '</span><span class="bt"><i style="width:' + Math.round(cnt[m] / mx * 100) + '%;background:' + MOODC[m] + '"></i></span><b>' + cnt[m] + '</b></div>';
    var wd = [0, 0, 0, 0, 0, 0, 0], wn = [0, 0, 0, 0, 0, 0, 0]; ms.forEach(function (e) { var d = dOf(e.date).getDay(); wd[d] += e.mood; wn[d]++; });
    var best = -1, bv = 0; for (var i = 0; i < 7; i++) if (wn[i] >= 2 && wd[i] / wn[i] > bv) { bv = wd[i] / wn[i]; best = i; }
    if (ms.length >= 8 && best >= 0) h += '<p class="pattern">' + IC.spark + ' ' + esc(t("best_day", { d: fmt("2024-01-" + pad(best === 0 ? 7 : best), { weekday: "long" }) })) + ' <small>' + esc(t("local_calc")) + '</small></p>';
    h += '</section>';
    var tg = {}; list.forEach(function (e) { e.tags.forEach(function (g) { tg[g] = (tg[g] || 0) + 1; }); });
    var tops = Object.keys(tg).sort(function (a, b) { return tg[b] - tg[a]; }).slice(0, 8);
    if (tops.length) h += '<section class="card"><h3 class="sh">' + esc(t("top_tags")) + '</h3><div class="tags">' + tops.map(function (g) { return '<button class="tag" data-a="tagsearch" data-v="' + esc(g) + '">#' + esc(g) + ' <small>' + tg[g] + '</small></button>'; }).join("") + '</div></section>';
    var mom = entriesSorted(list.filter(function (e) { return e.mood === 5 && (e.text || e.photos.length); })).slice(0, 3);
    if (mom.length) h += '<section><h3 class="sh">' + esc(t("moments")) + '</h3>' + mom.map(function (e) { return entryCard(e); }).join("") + '</section>';
    return h;
  }
  function moodChart(list, isM) {
    var W = 320, H = 140, L = 30, R = 10, T = 12, B = 22, pts = [], n, lab = [];
    if (isM) { n = daysIn(ui.lMonth); for (var d = 1; d <= n; d++) { var iso = ui.lMonth + "-" + pad(d), es = list.filter(function (e) { return e.date === iso && e.mood; }); if (es.length) pts.push([d, es.reduce(function (a, e) { return a + e.mood; }, 0) / es.length]); } lab = [1, 8, 15, 22, n]; }
    else { n = 12; for (var m = 1; m <= 12; m++) { var ym = ui.lYear + "-" + pad(m), es2 = list.filter(function (e) { return e.date.slice(0, 7) === ym && e.mood; }); if (es2.length) pts.push([m, es2.reduce(function (a, e) { return a + e.mood; }, 0) / es2.length]); } lab = [1, 4, 7, 10, 12]; }
    var X = function (v) { return L + (v - 1) / Math.max(1, n - 1) * (W - L - R); }, Y = function (v) { return T + (5 - v) / 4 * (H - T - B); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(t("mood_course")) + '">';
    for (var y = 1; y <= 5; y++) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y) + '" y2="' + Y(y) + '" stroke="var(--line)" stroke-width="1"/><circle cx="12" cy="' + Y(y) + '" r="5" fill="' + MOODC[y] + '"/>';
    lab.forEach(function (v) { s += '<text x="' + X(v) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + (isM ? v : esc(fmt(ui.lYear + "-" + pad(v) + "-01", { month: "short" }))) + '</text>'; });
    if (pts.length > 1) s += '<polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function (p) { return X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1); }).join(" ") + '"/>';
    pts.forEach(function (p) { s += '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="3.6" fill="' + MOODC[Math.round(p[1])] + '" stroke="var(--card)" stroke-width="1.5"/>'; });
    return s + '</svg>';
  }
  function proTeaser() { return '<section class="card pro-teaser"><p>' + esc(t("pro_need")) + '</p><button class="btn primary" data-a="sub" data-v="pro">Sotto Pro</button></section>'; }

  function vMore() {
    if (ui.sub) return vSub();
    var photos = Object.keys(D.photos).length, days = {}; D.entries.forEach(function (e) { days[e.date] = 1; });
    var h = topbar(t("tab_more"));
    h += '<p class="mutedline center">' + esc(t("stats_line", { e: D.entries.length, d: Object.keys(days).length, p: photos })) + '</p>';
    var rows = [["books", t("books"), t("books_sub")], ["pdf", t("pdf"), t("pdf_sub")], ["backup", t("backup"), t("backup_sub")], ["lock", t("lock"), KEY ? t("lock_on") : t("lock_off")]].concat(REMIND ? [["remind", t("reminder"), D.settings.remind.on ? t("rem_on", { t: D.settings.remind.time }) : t("rem_off")]] : []).concat([ ["lang", t("language"), (LANGS.filter(function (l) { return l[0] === LANG; })[0] || [0, ""])[1]], ["theme", t("theme"), t("th_" + D.settings.theme)], ["pro", "Sotto Pro", isPro() ? t("pro_unlocked") : t("pro_lockedtxt")], ["legal", t("legal"), t("version") + " " + VERSION]]);
    h += '<nav class="card menu">' + rows.map(function (r) { return '<button class="mi" data-a="sub" data-v="' + r[0] + '"><span><b>' + esc(r[1]) + '</b><small>' + esc(r[2]) + '</small></span>' + IC.chev + '</button>'; }).join("") + '</nav>';
    return h;
  }
  var TITLES = { remind: "reminder", books: "books", pdf: "pdf", backup: "backup", lock: "lock", lang: "language", theme: "theme", legal: "legal" };
  function vSub() {
    var s = ui.sub, h = topbar(s === "pro" ? "Sotto Pro" : t(TITLES[s]), true);
    if (s === "books") {
      h += '<section class="card list">' + D.books.map(function (k) { var n = D.entries.filter(function (e) { return e.bookId === k.id; }).length; return '<div class="li"><span class="bdot bt-' + k.type + '"></span><span class="lt"><b>' + esc(bookName(k)) + '</b><small>' + esc(t("bt_" + k.type)) + ' · ' + esc(n === 1 ? t("one_entry") : t("n_entries", { n: n })) + (k.birth ? ' · ' + esc(ageAt(k.birth, today())) : '') + '</small></span><button class="link" data-a="editbook" data-id="' + esc(k.id) + '">' + esc(t("edit")) + '</button></div>'; }).join("") + '</section>';
      h += (isPro() || D.books.length < 1) ? '<button class="btn primary wide" data-a="newbook">' + esc(t("new_book")) + '</button>' : proTeaser();
    } else if (s === "pdf") {
      if (!isPro()) return h + proTeaser();
      var pd = ui.pdf;
      h += '<section class="card"><h3 class="sh">' + esc(t("pdf_head")) + '</h3><p class="mutedline">' + esc(t("pdf_intro")) + '</p>';
      h += '<label class="fld"><span>' + esc(t("book")) + '</span><select id="pdfbook" class="inp"><option value="all">' + esc(t("all_books")) + '</option>' + D.books.map(function (k) { return '<option value="' + esc(k.id) + '"' + (pd.book === k.id ? " selected" : "") + '>' + esc(bookName(k)) + '</option>'; }).join("") + '</select></label>';
      h += '<label class="fld"><span>' + esc(t("period")) + '</span><select id="pdfrange" class="inp">' + [["all", t("all_time")], ["this", t("this_year")], ["last", t("last_year")]].map(function (r) { return '<option value="' + r[0] + '"' + (pd.range === r[0] ? " selected" : "") + '>' + esc(r[1]) + '</option>'; }).join("") + '</select></label>';
      h += '<label class="check"><input type="checkbox" id="pdfph"' + (pd.photos ? " checked" : "") + '> ' + esc(t("with_photos")) + '</label>';
      h += '<button class="btn primary wide" data-a="makepdf"' + (pd.busy ? " disabled" : "") + '>' + esc(pd.busy ? t("pdf_busy") : t("pdf_make")) + '</button></section>';
    } else if (s === "backup") {
      h += '<section class="card"><button class="btn primary wide" data-a="backup">' + esc(t("backup_save")) + '</button><p class="mutedline">' + esc(t("backup_note")) + '</p><label class="btn ghost wide">' + esc(t("backup_load")) + '<input type="file" accept=".json,.sotto,application/json" data-pick="restore" hidden></label><button class="btn ghost wide" data-a="exporttxt">' + esc(t("export_txt")) + '</button></section>';
      h += '<button class="btn danger wide" data-a="wipe">' + esc(t("wipe")) + '</button>';
    } else if (s === "lock") {
      h += '<section class="card"><p class="lockstate">' + IC.lock + ' ' + esc(KEY ? t("lock_on") : t("lock_off")) + '</p><p class="mutedline">' + esc(t("pin_warn")) + '</p>';
      if (KEY) h += '<button class="btn primary wide" data-a="pinsheet" data-v="change">' + esc(t("pin_change")) + '</button><button class="btn ghost wide" data-a="pinsheet" data-v="remove">' + esc(t("pin_remove")) + '</button>';
      else h += '<button class="btn primary wide" data-a="pinsheet" data-v="set">' + esc(t("pin_set")) + '</button>';
      h += '</section>';
    } else if (s === "remind") {
      var rm = D.settings.remind;
      h += '<section class="card"><label class="check"><input type="checkbox" id="remon"' + (rm.on ? " checked" : "") + '> ' + esc(t("rem_daily")) + '</label><label class="fld"><span>' + esc(t("time")) + '</span><input id="remtime" type="time" class="inp" value="' + esc(rm.time) + '"></label><button class="btn primary wide" data-a="saveremind">' + esc(t("save")) + '</button><p class="mutedline">' + esc(t("rem_note")) + '</p></section>';
    } else if (s === "lang") {
      h += '<section class="card list">' + LANGS.map(function (l) { return '<button class="li sel' + (l[0] === LANG ? " on" : "") + '" data-a="setlang" data-v="' + l[0] + '"><span class="lt"><b>' + esc(l[1]) + '</b></span>' + (l[0] === LANG ? "✓" : "") + '</button>'; }).join("") + '</section>';
    } else if (s === "theme") {
      h += '<div class="themes">' + THEMES.map(function (th, i) { var lockd = !isPro() && i > 1; return '<button class="themecard th-' + th + (D.settings.theme === th ? " on" : "") + '" data-a="settheme" data-v="' + th + '"' + (lockd ? ' data-pro="1"' : '') + '><span class="sw"><i></i><i></i><i></i></span><b>' + esc(t("th_" + th)) + (lockd ? " · Pro" : "") + '</b></button>'; }).join("") + '</div>';
    } else if (s === "pro") {
      h += '<section class="card pro"><div class="proicon">' + face(5, 56) + '</div><h2>' + esc(t("pro_title")) + '</h2><ul>' + ["pro_l1", "pro_l2", "pro_l3", "pro_l4", "pro_l5", "pro_l6"].map(function (k) { return '<li>' + esc(t(k)) + '</li>'; }).join("") + '</ul><p class="price">' + esc(proPrice()) + '</p>' + (isPro() ? '<button class="btn primary wide" disabled>' + esc(t("pro_unlocked")) + '</button>' : BILLING ? '<button class="btn primary wide" data-a="buypro">' + esc(t("pro_buy", { p: proPrice() })) + '</button><button class="btn ghost wide" data-a="restorepro">' + esc(t("pro_restore")) + '</button>' : '<button class="btn primary wide" disabled>' + esc(proPrice()) + '</button>') + (!BILLING && PRO_TEST ? '<p class="mutedline">' + esc(t("pro_test")) + '</p>' : '') + '</section>';
    } else if (s === "legal") {
      h += '<section class="card legal"><h3 class="sh">' + esc(t("provider")) + '</h3><p>Sven Hädrich<br>Eppsteiner Str. 6<br>65719 Hofheim am Taunus<br>Deutschland</p><h3 class="sh">' + esc(t("privacy")) + '</h3><p>' + esc(t("legal_t3")) + '</p><h3 class="sh">' + esc(t("legal_dis")) + '</h3><p>' + esc(t("legal_t1")) + '</p><p>' + esc(t("legal_t2")) + '</p><p class="mutedline">Sotto ' + VERSION + '</p></section>';
    }
    return h;
  }

  /* ---------- Blätter (Sheets) ---------- */
  function vSheet() {
    var sh = ui.sheet; if (!sh) return "";
    var h = '<div class="scrim" data-a="closesheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheetbar"><span class="grab"></span><button class="iconbtn sheetx" data-a="closesheet" aria-label="' + esc(t("cancel")) + '">' + IC.x + '</button></div>';
    if (sh.kind === "view") {
      var e = D.entries.filter(function (x) { return x.id === sh.id; })[0]; if (!e) { ui.sheet = null; return ""; }
      h += entryCard(e, { full: true }) + '<div class="row2"><button class="btn ghost" data-a="editentry" data-id="' + esc(e.id) + '">' + esc(t("edit")) + '</button><button class="btn ghost danger" data-a="delentry" data-id="' + esc(e.id) + '">' + esc(t("del")) + '</button></div>';
    } else if (sh.kind === "entry") {
      h += '<h2>' + esc(sh.dr.id ? t("edit_entry") : t("new_entry")) + '</h2>' + composer(sh.dr, "e") + '<div class="row2"><button class="btn ghost" data-a="closesheet">' + esc(t("cancel")) + '</button><button class="btn primary" data-a="savee">' + esc(t("save")) + '</button></div>';
    } else if (sh.kind === "confirm") {
      h += '<h2>' + esc(sh.title) + '</h2><p class="mutedline">' + esc(sh.text) + '</p><div class="row2"><button class="btn ghost" data-a="closesheet">' + esc(t("cancel")) + '</button><button class="btn ' + (sh.danger ? "danger" : "primary") + '" data-a="confirmok">' + esc(sh.ok) + '</button></div>';
    } else if (sh.kind === "book") {
      var k = sh.book;
      h += '<h2>' + esc(k.id ? t("edit") : t("new_book")) + '</h2><div class="chips">' + ["me", "kid", "trip", "family"].map(function (ty) { return '<button class="chip' + (k.type === ty ? " on" : "") + '" data-a="booktype" data-v="' + ty + '">' + esc(t("bt_" + ty)) + '</button>'; }).join("") + '</div><label class="fld"><span>' + esc(t("name")) + '</span><input id="bname" class="inp" maxlength="60" value="' + esc(k.name) + '"></label>' + (k.type === "kid" ? '<label class="fld"><span>' + esc(t("birth")) + '</span><input id="bbirth" type="date" class="inp" value="' + esc(k.birth || "") + '" max="' + today() + '"></label>' : '') + '<div class="row2">' + (k.id && D.books.length > 1 ? '<button class="btn ghost danger" data-a="delbook">' + esc(t("del")) + '</button>' : '<button class="btn ghost" data-a="closesheet">' + esc(t("cancel")) + '</button>') + '<button class="btn primary" data-a="savebook">' + esc(t("save")) + '</button></div>';
    } else if (sh.kind === "pin") {
      h += '<h2>' + esc(sh.mode === "remove" ? t("pin_remove") : sh.mode === "change" ? t("pin_change") : sh.mode === "restore" ? t("restore_pin") : t("pin_set")) + '</h2>';
      if (sh.mode === "change" || sh.mode === "remove" || sh.mode === "restore") h += '<input id="pcur" class="inp pin" type="password" inputmode="numeric" autocomplete="off" placeholder="' + esc(sh.mode === "restore" ? t("enter_pin") : t("pin_cur")) + '">';
      if (sh.mode === "set" || sh.mode === "change") h += '<input id="p1" class="inp pin" type="password" inputmode="numeric" autocomplete="off" placeholder="' + esc(t("pin_new")) + '"><input id="p2" class="inp pin" type="password" inputmode="numeric" autocomplete="off" placeholder="' + esc(t("pin_rep")) + '">';
      if (sh.err) h += '<p class="err">' + esc(sh.err) + '</p>';
      h += '<div class="row2"><button class="btn ghost" data-a="closesheet">' + esc(t("cancel")) + '</button><button class="btn primary" data-a="pinok">' + esc(t("save")) + '</button></div>';
    }
    return h + '</div>';
  }

  function vLock() {
    var wait = Math.max(0, Math.ceil((ui.waitUntil - Date.now()) / 1000));
    return '<main class="lockscreen"><div class="logo">' + face(4, 64) + '</div><h1>Sotto</h1><p class="mutedline">' + IC.lock + ' ' + esc(t("locked_note")) + '</p><input id="upin" class="inp pin" type="password" inputmode="numeric" autocomplete="off" placeholder="' + esc(t("enter_pin")) + '"' + (wait ? " disabled" : "") + '>' + (ui.lockErr ? '<p class="err">' + esc(ui.lockErr) + '</p>' : '') + '<button class="btn primary wide" data-a="unlock"' + (wait ? " disabled" : "") + '>' + esc(wait ? t("wait_s", { n: wait }) : t("unlock")) + '</button></main>';
  }

  function vWizard() {
    var st = ui.wiz, h = '<main class="wizard"><div class="dots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i <= st ? "on" : "") + '"></i>'; }).join("") + '</div>';
    if (st === 0) { h += '<div class="logo">' + face(4, 72) + '</div><h1>' + esc(t("wiz_hi")) + '</h1><p class="lead">' + esc(t("wiz_sub")) + '</p><h3 class="sh">' + esc(t("wiz_lang")) + '</h3><div class="chips center">' + LANGS.map(function (l) { return '<button class="chip' + (l[0] === LANG ? " on" : "") + '" data-a="wlang" data-v="' + l[0] + '">' + esc(l[1]) + '</button>'; }).join("") + '</div><button class="btn primary wide" data-a="wnext">' + esc(t("next")) + '</button>'; }
    else if (st === 1) { h += '<h1>' + esc(t("wiz_name")) + '</h1><input id="wname" class="inp big" maxlength="40" placeholder="' + esc(t("ph_name")) + '" value="' + esc(D.settings.name) + '"><button class="btn primary wide" data-a="wnext">' + esc(t("next")) + '</button>'; }
    else if (st === 2) { h += '<h1>' + esc(t("wiz_pin")) + '</h1><p class="lead">' + esc(t("wiz_pin_sub")) + '</p><input id="p1" class="inp pin" type="password" inputmode="numeric" autocomplete="off" placeholder="' + esc(t("pin_new")) + '"><input id="p2" class="inp pin" type="password" inputmode="numeric" autocomplete="off" placeholder="' + esc(t("pin_rep")) + '">' + (ui.wizErr ? '<p class="err">' + esc(ui.wizErr) + '</p>' : '') + '<p class="mutedline">' + esc(t("pin_warn")) + '</p><button class="btn primary wide" data-a="wpin">' + esc(t("pin_set")) + '</button><button class="btn ghost wide" data-a="wskip">' + esc(t("skip_pin")) + '</button>'; }
    else { h += '<h1>' + esc(t("wiz_ok")) + '</h1><ul class="okl"><li>' + esc(t("wiz_ok1")) + '</li><li>' + esc(t("wiz_ok2")) + '</li><li>' + esc(t("wiz_ok3")) + '</li></ul><label class="check"><input type="checkbox" id="wizok"> ' + esc(t("wiz_check")) + '</label><button class="btn primary wide" data-a="wdone">' + esc(t("wiz_go")) + '</button><button class="link" data-a="wlegal">' + esc(t("legal")) + '</button>'; }
    return h + '</main>' + vSheet();
  }

  function nav() {
    return '<nav class="tabs">' + [["today", IC.today], ["time", IC.time], ["look", IC.look], ["more", IC.more]].map(function (p) { return '<button class="' + (ui.tab === p[0] ? "on" : "") + '" data-a="tab" data-v="' + p[0] + '"' + (ui.tab === p[0] ? ' aria-current="page"' : '') + '>' + p[1] + '<span>' + esc(t("tab_" + p[0])) + '</span></button>'; }).join("") + '</nav>';
  }

  var root = null;
  function render() {
    if (!root) root = document.getElementById("root");
    var keep = document.activeElement && document.activeElement.id === "q" ? (document.getElementById("q").selectionStart || 0) : -1;
    document.documentElement.setAttribute("data-theme", D ? D.settings.theme : "light");
    document.documentElement.lang = LANG;
    var h;
    if (ui.locked) h = vLock();
    else if (!D) h = "";
    else if (!D.settings.onboarded) h = vWizard();
    else { var v = ui.tab === "today" ? vToday() : ui.tab === "time" ? vTime() : ui.tab === "look" ? vLook() : vMore(); h = '<main class="page">' + v + '</main>' + nav() + vSheet(); }
    if (ui.toast) h += '<div class="toast" role="status">' + esc(ui.toast) + '</div>';
    root.innerHTML = h;
    document.body.classList.toggle("noscroll", !!ui.sheet);
    if (keep >= 0) { var q = document.getElementById("q"); if (q) { q.focus(); try { q.setSelectionRange(keep, keep); } catch (e) {} } }
  }
  var toastT = null;
  function toast(s) { ui.toast = s; render(); clearTimeout(toastT); toastT = setTimeout(function () { ui.toast = ""; render(); }, 2200); }

  /* ---------- Aktionen ---------- */
  function val(id) { var el = document.getElementById(id); return el ? el.value : ""; }
  function confirmAsk(title, text, ok, fn, danger) { ui.sheet = { kind: "confirm", title: title, text: text, ok: ok, fn: fn, danger: danger }; render(); }
  function commitDraft(dr) {
    var text = dr.text.trim(); if (!text && !dr.mood && !dr.photos.length) { toast(t("entry_empty")); return false; }
    var ids = dr.photos.map(function (p) { if (p.id) return p.id; var id = uid("p"); D.photos[id] = p.src; return id; });
    var e = dr.id ? D.entries.filter(function (x) { return x.id === dr.id; })[0] : null;
    if (e) { var old = e.photos; Object.assign(e, { date: dr.date, time: dr.time, mood: dr.mood, text: text, tags: tagList(dr.tags), bookId: dr.bookId, photos: ids, updated: Date.now() }); old.forEach(function (p) { if (ids.indexOf(p) < 0) delete D.photos[p]; }); }
    else D.entries.push({ id: uid("e"), date: dr.date, time: dr.time, mood: dr.mood, text: text, tags: tagList(dr.tags), bookId: dr.bookId, photos: ids, created: Date.now(), updated: Date.now() });
    save(true); return true;
  }
  function delEntry(id) { var e = D.entries.filter(function (x) { return x.id === id; })[0]; if (!e) return; e.photos.forEach(function (p) { delete D.photos[p]; }); D.entries = D.entries.filter(function (x) { return x.id !== id; }); save(true); }
  function download(name, blob) { var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); }
  function stamp() { var d = new Date(); return isoOf(d) + "_" + pad(d.getHours()) + pad(d.getMinutes()); }

  async function handle(a, el) {
    var v = el.getAttribute("data-v"), id = el.getAttribute("data-id");
    syncDraft();
    switch (a) {
      case "tab": ui.tab = v; ui.sub = null; ui.sheet = null; window.scrollTo(0, 0); break;
      case "back": ui.sub = null; break;
      case "sub": if (el.getAttribute("data-pro") && !isPro()) v = "pro"; ui.tab = "more"; ui.sub = v; ui.sheet = null; window.scrollTo(0, 0); break;
      case "mood": var m = +el.getAttribute("data-m"); var tgt = ui.sheet && ui.sheet.kind === "entry" ? ui.sheet.dr : ui.draft; tgt.mood = tgt.mood === m ? 0 : m; break;
      case "nextprompt": ui.promptIx++; break;
      case "rmphoto": var tg2 = ui.sheet && ui.sheet.kind === "entry" ? ui.sheet.dr : ui.draft; tg2.photos.splice(+el.getAttribute("data-i"), 1); break;
      case "savec": if (commitDraft(ui.draft)) { ui.draft = freshDraft(); ui.promptIx++; toast(t("saved")); return; } return;
      case "savee": if (commitDraft(ui.sheet.dr)) { ui.sheet = null; toast(t("saved")); return; } return;
      case "open": ui.sheet = { kind: "view", id: id }; break;
      case "editentry": var e = D.entries.filter(function (x) { return x.id === id; })[0]; if (!e) break; ui.sheet = { kind: "entry", dr: { id: e.id, date: e.date, time: e.time, mood: e.mood, text: e.text, tags: e.tags.join(", "), bookId: e.bookId, photos: e.photos.map(function (p) { return { id: p }; }) } }; break;
      case "delentry": confirmAsk(t("del_q"), t("undo_no"), t("del"), function () { delEntry(id); }, true); return;
      case "closesheet": ui.sheet = null; break;
      case "confirmok": var fn = ui.sheet.fn; ui.sheet = null; await fn(); break;
      case "tview": ui.tView = v; break;
      case "qbook": ui.qBook = v; break;
      case "calm": ui.cal = addMonths(ui.cal, +v); ui.calDay = null; break;
      case "day": ui.calDay = v; break;
      case "newfor": ui.sheet = { kind: "entry", dr: freshDraft(v) }; ui.sheet.dr.time = "20:00"; break;
      case "lmode": if (v === "year" && !isPro()) { ui.tab = "more"; ui.sub = "pro"; break; } ui.lMode = v; break;
      case "lstep": if (ui.lMode === "month") ui.lMonth = addMonths(ui.lMonth, +v); else ui.lYear += +v; break;
      case "tagsearch": ui.tab = "time"; ui.tView = "list"; ui.q = v; break;
      case "newbook": ui.sheet = { kind: "book", book: { id: null, name: "", type: "kid" } }; break;
      case "editbook": var k = bookById(id); ui.sheet = { kind: "book", book: Object.assign({}, k) }; break;
      case "booktype": ui.sheet.book.name = val("bname"); ui.sheet.book.birth = val("bbirth") || ui.sheet.book.birth; ui.sheet.book.type = v; break;
      case "savebook":
        var bk = ui.sheet.book; bk.name = val("bname").trim().slice(0, 60); var bb = val("bbirth"); bk.birth = bk.type === "kid" && isIso(bb) ? bb : undefined;
        if (bk.id) { var ob = bookById(bk.id); Object.assign(ob, bk); } else { bk.id = uid("b"); D.books.push(bk); }
        ui.sheet = null; save(true); toast(t("saved")); return;
      case "delbook": var did = ui.sheet.book.id, rest = D.books.filter(function (x) { return x.id !== did; }); confirmAsk(t("book_del_q"), t("book_del_t", { b: bookName(rest[0]) }), t("del"), function () { D.entries.forEach(function (x) { if (x.bookId === did) x.bookId = rest[0].id; }); D.books = rest; if (ui.qBook === did) ui.qBook = "all"; save(true); }, true); return;
      case "setlang": setLang(v); break;
      case "settheme": if (el.getAttribute("data-pro") && !isPro()) { ui.sub = "pro"; break; } D.settings.theme = v; save(); break;
      case "buypro": try { NAT.buyPro(); } catch (e2) {} return;
      case "restorepro": try { NAT.restorePro(); } catch (e2) {} return;
      case "saveremind": var ron = document.getElementById("remon"), rtv = val("remtime"); D.settings.remind = { on: !!(ron && ron.checked), time: /^\d{2}:\d{2}$/.test(rtv) ? rtv : D.settings.remind.time }; pushReminder(); save(); toast(t("saved")); return;
      case "pinsheet": ui.sheet = { kind: "pin", mode: v }; break;
      case "pinok": await pinOk(); return;
      case "backup": var env = await envelope(); download("sotto-sicherung_" + stamp() + ".json", new Blob([JSON.stringify(env)], { type: "application/json" })); return;
      case "exporttxt": download("sotto_" + stamp() + ".txt", new Blob([textExport()], { type: "text/plain;charset=utf-8" })); return;
      case "wipe": confirmAsk(t("wipe"), t("wipe_t"), t("del"), async function () { KEY = null; var lang = LANG; D = blank(); D.settings.lang = lang; ui.wiz = 0; ui.draft = null; ui.tab = "today"; ui.sub = null; try { localStorage.removeItem(DB_KEY); } catch (e2) {} await idbPut(""); try { var n = window.KammerAndroid; if (n && n.beginDb) { n.beginDb(); n.appendDb(""); n.commitDb(); } } catch (e3) {} }, true); return;
      case "makepdf": ui.pdf.book = val("pdfbook") || "all"; ui.pdf.range = val("pdfrange") || "all"; var cb = document.getElementById("pdfph"); ui.pdf.photos = cb ? cb.checked : true; makePdf(); return;
      case "unlock": await unlock(); return;
      case "wlang": setLang(v); break;
      case "wnext": if (ui.wiz === 1) D.settings.name = val("wname").trim().slice(0, 40); ui.wiz++; break;
      case "wpin": var p1 = val("p1"), p2 = val("p2"); if (!/^\d{6,12}$/.test(p1)) { ui.wizErr = t("pin_short"); break; } if (p1 !== p2) { ui.wizErr = t("pin_mismatch"); break; } ui.wizErr = ""; KEY = await makeKey(p1); ui.wiz = 3; break;
      case "wskip": ui.wizErr = ""; KEY = null; ui.wiz = 3; break;
      case "wlegal": ui.sheet = { kind: "confirm", title: t("legal"), text: t("legal_t3") + "\n\n" + t("legal_t1") + "\n\n" + t("legal_t2") + "\n\nSven Hädrich · Eppsteiner Str. 6 · 65719 Hofheim am Taunus", ok: "OK", fn: function () {} }; break;
      case "wdone": var ok = document.getElementById("wizok"); if (!ok || !ok.checked) { ok && ok.parentNode.classList.add("shake"); return; } D.settings.onboarded = true; D.settings.lang = LANG; ui.draft = freshDraft(); save(true); break;
    }
    render();
  }

  async function pinOk() {
    var sh = ui.sheet, cur = val("pcur"), p1 = val("p1"), p2 = val("p2");
    if (sh.mode === "restore") { var r = await unseal(sh.env, cur); if (!r) { sh.err = t("wrong_pin"); render(); return; } var st; try { st = safeParse(r.text); } catch (e) { st = null; } ui.sheet = null; applyRestore(st); return; }
    if (sh.mode === "change" || sh.mode === "remove") { var test = await unseal(await envelope(), cur); if (!test) { sh.err = t("wrong_pin"); render(); return; } }
    if (sh.mode === "remove") { KEY = null; ui.sheet = null; await save(true); toast(t("pin_removed")); return; }
    if (!/^\d{6,12}$/.test(p1)) { sh.err = t("pin_short"); render(); return; }
    if (p1 !== p2) { sh.err = t("pin_mismatch"); render(); return; }
    KEY = await makeKey(p1); ui.sheet = null; await save(true); toast(t("pin_saved"));
  }
  async function unlock() {
    if (Date.now() < ui.waitUntil) return;
    var pin = val("upin"); var env = newer(parseEnv(localStorage.getItem(DB_KEY)), parseEnv(await idbGet()));
    if (!env) { ui.locked = false; D = blank(); render(); return; }
    var r = await unseal(env, pin);
    if (!r) { ui.fails++; ui.lockErr = t("wrong_pin"); if (ui.fails >= 5) { ui.waitUntil = Date.now() + Math.min(300, 30 * Math.pow(2, ui.fails - 5)) * 1000; tick(); } render(); return; }
    var st; try { st = safeParse(r.text); } catch (e) { st = null; }
    KEY = r.key; D = normalize(st); D.settings.onboarded = true; ui.locked = false; ui.fails = 0; ui.lockErr = ""; setLang(D.settings.lang, true); ui.draft = freshDraft(); render();
  }
  function tick() { var iv = setInterval(function () { render(); if (Date.now() >= ui.waitUntil) clearInterval(iv); }, 1000); }
  function applyRestore(st) {
    if (!isObj(st)) { toast(t("restore_bad")); return; }
    confirmAsk(t("restore_q"), t("restore_t"), t("backup_load"), function () { var lang = LANG; D = normalize(st); D.settings.onboarded = true; if (!LOC[D.settings.lang]) D.settings.lang = lang; setLang(D.settings.lang, true); ui.draft = freshDraft(); ui.sub = null; ui.tab = "today"; save(true); setTimeout(function () { toast(t("restore_ok")); }, 50); });
  }
  async function restoreFile(file) {
    var txt = ""; try { txt = await file.text(); } catch (e) {}
    if (txt.length > 300e6) { toast(t("restore_bad")); return; }
    var env = parseEnv(txt); if (!env) { toast(t("restore_bad")); return; }
    if (env.sealed) { ui.sheet = { kind: "pin", mode: "restore", env: env }; render(); return; }
    applyRestore(env.state);
  }
  function setLang(l, quiet) { if (!LOC[l]) return; LANG = l; try { localStorage.setItem("sotto-lang", l); } catch (e) {} if (D) { D.settings.lang = l; if (!quiet) save(); if (D.settings.remind && D.settings.remind.on) pushReminder(); } }
  function pushReminder() { if (!REMIND || !D) return; var r = D.settings.remind, hm = r.time.split(":"); try { NAT.setReminder(!!r.on, +hm[0], +hm[1], "Sotto", t("how") + " " + t("ph_text")); } catch (e) {} }
  window.__sottoPro = function (on) { render(); if (on) toast(t("pro_thanks")); };
  window.__sottoPrice = function () { if (ui.sub === "pro") render(); };
  window.__kammerBack = function () { if (ui.locked || !D) return false; if (!D.settings.onboarded) { if (ui.sheet) { ui.sheet = null; render(); return true; } if (ui.wiz > 0) { ui.wiz--; render(); return true; } return false; } syncDraft(); if (ui.sheet) { ui.sheet = null; render(); return true; } if (ui.sub) { ui.sub = null; render(); return true; } if (ui.tab !== "today") { ui.tab = "today"; render(); window.scrollTo(0, 0); return true; } return false; };
  function textExport() {
    var lines = ["Sotto – " + t("my_diary"), ""];
    entriesSorted(D.entries).reverse().forEach(function (e) { lines.push("## " + longDate(e.date) + " · " + e.time + " · " + moodWord(e.mood) + (D.books.length > 1 ? " · " + bookName(bookById(e.bookId)) : "")); if (e.text) lines.push(e.text); if (e.tags.length) lines.push(e.tags.map(function (g) { return "#" + g; }).join(" ")); if (e.photos.length) lines.push("[" + e.photos.length + " " + t("photo") + "]"); lines.push(""); });
    return lines.join("\n");
  }

  /* ---------- PDF-Buch (A5, Seiten als Bild) ---------- */
  async function makePdf() {
    var pd = ui.pdf, y0 = new Date().getFullYear();
    var list = D.entries.filter(function (e) { if (pd.book !== "all" && e.bookId !== pd.book) return false; var y = +e.date.slice(0, 4); return pd.range === "all" || (pd.range === "this" && y === y0) || (pd.range === "last" && y === y0 - 1); });
    list = entriesSorted(list).reverse();
    if (!list.length) { toast(t("pdf_none")); return; }
    pd.busy = true; render(); await new Promise(function (r) { setTimeout(r, 30); });
    try {
      var W = 874, H = 1240, M = 86, pages = [], c, g, y;
      var fontS = '"Literata","Noto Serif",Georgia,serif', fontA = 'Inter,"Roboto",system-ui,sans-serif';
      function newPage() { c = document.createElement("canvas"); c.width = W; c.height = H; g = c.getContext("2d"); g.fillStyle = "#FBF8F2"; g.fillRect(0, 0, W, H); g.textBaseline = "alphabetic"; pages.push(c); y = M; }
      function foot() { g.fillStyle = "#9A8F82"; g.font = "18px " + fontA; g.textAlign = "center"; g.fillText(String(pages.length), W / 2, H - 44); g.textAlign = "left"; }
      function wrap(text, font, maxW) { g.font = font; var out = []; String(text).split(/\n/).forEach(function (para) { var words = para.split(/\s+/), line = ""; words.forEach(function (w) { var tst = line ? line + " " + w : w; if (g.measureText(tst).width > maxW && line) { out.push(line); line = w; } else line = tst; }); out.push(line); }); return out; }
      /* Titelseite */
      newPage();
      var bk = pd.book === "all" ? null : bookById(pd.book), title = bk ? bookName(bk) : t("my_diary");
      g.fillStyle = "#2B2622"; g.font = "600 60px " + fontS; g.textAlign = "center";
      wrap(title, "600 60px " + fontS, W - 2 * M).forEach(function (l, i) { g.fillText(l, W / 2, 470 + i * 72); });
      g.font = "26px " + fontA; g.fillStyle = "#7A6F64";
      g.fillText(fmt(list[0].date, { month: "long", year: "numeric" }) + " – " + fmt(list[list.length - 1].date, { month: "long", year: "numeric" }), W / 2, 600);
      if (D.settings.name) g.fillText(D.settings.name, W / 2, 646);
      g.strokeStyle = "#C8873A"; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2 - 60, 690); g.lineTo(W / 2 + 60, 690); g.stroke();
      g.font = "20px " + fontA; g.fillText("Sotto", W / 2, H - 80); g.textAlign = "left";
      newPage();
      var maxW = W - 2 * M, body = "25px " + fontS, lh = 38;
      for (var i = 0; i < list.length; i++) {
        var e = list[i], k = bookById(e.bookId);
        if (y > H - M - 160) { foot(); newPage(); }
        g.fillStyle = "#2B2622"; g.font = "600 28px " + fontS; g.fillText(longDate(e.date), M, y + 28);
        var meta = e.time + " · " + moodWord(e.mood) + (k.birth ? " · " + ageAt(k.birth, e.date) : "") + (pd.book === "all" && D.books.length > 1 ? " · " + bookName(k) : "");
        g.font = "19px " + fontA; g.fillStyle = MOODHEX[e.mood] || "#9A8F82"; g.beginPath(); g.arc(M + 8, y + 56, 8, 0, 7); g.fill();
        g.fillStyle = "#7A6F64"; g.fillText(meta, M + 26, y + 63); y += 96;
        if (e.text) { var ls = wrap(e.text, body, maxW); for (var j = 0; j < ls.length; j++) { if (y > H - M - 20) { foot(); newPage(); } g.font = body; g.fillStyle = "#2B2622"; g.fillText(ls[j], M, y); y += lh; } y += 6; }
        if (pd.photos && e.photos.length) {
          for (var p = 0; p < e.photos.length; p++) {
            var img = await imgFrom(D.photos[e.photos[p]]); if (!img) continue;
            var iw = maxW, ih = img.naturalHeight / img.naturalWidth * iw, mh = 520; if (ih > mh) { iw = iw * mh / ih; ih = mh; }
            if (y + ih > H - M) { foot(); newPage(); }
            g.drawImage(img, M + (maxW - iw) / 2, y, iw, ih); y += ih + 18;
          }
        }
        if (e.tags.length) { g.font = "19px " + fontA; g.fillStyle = "#A8642A"; g.fillText(e.tags.map(function (x) { return "#" + x; }).join("  "), M, y + 4); y += 34; }
        g.strokeStyle = "#E6DCCD"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(M, y + 14); g.lineTo(W - M, y + 14); g.stroke(); y += 46;
        if (i % 10 === 9) await new Promise(function (r) { setTimeout(r, 0); });
      }
      foot();
      var jpgs = []; for (var q = 0; q < pages.length; q++) jpgs.push(await canvasJpeg(pages[q]));
      var blob = pdfFromJpegs(jpgs, W, H);
      download("sotto_" + (bk ? bookName(bk).replace(/[^\p{L}\p{N}]+/gu, "-") + "_" : "") + stamp() + ".pdf", blob);
      pd.busy = false; toast(t("pdf_done", { n: pages.length }));
    } catch (err) { pd.busy = false; render(); }
  }
  var MOODHEX = ["", "#5B7A99", "#8C9BAA", "#C9B79C", "#D9A35B", "#E3B53C"];
  function imgFrom(src) { return new Promise(function (res) { if (!src) return res(null); var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function canvasJpeg(cv) { return new Promise(function (res) { cv.toBlob(function (b) { b.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, "image/jpeg", 0.86); }); }
  function pdfFromJpegs(jpgs, pw, ph) {
    var enc = new TextEncoder(), parts = [], off = 0, xref = [];
    function push(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); off += b.length; }
    var n = jpgs.length, ptW = 419.53, ptH = 595.28;
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    function obj(num, body) { xref[num] = off; push(num + " 0 obj\n"); body(); push("\nendobj\n"); }
    obj(1, function () { push("<< /Type /Catalog /Pages 2 0 R >>"); });
    var kids = []; for (var i = 0; i < n; i++) kids.push((3 + i * 3) + " 0 R");
    obj(2, function () { push("<< /Type /Pages /Count " + n + " /Kids [" + kids.join(" ") + "] >>"); });
    for (var j = 0; j < n; j++) {
      var pn = 3 + j * 3, im = pn + 1, cn = pn + 2, cs = "q " + ptW + " 0 0 " + ptH + " 0 0 cm /Im0 Do Q";
      obj(pn, function () { push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + ptW + " " + ptH + "] /Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + cn + " 0 R >>"); });
      obj(im, function () { push("<< /Type /XObject /Subtype /Image /Width " + pw + " /Height " + ph + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpgs[j].length + " >>\nstream\n"); push(jpgs[j]); push("\nendstream"); });
      obj(cn, function () { push("<< /Length " + cs.length + " >>\nstream\n" + cs + "\nendstream"); });
    }
    var total = 3 + n * 3, xo = off, x = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (var k = 1; k < total; k++) x += String(xref[k]).padStart(10, "0") + " 00000 n \n";
    push(x + "trailer\n<< /Size " + total + " /Root 1 0 R /Info << /Producer (Sotto " + VERSION + ") >> >>\nstartxref\n" + xo + "\n%%EOF\n");
    return new Blob(parts, { type: "application/pdf" });
  }

  /* ---------- Ereignisse ---------- */
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-a]"); if (!el || el.disabled) return;
    if (el.tagName === "LABEL") return;
    ev.preventDefault(); handle(el.getAttribute("data-a"), el);
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && ev.target.id === "upin") { ev.preventDefault(); unlock(); }
    if (ev.key === "Enter" && ev.target.classList && ev.target.classList.contains("entry")) { ev.preventDefault(); handle("open", ev.target); }
    if (ev.key === "Escape" && ui.sheet) { ui.sheet = null; render(); }
  });
  var qT = null;
  document.addEventListener("input", function (ev) { if (ev.target.id === "q") { ui.q = ev.target.value; clearTimeout(qT); qT = setTimeout(render, 180); } });
  document.addEventListener("change", async function (ev) {
    var pick = ev.target.getAttribute && ev.target.getAttribute("data-pick"); if (!pick) return;
    var files = Array.prototype.slice.call(ev.target.files || []); ev.target.value = "";
    if (!files.length) return;
    if (pick === "restore") { restoreFile(files[0]); return; }
    syncDraft();
    var dr = pick === "e" ? ui.sheet && ui.sheet.dr : ui.draft; if (!dr) return;
    var max = isPro() ? PRO_PHOTOS : FREE_PHOTOS;
    for (var i = 0; i < files.length; i++) { if (dr.photos.length >= max) { toast(t("max_photos", { n: max })); break; } try { dr.photos.push({ src: await shrink(files[i]) }); } catch (e) { toast(t("photo_fail")); } }
    render();
  });

  /* ---------- Start ---------- */
  async function boot() {
    var env = null; try { env = newer(parseEnv(localStorage.getItem(DB_KEY)), parseEnv(await idbGet())); } catch (e) {}
    if (env && env.sealed) { ui.locked = true; render(); return; }
    D = env ? normalize(env.state) : blank();
    if (D.settings.onboarded && LOC[D.settings.lang]) LANG = D.settings.lang;
    ui.draft = freshDraft(); render();
  }
  window.__sotto = { get D() { return D; }, ui: ui, render: render, normalize: normalize };
  boot();
})();
