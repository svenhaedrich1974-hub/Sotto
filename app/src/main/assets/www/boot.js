(function () {
  if (window.__kammerNative) return;
  window.__kammerNative = true;
  try {
    var nativeDb = window.KammerAndroid;
    if (nativeDb && nativeDb.dbChunks) {
      var count = nativeDb.dbChunks();
      var parts = [];
      for (var i = 0; i < count; i++) parts.push(nativeDb.dbChunk(i) || "");
      var saved = parts.join("");
      var local = "";
      try { local = localStorage.getItem("kammer-db-v1") || ""; } catch (err) {}
      function stamp(raw) {
        try { return JSON.parse(raw).savedAt || 0; } catch (err) { return 0; }
      }
      if (saved && stamp(saved) >= stamp(local)) localStorage.setItem("kammer-db-v1", saved);
    }
  } catch (err) {}
  var blobs = new Map();
  var origCreate = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    var url = origCreate.call(URL, obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  var origRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = function (url) {
    setTimeout(function () {
      blobs.delete(url);
      origRevoke.call(URL, url);
    }, 1500);
  };
  function send(name, blob) {
    if (!window.KammerAndroid || !blob) return false;
    var reader = new FileReader();
    reader.onloadend = function () {
      try {
        var result = String(reader.result || "");
        var comma = result.indexOf(",");
        var data = comma >= 0 ? result.slice(comma + 1) : result;
        var size = 262144;
        window.KammerAndroid.beginSave(name || "kammer.bin", blob.type || "application/octet-stream");
        for (var i = 0; i < data.length; i += size) {
          window.KammerAndroid.appendSave(data.slice(i, i + size));
        }
        window.KammerAndroid.finishSave();
      } catch (err) {
        try { window.KammerAndroid.abortSave(); } catch (e) {}
      }
    };
    reader.readAsDataURL(blob);
    return true;
  }
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      var blob = blobs.get(this.href);
      if (this.download && blob && window.KammerAndroid) {
        send(this.download, blob);
        return;
      }
    } catch (err) {}
    return origClick.call(this);
  };
})();
