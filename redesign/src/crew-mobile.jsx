// Crew Mobile — what's on the field crew's phone
const { JOBS, CREWS } = window.GREENOPS;

function CrewPhoneShell({ children, screen, setScreen }) {
  return (
    <IOSDevice>
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--cream-50)' }}>
        {children}
        <nav style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          background: 'var(--moss-900)', color: 'white',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)', paddingTop: 8,
          flexShrink: 0,
        }}>
          {[
            { id: 'today', label: 'Today', icon: 'Calendar' },
            { id: 'route', label: 'Route', icon: 'Route' },
            { id: 'job', label: 'Job', icon: 'Briefcase' },
            { id: 'me', label: 'Me', icon: 'User' },
          ].map(t => {
            const Ico = Icon[t.icon];
            const active = screen === t.id;
            return (
              <button key={t.id} onClick={() => setScreen(t.id)} style={{
                background: 'transparent', border: 'none', padding: '8px 0',
                color: active ? 'var(--gold-500)' : 'var(--sage-300)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                fontSize: 10, fontWeight: 500, cursor: 'pointer',
              }}>
                <Ico size={20} stroke={active ? 'var(--gold-500)' : 'var(--sage-300)'} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>
    </IOSDevice>
  );
}

function CrewToday({ go }) {
  const todayJobs = JOBS.filter(j => j.date === '2026-05-07' && j.crew === 'Crew Bravo');
  return (
    <>
      <div style={{ background: 'var(--moss-900)', color: 'white', padding: '60px 20px 24px' }}>
        <div style={{ fontSize: 12, color: 'var(--sage-300)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Thursday · May 7</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, marginTop: 4 }}>Good morning, Sarah</div>
        <div style={{ marginTop: 6, color: 'var(--sage-300)', fontSize: 13 }}>Crew Bravo · 4 stops · 84mi · clock-in 7:00am</div>

        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { l: 'Stops', v: '4' },
            { l: 'Done', v: '1' },
            { l: 'Hours', v: '7.5' },
          ].map(s => (
            <div key={s.l} style={{ background: 'var(--moss-800)', padding: '10px 12px', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--sage-300)' }}>{s.l}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 90px' }}>
        <button style={{
          width: '100%', padding: 16, background: 'var(--gold-500)', color: 'var(--bark-700)',
          border: 'none', borderRadius: 12, fontWeight: 600, fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16,
          boxShadow: '0 4px 12px rgba(201, 168, 76, 0.4)',
        }}>
          <Icon.MapPin size={18} stroke="var(--bark-700)" />
          Clock in & start route
        </button>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '4px 0 8px' }}>Up next</div>

        {todayJobs.map((j, i) => (
          <div key={j.id} style={{
            background: 'white', borderRadius: 12, padding: 14, marginBottom: 10,
            border: i === 0 ? '2px solid var(--forest-600)' : '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="pin" style={{ width: 28, height: 28, fontSize: 13, background: i === 0 ? 'var(--forest-600)' : 'var(--cream-200)', color: i === 0 ? 'white' : 'var(--text-muted)' }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{j.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{j.client}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{j.address.split(',')[0]}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11 }}>
                  <span className="num"><Icon.Clock size={10} /> {j.start}–{j.end}</span>
                  <StatusBadge status={j.status} />
                </div>
              </div>
            </div>
            {i === 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-cta btn-sm" style={{ flex: 1, justifyContent: 'center' }}>Navigate</button>
                <button className="btn btn-sm btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>Details</button>
              </div>
            )}
          </div>
        ))}

        <div style={{ marginTop: 16, padding: 14, background: 'var(--gold-100)', borderRadius: 12, border: '1px solid var(--gold-300)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Icon.Drop size={20} stroke="var(--gold-700)" />
          <div style={{ flex: 1, fontSize: 12 }}>
            <strong>Friday rain</strong> — dispatcher may push some Friday jobs to Saturday. Stay tuned.
          </div>
        </div>
      </div>
    </>
  );
}

function CrewJob({ go }) {
  const j = JOBS.find(x => x.id === 'j5') || JOBS[1];
  return (
    <>
      <div style={{ background: 'var(--moss-900)', color: 'white', padding: '52px 16px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="icon-btn" style={{ background: 'var(--moss-800)', border: 'none' }}><Icon.ArrowLeft size={16} stroke="white" /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--sage-300)' }}>Stop 1 of 4 · in progress</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>{j.title}</div>
        </div>
        <button className="icon-btn" style={{ background: 'var(--moss-800)', border: 'none' }}><Icon.Phone size={14} stroke="white" /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 90px' }}>
        <div style={{ background: 'white', padding: 16, borderRadius: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>{j.client}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{j.address}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button className="btn btn-cta btn-sm" style={{ flex: 1, justifyContent: 'center' }}><Icon.MapPin size={12} />Navigate</button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}><Icon.Phone size={12} />Call</button>
          </div>
        </div>

        <div style={{ background: 'var(--gold-100)', padding: 12, borderRadius: 12, marginBottom: 12, border: '1px solid var(--gold-300)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold-700)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Access notes</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Side gate code <strong className="num">4218#</strong>. Dog-friendly but please latch back gate.</div>
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Checklist</div>
          {[
            { l: 'Clock in (GPS verified)', done: true },
            { l: 'Mow common areas', done: true },
            { l: 'Edge perimeter & sidewalks', done: false, active: true },
            { l: 'Blow-off sidewalks & lots', done: false },
            { l: 'Before/after photos', done: false },
            { l: 'Customer signature', done: false },
          ].map((c, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 0', borderBottom: i < 5 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: c.done ? 'var(--forest-600)' : c.active ? 'var(--gold-100)' : 'var(--cream-100)',
                border: c.active ? '2px solid var(--gold-500)' : '1px solid var(--border)',
                display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>
                {c.done && <Icon.Check size={12} stroke="white" />}
              </div>
              <div style={{ flex: 1, fontSize: 14, fontWeight: c.active ? 600 : 400, color: c.done ? 'var(--text-muted)' : 'var(--ink-900)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.l}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div className="flex-between mb-12">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Photos</div>
            <button style={{ fontSize: 11, color: 'var(--forest-600)', background: 'transparent', border: 'none', fontWeight: 600 }}>+ Add</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div className="photo-ph" style={{ height: 80, fontSize: 9 }}>before · entry</div>
            <div className="photo-ph" style={{ height: 80, fontSize: 9 }}>before · pool</div>
            <button style={{ height: 80, border: '2px dashed var(--border-strong)', borderRadius: 8, background: 'var(--cream-50)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <Icon.Camera size={20} stroke="var(--text-muted)" />
            </button>
          </div>
        </div>

        <button style={{ width: '100%', padding: 14, background: 'var(--st-issue)', color: 'white', border: 'none', borderRadius: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon.Flag size={16} stroke="white" />
          Flag an issue
        </button>
      </div>

      <div style={{ position: 'absolute', bottom: 70, left: 16, right: 16, padding: 14, background: 'var(--forest-600)', color: 'white', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 8px 24px rgba(61, 107, 44, 0.4)' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--sage-300)', textTransform: 'uppercase', fontWeight: 600 }}>Elapsed</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500 }} className="num">1h 12m</div>
        </div>
        <button style={{ background: 'var(--gold-500)', color: 'var(--bark-700)', border: 'none', padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: 14 }}>Mark complete</button>
      </div>
    </>
  );
}

function CrewRoute() {
  return (
    <>
      <div style={{ background: 'var(--moss-900)', color: 'white', padding: '52px 16px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--sage-300)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Today's route · 84mi</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, marginTop: 4 }}>Bravo · HOA day</div>
      </div>
      <div className="mapbox-fake" style={{ flex: 1, position: 'relative' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path d="M 60 380 L 120 280 L 200 220 L 280 140" fill="none" stroke="var(--gold-500)" strokeWidth="3" strokeDasharray="6 4" />
        </svg>
        {[
          { x: 60, y: 380, n: 1, t: 'NOW', l: 'Westwind' },
          { x: 120, y: 280, n: 2, t: '11:30', l: 'Sage Hills' },
          { x: 200, y: 220, n: 3, t: '13:00', l: 'Horse Heaven' },
          { x: 280, y: 140, n: 4, t: '15:00', l: 'Cedar Estates' },
        ].map(p => (
          <div key={p.n} style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}>
            <div className="pin" style={{ width: 30, height: 30, fontSize: 12, background: p.n === 1 ? 'var(--gold-500)' : 'var(--moss-900)', color: p.n === 1 ? 'var(--bark-700)' : 'white' }}>{p.n}</div>
            <div style={{ position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)', background: 'var(--moss-900)', color: 'white', fontSize: 10, padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>{p.t} · {p.l}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function CrewMe() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '52px 16px 90px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 24 }}>
        <Avatar name="Sarah Johnson" size={72} color="#C9A84C" />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, marginTop: 12 }}>Sarah Johnson</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lead · Crew Bravo · since 2022</div>
      </div>

      <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>This week</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { l: 'Hours', v: '34.5' },
            { l: 'Stops', v: '18' },
            { l: 'Miles driven', v: '342' },
            { l: 'Photos taken', v: '64' },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.l}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {['Time off requests', 'Pay stubs', 'Vehicle inspection', 'Settings', 'Sign out'].map((l, i, arr) => (
        <button key={l} style={{
          width: '100%', textAlign: 'left', padding: 16, background: 'white',
          border: '1px solid var(--border)', borderTop: i > 0 ? 'none' : undefined,
          borderRadius: i === 0 ? '12px 12px 0 0' : i === arr.length - 1 ? '0 0 12px 12px' : 0,
          display: 'flex', alignItems: 'center', gap: 12,
          fontWeight: 500, fontSize: 14, cursor: 'pointer',
          color: l === 'Sign out' ? 'var(--st-issue)' : 'var(--ink-900)',
        }}>
          <span style={{ flex: 1 }}>{l}</span>
          <Icon.ChevronRight size={14} stroke="var(--text-subtle)" />
        </button>
      ))}
    </div>
  );
}

function CrewMobile() {
  const [screen, setScreen] = React.useState('today');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 48, padding: 48, justifyContent: 'center', alignItems: 'start', minHeight: '100vh', background: 'var(--canvas)' }}>
      <div>
        <div className="page-eyebrow" style={{ marginBottom: 12, textAlign: 'center' }}>Crew · Today</div>
        <CrewPhoneShell screen="today" setScreen={setScreen}><CrewToday /></CrewPhoneShell>
      </div>
      <div>
        <div className="page-eyebrow" style={{ marginBottom: 12, textAlign: 'center' }}>Crew · Active job</div>
        <CrewPhoneShell screen="job" setScreen={setScreen}><CrewJob /></CrewPhoneShell>
      </div>
      <div>
        <div className="page-eyebrow" style={{ marginBottom: 12, textAlign: 'center' }}>Crew · Route map</div>
        <CrewPhoneShell screen="route" setScreen={setScreen}><CrewRoute /></CrewPhoneShell>
      </div>
      <div>
        <div className="page-eyebrow" style={{ marginBottom: 12, textAlign: 'center' }}>Crew · Profile</div>
        <CrewPhoneShell screen="me" setScreen={setScreen}><CrewMe /></CrewPhoneShell>
      </div>
    </div>
  );
}

window.CrewMobileScreens = { CrewMobile };
