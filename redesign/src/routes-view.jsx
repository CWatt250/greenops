// Routes (list, builder, detail) + Crew Dispatch
const { CLIENTS, CREWS, JOBS } = window.GREENOPS;

// ============ ROUTES LIST ============
function Routes({ go }) {
  const routes = [
    { id: 'r1', name: 'Alpha · Thursday loop', crew: 'Crew Alpha', date: '2026-05-07', stops: 6, miles: 84, time: '7h 30m', status: 'in_progress', saved: '38 min', color: '#3D6B2C' },
    { id: 'r2', name: 'Bravo · HOA day', crew: 'Crew Bravo', date: '2026-05-07', stops: 4, miles: 102, time: '8h 0m', status: 'in_progress', saved: '52 min', color: '#C9A84C' },
    { id: 'r3', name: 'Charlie · Commercial Kennewick', crew: 'Crew Charlie', date: '2026-05-07', stops: 3, miles: 56, time: '6h 30m', status: 'in_progress', saved: '24 min', color: '#3B6FB8' },
    { id: 'r4', name: 'Delta · Pasco/Prosser', crew: 'Crew Delta', date: '2026-05-07', stops: 5, miles: 124, time: '8h 0m', status: 'in_progress', saved: '1h 8m', color: '#8B5C18' },
    { id: 'r5', name: 'Alpha · Friday loop', crew: 'Crew Alpha', date: '2026-05-08', stops: 7, miles: 92, time: '7h 45m', status: 'planned', saved: '34 min', color: '#3D6B2C' },
    { id: 'r6', name: 'Bravo · Friday', crew: 'Crew Bravo', date: '2026-05-08', stops: 5, miles: 88, time: '8h 0m', status: 'planned', saved: '41 min', color: '#C9A84C' },
    { id: 'r7', name: 'Saturday makeup loop', crew: 'Crew Alpha', date: '2026-05-09', stops: 8, miles: 108, time: '8h 30m', status: 'draft', saved: '—', color: '#3D6B2C' },
    { id: 'r8', name: 'Monday HOA round', crew: 'Crew Bravo', date: '2026-05-11', stops: 3, miles: 64, time: '6h 0m', status: 'draft', saved: '—', color: '#C9A84C' },
  ];

  const totalSaved = '4h 17m';

  return (
    <>
      <Topbar crumbs={['Office', 'Routes']} />
      <div className="page">
        <PageHeader
          eyebrow="Powered by VROOM optimization"
          title="Routes"
          sub="Build, optimize, and dispatch daily routes across all crews."
          actions={<>
            <button className="btn btn-ghost"><Icon.Wand size={14} />Re-optimize all</button>
            <button className="btn btn-cta" onClick={() => go('routes', { sub: 'new' })}><Icon.Plus size={14} />Build route</button>
          </>}
        />

        <div className="grid grid-4 mb-24">
          <StatCard label="Active routes" value="4" foot="all crews dispatched" />
          <StatCard label="Stops today" value="18" delta="+3" foot="vs yesterday" />
          <StatCard label="Drive time" value="29.0h" foot="across 4 crews · today" />
          <StatCard label="Time saved by AI" value={totalSaved} delta="+18%" foot="vs hand-built routes" />
        </div>

        <div className="filter-bar">
          <Chips
            options={[
              { id: 'today', label: 'Today', count: 4 },
              { id: 'tomorrow', label: 'Friday', count: 2 },
              { id: 'week', label: 'This week', count: 8 },
              { id: 'drafts', label: 'Drafts', count: 2 },
            ]}
            value="today" onChange={() => {}} />
        </div>

        <div className="grid grid-2 gap-16">
          {routes.map(r => (
            <div key={r.id} className="card" style={{ cursor: 'pointer', borderColor: r.status === 'in_progress' ? 'var(--forest-600)' : 'var(--border)' }} onClick={() => go('routes', { sub: 'detail', id: r.id })}>
              <div style={{ height: 140, position: 'relative' }} className="mapbox-fake">
                {/* fake route line */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 400 140" preserveAspectRatio="none">
                  <path d="M 30 110 Q 90 30, 150 70 T 280 50 L 360 90" fill="none" stroke={r.color} strokeWidth="3" strokeDasharray="6 4" opacity="0.7" />
                </svg>
                {[
                  { x: 30, y: 110 }, { x: 110, y: 60 }, { x: 200, y: 80 }, { x: 290, y: 45 }, { x: 360, y: 90 }
                ].slice(0, Math.min(5, r.stops)).map((p, i) => (
                  <div key={i} className="pin" style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)', background: r.color, width: 24, height: 24, fontSize: 11 }}>{i + 1}</div>
                ))}
                <div style={{ position: 'absolute', top: 10, left: 10 }}>
                  <StatusBadge status={r.status === 'in_progress' ? 'in_progress' : r.status === 'planned' ? 'scheduled' : 'draft'} />
                </div>
              </div>
              <div className="card-pad">
                <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500 }}>{r.name}</div>
                    <div className="tbl-sub">{r.crew} · {r.date}</div>
                  </div>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: r.color }}></div>
                </div>
                <div className="flex gap-16 mt-12" style={{ fontSize: 12 }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Stops</span> <strong className="num">{r.stops}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Miles</span> <strong className="num">{r.miles}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Time</span> <strong className="num">{r.time}</strong></div>
                  {r.saved !== '—' && <div style={{ marginLeft: 'auto' }}><span className="delta-up"><Icon.ArrowDown size={10} /> Saved {r.saved}</span></div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ============ ROUTE BUILDER ============
function NewRoute({ go }) {
  const stops = [
    { i: 1, name: 'Maria Chen', addr: '4218 Riverwood Ln', eta: '08:00', dur: '45m' },
    { i: 2, name: 'James & Anita Lopez', addr: '892 Vineyard Dr', eta: '09:00', dur: '1h 15m' },
    { i: 3, name: 'Linda Vasquez', addr: '1833 Country Club Ln', eta: '10:30', dur: '1h' },
    { i: 4, name: 'Reagan Family', addr: '67 Apple Blossom Way', eta: '13:00', dur: '2h' },
    { i: 5, name: 'David Park', addr: '215 Meadowbrook Ct', eta: '15:30', dur: '30m' },
    { i: 6, name: 'Walker Property', addr: '88 Vista Way', eta: '16:30', dur: '1h' },
  ];

  return (
    <>
      <Topbar crumbs={['Office', 'Routes', 'New']} search={false} />
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', height: 'calc(100vh - 60px)' }}>
        {/* Left: stop list */}
        <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
            <div className="page-eyebrow">Route builder</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0, fontWeight: 500 }}>Alpha · Thursday loop</h2>
            <div className="flex gap-12 mt-12" style={{ fontSize: 12 }}>
              <span><Icon.Truck size={12} stroke="var(--forest-600)" /> Crew Alpha</span>
              <span><Icon.Calendar size={12} stroke="var(--forest-600)" /> Thu, May 7</span>
            </div>
          </div>

          <div style={{ padding: 16, background: 'var(--gold-100)', borderBottom: '1px solid var(--gold-300)' }}>
            <div className="flex-between mb-8">
              <div className="flex-center gap-8"><Icon.Wand size={14} stroke="var(--gold-700)" /><strong style={{ fontSize: 13 }}>Optimization ready</strong></div>
              <button className="btn btn-cta btn-sm">Optimize<Icon.ArrowRight size={12} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--bark-700)' }}>VROOM estimates <strong>38 min saved</strong> by re-sequencing 6 stops with current traffic.</div>
          </div>

          <div style={{ padding: 16 }}>
            <div className="flex-between mb-12">
              <div className="label" style={{ margin: 0 }}>Stops · 6</div>
              <button className="btn btn-ghost btn-sm"><Icon.Plus size={12} />Add stop</button>
            </div>

            {stops.map((s, i) => (
              <div key={s.i} style={{ padding: 12, background: 'var(--cream-50)', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border)', display: 'flex', gap: 12, cursor: 'grab' }}>
                <div className="pin" style={{ flexShrink: 0 }}>{s.i}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</div>
                  <div className="tbl-sub">{s.addr}</div>
                  <div className="flex gap-12 mt-8" style={{ fontSize: 11 }}>
                    <span className="num"><Icon.Clock size={10} /> {s.eta}</span>
                    <span style={{ color: 'var(--text-muted)' }}>· {s.dur}</span>
                    {i < stops.length - 1 && <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>↓ {Math.round(8 + Math.random() * 12)}min drive</span>}
                  </div>
                </div>
                <Icon.MoreH size={14} stroke="var(--text-subtle)" />
              </div>
            ))}

            <div style={{ marginTop: 12, padding: 14, background: 'var(--moss-900)', color: 'white', borderRadius: 10 }}>
              <div className="flex-between">
                <div>
                  <div style={{ fontSize: 11, color: 'var(--sage-300)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Route summary</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginTop: 4 }}>84 mi · 7h 30m</div>
                </div>
                <Icon.Route size={28} stroke="var(--gold-500)" />
              </div>
              <div className="flex gap-12 mt-12" style={{ fontSize: 12, color: 'var(--sage-300)' }}>
                <span>6 stops</span>
                <span>· 5h 25m work</span>
                <span>· 2h 5m drive</span>
              </div>
              <div className="flex gap-8 mt-12">
                <button className="btn btn-cta btn-sm" style={{ flex: 1, justifyContent: 'center' }}>Save & Dispatch</button>
                <button className="btn btn-sm" style={{ background: 'transparent', border: '1px solid var(--moss-700)', color: 'var(--cream-100)' }}>Save draft</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: map */}
        <div className="mapbox-fake" style={{ position: 'relative' }}>
          {/* fake polyline */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path d="M 120 480 L 180 380 L 320 320 L 540 280 L 720 220 L 880 180" fill="none" stroke="var(--forest-600)" strokeWidth="3" strokeDasharray="8 6" />
          </svg>

          {[
            { x: 120, y: 480, n: 1, l: 'Chen', t: '08:00' },
            { x: 180, y: 380, n: 2, l: 'Lopez', t: '09:00' },
            { x: 320, y: 320, n: 3, l: 'Vasquez', t: '10:30' },
            { x: 540, y: 280, n: 4, l: 'Reagan', t: '13:00' },
            { x: 720, y: 220, n: 5, l: 'Park', t: '15:30' },
            { x: 880, y: 180, n: 6, l: 'Walker', t: '16:30' },
          ].map(p => (
            <div key={p.n} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}>
              <div className="pin" style={{ width: 36, height: 36, fontSize: 14 }}>{p.n}</div>
              <div style={{ position: 'absolute', top: 38, left: '50%', transform: 'translateX(-50%)', background: 'var(--moss-900)', color: 'white', fontSize: 11, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                {p.l} · <span className="num">{p.t}</span>
              </div>
            </div>
          ))}

          {/* Map controls */}
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="icon-btn" style={{ background: 'white' }}><Icon.Plus size={14} /></button>
            <button className="icon-btn" style={{ background: 'white', fontWeight: 600 }}>−</button>
          </div>
          <div style={{ position: 'absolute', top: 16, left: 16, background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: 8, display: 'flex', gap: 4 }}>
            <button className="btn btn-sm btn-ghost" style={{ border: 'none' }}>Map</button>
            <button className="btn btn-sm btn-dark">Satellite</button>
          </div>
          <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(28, 43, 26, 0.92)', color: 'white', borderRadius: 8, padding: '12px 16px', backdropFilter: 'blur(8px)' }}>
            <div className="flex-center gap-12">
              <Icon.Cloud size={18} stroke="var(--gold-500)" />
              <div>
                <div style={{ fontSize: 11, color: 'var(--sage-300)' }}>Today's weather</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>68°F · Sunny · 6mph wind</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ ROUTE DETAIL ============
function RouteDetail({ go, id }) {
  return <NewRoute go={go} />; // detail same view; reuse
}

// ============ CREW DISPATCH ============
function CrewDispatch({ go }) {
  const todayJobs = JOBS.filter(j => j.date === '2026-05-07');
  return (
    <>
      <Topbar crumbs={['Office', 'Crew Dispatch']} />
      <div className="page">
        <PageHeader
          eyebrow="Live · auto-refresh on"
          title="Crew dispatch"
          sub="Where every crew is right now. GPS pings update every 30 seconds."
          actions={<>
            <button className="btn btn-ghost"><Icon.Refresh size={14} />Refresh</button>
            <button className="btn btn-primary"><Icon.Send size={14} />Send broadcast</button>
          </>}
        />

        <div className="grid gap-16 mb-24" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Live map */}
          <div className="card" style={{ height: 420 }}>
            <div className="card-head">
              <div className="card-title">Live crew map</div>
              <div className="flex-center gap-8"><span className="live-dot"></span><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live</span></div>
            </div>
            <div className="mapbox-fake" style={{ height: 'calc(100% - 53px)', position: 'relative' }}>
              {[
                { x: '20%', y: '60%', n: 'A', color: '#3D6B2C', name: 'Crew Alpha' },
                { x: '60%', y: '35%', n: 'B', color: '#C9A84C', name: 'Crew Bravo' },
                { x: '45%', y: '75%', n: 'C', color: '#3B6FB8', name: 'Crew Charlie' },
                { x: '85%', y: '55%', n: 'D', color: '#8B5C18', name: 'Crew Delta' },
              ].map(c => (
                <div key={c.n} style={{ position: 'absolute', left: c.x, top: c.y }}>
                  <div className="pin" style={{ background: c.color, width: 32, height: 32 }}>{c.n}</div>
                  <div style={{ position: 'absolute', top: 38, left: '50%', transform: 'translateX(-50%)', background: 'var(--moss-900)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{c.name}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><div className="card-title">Crew status</div></div>
            <div style={{ padding: 0 }}>
              {CREWS.map((c, i) => {
                const cj = todayJobs.filter(j => j.crew === c.name);
                const cur = cj.find(j => j.status === 'in_progress');
                const done = cj.filter(j => j.status === 'complete').length;
                return (
                  <div key={c.id} style={{ padding: '14px 20px', borderBottom: i < CREWS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div className="flex-between">
                      <div className="flex-center gap-10">
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }}></span>
                        <strong>{c.name}</strong>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {c.members.length} on-site</span>
                      </div>
                      <span className="num" style={{ fontSize: 12 }}>{done}/{cj.length} done</span>
                    </div>
                    {cur && (
                      <div className="mt-8" style={{ padding: 10, background: 'var(--cream-50)', borderRadius: 6, fontSize: 12 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>NOW · in progress</div>
                        <div style={{ fontWeight: 500 }}>{cur.title} · {cur.client}</div>
                        <div className="flex-between mt-8">
                          <span style={{ color: 'var(--text-muted)' }}>{cur.address.split(',')[0]}</span>
                          <span className="num">{cur.start} ETA {cur.end}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-6 mt-8">
                      <button className="btn btn-ghost btn-sm"><Icon.Phone size={11} />Call lead</button>
                      <button className="btn btn-ghost btn-sm"><Icon.Send size={11} />Message</button>
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Open route →</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Live activity feed</div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last 2 hours</span>
          </div>
          <div style={{ padding: 24 }}>
            <div className="timeline">
              {[
                { time: '11:08am', text: 'Crew Bravo completed Westwind common areas (Sarah Johnson)', kind: 'gold' },
                { time: '10:42am', text: 'Sarah Johnson flagged sprinkler issue at Westwind HOA', kind: 'issue' },
                { time: '10:14am', text: 'Crew Alpha completed Maria Chen weekly mow (Diego Marin)', kind: 'gold' },
                { time: '9:33am', text: 'Crew Delta clock-in at Pasco SD — Maya HS (Maya Rodriguez)', kind: '' },
                { time: '9:02am', text: 'Crew Alpha completed Lopez mow + hedge trim — total 1h 12m', kind: 'gold' },
                { time: '8:14am', text: 'Crew Charlie clock-in at Tri-City Medical Plaza', kind: '' },
              ].map((t, i) => (
                <div key={i} className={cx('t-item', t.kind)}>
                  <div className="t-time">{t.time} · today</div>
                  <div className="t-text">{t.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.RouteScreens = { Routes, NewRoute, RouteDetail, CrewDispatch };
