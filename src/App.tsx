import { useEffect, useMemo, useReducer } from "react";
import type { CSSProperties, Dispatch, ReactNode } from "react";

/* ---------- Domínio ---------- */
type Role = "admin" | "analyst" | "viewer";
type Phase = "loading" | "ready" | "denied";

interface Tenant {
  name: string;
  a: string;
  b: string;
}
interface RemoteModule {
  id: string;
  name: string;
  fw: "React" | "Angular";
  port: number;
  roles: Role[];
  tone: "pink" | "blue" | "yel";
}
interface ShellEvent {
  id: number;
  kind: string;
  msg: ReactNode;
}

const TENANTS: Tenant[] = [
  { name: "Nova Clínica", a: "#ff5a1f", b: "#1f4fd8" },
  { name: "Atlas Logística", a: "#ff7aa8", b: "#1f4fd8" },
  { name: "Verde Labs", a: "#f2a33a", b: "#0f8f7a" },
];
const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "analyst", label: "Analista" },
  { value: "viewer", label: "Visualizador" },
];
const MODULES: RemoteModule[] = [
  {
    id: "dash",
    name: "Dashboard",
    fw: "React",
    port: 4201,
    roles: ["admin", "analyst", "viewer"],
    tone: "pink",
  },
  {
    id: "rep",
    name: "Relatórios",
    fw: "React",
    port: 4202,
    roles: ["admin", "analyst"],
    tone: "blue",
  },
  {
    id: "bill",
    name: "Faturamento",
    fw: "Angular",
    port: 4203,
    roles: ["admin"],
    tone: "yel",
  },
  {
    id: "usr",
    name: "Usuários",
    fw: "Angular",
    port: 4204,
    roles: ["admin"],
    tone: "pink",
  },
  {
    id: "aud",
    name: "Auditoria",
    fw: "Angular",
    port: 4205,
    roles: ["admin", "analyst"],
    tone: "blue",
  },
];

const canAccess = (m: RemoteModule, role: Role) => m.roles.includes(role);
const findModule = (id: string) => MODULES.find((m) => m.id === id)!;
const cacheKey = (tenant: number, id: string) => `${tenant}:${id}`;

/* ---------- Estado do shell (reducer puro) ---------- */
interface State {
  tenant: number;
  role: Role;
  active: string;
  phase: Phase;
  cached: boolean;
  loaded: ReadonlySet<string>;
  events: ShellEvent[];
  seq: number;
}
type Action =
  | { type: "select"; id: string }
  | { type: "role"; role: Role }
  | { type: "tenant"; index: number }
  | { type: "mounted" };

const log = (s: State, kind: string, msg: ReactNode): State => {
  const seq = s.seq + 1;
  return {
    ...s,
    seq,
    events: [{ id: seq, kind, msg }, ...s.events].slice(0, 40),
  };
};

/** Pede o remote do módulo ativo: o guard bloqueia por papel antes de qualquer download. */
function load(s: State): State {
  const m = findModule(s.active);
  if (!canAccess(m, s.role)) {
    return log(
      { ...s, phase: "denied" },
      "guard",
      <>
        bloqueou <i>{m.id}</i> para {s.role}
      </>,
    );
  }
  const cached = s.loaded.has(cacheKey(s.tenant, m.id));
  return log(
    { ...s, phase: "loading", cached },
    "shell",
    <>
      importando remote <i>{m.id}</i> ({m.fw})
    </>,
  );
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "select":
      return load({ ...s, active: a.id });
    case "role":
      return load(
        log(
          { ...s, role: a.role },
          "auth",
          <>
            papel → <i>{a.role}</i>
          </>,
        ),
      );
    case "tenant":
      return load(
        log(
          { ...s, tenant: a.index, loaded: new Set() },
          "shell",
          <>
            tenant → <i>{TENANTS[a.index].name}</i>, cache limpo
          </>,
        ),
      );
    case "mounted": {
      const m = findModule(s.active);
      const loaded = new Set(s.loaded).add(cacheKey(s.tenant, m.id));
      return log(
        { ...s, phase: "ready", loaded },
        m.id,
        <>
          montado no tenant <i>{TENANTS[s.tenant].name}</i>
        </>,
      );
    }
  }
}

const init = (): State =>
  load({
    tenant: 0,
    role: "admin",
    active: "dash",
    phase: "loading",
    cached: false,
    loaded: new Set(),
    events: [{ id: 0, kind: "shell", msg: "host iniciado" }],
    seq: 0,
  });

