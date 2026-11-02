/**
 * Banco FALSO (em memória) que imita só o que o robô usa do supabase-js. Serve para os testes rodarem sem internet.
 * Os dados ficam em globalThis.__SIM.st (st.db = tabelas; st.storage = arquivos; st.lock = trava do robô).
 */
const S = () => globalThis.__SIM.st;
const uid = () => "id" + (S().idc = (S().idc || 0) + 1);
const cmp = (a, b) => (a === b ? 0 : a == null ? -1 : b == null ? 1 : a < b ? -1 : 1);
const like = (v, p) => new RegExp("^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "is").test(String(v ?? ""));
// valores que o banco de verdade preenche sozinho
const DEFAULTS = {
  ideas: { status: "new" },
  subtopics: { status: "new" },
  pipeline_runs: { source: "robot" },
  posts: { cover_url: "", cover_thumb_url: "", cover_alt: "" },
};
const table = (n) => S().db[n] || [];

class Query {
  constructor(t) {
    this.t = t;
    this.mode = "select";
    this.filters = [];
    this.orders = [];
    this.limitN = null;
    this.rangeN = null;
    this.payload = null;
    this.returning = false;
    this.head = false;
    this.one = null;
    this.opts = {};
  }
  select(_cols, o = {}) {
    if (this.mode !== "select") this.returning = true;
    this.head = !!o.head;
    return this;
  }
  insert(r) { this.mode = "insert"; this.payload = Array.isArray(r) ? r : [r]; return this; }
  update(v) { this.mode = "update"; this.payload = v; return this; }
  upsert(r, o = {}) { this.mode = "upsert"; this.payload = Array.isArray(r) ? r : [r]; this.opts = o; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  lte(c, v) { this.filters.push((r) => r[c] != null && r[c] <= v); return this; }
  gte(c, v) { this.filters.push((r) => r[c] != null && r[c] >= v); return this; }
  gt(c, v) { this.filters.push((r) => r[c] != null && r[c] > v); return this; }
  like(c, p) { this.filters.push((r) => like(r[c], p)); return this; }
  in(c, a) { this.filters.push((r) => a.includes(r[c])); return this; }
  not(c, op, v) {
    if (op === "like" || op === "ilike") this.filters.push((r) => !like(r[c], v));
    else if (op === "is" && v === null) this.filters.push((r) => r[c] != null);
    return this;
  }
  order(c, o = {}) { this.orders.push([c, o.ascending === false ? -1 : 1]); return this; }
  limit(n) { this.limitN = n; return this; }
  range(a, b) { this.rangeN = [a, b]; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  finish(list) {
    if (this.one === "single") return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { message: "sem linha" } };
    if (this.one === "maybe") return { data: list[0] ?? null, error: null };
    return { data: list, error: null };
  }
  then(resolve, reject) {
    try { resolve(this.run()); } catch (e) { reject(e); }
  }
  run() {
    const rows = S().db[this.t];
    if (!rows) return { data: null, count: null, error: { message: `relation "${this.t}" does not exist` } };
    // imita os gatilhos do banco que marcam "o conteúdo do site mudou"
    const touch = () => { const ss = S().db.site_state; if (ss && ss[0]) ss[0].content_changed_at = new Date().toISOString(); };
    const match = rows.filter((r) => this.filters.every((fn) => fn(r)));
    if (this.mode === "select") {
      let out = match.slice();
      for (let i = this.orders.length - 1; i >= 0; i--) { const [c, d] = this.orders[i]; out.sort((a, b) => d * cmp(a[c], b[c])); }
      if (this.rangeN) out = out.slice(this.rangeN[0], this.rangeN[1] + 1);
      if (this.limitN != null) out = out.slice(0, this.limitN);
      if (this.head) return { data: null, count: match.length, error: null };
      return this.finish(out.map((r) => ({ ...r })));
    }
    if (this.mode === "insert") {
      const ins = this.payload.map((r) => ({ id: uid(), created_at: new Date().toISOString(), ...(DEFAULTS[this.t] || {}), ...r }));
      rows.push(...ins);
      const publishedPost = this.t === "posts" && ins.some((r) => r.status === "published");
      const publishedTag = this.t === "post_tags" && ins.some((r) => { const p = table("posts").find((x) => x.id === r.post_id); return p && p.status === "published"; });
      if (publishedPost || publishedTag) touch();
      return this.returning ? this.finish(ins.map((r) => ({ ...r }))) : { data: null, error: null };
    }
    if (this.mode === "update") {
      // falha injetada: a execução "morre" logo depois de salvar o post, antes de marcar o tópico como usado
      if (this.t === "subtopics" && this.payload && this.payload.status === "used" && process.env.SIM_KILL_BEFORE_USED && !S().killedOnce) { S().killedOnce = true; process.exit(137); }
      if (this.t === "posts") touch();
      match.forEach((r) => Object.assign(r, this.payload));
      return this.returning ? this.finish(match.map((r) => ({ ...r }))) : { data: null, error: null };
    }
    if (this.mode === "upsert") {
      if (this.t === "tags" && process.env.SIM_FAIL_TAGS) return { data: null, error: { message: "falha simulada nas tags" } };
      const keys = String(this.opts.onConflict || "id").split(",");
      const out = [];
      for (const r of this.payload) {
        let ex = rows.find((x) => keys.every((k) => x[k] === r[k]));
        if (ex) Object.assign(ex, r);
        else { ex = { ...(this.t === "post_tags" ? {} : { id: uid() }), ...r }; rows.push(ex); } // o banco de verdade só cria "id" onde a tabela tem
        out.push({ ...ex });
      }
      return this.returning ? this.finish(out) : { data: null, error: null };
    }
    return { data: null, error: { message: "operação não suportada pelo banco falso" } };
  }
}

const files = () => (S().storage = S().storage || {});
const bucketFiles = (bucket) => Object.keys(files()).filter((k) => k.startsWith(bucket + "/"));

export function createClient() {
  return {
    from: (t) => new Query(t),
    storage: {
      createBucket: async (name, opts) => {
        const st = S();
        st.buckets = st.buckets || {};
        if (st.buckets[name]) return { data: null, error: { message: "The resource already exists" } };
        st.buckets[name] = { public: !!(opts && opts.public) };
        return { data: { name }, error: null };
      },
      from: (bucket) => ({
        upload: async (path, data, opts) => {
          const key = `${bucket}/${path}`;
          if (files()[key] && opts && opts.upsert === false) return { data: null, error: { message: "The resource already exists" } };
          // guarda o conteúdo só dos backups (os outros arquivos só precisam de tamanho e tipo)
          files()[key] = { size: data.length, type: opts && opts.contentType, created_at: new Date().toISOString(), base64: bucket === "backups" ? Buffer.from(data).toString("base64") : undefined };
          return { data: { path }, error: null };
        },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        list: async (prefix = "") => ({
          data: bucketFiles(bucket).map((k) => k.slice(bucket.length + 1)).filter((n) => n.startsWith(prefix)).map((name) => ({ name, created_at: files()[`${bucket}/${name}`].created_at })),
          error: null,
        }),
        remove: async (paths) => { for (const p of paths) delete files()[`${bucket}/${p}`]; return { data: paths, error: null }; },
        download: async (path) => {
          const f = files()[`${bucket}/${path}`];
          if (!f || !f.base64) return { data: null, error: { message: "Object not found" } };
          const buf = Buffer.from(f.base64, "base64");
          return { data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }, error: null };
        },
      }),
    },
    rpc: async (name, args) => {
      const st = S();
      if (name === "acquire_pipeline_lock") {
        if ((st.lock || 0) < Date.now()) { st.lock = Date.now() + ((args && args._minutes) || 14) * 60000; return { data: true, error: null }; }
        return { data: false, error: null };
      }
      if (name === "release_pipeline_lock") st.lock = 0;
      return { data: null, error: null };
    },
  };
}
