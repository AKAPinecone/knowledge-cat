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

  function inflate(bytes) {
    if (!canInflate()) return Promise.resolve(null);
    try {
      const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(st).arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
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

  function pack(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    return deflate(bytes).then(function (def) {
      if (def && def.length && def.length < bytes.length) {
        return PREFIX_DEFLATE + toUrlSafe(bytesToB64(def));
      }
      return PREFIX_RAW + toUrlSafe(bytesToB64(bytes));
    });
  }

  /* 生成同步码。返回 {code, droppedThumbs, size} */
  function encode(state) {
    const stamp = new Date().toISOString();
    const full = { kind: KIND, exportedAt: stamp, state: stripLocalSlots(state) };
    return pack(full).then(function (code) {
      if (code.length <= MAX_CODE) {
        return { code: code, droppedThumbs: false, size: code.length, compressed: code.indexOf(PREFIX_DEFLATE) === 0 };
      }
      const lean = { kind: KIND, exportedAt: stamp, slim: true, state: slim(stripLocalSlots(state)) };
      return pack(lean).then(function (code2) {
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
        if (!out) throw new Error('这台设备解不开压缩的同步码，回原来那台点「复制为链接」再发一次');
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
    canDeflate: canDeflate
  };
})();
