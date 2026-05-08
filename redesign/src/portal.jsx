// Customer Portal — light, friendly, single-property focused
const { CLIENTS, JOBS, INVOICES } = window.GREENOPS;

function PortalShell({ children, page, setPage }) {
  return (
    <div className="portal-shell">
      <header className="portal-top">
        <div className="flex-center gap-12">
          <Logo size={28} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>TLC Landscape</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Customer portal</div>
          </div>
        </div>
        <nav className="flex gap-4">
          {[
            { id: 'home', label: 'Home', icon: 'Home' },
            { id: 'jobs', label: 'My services', icon: 'Calendar' },
            { id: 'invoices', label: 'Billing', icon: 'Receipt' },
            { id: 'request', label: 'Request work', icon: 'Plus' },
          ].map(t => {
            const Ico = Icon[t.icon];
            return (
              <button key={t.id} className="portal-link" onClick={() => setPage(t.id)}
                style={page === t.id ? { background: 'var(--sage-100)', color: 'var(--moss-900)' } : {}}>
                <Ico size={14} stroke={page === t.id ? 'var(--forest-600)' : 'var(--text-muted)'} />
                {t.label}
              </button>
            );
          })}
        </nav>
        <div className="flex-center gap-8">
          <button className="icon-btn"><Icon.Bell size={15} /></button>
          <Avatar name="Maria Chen" size={32} />
        </div>
      </header>
      <div style={{ padding: '32px 48px', maxWidth: 1280, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

function PortalHome({ go }) {
  const next = JOBS.find(j => j.clientId === 'c1') || JOBS[0];
  return (
    <>
      <div className="mb-24">
        <div className="page-eyebrow">Hello, Maria</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 500, margin: '4px 0 6px', letterSpacing: '-0.02em' }}>Your yard, looking sharp.</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: 0 }}>4218 Riverwood Ln · client since 2023 · weekly mow on Thursdays</p>
      </div>

      <div className="grid grid-3-2 gap-24 mb-24">
        <div className="card" style={{ background: 'linear-gradient(135deg, var(--moss-900) 0%, var(--forest-800) 100%)', color: 'white', borderColor: 'var(--moss-800)' }}>
          <div className="card-pad-lg" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gold-300)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Next visit</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, margin: '8px 0 4px' }}>Thursday, May 14</div>
              <div style={{ color: 'var(--sage-300)' }}>Between 8:00 – 9:00 AM · Weekly Mow & Edge</div>
              <div className="rule" style={{ background: 'var(--moss-800)' }}></div>
              <div className="flex gap-12">
                <div>
                  <div style={{ fontSize: 11, color: 'var(--sage-300)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Crew</div>
                  <div style={{ fontWeight: 500, marginTop: 4 }}>Crew Alpha · Diego M.</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--sage-300)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Forecast</div>
                  <div style={{ fontWeight: 500, marginTop: 4 }}>72° · Sunny</div>
                </div>
              </div>
            </div>
            <div style={{ width: 120, height: 120, borderRadius: 12, background: 'var(--moss-800)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon.Calendar size={48} stroke="var(--gold-500)" />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--moss-800)', padding: 16, display: 'flex', gap: 8 }}>
            <button className="btn btn-cta btn-sm">Reschedule</button>
            <button className="btn btn-sm" style={{ background: 'transparent', border: '1px solid var(--moss-700)', color: 'var(--cream-100)' }}>Skip this week</button>
            <button className="btn btn-sm" style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--moss-700)', color: 'var(--cream-100)' }}>Add to calendar</button>
          </div>
        </div>

        <div className="card card-pad-lg">
          <div className="label">Account at a glance</div>
          <div className="rule" style={{ marginTop: 12 }}></div>
          <div className="flex-between" style={{ padding: '8px 0' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Balance</span>
            <strong className="num" style={{ color: 'var(--forest-600)' }}>$0.00 ✓</strong>
          </div>
          <div className="flex-between" style={{ padding: '8px 0' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Last paid</span>
            <span className="num" style={{ fontWeight: 500 }}>Apr 22 · $260</span>
          </div>
          <div className="flex-between" style={{ padding: '8px 0' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Visits YTD</span>
            <span className="num" style={{ fontWeight: 500 }}>12 jobs</span>
          </div>
          <div className="flex-between" style={{ padding: '8px 0' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Saved on auto-pay</span>
            <span className="num" style={{ fontWeight: 500, color: 'var(--gold-700)' }}>$24.50</span>
          </div>
          <button className="btn btn-ghost mt-12" style={{ width: '100%', justifyContent: 'center' }}>Manage payment</button>
        </div>
      </div>

      <div className="grid grid-2 gap-24 mb-24">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Recent visits</div>
            <button className="btn btn-sm btn-ghost" onClick={() => go('jobs')}>See all</button>
          </div>
          <div style={{ padding: 4 }}>
            {[
              { d: 'Thu May 7', t: 'Weekly Mow & Edge', sub: 'Crew Alpha · Diego M.', dur: '1h 12m', photos: 4 },
              { d: 'Thu Apr 30', t: 'Weekly Mow & Edge', sub: 'Crew Alpha · Diego M.', dur: '1h 4m', photos: 3 },
              { d: 'Thu Apr 23', t: 'Weekly Mow & Edge + spring fert', sub: 'Crew Alpha · Diego M.', dur: '1h 38m', photos: 4 },
            ].map((v, i) => (
              <div key={i} style={{ padding: '14px 20px', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ textAlign: 'center', flexShrink: 0, width: 56 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{v.d.split(' ')[1]}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, lineHeight: 1 }}>{v.d.split(' ')[2]}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{v.t}</div>
                  <div className="tbl-sub">{v.sub} · {v.dur}</div>
                </div>
                <div className="flex gap-2">
                  <div className="photo-ph" style={{ width: 44, height: 44, fontSize: 9 }}>before</div>
                  <div className="photo-ph after" style={{ width: 44, height: 44, fontSize: 9 }}>after</div>
                </div>
                <Icon.ChevronRight size={14} stroke="var(--text-subtle)" />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Quick requests</div>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Extra mow', sub: 'Adds $65', icon: 'Leaf' },
              { l: 'Hedge trim', sub: 'Quote', icon: 'Sparkle' },
              { l: 'Sprinkler check', sub: '$95 flat', icon: 'Drop' },
              { l: 'Mulch refresh', sub: 'Quote', icon: 'Layers' },
              { l: 'Tree pruning', sub: 'Quote', icon: 'Leaf' },
              { l: 'Something else', sub: 'Tell us', icon: 'Plus' },
            ].map((q, i) => {
              const Ico = Icon[q.icon];
              return (
                <button key={i} className="card card-pad" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go('request')}>
                  <Ico size={18} stroke="var(--forest-600)" />
                  <div style={{ fontWeight: 500, marginTop: 6 }}>{q.l}</div>
                  <div className="tbl-sub">{q.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--cream-50)' }}>
        <div className="card-head">
          <div>
            <div className="card-title">Seasonal tip from your crew</div>
            <div className="card-sub">Diego, Crew Alpha lead</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 24, padding: 20 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            We noticed your front lawn is greening up nicely after spring fert. With Memorial Day weekend coming, it's a great time for an aeration + overseed combo — your soil is just compacted enough that it'll make a big difference for July & August color. Quote takes 30 seconds.
          </p>
          <button className="btn btn-cta" style={{ alignSelf: 'center', justifyContent: 'center' }}>Get a quote<Icon.ArrowRight size={14} /></button>
        </div>
      </div>
    </>
  );
}

function PortalJobs({ go }) {
  return (
    <>
      <div className="mb-24">
        <div className="page-eyebrow">12 visits this year</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 500, margin: '4px 0 6px' }}>My services</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: 0 }}>Every visit, photo, and note for 4218 Riverwood Ln.</p>
      </div>

      <div className="filter-bar">
        <Chips options={[
          { id: 'all', label: 'All', count: 12 },
          { id: 'upcoming', label: 'Upcoming', count: 4 },
          { id: 'complete', label: 'Complete', count: 8 },
        ]} value="all" onChange={() => {}} />
      </div>

      <div className="card mb-16">
        <div className="card-pad-lg" style={{ display: 'grid', gridTemplateColumns: '120px 1fr 200px', gap: 20, alignItems: 'center', background: 'var(--sage-100)' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Thu, May</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 500, lineHeight: 1, color: 'var(--moss-900)' }}>14</div>
            <div className="num" style={{ fontSize: 12, marginTop: 4 }}>8:00 AM</div>
          </div>
          <div>
            <StatusBadge status="scheduled" />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, marginTop: 8 }}>Weekly Mow & Edge</div>
            <div className="tbl-sub">Crew Alpha · Diego Marin · estimated 1h 15m</div>
            <div className="rule"></div>
            <div className="flex gap-16" style={{ fontSize: 12 }}>
              <div className="flex-center gap-4"><Icon.MapPin size={12} stroke="var(--text-muted)" /> 4218 Riverwood Ln</div>
              <div className="flex-center gap-4"><Icon.Cloud size={12} stroke="var(--text-muted)" /> 72°F sunny</div>
              <div className="flex-center gap-4"><Icon.Receipt size={12} stroke="var(--text-muted)" /> $65 · auto-charged after</div>
            </div>
          </div>
          <div className="flex gap-8" style={{ flexDirection: 'column' }}>
            <button className="btn btn-cta">Reschedule</button>
            <button className="btn btn-ghost btn-sm">Skip this week</button>
          </div>
        </div>
      </div>

      {[
        { d: 'May 7', sub: 'Weekly Mow & Edge', status: 'complete', total: '$65.00', notes: 'Lawn looking great. Edged extra crisp around the rose bed per your request.' },
        { d: 'Apr 30', sub: 'Weekly Mow & Edge', status: 'complete', total: '$65.00', notes: '' },
        { d: 'Apr 23', sub: 'Weekly Mow + spring fertilization', status: 'complete', total: '$130.00', notes: 'Granular fert applied — water deeply within 24h for best results.' },
        { d: 'Apr 16', sub: 'Weekly Mow & Edge', status: 'complete', total: '$65.00', notes: '' },
      ].map((v, i) => (
        <div key={i} className="card mb-12" style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 20, padding: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{v.d.split(' ')[0]}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, lineHeight: 1 }}>{v.d.split(' ')[1]}</div>
          </div>
          <div>
            <div className="flex-center gap-8 mb-4"><strong>{v.sub}</strong><StatusBadge status={v.status} /></div>
            {v.notes && <div className="tbl-sub" style={{ fontStyle: 'italic' }}>"{v.notes}"</div>}
            <div className="flex gap-4 mt-8">
              <div className="photo-ph" style={{ width: 56, height: 56, fontSize: 9 }}>before</div>
              <div className="photo-ph after" style={{ width: 56, height: 56, fontSize: 9 }}>after</div>
              <div className="photo-ph" style={{ width: 56, height: 56, fontSize: 9 }}>back</div>
              <div className="photo-ph after" style={{ width: 56, height: 56, fontSize: 9 }}>edges</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500 }}>{v.total}</div>
            <div className="tbl-sub">paid · {v.d}</div>
            <button className="btn btn-ghost btn-sm mt-8">View receipt</button>
          </div>
        </div>
      ))}
    </>
  );
}

