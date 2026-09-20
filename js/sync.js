/* =========================================================
 * 知识喂了猫 · 跨设备同步码
 *
 * 为什么需要它：浏览器把 localStorage 按「设备 + 浏览器 + 网址」三把锁分开存放，
 * 这是安全沙箱，任何网页都绕不过去。所以换手机、换浏览器、换个端口打开，
 * 看到的都是各存各的一份——不是丢档，是两头各有一份。
 * 同步码做的事：把这一份压成一段短文本，搬到另一台设备上粘回去。
 *
 * 编码：JSON → deflate-raw 压缩 → base64url
 *   CATD1-xxx  压过的（首选）
 *   CATR1-xxx  没压的（浏览器不支持压缩流时的降级）
 * 也认直接粘贴的整份存档 JSON，以及带 #s= 的整条链接。
 * ========================================================= */
window.Sync = (function () {

  const PREFIX_DEFLATE = 'CATD1-';
  const PREFIX_RAW = 'CATR1-';
  const KIND = 'kfc-save';
  const HASH = 's';

  /* 同步码超过这个长度就换瘦身版（摘掉证据库里的截图缩略图）。
     粘贴太长的文本在微信里会被折叠甚至截断，所以宁可少带图片。 */
  const MAX_CODE = 12000;

  /* ---------------- base64url ---------------- */
  function bytesToB64(bytes) {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(s);
  }
  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function toUrlSafe(b64) {
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromUrlSafe(s) {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return t;
  }

  /* ---------------- 压缩流（不支持就降级） ---------------- */
  function canDeflate() { return typeof CompressionStream !== 'undefined'; }
  function canInflate() { return typeof DecompressionStream !== 'undefined'; }

  function deflate(bytes) {
    if (!canDeflate()) return Promise.resolve(null);
    try {
      const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Response(st).arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* 纯 JS 的 raw-deflate 解压（RFC1951），不碰任何新 API。
     为什么要有它：电脑上的 Chrome 会把同步码压成 CATD1-（省一半长度），
     而不少手机自带浏览器（荣耀 / UC / 微信 X5 内核等）没有 DecompressionStream，
     拿到压缩码就只能干瞪眼。有这份兜底，再老的浏览器也能读压缩码。 */
  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
    67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
    1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  var FIXL = null, FIXD = null, fixLit = null, fixDist = null;

  /* 把「每个符号几位」编成一份可查的表（puff 那套规范霍夫曼解码） */
  function mkTree(lengths, n) {
    var i, count = new Uint16Array(16);
    for (i = 0; i < n; i++) count[lengths[i]]++;
    count[0] = 0;
    var offs = new Uint16Array(17);
    for (i = 1; i < 16; i++) offs[i + 1] = offs[i] + count[i];
    var symbol = new Uint16Array(n);
    for (i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
    return { count: count, symbol: symbol };
  }

  function fixedTrees() {
    if (fixLit) return;
    var i;
    FIXL = new Uint8Array(288);
    for (i = 0; i < 144; i++) FIXL[i] = 8;
    for (; i < 256; i++) FIXL[i] = 9;
    for (; i < 280; i++) FIXL[i] = 7;
    for (; i < 288; i++) FIXL[i] = 8;
    FIXD = new Uint8Array(30);
    for (i = 0; i < 30; i++) FIXD[i] = 5;
    fixLit = mkTree(FIXL, 288);
    fixDist = mkTree(FIXD, 30);
  }

  function inflateJs(src) {
    var sp = 0, bb = 0, bc = 0;
    var out = new Uint8Array(Math.max(4096, src.length * 6)), op = 0;

    function grow(n) {
      if (op + n <= out.length) return;
      var cap = out.length;
      while (cap < op + n) cap = cap * 2;
      var nb = new Uint8Array(cap);
      nb.set(out.subarray(0, op));
      out = nb;
    }
    function bit() {
      if (!bc) {
        if (sp >= src.length) throw new Error('同步码被截断了（复制时少了一截）');
        bb = src[sp++]; bc = 8;
      }
      var v = bb & 1; bb = bb >> 1; bc--; return v;
    }
    function bits(n) {
      var v = 0;
      for (var i = 0; i < n; i++) v |= bit() << i;
      return v;
    }
    function sym(h) {
      var code = 0, first = 0, index = 0, len, c;
      for (len = 1; len <= 15; len++) {
        code |= bit();
        c = h.count[len];
        if (code >= first && code - first < c) return h.symbol[index + (code - first)];
        index += c;
        first = (first + c) << 1;
        code = code << 1;
      }
      throw new Error('同步码里有坏数据');
    }

    fixedTrees();
    var last = 0, type, i, len, ds, dist, from, k, v, rep, s2;
    do {
      last = bit();
      type = bits(2);
      if (type === 0) {
        bb = 0; bc = 0;
        if (sp + 4 > src.length) throw new Error('同步码被截断了（复制时少了一截）');
        len = src[sp] | (src[sp + 1] << 8);
        sp += 4;
        if (sp + len > src.length) throw new Error('同步码被截断了（复制时少了一截）');
        grow(len);
        out.set(src.subarray(sp, sp + len), op);
        op += len; sp += len;
      } else if (type === 1 || type === 2) {
        var lh, dh;
        if (type === 1) { lh = fixLit; dh = fixDist; }
        else {
          var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
          var cl = new Uint8Array(19);
          for (i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
          var clh = mkTree(cl, 19);
          var lens = new Uint8Array(hlit + hdist);
          i = 0;
          while (i < lens.length) {
            s2 = sym(clh);
            if (s2 < 16) { lens[i++] = s2; continue; }
            v = 0;
            if (s2 === 16) {
              if (!i) throw new Error('同步码里有坏数据');
              v = lens[i - 1]; rep = 3 + bits(2);
            } else if (s2 === 17) { rep = 3 + bits(3); }
            else { rep = 11 + bits(7); }
            while (rep--) {
              if (i >= lens.length) throw new Error('同步码里有坏数据');
              lens[i++] = v;
            }
          }
          lh = mkTree(lens.subarray(0, hlit), hlit);
          dh = mkTree(lens.subarray(hlit), hdist);
        }
        for (;;) {
          s2 = sym(lh);
          if (s2 === 256) break;
          if (s2 < 256) { grow(1); out[op++] = s2; continue; }
          s2 -= 257;
          if (s2 >= 29) throw new Error('同步码里有坏数据');
          len = LBASE[s2] + bits(LEXT[s2]);
          ds = sym(dh);
          if (ds >= 30) throw new Error('同步码里有坏数据');
          dist = DBASE[ds] + bits(DEXT[ds]);
          from = op - dist;
          if (from < 0) throw new Error('同步码里有坏数据');
          grow(len);
          for (k = 0; k < len; k++) out[op++] = out[from++];
        }
      } else {
        throw new Error('同步码里有坏数据');
      }
    } while (!last);
    return out.subarray(0, op);
  }

  function inflate(bytes) {
    if (canInflate()) {
      try {
        const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(st).arrayBuffer().then(function (buf) {
          const out = new Uint8Array(buf);
          if (out.length) return out;
          try { return inflateJs(bytes) || null; } catch (e) { return null; }
        }).catch(function () {
          try { return inflateJs(bytes) || null; } catch (e) { return null; }
        });
      } catch (e) { /* 老浏览器连流都用不了，往下走纯 JS 版 */ }
    }
    try { return Promise.resolve(inflateJs(bytes) || null); }
    catch (e) { return Promise.resolve(null); }
  }

  /* ---------------- 打包 / 解包 ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 瘦身：证据库里每条凭证都带一张 base64 缩略图，是存档里最占地方的部分。
     原图本来就存在 IndexedDB / 本机文件里，同步码不带它们，
     文字笔记、进度、生物、成就全都在。 */
  function slim(state) {
    const c = clone(state);
    (c.evidence || []).forEach(function (e) {
      if (e.thumb) { e.thumb = ''; e.thumbDropped = true; }
    });
    /* v1.33：每只小生物的日志也占地方（一只最多 40 条）。
       同步码只带**最近几条**——"它最近过得怎么样"这一层信息保住了，
       码也不至于越长越离谱。本机存档不受影响，一条都不少。 */
    const keep = (window.GAME_DATA && window.GAME_DATA.PET_LOG_SYNC_MAX) || 8;
    (c.pets || []).forEach(function (p) {
      if (Array.isArray(p.log) && p.log.length > keep) {
        p.log = p.log.slice(0, keep);
        p.logTrimmed = true;
      }
    });
    return c;
  }

  /* 存档槽是"本机抽屉"，不跟着存档码走：
     否则每存一次就把上一份码再打包一遍，码会越滚越大。 */
  function stripLocalSlots(state) {
    const c = clone(state);
    c.saves = [];
    c.save = { lastAt: 0, sinceTake: 0, lastTakeAt: 0, autoCount: 0 };
    return c;
  }

  function pack(obj, forceRaw) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (forceRaw) return Promise.resolve(PREFIX_RAW + toUrlSafe(bytesToB64(bytes)));
    return deflate(bytes).then(function (def) {
      if (def && def.length && def.length < bytes.length) {
        return PREFIX_DEFLATE + toUrlSafe(bytesToB64(def));
      }
      return PREFIX_RAW + toUrlSafe(bytesToB64(bytes));
    });
  }

  /* 生成同步码。返回 {code, droppedThumbs, size} */
  /* opts.raw = true 时强制出「不压缩的兼容码」：更长，但连最老的浏览器都能读。
     老手机读不了压缩码时用得上。 */
  function encode(state, opts) {
    const raw = !!(opts && opts.raw);
    const stamp = new Date().toISOString();
    const full = { kind: KIND, exportedAt: stamp, state: stripLocalSlots(state) };
    return pack(full, raw).then(function (code) {
      if (code.length <= MAX_CODE) {
        return { code: code, droppedThumbs: false, size: code.length, compressed: code.indexOf(PREFIX_DEFLATE) === 0 };
      }
      const lean = { kind: KIND, exportedAt: stamp, slim: true, state: slim(stripLocalSlots(state)) };
      return pack(lean, raw).then(function (code2) {
        if (code2.length < code.length) {
          return { code: code2, droppedThumbs: true, size: code2.length, compressed: code2.indexOf(PREFIX_DEFLATE) === 0 };
        }
        return { code: code, droppedThumbs: false, size: code.length, compressed: code.indexOf(PREFIX_DEFLATE) === 0 };
      });
    });
  }

  function validate(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('同步码内容不对');
    /* 也认直接粘过来的整份存档 JSON（老的导出文件那种） */
    if (!obj.state) {
      if (obj.cur && obj.study) return { state: obj, exportedAt: '', slim: false };
      throw new Error('这段文字里没有找到存档');
    }
    if (obj.kind && obj.kind !== KIND) throw new Error('这不是「知识喂了猫」的同步码');
    if (typeof obj.state !== 'object') throw new Error('同步码里的存档坏了');
    return obj;
  }

  /* 解析同步码。可以喂：纯同步码 / 带 #s= 的链接 / 整份存档 JSON */
  function decode(text) {
    let s = String(text === undefined || text === null ? '' : text).trim();
    if (!s) return Promise.reject(new Error('还没粘贴同步码'));

    /* 整条链接：取 #s= 后面的部分 */
    const hashAt = s.indexOf('#');
    if (hashAt >= 0) {
      const frag = s.slice(hashAt + 1);
      const eq = frag.indexOf('=');
      if (eq > 0 && frag.slice(0, eq) === HASH) s = frag.slice(eq + 1);
    }
    if (s.indexOf('%') >= 0) { try { s = decodeURIComponent(s); } catch (e) { /* 保持原样 */ } }

    /* 找到同步码前缀的位置（粘贴时前面可能混了文字）。注意：
       这里只对"码"做去空白，不能对 JSON 做——JSON 的字符串值里本来就有空格。 */
    /* 整份存档 JSON 优先：它里面也可能出现同步码字样（例如存档槽），
       先按 JSON 解，免得被误判成一串码。 */
    if (s.charAt(0) === '{') {
      try { return Promise.resolve(validate(JSON.parse(s))); }
      catch (e) { return Promise.reject(new Error('这段 JSON 读不出来')); }
    }

    let at = -1, compressed = false;
    if (s.indexOf(PREFIX_DEFLATE) >= 0) { at = s.indexOf(PREFIX_DEFLATE); compressed = true; }
    else if (s.indexOf(PREFIX_RAW) >= 0) { at = s.indexOf(PREFIX_RAW); compressed = false; }

    if (at >= 0) {
      const pfx = compressed ? PREFIX_DEFLATE : PREFIX_RAW;
      const body = fromUrlSafe(s.slice(at + pfx.length).replace(/\s+/g, ''));
      let bytes;
      try { bytes = b64ToBytes(body); }
      catch (e) { return Promise.reject(new Error('同步码格式不对（复制的时候可能少了一截）')); }

      if (!compressed) {
        try { return Promise.resolve(validate(JSON.parse(new TextDecoder().decode(bytes)))); }
        catch (e) { return Promise.reject(new Error('同步码解出来是坏数据')); }
      }
      return inflate(bytes).then(function (out) {
        if (!out) throw new Error('这台的浏览器读不了压缩过的同步码。让对面生成一份「老设备兼容码」（不压缩的那种）再发一次。');
        try { return validate(JSON.parse(new TextDecoder().decode(out))); }
        catch (e) { throw new Error('同步码解出来是坏数据'); }
      });
    }

    return Promise.reject(new Error('这看起来不是一段同步码'));
  }

  /* ---------------- 链接搬运 ---------------- */
  function linkFor(code) {
    const base = location.origin + location.pathname + location.search;
    return base + '#' + HASH + '=' + code;
  }

  function codeFromHash() {
    const h = String(location.hash || '').replace(/^#/, '');
    if (!h) return null;
    let v = null;
    h.split('&').forEach(function (kv) {
      const i = kv.indexOf('=');
      if (i > 0 && kv.slice(0, i) === HASH) v = kv.slice(i + 1);
    });
    return v || null;
  }

  function clearHash() {
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (e) { try { location.hash = ''; } catch (e2) { /* 无所谓 */ } }
  }

  /* ---------------- 给界面看的小摘要 ---------------- */
  function when(ts) {
    if (!ts) return '时间未知';
    const d = new Date(ts);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function brief(state) {
    if (!state) return '（空档）';
    const st = state.stats || {};
    return [
      (st.notes || 0) + ' 条文字记录',
      (state.pets || []).length + ' 只小生物',
      Object.keys(state.achievements || {}).length + ' 个成就',
      (st.fullFeedDays || 0) + ' 天喂饱',
      (state.evidence || []).length + ' 份凭证',
      (st.questions || 0) + ' 道题'
    ].join(' · ');
  }

  return {
    encode: encode, decode: decode,
    linkFor: linkFor, codeFromHash: codeFromHash, clearHash: clearHash,
    brief: brief, when: when,
    PREFIX_DEFLATE: PREFIX_DEFLATE, PREFIX_RAW: PREFIX_RAW,
    canDeflate: canDeflate,
    inflateJs: function (b) { return inflateJs(b); }
  };
})();
