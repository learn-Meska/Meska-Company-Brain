// A tiny in-memory stand-in for the Supabase service client, enough for the booking flows under test.
// It records every write so golden tests can compare exactly what the app sends to the database.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null; count?: number };
export type Write = { table: string; op: "insert" | "update" | "delete"; payload?: unknown; filters: [string, string, unknown][] };

// Deterministic UUIDs, so snapshots stay stable: 00000000-0000-4000-8000-000000000001, …
export const fakeId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function createFakeDb(seed: { trainers?: Row[]; lookups?: Row[] } = {}) {
  let next = 1;
  const tables: Record<string, Row[]> = { trainers: seed.trainers ?? [], lookups: seed.lookups ?? [] };
  const writes: Write[] = [];
  const storage = new Set<string>();
  // failures to inject: table -> error message for the next insert into it
  const failInsert: Record<string, string> = {};

  const rows = (t: string) => (tables[t] ??= []);

  class Query implements PromiseLike<Result> {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: unknown;
    private filters: [string, string, unknown][] = [];
    private one: "single" | "maybe" | null = null;
    private returning = false;
    constructor(private table: string) {}
    select() {
      if (this.op !== "select") this.returning = true;
      return this;
    }
    insert(p: unknown) {
      this.op = "insert";
      this.payload = p;
      return this;
    }
    update(p: unknown) {
      this.op = "update";
      this.payload = p;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(k: string, v: unknown) {
      this.filters.push(["eq", k, v]);
      return this;
    }
    is(k: string, v: unknown) {
      this.filters.push(["is", k, v]);
      return this;
    }
    in(k: string, v: unknown[]) {
      this.filters.push(["in", k, v]);
      return this;
    }
    order() {
      return this;
    }
    range() {
      return this;
    }
    single() {
      this.one = "single";
      return this;
    }
    maybeSingle() {
      this.one = "maybe";
      return this;
    }
    private match(r: Row) {
      return this.filters.every(([op, k, v]) => (op === "in" ? (v as unknown[]).includes(r[k]) : op === "is" ? (r[k] ?? null) === v : r[k] === v));
    }
    private exec(): Result {
      const t = this.table;
      if (this.op === "insert") {
        writes.push({ table: t, op: "insert", payload: this.payload, filters: [] });
        if (failInsert[t]) {
          const message = failInsert[t];
          delete failInsert[t];
          return { data: null, error: { message } };
        }
        const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        const saved = list.map((r) => ({ id: fakeId(next++), ...r }));
        rows(t).push(...saved);
        const out = saved.map((r) => ({ id: r.id }));
        return { data: this.one ? out[0] : this.returning ? out : null, error: null };
      }
      if (this.op === "delete" || this.op === "update") {
        writes.push({ table: t, op: this.op, payload: this.payload, filters: this.filters });
        const hit = rows(t).filter((r) => this.match(r));
        if (this.op === "delete") {
          tables[t] = rows(t).filter((r) => !hit.includes(r));
          // ON DELETE CASCADE / SET NULL as in the real schema
          if (t === "deals") {
            const ids = hit.map((r) => r.id);
            tables.deal_participants = rows("deal_participants").filter((p) => !ids.includes(p.deal_id));
            for (const b of rows("bookings")) if (ids.includes(b.deal_id)) b.deal_id = null;
          }
        } else for (const r of hit) Object.assign(r, this.payload);
        return { data: this.returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
      }
      let found = rows(t).filter((r) => this.match(r));
      if (t === "bookings") found = found.map((b) => withJoins(b));
      if (this.one) return { data: found[0] ?? null, error: null };
      return { data: found, error: null, count: found.length };
    }
    then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve().then(() => this.exec()).then(ok, bad);
    }
  }

  // what BOOKING_SELECT joins in
  function withJoins(b: Row) {
    const name = (id: unknown) => (id ? ((rows("lookups").find((l) => l.id === id)?.name as string | undefined) ?? null) : null);
    const trainer = rows("trainers").find((x) => x.id === b.trainer_id);
    return {
      slots: [],
      skill_ids: [],
      feedback_token: fakeId(9999),
      ...b,
      trainers: trainer ? { id: trainer.id, full_name: trainer.full_name, email: trainer.email ?? null, user_id: null } : null,
      audience: name(b.audience_id) ? { name: name(b.audience_id) } : null,
      func: name(b.function_id) ? { name: name(b.function_id) } : null,
      industry: name(b.industry_id) ? { name: name(b.industry_id) } : null,
    };
  }

  const client = {
    from: (t: string) => new Query(t),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: async (path: string) => {
          storage.add(`${bucket}/${path}`);
          return { data: { token: "upload-token", signedUrl: `https://storage.test/${bucket}/${path}` }, error: null };
        },
        createSignedUrl: async (path: string) =>
          storage.has(`${bucket}/${path}`) ? { data: { signedUrl: `https://storage.test/${bucket}/${path}?signed` }, error: null } : { data: null, error: { message: "Object not found" } },
      }),
    },
  };

  return {
    client,
    tables,
    writes,
    // pretend the browser finished uploading this object
    putObject: (bucket: string, path: string) => storage.add(`${bucket}/${path}`),
    failNextInsert: (table: string, message: string) => (failInsert[table] = message),
  };
}