function PortalInvoices({ go }) {
  return (
    <>
      <div className="mb-24">
        <div className="page-eyebrow">Billing & invoices</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 500, margin: '4px 0 6px' }}>You're all paid up.</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: 0 }}>Auto-pay is enabled — invoices charge to Visa ··2121 the day after each visit.</p>
      </div>

      <div className="grid grid-3 mb-24">
        <div className="card card-pad-lg">
          <div className="label">Current balance</div>
          <MoneyFmt big value={0} />
          <div style={{ color: 'var(--forest-600)', fontSize: 13, marginTop: 4 }}>✓ Up to date</div>
        </div>
        <div className="card card-pad-lg">
          <div className="label">Paid YTD</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, marginTop: 8 }}>$1,140.00</div>
          <div className="tbl-sub">across 12 visits</div>
        </div>
        <div className="card card-pad-lg" style={{ background: 'var(--gold-100)', borderColor: 'var(--gold-300)' }}>
          <div className="label">Auto-pay savings</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, marginTop: 8, color: 'var(--gold-700)' }}>$24.50</div>
          <div className="tbl-sub">5% off · enabled Apr 2024</div>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-head"><div className="card-title">Invoices</div></div>
        <table className="tbl">
          <thead><tr><th>Invoice</th><th>For</th><th>Date</th><th>Status</th><th className="tbl-num">Amount</th><th></th></tr></thead>
          <tbody>
            {[
              { id: 'TLC-1043', for: 'Weekly Mow & Edge · May 7', d: 'May 8', s: 'paid', a: 65 },
              { id: 'TLC-1038', for: 'Weekly Mow & Edge · Apr 30', d: 'May 1', s: 'paid', a: 65 },
              { id: 'TLC-1031', for: 'Weekly Mow + spring fert · Apr 23', d: 'Apr 24', s: 'paid', a: 130 },
              { id: 'TLC-1024', for: 'Weekly Mow & Edge · Apr 16', d: 'Apr 17', s: 'paid', a: 65 },
              { id: 'TLC-1017', for: 'Weekly Mow & Edge · Apr 9', d: 'Apr 10', s: 'paid', a: 65 },
              { id: 'TLC-1010', for: 'Weekly Mow & Edge · Apr 2', d: 'Apr 3', s: 'paid', a: 65 },
            ].map(inv => (
              <tr key={inv.id} className="clickable">
                <td className="tbl-name num">{inv.id}</td>
                <td>{inv.for}</td>
                <td className="num">{inv.d}</td>
                <td><StatusBadge status={inv.s} /></td>
                <td className="tbl-num">${inv.a}.00</td>
                <td><Icon.Download size={14} stroke="var(--text-subtle)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad-lg">
        <div className="card-title mb-16">Payment method</div>
        <div className="flex-between" style={{ padding: 16, background: 'var(--cream-50)', borderRadius: 8 }}>
          <div className="flex-center gap-12">
            <div style={{ width: 44, height: 30, background: 'linear-gradient(135deg, #1a1f71 0%, #4264c8 100%)', borderRadius: 4, display: 'grid', placeItems: 'center', color: 'white', fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-display)' }}>VISA</div>
            <div>
              <div style={{ fontWeight: 500 }} className="num">Visa ending in 2121</div>
              <div className="tbl-sub">Expires 09/27</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm">Update</button>
        </div>
        <div className="flex-center gap-8 mt-16">
          <Toggle on={true} onChange={() => {}} />
          <span style={{ fontWeight: 500 }}>Auto-pay enabled</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>Save 5% on every invoice</span>
        </div>
      </div>
    </>
  );
}

function PortalRequest({ go }) {
  const [step, setStep] = React.useState(2);
  return (
    <>
      <div className="mb-24">
        <div className="page-eyebrow">Step {step} of 3</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 500, margin: '4px 0 6px' }}>Request work</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: 0 }}>Tell us what you need. We'll get back within 24 hours with a quote.</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? 'var(--forest-600)' : 'var(--cream-200)' }}></div>
        ))}
      </div>

      <div className="card card-pad-lg mb-16">
        <div className="card-title mb-16">What kind of work?</div>
        <div className="grid grid-3 gap-12">
          {[
            { id: 'mow', l: 'Extra mow', s: 'One-time visit', icon: 'Leaf' },
            { id: 'hedge', l: 'Hedge / shrub trim', s: '1+ areas', icon: 'Sparkle', sel: true },
            { id: 'tree', l: 'Tree work', s: 'Pruning, removal', icon: 'Leaf' },
            { id: 'mulch', l: 'Mulch refresh', s: 'Beds & borders', icon: 'Layers' },
            { id: 'sprink', l: 'Sprinkler', s: 'Repair, tune-up', icon: 'Drop' },
            { id: 'other', l: 'Something else', s: 'Tell us in the notes', icon: 'Plus' },
          ].map(o => {
            const Ico = Icon[o.icon];
            return (
              <button key={o.id} className="card card-pad" style={{
                border: o.sel ? '2px solid var(--forest-600)' : '1px solid var(--border)',
                background: o.sel ? 'var(--sage-100)' : 'var(--surface)',
                textAlign: 'left', cursor: 'pointer'
              }}>
                <Ico size={20} stroke={o.sel ? 'var(--forest-600)' : 'var(--text-muted)'} />
                <div style={{ fontWeight: 500, marginTop: 8 }}>{o.l}</div>
                <div className="tbl-sub">{o.s}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card card-pad-lg mb-16">
        <div className="card-title mb-16">Tell us a bit more</div>
        <div><label className="label">Describe what you need</label>
          <textarea className="input" rows={4} style={{ width: '100%', resize: 'vertical' }}
            defaultValue="The boxwoods along the front walk are getting leggy and the privets next to the driveway need shaping. Probably 4 hours of work?" />
        </div>

        <div className="grid grid-2 gap-16 mt-16">
          <div>
            <label className="label">When works for you?</label>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              <button className="chip">ASAP</button>
              <button className="chip active">This week</button>
              <button className="chip">Next 2 weeks</button>
              <button className="chip">No rush</button>
            </div>
          </div>
          <div>
            <label className="label">Budget range (optional)</label>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              <button className="chip">Under $200</button>
              <button className="chip active">$200 – $500</button>
              <button className="chip">$500 – $1,000</button>
              <button className="chip">$1,000+</button>
            </div>
          </div>
        </div>

        <div className="mt-16">
          <label className="label">Photos (helps us quote faster)</label>
          <div className="grid grid-4 gap-8">
            <div className="photo-ph" style={{ height: 90, fontSize: 10 }}>front walk</div>
            <div className="photo-ph" style={{ height: 90, fontSize: 10 }}>privet</div>
            <button style={{ height: 90, border: '2px dashed var(--border-strong)', borderRadius: 8, background: 'var(--cream-50)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <Icon.Plus size={20} />
                <div style={{ fontSize: 11, marginTop: 4 }}>Add photo</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-between">
        <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
        <button className="btn btn-cta" onClick={() => setStep(3)}>Continue<Icon.ArrowRight size={14} /></button>
      </div>
    </>
  );
}

window.PortalScreens = { PortalShell, PortalHome, PortalJobs, PortalInvoices, PortalRequest };