/** Gerador pseudoaleatório determinístico: mesmos números para o mesmo tenant e módulo. */
function seeded(str: string) {
  let h = 0;
  for (const c of str) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return () => (h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296;
}

/* ---------- Componentes ---------- */
interface Ctx {
  state: State;
  dispatch: Dispatch<Action>;
}

function Sidebar({ state, dispatch }: Ctx) {
  return (
    <aside>
      <div className="logo">
        halo<i>.</i>
      </div>
      <div className="lbl">Módulos (remotes)</div>
      <div id="nav">
        {MODULES.map((m) => {
          const on = m.id === state.active;
          const ok = canAccess(m, state.role);
          return (
            <button
              key={m.id}
              type="button"
              className={`nav${on ? " on" : ""}${ok ? "" : " lock"}`}
              aria-current={on ? "page" : undefined}
              onClick={() => dispatch({ type: "select", id: m.id })}
            >
              <span>{m.name}</span>
              <small>{ok ? m.fw : "🔒"}</small>
            </button>
          );
        })}
      </div>
      <div className="ctl">
        <label className="f">
          <span className="lbl">Tenant</span>
          <select
            value={state.tenant}
            onChange={(e) =>
              dispatch({ type: "tenant", index: Number(e.target.value) })
            }
          >
            {TENANTS.map((t, i) => (
              <option key={t.name} value={i}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          <span className="lbl">Papel do usuário</span>
          <select
            value={state.role}
            onChange={(e) =>
              dispatch({ type: "role", role: e.target.value as Role })
            }
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}

function Hero({ tenant }: { tenant: Tenant }) {
  return (
    <section className="hero grain">
      <div className="glass">
        <span className="mut" style={{ color: "#fff", opacity: 0.8 }}>
          Tenant ativo
        </span>
        <b>{tenant.name}</b>
      </div>
      <div className="eb">Shell · host app</div>
      <h1>
        Um shell.
        <br />
        Vários módulos.
      </h1>
      <p>
        Cada módulo é um micro-frontend independente, carregado sob demanda e
        liberado pelo papel do usuário.
      </p>
    </section>
  );
}

function ModuleGrid({ state, dispatch }: Ctx) {
  return (
    <section className="grid">
      {MODULES.map((m) => {
        const ok = canAccess(m, state.role);
        const hint = !ok
          ? "sem permissão"
          : state.loaded.has(cacheKey(state.tenant, m.id))
            ? "em cache"
            : "carrega sob demanda";
        return (
          <button
            key={m.id}
            type="button"
            className={`card grain ${m.tone}${ok ? "" : " off"}`}
            onClick={() => dispatch({ type: "select", id: m.id })}
          >
            <span className="tag">
              {m.fw} · :{m.port}
            </span>
            <h3>{m.name}</h3>
            <span style={{ fontSize: 12, opacity: 0.7 }}>{hint}</span>
          </button>
        );
      })}
    </section>
  );
}

function ModuleView({
  m,
  tenant,
  phase,
  cached,
}: {
  m: RemoteModule;
  tenant: Tenant;
  phase: Phase;
  cached: boolean;
}) {
  const data = useMemo(() => {
    const r = seeded(tenant.name + m.id);
    return {
      ms: Math.round(90 + r() * 160),
      bars: Array.from({ length: 9 }, () => 25 + r() * 75),
      items: Math.round(r() * 900 + 100),
      health: (r() * 9 + 90).toFixed(1).replace(".", ","),
      pending: Math.round(r() * 40 + 5),
    };
  }, [tenant.name, m.id]);

  if (phase === "denied") {
    return (
      <>
        <h2>403 · {m.name}</h2>
        <p className="mut" style={{ marginTop: 8 }}>
          O papel atual não tem acesso. O shell nem baixa o remoteEntry.js deste
          módulo.
        </p>
      </>
    );
  }
  if (phase === "loading") {
    return cached ? null : (
      <>
        <h2>{m.name}</h2>
        <div className="sk" />
        <div className="sk" style={{ width: "70%" }} />
        <div className="sk" style={{ width: "85%" }} />
      </>
    );
  }
  const shared = m.fw === "React" ? "react" : "@angular/core";
  return (
    <>
      <h2>{m.name}</h2>
      <div className="mut">
        {m.fw} · remoteEntry.js em localhost:{m.port} ·{" "}
        {cached ? "cache" : `${data.ms} ms`}
      </div>
      <div className="kpis">
        <div>
          <b>{data.items}</b>itens
        </div>
        <div>
          <b>{data.health}%</b>saúde
        </div>
        <div>
          <b>{data.pending}</b>pendências
        </div>
      </div>
      <div className="bars">
        {data.bars.map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
      <pre>{`new ModuleFederationPlugin({ name: "${m.id}", exposes: { "./Module": "./src/bootstrap" }, shared: ["${shared}"] })`}</pre>
    </>
  );
}

function EventBus({ events }: { events: ShellEvent[] }) {
  return (
    <div className="panel">
      <h2>Event bus</h2>
      <div className="mut">Eventos trocados entre shell e remotes</div>
      <div id="log" role="log" aria-live="polite" style={{ marginTop: 12 }}>
        {events.map((e) => (
          <div key={e.id}>
            <b>{e.kind}</b> {e.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- App ---------- */
export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const tenant = TENANTS[state.tenant];

  useEffect(() => {
    document.title = "Halo — SaaS multi-tenant com micro-frontends";
  }, []);

  // Simula o carregamento assíncrono do remote; o cleanup cancela se o usuário trocar de módulo.
  useEffect(() => {
    if (state.phase !== "loading") return;
    const t = window.setTimeout(
      () => dispatch({ type: "mounted" }),
      state.cached ? 80 : 650,
    );
    return () => window.clearTimeout(t);
  }, [state.phase, state.cached, state.active, state.role, state.tenant]);

  const vars = { "--a1": tenant.a, "--a2": tenant.b } as CSSProperties;

  return (
    <div className="app" style={vars}>
      <Sidebar state={state} dispatch={dispatch} />
      <main>
        <Hero tenant={tenant} />
        <ModuleGrid state={state} dispatch={dispatch} />
        <section className="row">
          <div className="panel" aria-live="polite">
            <ModuleView
              m={findModule(state.active)}
              tenant={tenant}
              phase={state.phase}
              cached={state.cached}
            />
          </div>
          <EventBus events={state.events} />
        </section>
      </main>
    </div>
  );
}
