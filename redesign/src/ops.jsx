// Crews, Services, Settings
const { CLIENTS, CREWS, SERVICES, JOBS } = window.GREENOPS;

// ============ CREWS ============
function CrewsPage({ go }) {
  return (
    <>
      <Topbar crumbs={['Office', 'Crews']} />
      <div className="page">
        <PageHeader
          eyebrow="4 crews · 11 members"
          title="Crews"
          sub="Crew composition, color coding, and performance at a glance."
          actions={<button className="btn btn-cta"><Icon.Plus size={14} />New crew</button>}
        />

        <div className="grid grid-2 gap-16">
          {CREWS.map(c => (
            <div key={c.id} className="card">
              <div style={{ padding: 20, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: c.color, display: 'grid', placeItems: 'center', color: 'white', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>
                  {c.name.split(' ')[1][0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 500 }}>{c.name}</div>
                  <div className="tbl-sub">Lead: {c.lead} · {c.members.length} members</div>
                </div>
                <button className="icon-btn"><Icon.MoreH size={14} /></button>
              </div>

              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div>
                  <div className="label">Today</div>
                  <div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{c.today}</div>
                  <div className="tbl-sub">jobs scheduled</div>
                </div>
                <div>
                  <div className="label">Completion</div>
                  <div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{c.completion}%</div>
                  <div className="tbl-sub">last 30 days</div>
                </div>
                <div>
                  <div className="label">On the road</div>
                  <div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{c.mileage}<span style={{ fontSize: 12, color: 'var(--text-muted)' }}>mi</span></div>
                  <div className="tbl-sub">today</div>
                </div>
              </div>

              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--cream-50)' }}>
                <div className="label mb-8">Members</div>
                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                  {c.members.map(m => (
                    <div key={m} className="flex-center gap-6" style={{ background: 'white', border: '1px solid var(--border)', padding: '4px 10px 4px 4px', borderRadius: 999, fontSize: 12 }}>
                      <Avatar name={m} size={20} color={m === c.lead ? c.color : undefined} />
                      <span style={{ fontWeight: 500 }}>{m}</span>
                      {m === c.lead && <Icon.Star size={11} stroke="var(--gold-500)" fill="var(--gold-500)" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ============ SERVICES CATALOG ============
function ServicesPage({ go }) {
  const cats = [
    { id: 'all', label: 'All', count: SERVICES.length },
    { id: 'mowing', label: 'Mowing', count: SERVICES.filter(s => s.cat === 'mowing').length },
    { id: 'cleanup', label: 'Cleanup', count: SERVICES.filter(s => s.cat === 'cleanup').length },
    { id: 'fertilization', label: 'Fertilization' },
    { id: 'aeration', label: 'Aeration' },
    { id: 'sprinkler', label: 'Sprinkler' },
    { id: 'tree', label: 'Tree & shrub' },
    { id: 'snow', label: 'Snow' },
    { id: 'holiday', label: 'Holiday' },
  ];
  const catIcon = { mowing: 'Leaf', cleanup: 'Sparkle', fertilization: 'Drop', aeration: 'Layers', sprinkler: 'Drop', tree: 'Leaf', snow: 'Cloud', holiday: 'Star', other: 'Layers' };
  const unitLabel = { per_visit: '/ visit', per_sqft: '/ ft²', per_hour: '/ hour', flat: 'flat', per_unit: '/ unit' };
  const [active, setActive] = React.useState('all');
  const filtered = active === 'all' ? SERVICES : SERVICES.filter(s => s.cat === active);

  return (
    <>
      <Topbar crumbs={['Office', 'Services']} />
      <div className="page">
        <PageHeader
          eyebrow="12 services · 10 active"
          title="Service catalog"
          sub="Services you offer. These power line items, estimates, and recurring jobs."
          actions={<button className="btn btn-cta"><Icon.Plus size={14} />Add service</button>}
        />

        <div className="filter-bar">
          <Chips options={cats} value={active} onChange={setActive} />
        </div>

        <div className="grid grid-3 gap-16">
          {filtered.map(s => {
            const Ico = Icon[catIcon[s.cat]] || Icon.Layers;
            return (
              <div key={s.id} className="card card-pad" style={{ opacity: s.active ? 1 : 0.55 }}>
                <div className="flex-between mb-12">
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--sage-100)', display: 'grid', placeItems: 'center' }}>
                    <Ico size={18} stroke="var(--forest-600)" />
                  </div>
                  <Toggle on={s.active} onChange={() => {}} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500 }}>{s.name}</div>
                <div className="tbl-sub" style={{ textTransform: 'capitalize' }}>{s.cat}</div>
                <div className="rule"></div>
                <div className="flex-between">
                  <div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>${s.price}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>{unitLabel[s.unit]}</span>
                  </div>
                  <div className="tbl-sub num">{s.jobs} jobs YTD</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ============ SETTINGS ============
function Settings({ go }) {
  return (
    <>
      <Topbar crumbs={['Office', 'Settings']} />
      <div className="page" style={{ maxWidth: 1100 }}>
        <PageHeader title="Settings" sub="Company, billing, integrations, and team preferences." />

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32 }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[
              { id: 'company', label: 'Company profile', icon: 'Building', active: true },
              { id: 'team', label: 'Team & roles', icon: 'Users' },
              { id: 'billing', label: 'Billing & tax', icon: 'CreditCard' },
              { id: 'notif', label: 'Notifications', icon: 'Bell' },
              { id: 'integ', label: 'Integrations', icon: 'Layers' },
              { id: 'tags', label: 'Tags & labels', icon: 'Sparkle' },
              { id: 'export', label: 'Data export', icon: 'Download' },
              { id: 'danger', label: 'Danger zone', icon: 'X' },
            ].map(s => {
              const Ico = Icon[s.icon];
              return (
                <button key={s.id} className="portal-link" style={s.active ? { background: 'var(--sage-100)', color: 'var(--moss-900)' } : {}}>
                  <Ico size={15} stroke={s.active ? 'var(--forest-600)' : 'var(--text-muted)'} />
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div>
            <div className="card card-pad-lg mb-16">
              <div className="card-title mb-16">Company profile</div>
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginBottom: 24 }}>
                <div style={{ width: 72, height: 72, borderRadius: 14, background: 'var(--moss-900)', display: 'grid', placeItems: 'center', color: 'white' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 28 }}>TLC</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>TLC Landscape Management</div>
                  <div className="tbl-sub">Logo · 200 × 200 minimum · PNG or SVG</div>
                  <button className="btn btn-ghost btn-sm mt-8">Upload new</button>
                </div>
              </div>

              <div className="grid grid-2 gap-16">
                <div><label className="label">Legal name</label><input className="input" defaultValue="TLC Landscape Management LLC" style={{ width: '100%' }} /></div>
                <div><label className="label">DBA</label><input className="input" defaultValue="TLC Landscape" style={{ width: '100%' }} /></div>
                <div><label className="label">Phone</label><input className="input" defaultValue="(509) 627-9384" style={{ width: '100%' }} /></div>
                <div><label className="label">Email</label><input className="input" defaultValue="hello@tlclandscape.com" style={{ width: '100%' }} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label className="label">Address</label><input className="input" defaultValue="1053 S Highland Dr, Kennewick, WA 99337" style={{ width: '100%' }} /></div>
              </div>
            </div>

            <div className="card card-pad-lg mb-16">
              <div className="flex-between mb-12">
                <div className="card-title" style={{ margin: 0 }}>Brand colors</div>
                <button className="btn btn-ghost btn-sm">Restore defaults</button>
              </div>
              <div className="grid grid-4 gap-12">
                {[
                  { l: 'Primary green', c: '#3D6B2C' },
                  { l: 'Sidebar dark', c: '#1C2B1A' },
                  { l: 'Gold accent', c: '#C9A84C' },
                  { l: 'Cream surface', c: '#F5F5F0' },
                ].map(s => (
                  <div key={s.l}>
                    <label className="label">{s.l}</label>
                    <div className="flex-center gap-8" style={{ background: 'var(--cream-50)', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: s.c, border: '1px solid var(--border)' }}></div>
                      <span className="num" style={{ fontSize: 12 }}>{s.c}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-pad-lg">
              <div className="card-title mb-12">Operating hours</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => (
                  <div key={d} className="flex-center gap-12" style={{ padding: '6px 0', borderBottom: i < 6 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ width: 100, fontWeight: 500 }}>{d}</div>
                    <Toggle on={i < 6} onChange={() => {}} />
                    {i < 6 ? (
                      <div className="flex-center gap-6 num" style={{ fontSize: 13 }}>
                        <input className="input" style={{ width: 80 }} defaultValue="7:00 AM" />
                        <span>–</span>
                        <input className="input" style={{ width: 80 }} defaultValue={i === 5 ? '2:00 PM' : '5:00 PM'} />
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Closed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.OpsScreens = { CrewsPage, ServicesPage, Settings };
