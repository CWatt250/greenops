// Analytics, Portal Admin
const { CLIENTS, CREWS, SERVICES, JOBS, INVOICES, PORTAL_ACTIVITY } = window.GREENOPS;

// Tiny SVG sparkline / bar / donut helpers
function BarChart({ data, height = 220, color = 'var(--forest-600)', max }) {
  const m = max || Math.max(...data.map(d => d.v));
  const w = 100 / data.length;
  return (
    <div style={{ position: 'relative', height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
        {[0.25, 0.5, 0.75].map(y => (
          <line key={y} x1="0" x2="100" y1={100 - y * 100} y2={100 - y * 100} stroke="var(--border)" strokeWidth="0.2" strokeDasharray="0.5 0.5" />
        ))}
        {data.map((d, i) => {
          const h = (d.v / m) * 90;
          return (
            <rect key={i} x={i * w + w * 0.18} y={100 - h} width={w * 0.64} height={h} fill={d.color || color} rx="0.5" />
          );
        })}
      </svg>
      <div style={{ position: 'absolute', bottom: -22, left: 0, right: 0, display: 'flex', fontSize: 10, color: 'var(--text-muted)' }}>
        {data.map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center' }}>{d.l}</div>)}
      </div>
    </div>
  );
}

function LineChart({ series, height = 220 }) {
  const allV = series.flatMap(s => s.data);
  const max = Math.max(...allV);
  const min = 0;
  const path = (data) => data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / (max - min)) * 90;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
      {[0.25, 0.5, 0.75].map(y => (
        <line key={y} x1="0" x2="100" y1={100 - y * 100} y2={100 - y * 100} stroke="var(--border)" strokeWidth="0.2" strokeDasharray="0.5 0.5" />
      ))}
      {series.map((s, i) => (
        <React.Fragment key={i}>
          <path d={`${path(s.data)} L 100 100 L 0 100 Z`} fill={s.color} opacity="0.08" />
          <path d={path(s.data)} fill="none" stroke={s.color} strokeWidth="0.6" strokeLinejoin="round" strokeLinecap="round" />
        </React.Fragment>
      ))}
    </svg>
  );
}

function Donut({ slices, size = 180 }) {
  const total = slices.reduce((a, b) => a + b.v, 0);
  let cum = 0;
  const r = 36, cx = 50, cy = 50;
  const arc = (start, end) => {
    const sa = (start / total) * Math.PI * 2 - Math.PI / 2;
    const ea = (end / total) * Math.PI * 2 - Math.PI / 2;
    const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
    const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
    const large = end - start > total / 2 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
      {slices.map((s, i) => {
        const d = arc(cum, cum + s.v);
        cum += s.v;
        return <path key={i} d={d} fill={s.color} />;
      })}
      <circle cx={cx} cy={cy} r={20} fill="var(--surface)" />
    </svg>
  );
}

// ============ ANALYTICS ============
function Analytics({ go }) {
  const [tab, setTab] = React.useState('revenue');
  const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const revData = [
    { l: 'Nov', v: 28 }, { l: 'Dec', v: 18 }, { l: 'Jan', v: 14 },
    { l: 'Feb', v: 16 }, { l: 'Mar', v: 32 }, { l: 'Apr', v: 41 }, { l: 'May', v: 48 },
  ];

  return (
    <>
      <Topbar crumbs={['Office', 'Analytics']} />
      <div className="page">
        <PageHeader
          eyebrow="Last 12 months · May 2025 – May 2026"
          title="Analytics"
          sub="Revenue, jobs, crews — what the numbers say."
          actions={<>
            <div className="chips" style={{ marginRight: 8 }}>
              <button className="chip">7d</button>
              <button className="chip">30d</button>
              <button className="chip">90d</button>
              <button className="chip active">12mo</button>
              <button className="chip">All</button>
            </div>
            <button className="btn btn-ghost"><Icon.Download size={14} />Export PDF</button>
          </>}
        />

        <div className="grid grid-4 mb-24">
          <StatCard label="Revenue" value="$486K" delta="+22%" foot="vs prior 12mo" spark={[28, 18, 14, 16, 32, 41, 48, 52, 58, 56, 62, 48]} />
          <StatCard label="Jobs completed" value="1,842" delta="+14%" foot="vs prior 12mo" spark={[120, 80, 60, 75, 140, 180, 220, 240, 250, 230, 260, 220]} />
          <StatCard label="Avg job value" value="$264" delta="+8%" foot="vs prior 12mo" spark={[210, 218, 224, 232, 238, 244, 250, 254, 258, 260, 263, 264]} />
          <StatCard label="Active clients" value="187" delta="+12" foot="net new this year" spark={[175, 176, 174, 173, 175, 178, 180, 182, 184, 185, 186, 187]} />
        </div>

        <Tabs value={tab} onChange={setTab} tabs={[
          { id: 'revenue', label: 'Revenue' },
          { id: 'crew', label: 'Crew performance' },
          { id: 'services', label: 'Service mix' },
          { id: 'clients', label: 'Client retention' },
        ]} />

        {tab === 'revenue' && (
          <>
            <div className="grid grid-3-2 gap-16 mb-16">
              <div className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">Revenue trend</div>
                    <div className="card-sub">Monthly · this year vs last year</div>
                  </div>
                  <div className="flex gap-12" style={{ fontSize: 12 }}>
                    <span className="flex-center gap-6"><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--forest-600)' }}></span>This year</span>
                    <span className="flex-center gap-6"><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--gold-500)' }}></span>Last year</span>
                  </div>
                </div>
                <div style={{ padding: '20px 24px 24px' }}>
                  <LineChart series={[
                    { color: 'var(--gold-500)', data: [22, 14, 11, 13, 26, 35, 41, 44, 49, 47, 52, 41] },
                    { color: 'var(--forest-600)', data: [28, 18, 14, 16, 32, 41, 48, 52, 58, 56, 62, 48] },
                  ]} />
                  <div className="flex" style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                    {['Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May'].map(m => <div key={m} style={{ flex: 1, textAlign: 'center' }}>{m}</div>)}
                  </div>
                </div>
              </div>

              <div className="card card-pad-lg">
                <div className="card-title mb-16">Revenue by service</div>
                <div className="flex-center" style={{ justifyContent: 'center' }}>
                  <Donut slices={[
                    { v: 38, color: '#3D6B2C' },
                    { v: 22, color: '#C9A84C' },
                    { v: 18, color: '#3B6FB8' },
                    { v: 12, color: '#8B5C18' },
                    { v: 10, color: '#7B9F5E' },
                  ]} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
                  {[
                    { l: 'Mowing & maintenance', v: 38, c: '#3D6B2C' },
                    { l: 'Fertilization', v: 22, c: '#C9A84C' },
                    { l: 'Cleanup', v: 18, c: '#3B6FB8' },
                    { l: 'Sprinkler', v: 12, c: '#8B5C18' },
                    { l: 'Other', v: 10, c: '#7B9F5E' },
                  ].map(s => (
                    <div key={s.l} className="flex-between" style={{ fontSize: 12 }}>
                      <div className="flex-center gap-8"><span style={{ width: 10, height: 10, borderRadius: 2, background: s.c }}></span>{s.l}</div>
                      <span className="num" style={{ fontWeight: 500 }}>{s.v}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-2 gap-16">
              <div className="card">
                <div className="card-head"><div className="card-title">Top 10 clients · YTD revenue</div></div>
                <div style={{ padding: '12px 24px 20px' }}>
                  {CLIENTS.slice(0, 7).map((c, i) => {
                    const max = CLIENTS[0].revenue;
                    return (
                      <div key={c.id} className="bar-row">
                        <div className="bar-label">{i + 1}. {c.name}</div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${(c.revenue / max) * 100}%`, background: i === 0 ? 'var(--gold-500)' : 'var(--forest-600)' }}></div></div>
                        <div className="bar-num">${(c.revenue / 1000).toFixed(1)}K</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><div className="card-title">Cash flow · last 6 months</div></div>
                <div style={{ padding: '20px 24px 36px' }}>
                  <BarChart data={[
                    { l: 'Dec', v: 32 },
                    { l: 'Jan', v: 24 },
                    { l: 'Feb', v: 28 },
                    { l: 'Mar', v: 38 },
                    { l: 'Apr', v: 42 },
                    { l: 'May', v: 48 },
                  ]} />
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'crew' && (
          <div className="grid grid-2 gap-16">
            <div className="card">
              <div className="card-head"><div className="card-title">Jobs per crew · last 30 days</div></div>
              <div style={{ padding: '20px 24px 36px' }}>
                <BarChart data={CREWS.map(c => ({ l: c.name.split(' ')[1], v: c.today * 12 + 30, color: c.color }))} max={120} />
              </div>
            </div>
            <div className="card">
              <div className="card-head"><div className="card-title">Average completion time</div></div>
              <div style={{ padding: '12px 24px 20px' }}>
                {CREWS.map(c => (
                  <div key={c.id} className="bar-row">
                    <div className="bar-label flex-center gap-8">
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color }}></span>{c.name}
                    </div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${c.completion}%`, background: c.color }}></div></div>
                    <div className="bar-num">{c.completion}%</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-head"><div className="card-title">Crew leaderboard · revenue per labor hour</div></div>
              <table className="tbl">
                <thead><tr><th>Crew</th><th>Lead</th><th className="tbl-num">Jobs</th><th className="tbl-num">Hours logged</th><th className="tbl-num">Revenue</th><th className="tbl-num">$ / hour</th><th>Trend</th></tr></thead>
                <tbody>
                  {CREWS.map((c, i) => {
                    const rev = [42600, 38200, 31800, 28400][i];
                    const hours = [342, 318, 282, 264][i];
                    return (
                      <tr key={c.id}>
                        <td><div className="flex-center gap-8"><span style={{ width: 10, height: 10, borderRadius: 2, background: c.color }}></span><strong>{c.name}</strong></div></td>
                        <td>{c.lead}</td>
                        <td className="tbl-num">{c.today * 30 + 100}</td>
                        <td className="tbl-num">{hours}</td>
                        <td className="tbl-num">${rev.toLocaleString()}</td>
                        <td className="tbl-num">${Math.round(rev / hours)}</td>
                        <td><Sparkline data={[80, 90, 110, 105, 118, 124, 128]} color={c.color} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'services' && (
          <div className="card card-pad-lg">
            <div className="card-title mb-16">Service mix · last 12 months</div>
            <table className="tbl">
              <thead><tr><th>Service</th><th>Category</th><th className="tbl-num">Jobs</th><th className="tbl-num">Avg price</th><th className="tbl-num">Revenue</th><th className="tbl-num">% of total</th></tr></thead>
              <tbody>
                {SERVICES.slice(0, 8).map(s => {
                  const rev = s.jobs * s.price * (s.unit === 'per_visit' ? 1 : s.unit === 'per_sqft' ? 5000 : 100);
                  return (
                    <tr key={s.id}>
                      <td className="tbl-name">{s.name}</td>
                      <td style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>{s.cat}</td>
                      <td className="tbl-num">{s.jobs}</td>
                      <td className="tbl-num">${s.price}</td>
                      <td className="tbl-num">${(rev / 1000).toFixed(1)}K</td>
                      <td className="tbl-num">{((rev / 486000) * 100).toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'clients' && (
          <div className="grid grid-2 gap-16">
            <div className="card card-pad-lg">
              <div className="card-title mb-16">Retention cohort</div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                <div></div>
                {['M0', 'M1', 'M2', 'M3', 'M6', 'M12'].map(m => <div key={m} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>{m}</div>)}
                {[
                  { c: 'Q2 2025', vals: [100, 96, 94, 91, 88, 84] },
                  { c: 'Q3 2025', vals: [100, 95, 92, 90, 87, null] },
                  { c: 'Q4 2025', vals: [100, 97, 93, 89, null, null] },
                  { c: 'Q1 2026', vals: [100, 96, 92, null, null, null] },
                ].map((r, i) => (
                  <React.Fragment key={i}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.c}</div>
                    {r.vals.map((v, j) => (
                      <div key={j} style={{
                        background: v == null ? 'var(--cream-100)' : `rgba(61, 107, 44, ${v / 100})`,
                        color: v == null ? 'var(--text-subtle)' : v > 80 ? 'white' : 'var(--ink-900)',
                        textAlign: 'center', padding: '8px 0', borderRadius: 4, fontSize: 11, fontWeight: 500,
                      }}>{v != null ? `${v}%` : '—'}</div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="card card-pad-lg">
              <div className="card-title mb-16">Churn reasons · last 12mo</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { l: 'Moved out of area', v: 42 },
                  { l: 'Sold property', v: 28 },
                  { l: 'Switched to DIY', v: 14 },
                  { l: 'Pricing concerns', v: 9 },
                  { l: 'Service complaints', v: 4 },
                  { l: 'Other / unknown', v: 3 },
                ].map(c => (
                  <div key={c.l}>
                    <div className="flex-between" style={{ fontSize: 13, marginBottom: 4 }}><span>{c.l}</span><span className="num" style={{ color: 'var(--text-muted)' }}>{c.v}%</span></div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${c.v}%`, background: 'var(--gold-500)' }}></div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ============ PORTAL ADMIN INBOX ============
function PortalAdmin({ go }) {
  const [active, setActive] = React.useState(0);
  const items = [
    ...PORTAL_ACTIVITY,
    { kind: 'message', client: 'Tri-City Medical', text: 'Can we move next Tuesday\'s visit to Wed?', time: '2 days ago' },
    { kind: 'request', client: 'Pasco School District', text: 'Quote for additional baseball field maintenance', time: '3 days ago' },
    { kind: 'message', client: 'Reagan Family', text: 'Loved the work yesterday — thanks!', time: '3 days ago' },
    { kind: 'request', client: 'James Lopez', text: 'Quote: replace front sod (~800 ft²)', time: '4 days ago' },
  ];
  const cur = items[active];

  return (
    <>
      <Topbar crumbs={['Office', 'Portal Inbox']} />
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', height: 'calc(100vh - 60px)' }}>
        <div style={{ borderRight: '1px solid var(--border)', overflow: 'auto', background: 'var(--surface)' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <div className="page-eyebrow">Customer portal · 12 unread</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0, fontWeight: 500 }}>Inbox</h2>
            <div className="filter-bar" style={{ padding: 0, marginTop: 12, gap: 6 }}>
              <button className="chip active">All</button>
              <button className="chip">Requests · 6</button>
              <button className="chip">Messages · 5</button>
              <button className="chip">Issues · 1</button>
            </div>
          </div>
          {items.map((it, i) => (
            <button key={i} onClick={() => setActive(i)} style={{
              width: '100%', textAlign: 'left', padding: '14px 24px',
              borderBottom: '1px solid var(--border)',
              background: i === active ? 'var(--sage-100)' : 'transparent',
              borderLeft: i === active ? '3px solid var(--forest-600)' : '3px solid transparent',
              cursor: 'pointer', display: 'flex', gap: 12,
            }}>
              <div>
                {it.kind === 'request' && <Icon.FileText size={16} stroke="var(--gold-600)" />}
                {it.kind === 'message' && <Icon.Mail size={16} stroke="var(--st-scheduled)" />}
                {it.kind === 'complaint' && <Icon.Flag size={16} stroke="var(--st-issue)" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex-between">
                  <strong style={{ fontSize: 13 }}>{it.client}</strong>
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{it.time}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.text}</div>
              </div>
            </button>
          ))}
        </div>

        <div style={{ overflow: 'auto', padding: 32 }}>
          <div className="flex-between mb-24">
            <div>
              <div className="page-eyebrow">{cur.kind === 'request' ? 'Service request' : cur.kind === 'message' ? 'Customer message' : 'Issue'} · {cur.time}</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: '4px 0 0', fontWeight: 500 }}>{cur.client}</h2>
            </div>
            <div className="flex gap-8">
              <button className="btn btn-ghost"><Icon.Phone size={14} />Call</button>
              <button className="btn btn-ghost"><Icon.User size={14} />Open profile</button>
              {cur.kind === 'request' && <button className="btn btn-cta">Send estimate<Icon.ArrowRight size={12} /></button>}
            </div>
          </div>

          <div className="card card-pad-lg mb-16" style={{ background: 'var(--cream-50)' }}>
            <div className="flex-center gap-12 mb-12">
              <Avatar name={cur.client} size={36} />
              <div>
                <strong>{cur.client}</strong>
                <div className="tbl-sub">via customer portal · {cur.time}</div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{cur.text}</p>
            {cur.kind === 'request' && (
              <div className="mt-16" style={{ padding: 12, background: 'white', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div className="label">Property</div>
                <div className="flex gap-16 mt-4" style={{ fontSize: 13 }}>
                  <span><strong>Address:</strong> 4218 Riverwood Ln, Richland</span>
                  <span><strong>Lot:</strong> 8,400 ft²</span>
                  <span><strong>Budget hint:</strong> $300–500</span>
                </div>
              </div>
            )}
          </div>

          <div className="card card-pad-lg">
            <div className="card-title mb-12">Reply</div>
            <textarea className="input" rows={6} placeholder="Type your response..." style={{ width: '100%', resize: 'vertical' }}
              defaultValue={cur.kind === 'request' ? "Hi! Thanks for reaching out. I can have a crew lead come by Friday between 10–11 to walk the property. We'll have an estimate to you by Monday." : ""} />
            <div className="flex-between mt-12">
              <div className="flex gap-8">
                <button className="btn btn-ghost btn-sm"><Icon.Wand size={12} />Suggest reply</button>
                <button className="btn btn-ghost btn-sm">Save template</button>
              </div>
              <div className="flex gap-8">
                <button className="btn btn-ghost">Reply later</button>
                <button className="btn btn-cta"><Icon.Send size={14} />Send reply</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.AnalyticsScreens = { Analytics, PortalAdmin };
