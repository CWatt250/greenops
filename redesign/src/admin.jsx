// Dashboard, Clients, Jobs, Schedule
const { CLIENTS, CREWS, SERVICES, JOBS, INVOICES, ESTIMATES, PORTAL_ACTIVITY } = window.GREENOPS;

// ============ DASHBOARD ============
function Dashboard({ go }) {
  const todayJobs = JOBS.filter(j => j.date === '2026-05-07');
  const completed = todayJobs.filter(j => j.status === 'complete').length;
  const inProg = todayJobs.filter(j => j.status === 'in_progress').length;

  return (
    <>
      <Topbar crumbs={['Office', 'Dashboard']} />
      <div className="page">
        <PageHeader
          eyebrow="Thursday · May 7, 2026"
          title="Good morning, Connor"
          sub={`${todayJobs.length} jobs scheduled across 4 crews · 68°F & sunny in Kennewick`}
          actions={<>
            <button className="btn btn-ghost"><Icon.Download size={14} />Export</button>
            <button className="btn btn-cta" onClick={() => go('jobs', { sub: 'new' })}><Icon.Plus size={14} />New Job</button>
          </>}
        />

        <div className="grid grid-4 mb-24">
          <StatCard label="Today's Jobs" value={todayJobs.length} delta="+3" deltaLabel="vs yesterday"
            foot={`${completed} done · ${inProg} active`}
            spark={[12, 14, 11, 16, 13, 18, 15, 17, 22, 19, 24, todayJobs.length]} />
          <StatCard label="Revenue MTD" value="$48,240" delta="+18%"
            foot="vs $40,810 last May"
            spark={[8, 12, 14, 11, 18, 22, 28, 32, 38, 42, 46, 48]} />
          <StatCard label="Outstanding" value="$23,640" delta="-$2,840"
            foot="6 invoices, 2 overdue"
            spark={[28, 26, 27, 25, 26, 24, 25, 23, 24, 22, 24, 23]} />
          <StatCard label="Crews Out" value="4 / 4" delta=""
            foot="84% on schedule"
            spark={[3, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4]} />
        </div>

        <div className="grid grid-3-2 mb-24">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Today's run</div>
                <div className="card-sub">Live status across all crews · auto-refresh on</div>
              </div>
              <div className="flex gap-8 flex-center">
                <span className="live-dot"></span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Live</span>
              </div>
            </div>
            <table className="tbl">
              <thead><tr>
                <th>Job</th><th>Client</th><th>Crew</th><th>Window</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {todayJobs.slice(0, 7).map(j => (
                  <tr key={j.id} className="clickable" onClick={() => go('jobs', { sub: 'detail', id: j.id })}>
                    <td className="tbl-name">{j.title}</td>
                    <td>{j.client}<div className="tbl-sub">{j.address.split(',')[0]}</div></td>
                    <td>{j.crew}</td>
                    <td className="num" style={{ fontSize: 12 }}>{j.start}–{j.end}</td>
                    <td><StatusBadge status={j.status} /></td>
                    <td><Icon.ChevronRight size={14} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-head">
                <div className="card-title">Portal inbox</div>
                <button className="btn btn-sm btn-ghost" onClick={() => go('portal-admin')}>View all</button>
              </div>
              <div style={{ padding: '4px 4px 12px' }}>
                {PORTAL_ACTIVITY.slice(0, 4).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ marginTop: 2 }}>
                      {a.kind === 'request' && <Icon.FileText size={16} stroke="var(--gold-600)" />}
                      {a.kind === 'message' && <Icon.Mail size={16} stroke="var(--st-scheduled)" />}
                      {a.kind === 'complaint' && <Icon.Flag size={16} stroke="var(--st-issue)" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{a.client}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.text}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', whiteSpace: 'nowrap' }}>{a.time}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 4 }}>Weather watch</div>
              <div className="card-sub mb-12">Next 3 days · OpenWeatherMap</div>
              <div className="flex gap-12">
                {[
                  { d: 'Thu', icon: 'Sparkle', t: '68°', sub: 'Sunny', ok: true },
                  { d: 'Fri', icon: 'Cloud', t: '62°', sub: '40% rain', ok: false },
                  { d: 'Sat', icon: 'Sparkle', t: '71°', sub: 'Clear', ok: true },
                ].map(w => {
                  const Ico = Icon[w.icon];
                  return (
                    <div key={w.d} style={{ flex: 1, padding: 12, background: 'var(--cream-50)', borderRadius: 8, textAlign: 'center', border: w.ok ? '1px solid var(--border)' : '1px solid var(--gold-300)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{w.d}</div>
                      <Ico size={20} stroke={w.ok ? 'var(--gold-500)' : 'var(--st-scheduled)'} />
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{w.t}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.sub}</div>
                    </div>
                  );
                })}
              </div>
              {/* Friday rain warning */}
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--gold-100)', borderRadius: 6, fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--gold-300)' }}>
                <Icon.Drop size={14} stroke="var(--gold-700)" />
                <span><strong>Friday rain risk</strong> — 5 jobs may need to push to Sat or Mon.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Crew performance · today</div>
              <button className="btn btn-sm btn-ghost" onClick={() => go('analytics', { sub: 'crew' })}>Details<Icon.ArrowRight size={12}/></button>
            </div>
            <div style={{ padding: '4px 20px 16px' }}>
              {CREWS.map(c => {
                const crewJobs = todayJobs.filter(j => j.crew === c.name);
                const done = crewJobs.filter(j => j.status === 'complete').length;
                const pct = crewJobs.length ? (done / crewJobs.length) * 100 : 0;
                return (
                  <div key={c.id} className="bar-row">
                    <div className="bar-label flex-center gap-8">
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }}></span>
                      {c.name}
                    </div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: c.color }}></div></div>
                    <div className="bar-num">{done}/{crewJobs.length} · {c.completion}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Quick actions</div>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'New estimate', icon: 'FileText', go: 'estimates' },
                { label: 'New invoice', icon: 'Receipt', go: 'invoices' },
                { label: 'Add client', icon: 'Plus', go: 'clients', sub: 'new' },
                { label: 'Build route', icon: 'Map', go: 'routes', sub: 'new' },
                { label: 'Dispatch crew', icon: 'Truck', go: 'crew-dispatch' },
                { label: 'View today\'s schedule', icon: 'Calendar', go: 'schedule' },
              ].map((a, i) => {
                const Ico = Icon[a.icon];
                return (
                  <button key={i} className="btn btn-ghost" style={{ justifyContent: 'flex-start', padding: '12px 14px' }} onClick={() => go(a.go, { sub: a.sub })}>
                    <Ico size={15} stroke="var(--forest-600)" />
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ CLIENTS ============
function Clients({ go }) {
  const [filter, setFilter] = React.useState('all');
  const filtered = filter === 'all' ? CLIENTS : CLIENTS.filter(c => c.status === filter || c.type === filter);

  return (
    <>
      <Topbar crumbs={['Office', 'Clients']} />
      <div className="page">
        <PageHeader
          eyebrow="187 total · 12 added this month"
          title="Clients"
          sub="Search, filter, and manage every property TLC services."
          actions={<>
            <button className="btn btn-ghost"><Icon.Download size={14} />Export CSV</button>
            <button className="btn btn-cta" onClick={() => go('clients', { sub: 'new' })}><Icon.Plus size={14} />New Client</button>
          </>}
        />

        <div className="filter-bar">
          <input className="input input-search" placeholder="Search by name, address, or phone..." />
          <Chips
            options={[
              { id: 'all', label: 'All', count: 187 },
              { id: 'active', label: 'Active', count: 168 },
              { id: 'prospect', label: 'Prospect', count: 14 },
              { id: 'inactive', label: 'Inactive', count: 5 },
            ]}
            value={filter} onChange={setFilter} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm"><Icon.Filter size={12} />Type</button>
            <button className="btn btn-ghost btn-sm"><Icon.Filter size={12} />Crew</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Client</th><th>Type</th><th>Address</th><th>Lot</th><th>Crew</th><th>Status</th><th className="tbl-num">YTD Revenue</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="clickable" onClick={() => go('clients', { sub: 'detail', id: c.id })}>
                  <td>
                    <div className="tbl-name">{c.name}</div>
                    {c.company && <div className="tbl-sub">{c.company}</div>}
                  </td>
                  <td><PropertyTag type={c.type} /></td>
                  <td>
                    <div style={{ fontSize: 13 }}>{c.address}</div>
                    <div className="tbl-sub">{c.city}, {c.state} {c.zip}</div>
                  </td>
                  <td className="num">{c.lot.toLocaleString()} ft²</td>
                  <td>{c.crew || <span style={{ color: 'var(--text-subtle)', fontStyle: 'italic' }}>—</span>}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="tbl-num">{c.revenue ? `$${c.revenue.toLocaleString()}` : '—'}</td>
                  <td><Icon.ChevronRight size={14} stroke="var(--text-subtle)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ NEW CLIENT ============
function NewClient({ go }) {
  return (
    <>
      <Topbar crumbs={['Office', 'Clients', 'New']} />
      <div className="page" style={{ maxWidth: 960 }}>
        <PageHeader
          eyebrow="Step 1 of 1"
          title="Add a new client"
          sub="Property and contact details. Address autocomplete is on."
          actions={<>
            <button className="btn btn-ghost" onClick={() => go('clients')}>Cancel</button>
            <button className="btn btn-primary"><Icon.Check size={14} />Save client</button>
          </>}
        />

        <div className="grid grid-2 gap-24">
          <div className="card card-pad-lg">
            <div className="card-title mb-16">Property type</div>
            <div className="grid grid-3 gap-12">
              {[
                { id: 'residential', label: 'Residential', icon: 'Home', sel: true },
                { id: 'commercial', label: 'Commercial', icon: 'Building' },
                { id: 'hoa', label: 'HOA', icon: 'Houses' },
              ].map(t => {
                const Ico = Icon[t.icon];
                return (
                  <button key={t.id} className="card card-pad" style={{
                    border: t.sel ? '2px solid var(--forest-600)' : '1px solid var(--border)',
                    background: t.sel ? 'var(--sage-100)' : 'var(--surface)',
                    textAlign: 'left', cursor: 'pointer'
                  }}>
                    <Ico size={20} stroke={t.sel ? 'var(--forest-600)' : 'var(--text-muted)'} />
                    <div style={{ fontWeight: 500, marginTop: 6 }}>{t.label}</div>
                  </button>
                );
              })}
            </div>

            <div className="rule"></div>

            <div className="card-title mb-16">Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Full name</label><input className="input" defaultValue="David Park" style={{ width: '100%' }} /></div>
              <div><label className="label">Company (optional)</label><input className="input" placeholder="e.g. Park Properties" style={{ width: '100%' }} /></div>
              <div><label className="label">Phone</label><input className="input" defaultValue="(509) 555-0312" style={{ width: '100%' }} /></div>
              <div><label className="label">Email</label><input className="input" defaultValue="dpark@outlook.com" style={{ width: '100%' }} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Preferred contact</label>
                <div className="chips" style={{ width: 'fit-content' }}>
                  <button className="chip active">Phone</button>
                  <button className="chip">Email</button>
                  <button className="chip">SMS</button>
                </div>
              </div>
            </div>
          </div>

          <div className="card card-pad-lg">
            <div className="card-title mb-16">Service address</div>
            <div><label className="label">Street address</label><input className="input" placeholder="Start typing for suggestions..." defaultValue="215 Meadowbrook Ct" style={{ width: '100%' }} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label className="label">City</label><input className="input" defaultValue="Kennewick" style={{ width: '100%' }} /></div>
              <div><label className="label">State</label><input className="input" defaultValue="WA" style={{ width: '100%' }} /></div>
              <div><label className="label">Zip</label><input className="input" defaultValue="99337" style={{ width: '100%' }} /></div>
            </div>
            <div className="mt-16" style={{ height: 160, borderRadius: 8, overflow: 'hidden' }}>
              <div className="mapbox-fake" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -100%)' }}>
                  <Icon.MapPin size={32} stroke="var(--st-issue)" fill="var(--st-issue)" />
                </div>
              </div>
            </div>

            <div className="rule"></div>

            <div className="flex-between mb-12">
              <div className="card-title" style={{ margin: 0 }}>Billing address</div>
              <div className="flex-center gap-8">
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Same as service</span>
                <Toggle on={true} onChange={() => {}} />
              </div>
            </div>

            <div className="card-title mt-16 mb-12" style={{ fontSize: 15 }}>Property details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Lot size (ft²)</label><input className="input" defaultValue="6,200" style={{ width: '100%' }} /></div>
              <div><label className="label">Gate code</label><input className="input" placeholder="—" style={{ width: '100%' }} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Access notes</label>
                <textarea className="input" rows={2} placeholder="Side gate, dog in yard, etc." style={{ width: '100%', resize: 'vertical' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ CLIENT DETAIL ============
function ClientDetail({ go, id = 'c1' }) {
  const c = CLIENTS.find(x => x.id === id) || CLIENTS[0];
  const [tab, setTab] = React.useState('overview');
  const clientJobs = JOBS.filter(j => j.clientId === c.id);
  const clientInvs = INVOICES.filter(i => i.clientId === c.id);

  return (
    <>
      <Topbar crumbs={['Office', 'Clients', c.name]} />
      <div className="page">
        <PageHeader
          eyebrow={<><PropertyTag type={c.type} /> · client since 2023</>}
          title={c.name}
          sub={`${c.address}, ${c.city}, ${c.state} ${c.zip}`}
          actions={<>
            <button className="btn btn-ghost"><Icon.Mail size={14} />Email</button>
            <button className="btn btn-ghost"><Icon.Phone size={14} />Call</button>
            <button className="btn btn-ghost"><Icon.Edit size={14} />Edit</button>
            <button className="btn btn-cta"><Icon.Plus size={14} />New Job</button>
          </>}
        />

        <div className="grid grid-3-2 gap-24 mb-24">
          <div>
            <div className="grid grid-3 mb-16">
              <div className="card card-pad">
                <div className="stat-label">Lifetime revenue</div>
                <div className="stat-value" style={{ fontSize: 24 }}>${c.revenue.toLocaleString()}</div>
              </div>
              <div className="card card-pad">
                <div className="stat-label">Jobs YTD</div>
                <div className="stat-value" style={{ fontSize: 24 }}>{clientJobs.length * 4 + 8}</div>
              </div>
              <div className="card card-pad">
                <div className="stat-label">Open balance</div>
                <div className="stat-value" style={{ fontSize: 24, color: c.id === 'c2' ? 'var(--st-issue)' : 'var(--ink-900)' }}>
                  ${c.id === 'c2' ? '4,800' : '0'}
                </div>
              </div>
            </div>

            <Tabs value={tab} onChange={setTab} tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'jobs', label: 'Jobs', count: clientJobs.length + 18 },
              { id: 'invoices', label: 'Invoices', count: clientInvs.length },
              { id: 'notes', label: 'Notes & files' },
              { id: 'activity', label: 'Activity' },
            ]} />

            {tab === 'overview' && (
              <div className="card">
                <div className="mapbox-fake" style={{ height: 240, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -100%)' }}>
                    <Icon.MapPin size={28} stroke="var(--st-issue)" fill="var(--st-issue)" />
                  </div>
                </div>
                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                  <div><div className="label">Lot size</div><div style={{ fontWeight: 500 }}>{c.lot.toLocaleString()} ft²</div></div>
                  <div><div className="label">Property type</div><div style={{ fontWeight: 500, textTransform: 'capitalize' }}>{c.type}</div></div>
                  <div><div className="label">Assigned crew</div><div style={{ fontWeight: 500 }}>{c.crew || '—'}</div></div>
                  <div><div className="label">Gate code</div><div style={{ fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{c.gateCode || '—'}</div></div>
                  <div><div className="label">Preferred contact</div><div style={{ fontWeight: 500 }}>Phone</div></div>
                  <div><div className="label">Portal</div><div style={{ fontWeight: 500, color: 'var(--forest-600)' }}>✓ Invited</div></div>
                </div>
                {c.notes && <div style={{ borderTop: '1px solid var(--border)', padding: 20 }}>
                  <div className="label">Access notes</div>
                  <p style={{ margin: 0, color: 'var(--text)' }}>{c.notes}</p>
                </div>}
              </div>
            )}

            {tab === 'jobs' && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Date</th><th>Service</th><th>Crew</th><th>Status</th><th className="tbl-num">Total</th></tr></thead>
                  <tbody>
                    {clientJobs.map(j => (
                      <tr key={j.id} className="clickable" onClick={() => go('jobs', { sub: 'detail', id: j.id })}>
                        <td className="num">{j.date}</td>
                        <td className="tbl-name">{j.title}</td>
                        <td>{j.crew}</td>
                        <td><StatusBadge status={j.status} /></td>
                        <td className="tbl-num">${j.total}</td>
                      </tr>
                    ))}
                    {[...Array(6)].map((_, i) => (
                      <tr key={`p${i}`}>
                        <td className="num">2026-04-{30 - i * 7}</td>
                        <td className="tbl-name">Weekly Mow & Edge</td>
                        <td>{c.crew}</td>
                        <td><StatusBadge status="complete" /></td>
                        <td className="tbl-num">$65</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'invoices' && (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Invoice #</th><th>Date</th><th>Due</th><th>Status</th><th className="tbl-num">Amount</th></tr></thead>
                  <tbody>
                    {clientInvs.map(inv => (
                      <tr key={inv.id} className="clickable">
                        <td className="tbl-name num">{inv.id}</td>
                        <td className="num">{inv.date}</td>
                        <td className="num">{inv.due}</td>
                        <td><StatusBadge status={inv.status} /></td>
                        <td className="tbl-num">${inv.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'notes' && <div className="empty"><Icon.FileText size={28} /><div className="empty-title mt-8">No notes yet</div><div>Photos, contracts, and notes show here.</div></div>}

            {tab === 'activity' && (
              <div className="card card-pad-lg">
                <div className="timeline">
                  {[
                    { time: 'Today, 10:14am', text: 'Crew Alpha completed Weekly Mow & Edge', kind: '' },
                    { time: 'Yesterday', text: 'Invoice TLC-1040 sent — $280', kind: 'gold' },
                    { time: 'May 1', text: 'Job rescheduled from May 2 → May 7 (rain)', kind: '' },
                    { time: 'Apr 22', text: 'Payment received — $280 (check)', kind: 'gold' },
                    { time: 'Apr 15', text: 'Service request from portal — gate code update', kind: '' },
                  ].map((t, i) => (
                    <div key={i} className={cx('t-item', t.kind)}>
                      <div className="t-time">{t.time}</div>
                      <div className="t-text">{t.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card card-pad-lg">
              <div className="label">Contact</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="flex-center gap-8"><Icon.Phone size={14} stroke="var(--text-muted)" /><span className="num">{c.phone}</span></div>
                <div className="flex-center gap-8"><Icon.Mail size={14} stroke="var(--text-muted)" /><span>{c.email}</span></div>
              </div>
            </div>

            <div className="card card-pad-lg">
              <div className="label">Recurring services</div>
              <div className="mt-8" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="flex-between" style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Weekly Mow & Edge</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Every Thursday · Apr–Oct</div>
                  </div>
                  <span className="num" style={{ fontWeight: 500 }}>$65</span>
                </div>
                <div className="flex-between" style={{ padding: '8px 0' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Sprinkler winterize</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Annual · October</div>
                  </div>
                  <span className="num" style={{ fontWeight: 500 }}>$95</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm mt-12" style={{ width: '100%', justifyContent: 'center' }}><Icon.Plus size={12} />Add recurring service</button>
            </div>

            <div className="card card-pad-lg" style={{ background: 'var(--moss-900)', color: 'white', borderColor: 'var(--moss-800)' }}>
              <div className="label" style={{ color: 'var(--sage-300)' }}>Customer portal</div>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--cream-100)' }}>{c.name} can view jobs, invoices, and request services.</div>
              <div className="mt-12 flex gap-8">
                <button className="btn btn-cta btn-sm">Resend invite</button>
                <button className="btn btn-sm" style={{ background: 'transparent', color: 'var(--sage-300)', border: '1px solid var(--moss-700)' }}>View as customer</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ JOBS LIST ============
function Jobs({ go }) {
  const [filter, setFilter] = React.useState('all');
  return (
    <>
      <Topbar crumbs={['Office', 'Jobs']} />
      <div className="page">
        <PageHeader
          eyebrow="24 active · 6 issues to triage"
          title="Jobs"
          sub="Every scheduled, in-progress, and completed visit."
          actions={<>
            <button className="btn btn-ghost"><Icon.Calendar size={14} />Open Schedule</button>
            <button className="btn btn-cta" onClick={() => go('jobs', { sub: 'new' })}><Icon.Plus size={14} />New Job</button>
          </>}
        />

        <div className="filter-bar">
          <input className="input input-search" placeholder="Search jobs..." />
          <Chips
            options={[
              { id: 'all', label: 'All' },
              { id: 'unscheduled', label: 'Unscheduled', count: 4 },
              { id: 'scheduled', label: 'Scheduled', count: 18 },
              { id: 'in_progress', label: 'In progress', count: 4 },
              { id: 'complete', label: 'Complete' },
              { id: 'issue', label: 'Issues', count: 2 },
            ]}
            value={filter} onChange={setFilter} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm">Today</button>
            <button className="btn btn-ghost btn-sm">This week</button>
            <button className="btn btn-ghost btn-sm">This month</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Client</th><th>Crew</th><th>Date</th><th>Window</th><th>Status</th><th className="tbl-num">Total</th><th></th></tr></thead>
            <tbody>
              {JOBS.map(j => (
                <tr key={j.id} className="clickable" onClick={() => go('jobs', { sub: 'detail', id: j.id })}>
                  <td className="tbl-name">{j.title}</td>
                  <td>{j.client}<div className="tbl-sub">{j.address.split(',')[0]}</div></td>
                  <td>{j.crew}</td>
                  <td className="num">{j.date}</td>
                  <td className="num" style={{ fontSize: 12 }}>{j.start}–{j.end}</td>
                  <td><StatusBadge status={j.status} /></td>
                  <td className="tbl-num">${j.total}</td>
                  <td><Icon.ChevronRight size={14} stroke="var(--text-subtle)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ NEW JOB ============
function NewJob({ go }) {
  return (
    <>
      <Topbar crumbs={['Office', 'Jobs', 'New']} />
      <div className="page" style={{ maxWidth: 880 }}>
        <PageHeader
          title="Create job"
          sub="One-time or recurring service for a client."
          actions={<>
            <button className="btn btn-ghost" onClick={() => go('jobs')}>Cancel</button>
            <button className="btn btn-primary"><Icon.Check size={14} />Save job</button>
          </>}
        />

        <div className="card card-pad-lg mb-24">
          <div className="card-title mb-16">Client</div>
          <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'text' }}>
            <Icon.Search size={14} stroke="var(--text-subtle)" />
            <span style={{ color: 'var(--text-subtle)' }}>Search client by name, address, or phone...</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>⌘K</span>
          </div>
          <div className="mt-12" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {CLIENTS.slice(0, 4).map(c => (
              <button key={c.id} className="card card-pad" style={{ textAlign: 'left', cursor: 'pointer' }}>
                <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.name}</div>
                    <div className="tbl-sub">{c.address}</div>
                  </div>
                  <PropertyTag type={c.type} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card card-pad-lg mb-24">
          <div className="card-title mb-16">Schedule</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div><label className="label">Date</label><input className="input" defaultValue="2026-05-09" style={{ width: '100%' }} /></div>
            <div><label className="label">Start</label><input className="input" defaultValue="08:00" style={{ width: '100%' }} /></div>
            <div><label className="label">End</label><input className="input" defaultValue="09:00" style={{ width: '100%' }} /></div>
            <div><label className="label">Crew</label><select className="input" style={{ width: '100%' }}>{CREWS.map(c => <option key={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div className="mt-16 flex-center gap-8">
            <Toggle on={false} onChange={() => {}} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Make this recurring</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· iCal RRULE</span>
          </div>
        </div>

        <div className="card card-pad-lg">
          <div className="flex-between mb-16">
            <div className="card-title">Line items</div>
            <button className="btn btn-ghost btn-sm"><Icon.Plus size={12} />Add item</button>
          </div>
          <table className="tbl">
            <thead><tr><th>Service</th><th className="tbl-num">Qty</th><th className="tbl-num">Unit price</th><th className="tbl-num">Total</th><th></th></tr></thead>
            <tbody>
              <tr>
                <td className="tbl-name">Weekly Mow & Edge</td>
                <td className="tbl-num">1</td>
                <td className="tbl-num">$65.00</td>
                <td className="tbl-num">$65.00</td>
                <td><Icon.X size={14} stroke="var(--text-subtle)" /></td>
              </tr>
              <tr>
                <td className="tbl-name">Hedge Trimming</td>
                <td className="tbl-num">1.0</td>
                <td className="tbl-num">$75.00</td>
                <td className="tbl-num">$75.00</td>
                <td><Icon.X size={14} stroke="var(--text-subtle)" /></td>
              </tr>
            </tbody>
          </table>
          <div className="rule"></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="flex-between"><span style={{ color: 'var(--text-muted)' }}>Subtotal</span><span className="num">$140.00</span></div>
              <div className="flex-between"><span style={{ color: 'var(--text-muted)' }}>Tax (8.6%)</span><span className="num">$12.04</span></div>
              <div className="rule" style={{ margin: '6px 0' }}></div>
              <div className="flex-between" style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500 }}><span>Total</span><span>$152.04</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ JOB DETAIL ============
function JobDetail({ go, id = 'j5' }) {
  const j = JOBS.find(x => x.id === id) || JOBS[0];
  return (
    <>
      <Topbar crumbs={['Office', 'Jobs', j.title]} />
      <div className="page">
        <PageHeader
          eyebrow={<><StatusBadge status={j.status} /> · {j.crew}</>}
          title={j.title}
          sub={`${j.client} · ${j.address}`}
          actions={<>
            <button className="btn btn-ghost"><Icon.Edit size={14} />Edit</button>
            <button className="btn btn-ghost"><Icon.Calendar size={14} />Reschedule</button>
            <button className="btn btn-primary"><Icon.Receipt size={14} />Generate invoice</button>
          </>}
        />

        <div className="grid grid-3-2 gap-24">
          <div>
            <div className="card mb-16">
              <div className="card-head"><div className="card-title">Status workflow</div></div>
              <div style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 0 }}>
                {[
                  { k: 'unscheduled', label: 'Unscheduled' },
                  { k: 'scheduled', label: 'Scheduled' },
                  { k: 'in_progress', label: 'In progress' },
                  { k: 'complete', label: 'Complete' },
                ].map((s, i, arr) => {
                  const order = ['unscheduled', 'scheduled', 'in_progress', 'complete'];
                  const cur = order.indexOf(j.status);
                  const idx = order.indexOf(s.k);
                  const done = idx <= cur;
                  const active = idx === cur;
                  return (
                    <React.Fragment key={s.k}>
                      <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: done ? 'var(--forest-600)' : 'var(--cream-200)',
                          color: done ? 'white' : 'var(--text-muted)',
                          display: 'grid', placeItems: 'center',
                          margin: '0 auto', fontWeight: 600, fontSize: 13,
                          border: active ? '3px solid var(--gold-300)' : 'none'
                        }}>
                          {done && idx < cur ? <Icon.Check size={14} /> : idx + 1}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--ink-900)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s.label}</div>
                      </div>
                      {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: idx < cur ? 'var(--forest-600)' : 'var(--cream-200)', margin: '0 8px', marginTop: -22 }}></div>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="card mb-16">
              <div className="card-head"><div className="card-title">Line items</div></div>
              <table className="tbl">
                <thead><tr><th>Service</th><th className="tbl-num">Qty</th><th className="tbl-num">Rate</th><th className="tbl-num">Total</th></tr></thead>
                <tbody>
                  <tr><td className="tbl-name">Mowing — common areas (estimated 220k ft²)</td><td className="tbl-num">1</td><td className="tbl-num">$880.00</td><td className="tbl-num">$880.00</td></tr>
                  <tr><td className="tbl-name">Edging — perimeter & sidewalks</td><td className="tbl-num">1</td><td className="tbl-num">$220.00</td><td className="tbl-num">$220.00</td></tr>
                  <tr><td className="tbl-name">Blow-off — sidewalks & lots</td><td className="tbl-num">1</td><td className="tbl-num">$100.00</td><td className="tbl-num">$100.00</td></tr>
                </tbody>
              </table>
              <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ minWidth: 240 }}>
                  <div className="flex-between" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}><span>Total</span><span>$1,200.00</span></div>
                </div>
              </div>
            </div>

            <div className="card mb-16">
              <div className="card-head"><div className="card-title">Photos & signatures</div><button className="btn btn-sm btn-ghost"><Icon.Camera size={12} />Upload</button></div>
              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <PhotoPlaceholder kind="before" label="before · entry" />
                <PhotoPlaceholder kind="before" label="before · pool" />
                <PhotoPlaceholder kind="after" label="after · entry" />
                <PhotoPlaceholder kind="after" label="after · pool" />
              </div>
              <div style={{ padding: '0 16px 16px' }}>
                <div className="label">Customer signature</div>
                <div style={{ height: 80, border: '1px dashed var(--border-strong)', borderRadius: 6, display: 'grid', placeItems: 'center', color: 'var(--text-subtle)', fontStyle: 'italic', background: 'var(--cream-50)' }}>
                  Signed by S. Rodriguez · 2026-05-07 11:08
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><div className="card-title">Activity log</div></div>
              <div style={{ padding: '16px 24px' }}>
                <div className="timeline">
                  <div className="t-item"><div className="t-time">11:08am · Crew Bravo</div><div className="t-text">Job marked complete · 4 photos uploaded</div></div>
                  <div className="t-item"><div className="t-time">10:42am · Sarah Johnson</div><div className="t-text">Sprinkler head broken near building C — flagged for follow-up</div></div>
                  <div className="t-item"><div className="t-time">7:34am · Crew Bravo</div><div className="t-text">Clock-in at 1200 Westwind Way (GPS verified)</div></div>
                  <div className="t-item"><div className="t-time">7:01am · System</div><div className="t-text">Dispatched to crew — notification sent to 3 members</div></div>
                  <div className="t-item gold"><div className="t-time">May 5, 2:14pm · Connor Watt</div><div className="t-text">Job created from recurring template</div></div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card card-pad-lg">
              <div className="label">When</div>
              <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 18 }}>Thu, May 7 · 7:30 – 11:00am</div>
              <div className="rule"></div>
              <div className="label">Crew</div>
              <div className="mt-8 flex-center gap-10">
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#C9A84C' }}></span>
                <strong>Crew Bravo</strong>
              </div>
              <div className="mt-8" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sarah Johnson · Marcus Webb · Luis Romero</div>
              <div className="rule"></div>
              <div className="label">GPS verified</div>
              <div className="mt-8 flex-center gap-6"><Icon.MapPin size={14} stroke="var(--forest-600)" /><span style={{ fontSize: 12 }}>Clock-in at 7:34am · 0.04mi from address</span></div>
            </div>

            <div className="card card-pad-lg" style={{ background: 'var(--st-issue-bg)', borderColor: 'var(--st-issue)' }}>
              <div className="flex-center gap-8 mb-8">
                <Icon.Flag size={16} stroke="var(--st-issue)" />
                <strong style={{ color: 'var(--st-issue)' }}>Issue flagged</strong>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>Sprinkler head broken near building C. Photo attached. Customer notified, follow-up scheduled May 9.</p>
              <button className="btn btn-sm mt-12" style={{ background: 'var(--st-issue)', color: 'white', borderColor: 'var(--st-issue)' }}>Resolve →</button>
            </div>

            <div className="card card-pad-lg">
              <div className="label">Client</div>
              <div className="mt-8">
                <div style={{ fontWeight: 500 }}>{j.client}</div>
                <div className="tbl-sub">{j.address}</div>
              </div>
              <div className="flex gap-6 mt-12">
                <button className="btn btn-ghost btn-sm"><Icon.Phone size={12} />Call</button>
                <button className="btn btn-ghost btn-sm"><Icon.Mail size={12} />Email</button>
                <button className="btn btn-ghost btn-sm">Open client →</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ SCHEDULE ============
function Schedule({ go }) {
  const days = ['Mon May 4', 'Tue May 5', 'Wed May 6', 'Thu May 7', 'Fri May 8', 'Sat May 9', 'Sun May 10'];
  const hours = ['7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm'];

  // mock events keyed by [day][hour]
  const evt = (day, hour, items) => ({ day, hour, items });
  const events = [
    evt(0, 0, [{ title: 'Mow · Lopez', sub: 'Crew Alpha', cls: 'crew-1' }]),
    evt(0, 1, [{ title: 'Mow · Vasquez', sub: 'Crew Alpha', cls: 'crew-1' }]),
    evt(0, 0, [{ title: 'Westwind common', sub: 'Crew Bravo · 4hr', cls: 'crew-2' }]),
    evt(3, 1, [{ title: 'Mow · Chen', sub: 'Crew Alpha', cls: 'crew-1' }]),
    evt(3, 2, [{ title: 'Mow · Lopez', sub: 'Crew Alpha', cls: 'crew-1' }]),
    evt(3, 3, [{ title: 'Mow · Vasquez', sub: 'Crew Alpha · NOW', cls: 'crew-1' }]),
    evt(3, 0, [{ title: 'Westwind HOA', sub: 'Crew Bravo', cls: 'crew-2' }]),
    evt(3, 1, [{ title: 'Westwind cont.', sub: 'Crew Bravo', cls: 'crew-2' }]),
    evt(3, 6, [{ title: 'Sage Hills fert', sub: 'Crew Bravo', cls: 'crew-2' }]),
    evt(3, 1, [{ title: 'TCM Plaza', sub: 'Crew Charlie', cls: 'crew-3' }]),
    evt(3, 6, [{ title: 'Aeration · CCOP', sub: 'Crew Charlie', cls: 'crew-3' }]),
    evt(3, 0, [{ title: 'Pasco SD · Maya HS', sub: 'Crew Delta', cls: 'crew-4' }]),
    evt(3, 6, [{ title: 'YVV estate', sub: 'Crew Delta · 4hr', cls: 'crew-4' }]),
    evt(4, 1, [{ title: 'Park · spring', sub: 'Crew Alpha', cls: 'crew-1' }]),
    evt(4, 2, [{ title: 'Reagan mow', sub: 'Crew Alpha', cls: 'crew-1' }]),
    evt(4, 0, [{ title: 'Horse Heaven', sub: 'Crew Bravo · 6hr', cls: 'crew-2' }]),
    evt(4, 6, [{ title: 'TCM weekly', sub: 'Crew Charlie', cls: 'crew-3' }]),
    evt(4, 0, [{ title: 'Pasco SD · MS', sub: 'Crew Delta', cls: 'crew-4' }]),
    evt(5, 2, [{ title: 'Park sod', sub: 'Crew Alpha', cls: 'crew-1' }]),
  ];

  return (
    <>
      <Topbar crumbs={['Office', 'Schedule']} />
      <div className="page-wide">
        <PageHeader
          eyebrow="Week of May 4–10, 2026"
          title="Schedule"
          sub="Drag jobs onto crew swim-lanes. Updates broadcast live to crews."
          actions={<>
            <div className="chips" style={{ marginRight: 8 }}>
              <button className="chip">Day</button>
              <button className="chip active">Week</button>
              <button className="chip">Month</button>
            </div>
            <button className="btn btn-ghost"><Icon.ChevronLeft size={14} /></button>
            <button className="btn btn-ghost btn-sm">Today</button>
            <button className="btn btn-ghost"><Icon.ChevronRight size={14} /></button>
            <button className="btn btn-cta"><Icon.Wand size={14} />Auto-route this week</button>
          </>}
        />

        <div className="flex gap-16" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="schedule" style={{ gridTemplateColumns: '70px repeat(7, 1fr)' }}>
              <div className="schedule-cell head"></div>
              {days.map((d, i) => (
                <div key={d} className="schedule-cell head" style={{ background: i === 3 ? 'var(--sage-100)' : 'var(--cream-50)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d.split(' ')[0]}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: i === 3 ? 'var(--forest-600)' : 'var(--ink-900)' }}>{d.split(' ')[2]}</div>
                </div>
              ))}
              {hours.map((h, hi) => (
                <React.Fragment key={h}>
                  <div className="schedule-cell time">{h}</div>
                  {days.map((_, di) => {
                    const cell = events.filter(e => e.day === di && e.hour === hi);
                    return (
                      <div key={di} className="schedule-cell" style={{ background: di === 3 && hi === 4 ? 'var(--gold-100)' : 'transparent' }}>
                        {cell.map((e, i) => e.items.map((it, j) => (
                          <div key={`${i}-${j}`} className={`schedule-event ${it.cls}`}>
                            <div className="schedule-event-title">{it.title}</div>
                            <div className="schedule-event-meta">{it.sub}</div>
                          </div>
                        )))}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          <aside style={{ width: 280, flex: '0 0 280px' }}>
            <div className="card mb-16">
              <div className="card-head" style={{ padding: '12px 16px' }}>
                <div>
                  <div className="card-title" style={{ fontSize: 14 }}>Unscheduled</div>
                  <div className="card-sub">Drag onto calendar</div>
                </div>
                <span className="badge badge-unscheduled">4</span>
              </div>
              <div style={{ padding: 8 }}>
                {[
                  { t: 'Tree pruning · Westwind', sub: '12 trees · 4hr', dur: 'EST 4h' },
                  { t: 'Mulch refresh · TCM', sub: 'Entry beds', dur: 'EST 2h' },
                  { t: 'New client onboarding · Park', sub: 'Walkthrough + measure', dur: 'EST 1h' },
                  { t: 'Sprinkler repair · Lopez', sub: 'Follow-up from May 4', dur: 'EST 1h' },
                ].map((x, i) => (
                  <div key={i} style={{ padding: 10, borderRadius: 6, background: 'var(--cream-100)', marginBottom: 6, cursor: 'grab', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{x.t}</div>
                    <div className="flex-between" style={{ marginTop: 4 }}>
                      <div className="tbl-sub">{x.sub}</div>
                      <span className="tag" style={{ fontSize: 10 }}>{x.dur}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-pad">
              <div className="card-title mb-12" style={{ fontSize: 14 }}>Crew legend</div>
              {CREWS.map(c => (
                <div key={c.id} className="flex-center gap-8" style={{ padding: '4px 0', fontSize: 13 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color }}></span>
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 11 }}>{c.today} jobs</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

window.AdminScreens = { Dashboard, Clients, NewClient, ClientDetail, Jobs, NewJob, JobDetail, Schedule };
