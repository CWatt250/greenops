// Estimates, Invoices, Billing
const { CLIENTS, ESTIMATES, INVOICES, SERVICES } = window.GREENOPS;

// ============ ESTIMATES ============
function Estimates({ go }) {
  return (
    <>
      <Topbar crumbs={['Office', 'Estimates']} />
      <div className="page">
        <PageHeader
          eyebrow="6 active · 2 awaiting response"
          title="Estimates"
          sub="Build, send, and track quotes. Convert to jobs in one click."
          actions={<>
            <button className="btn btn-ghost"><Icon.Download size={14} />Export</button>
            <button className="btn btn-cta"><Icon.Plus size={14} />New estimate</button>
          </>}
        />

        <div className="grid grid-4 mb-24">
          <StatCard label="Active estimates" value="6" foot="$15,020 total" />
          <StatCard label="Sent · awaiting" value="2" foot="oldest 5 days" />
          <StatCard label="Acceptance rate" value="68%" delta="+8%" foot="last 30 days" />
          <StatCard label="Avg estimate" value="$2,503" delta="+$340" foot="vs last quarter" />
        </div>

        <div className="filter-bar">
          <input className="input input-search" placeholder="Search estimates..." />
          <Chips
            options={[
              { id: 'all', label: 'All', count: 6 },
              { id: 'draft', label: 'Drafts', count: 1 },
              { id: 'sent', label: 'Sent', count: 2 },
              { id: 'accepted', label: 'Accepted', count: 2 },
              { id: 'declined', label: 'Declined', count: 1 },
            ]} value="all" onChange={() => {}} />
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>#</th><th>Client</th><th>Title</th><th>Date</th><th>Status</th><th className="tbl-num">Amount</th><th></th>
            </tr></thead>
            <tbody>
              {ESTIMATES.map(e => (
                <tr key={e.id} className="clickable">
                  <td className="tbl-name num">{e.id}</td>
                  <td>{e.client}</td>
                  <td>{e.title}</td>
                  <td className="num">{e.date}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="tbl-num">${e.amount.toLocaleString()}</td>
                  <td>
                    <div className="flex gap-4" style={{ justifyContent: 'flex-end' }}>
                      {e.status === 'accepted' && <button className="btn btn-cta btn-sm">→ Job</button>}
                      <button className="icon-btn" style={{ width: 28, height: 28 }}><Icon.MoreH size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card mt-24" style={{ background: 'var(--moss-900)', color: 'white', borderColor: 'var(--moss-800)' }}>
          <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--gold-300)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Estimating tip</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginTop: 8, lineHeight: 1.3 }}>Your fall cleanup estimates close 4× higher when you include before/after photos from a similar property.</div>
            </div>
            <div className="grid grid-3 gap-12">
              <div className="photo-ph" style={{ height: 80 }}>before</div>
              <div className="photo-ph after" style={{ height: 80 }}>after</div>
              <div style={{ background: 'var(--moss-800)', borderRadius: 6, padding: 12, display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 12 }}>
                <div>
                  <strong style={{ color: 'var(--gold-500)', fontSize: 24, fontFamily: 'var(--font-display)' }}>4×</strong>
                  <div style={{ color: 'var(--sage-300)' }}>close rate</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ INVOICES ============
function Invoices({ go }) {
  return (
    <>
      <Topbar crumbs={['Office', 'Invoices']} />
      <div className="page">
        <PageHeader
          eyebrow="May 2026"
          title="Invoices"
          sub="Track every invoice from draft through paid."
          actions={<>
            <button className="btn btn-ghost"><Icon.Download size={14} />Export</button>
            <button className="btn btn-cta"><Icon.Plus size={14} />New invoice</button>
          </>}
        />

        <div className="grid grid-4 mb-24">
          <StatCard label="Outstanding" value="$23,640" delta="-$2,840" foot="6 invoices" />
          <StatCard label="Overdue" value="$2,450" delta="+$470" foot="2 invoices" />
          <StatCard label="Collected MTD" value="$48,240" delta="+18%" foot="vs last May" />
          <StatCard label="Avg days to pay" value="14.2" delta="-1.8" foot="industry avg 22" />
        </div>

        <div className="filter-bar">
          <input className="input input-search" placeholder="Search invoices..." />
          <Chips
            options={[
              { id: 'all', label: 'All', count: 84 },
              { id: 'draft', label: 'Drafts', count: 3 },
              { id: 'sent', label: 'Sent', count: 4 },
              { id: 'overdue', label: 'Overdue', count: 2 },
              { id: 'paid', label: 'Paid', count: 75 },
            ]} value="all" onChange={() => {}} />
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th>Status</th><th className="tbl-num">Amount</th><th className="tbl-num">Balance</th><th></th>
            </tr></thead>
            <tbody>
              {INVOICES.map(inv => {
                const balance = inv.amount - inv.paid;
                const dueDate = new Date(inv.due);
                const daysLate = inv.status === 'overdue' ? Math.ceil((new Date('2026-05-07') - dueDate) / (1000 * 60 * 60 * 24)) : 0;
                return (
                  <tr key={inv.id} className="clickable" onClick={() => go('invoices', { sub: 'detail', id: inv.id })}>
                    <td className="tbl-name num">{inv.id}</td>
                    <td>{inv.client}</td>
                    <td className="num">{inv.date}</td>
                    <td className="num">
                      {inv.due}
                      {daysLate > 0 && <div style={{ fontSize: 11, color: 'var(--st-issue)', fontFamily: 'var(--font-sans)' }}>{daysLate}d late</div>}
                    </td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td className="tbl-num">${inv.amount.toLocaleString()}</td>
                    <td className="tbl-num" style={{ color: balance > 0 ? 'var(--ink-900)' : 'var(--text-subtle)' }}>{balance > 0 ? `$${balance.toLocaleString()}` : '—'}</td>
                    <td><Icon.ChevronRight size={14} stroke="var(--text-subtle)" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ NEW INVOICE ============
function NewInvoice({ go }) {
  return (
    <>
      <Topbar crumbs={['Office', 'Invoices', 'New']} />
      <div className="page" style={{ maxWidth: 880 }}>
        <PageHeader
          eyebrow="Auto-generated from job TLC-J-1042"
          title="New invoice"
          actions={<>
            <button className="btn btn-ghost" onClick={() => go('invoices')}>Cancel</button>
            <button className="btn btn-ghost"><Icon.Eye size={14} />Preview</button>
            <button className="btn btn-cta">Send invoice<Icon.Send size={14} /></button>
          </>}
        />

        <div className="card card-pad-lg mb-16">
          <div className="grid grid-3 gap-16">
            <div><label className="label">Invoice number</label><input className="input num" defaultValue="TLC-1043" style={{ width: '100%' }} /></div>
            <div><label className="label">Issue date</label><input className="input" defaultValue="2026-05-07" style={{ width: '100%' }} /></div>
            <div><label className="label">Due date</label><input className="input" defaultValue="2026-06-06" style={{ width: '100%' }} /></div>
          </div>
          <div className="rule"></div>
          <div className="label">Bill to</div>
          <div className="card card-pad mt-8">
            <div className="flex-between">
              <div>
                <strong>Westwind HOA</strong>
                <div className="tbl-sub">1200 Westwind Way, Richland, WA 99354</div>
                <div className="tbl-sub">board@westwindhoa.org</div>
              </div>
              <button className="btn btn-ghost btn-sm">Change client</button>
            </div>
          </div>
        </div>

        <div className="card mb-16">
          <div className="card-head">
            <div className="card-title">Line items</div>
            <button className="btn btn-ghost btn-sm"><Icon.Plus size={12} />Add item</button>
          </div>
          <table className="tbl">
            <thead><tr><th>Description</th><th className="tbl-num">Qty</th><th className="tbl-num">Rate</th><th className="tbl-num">Amount</th><th></th></tr></thead>
            <tbody>
              <tr><td className="tbl-name">May 7 — Common areas mow & edge</td><td className="tbl-num">1</td><td className="tbl-num">$1,200.00</td><td className="tbl-num">$1,200.00</td><td><Icon.X size={14} /></td></tr>
              <tr><td className="tbl-name">May 7 — Sprinkler tune-up (3 zones)</td><td className="tbl-num">3</td><td className="tbl-num">$145.00</td><td className="tbl-num">$435.00</td><td><Icon.X size={14} /></td></tr>
              <tr><td className="tbl-name">May 7 — Mulch refresh, entry beds</td><td className="tbl-num">1</td><td className="tbl-num">$640.00</td><td className="tbl-num">$640.00</td><td><Icon.X size={14} /></td></tr>
            </tbody>
          </table>
          <div style={{ padding: 20, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="flex-between"><span style={{ color: 'var(--text-muted)' }}>Subtotal</span><span className="num">$2,275.00</span></div>
              <div className="flex-between"><span style={{ color: 'var(--text-muted)' }}>Markup (8%)</span><span className="num">$182.00</span></div>
              <div className="flex-between"><span style={{ color: 'var(--text-muted)' }}>Tax (8.6%)</span><span className="num">$211.30</span></div>
              <div className="rule" style={{ margin: '6px 0' }}></div>
              <div className="flex-between" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500 }}><span>Total</span><span>$2,668.30</span></div>
            </div>
          </div>
        </div>

        <div className="card card-pad-lg">
          <div className="card-title mb-12">Notes & terms</div>
          <textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical' }}
            defaultValue="Thank you for your business. Net 30. Late payments accrue 1.5%/month after due date." />
        </div>
      </div>
    </>
  );
}

// ============ INVOICE DETAIL ============
function InvoiceDetail({ go, id = 'TLC-1042' }) {
  const inv = INVOICES.find(x => x.id === id) || INVOICES[0];
  return (
    <>
      <Topbar crumbs={['Office', 'Invoices', inv.id]} />
      <div className="page">
        <PageHeader
          eyebrow={<><span className="num">{inv.id}</span> · <StatusBadge status={inv.status} /></>}
          title={`Invoice for ${inv.client}`}
          sub={`Issued ${inv.date} · Due ${inv.due}`}
          actions={<>
            <button className="btn btn-ghost"><Icon.Download size={14} />PDF</button>
            <button className="btn btn-ghost"><Icon.Send size={14} />Resend</button>
            <button className="btn btn-cta"><Icon.CreditCard size={14} />Record payment</button>
          </>}
        />

        <div className="grid grid-3-2 gap-24">
          <div className="card" style={{ background: 'white' }}>
            <div style={{ padding: 36, borderBottom: '1px solid var(--border)' }}>
              <div className="flex-between mb-16">
                <div>
                  <Logo size={40} />
                  <div style={{ marginTop: 12, fontFamily: 'var(--font-display)', fontSize: 18 }}>TLC Landscape Management</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>1053 S Highland Dr<br />Kennewick, WA 99337<br />(509) 627-9384</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, color: 'var(--moss-900)' }}>Invoice</div>
                  <div className="num" style={{ marginTop: 4, color: 'var(--text-muted)' }}>{inv.id}</div>
                </div>
              </div>

              <div className="grid grid-2 gap-24 mt-24">
                <div>
                  <div className="label">Bill to</div>
                  <strong>{inv.client}</strong>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>1200 Westwind Way<br/>Richland, WA 99354</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="grid grid-2 gap-8" style={{ fontSize: 13 }}>
                    <div style={{ color: 'var(--text-muted)' }}>Issued</div><div className="num">{inv.date}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Due</div><div className="num">{inv.due}</div>
                    <div style={{ color: 'var(--text-muted)' }}>Terms</div><div>Net 30</div>
                  </div>
                </div>
              </div>
            </div>

            <table className="tbl">
              <thead><tr><th>Description</th><th className="tbl-num">Qty</th><th className="tbl-num">Rate</th><th className="tbl-num">Amount</th></tr></thead>
              <tbody>
                <tr><td className="tbl-name">Common areas mow & edge — May 7</td><td className="tbl-num">1</td><td className="tbl-num">$1,200.00</td><td className="tbl-num">$1,200.00</td></tr>
                <tr><td className="tbl-name">Mulch refresh — entry beds</td><td className="tbl-num">1</td><td className="tbl-num">$640.00</td><td className="tbl-num">$640.00</td></tr>
                <tr><td className="tbl-name">Sprinkler tune-up — 3 zones</td><td className="tbl-num">3</td><td className="tbl-num">$145.00</td><td className="tbl-num">$435.00</td></tr>
                <tr><td className="tbl-name">Common areas mow & edge — Apr 30</td><td className="tbl-num">1</td><td className="tbl-num">$1,200.00</td><td className="tbl-num">$1,200.00</td></tr>
                <tr><td className="tbl-name">Common areas mow & edge — Apr 23</td><td className="tbl-num">1</td><td className="tbl-num">$1,200.00</td><td className="tbl-num">$1,200.00</td></tr>
              </tbody>
            </table>

            <div style={{ padding: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ minWidth: 280 }}>
                <div className="flex-between" style={{ padding: '6px 0' }}><span style={{ color: 'var(--text-muted)' }}>Subtotal</span><span className="num">$4,675.00</span></div>
                <div className="flex-between" style={{ padding: '6px 0' }}><span style={{ color: 'var(--text-muted)' }}>Tax (8.6%)</span><span className="num">$402.05</span></div>
                <div className="rule" style={{ margin: '8px 0' }}></div>
                <div className="flex-between" style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, padding: '6px 0' }}><span>Total due</span><span>${inv.amount.toLocaleString()}.00</span></div>
              </div>
            </div>

            <div style={{ background: 'var(--cream-50)', padding: 24, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
              Thank you for your business. Net 30. Late payments accrue 1.5%/month after due date. Pay online via the customer portal or mail check to address above.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card card-pad-lg">
              <div className="label">Balance due</div>
              <MoneyFmt big value={inv.amount - inv.paid} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>of ${inv.amount.toLocaleString()} total</div>
              <div style={{ height: 6, background: 'var(--cream-200)', borderRadius: 3, marginTop: 16, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--forest-600)', width: `${(inv.paid / inv.amount) * 100}%` }}></div>
              </div>
              <div className="rule"></div>
              <button className="btn btn-cta" style={{ width: '100%', justifyContent: 'center' }}>Record payment</button>
            </div>

            <div className="card">
              <div className="card-head"><div className="card-title">Payment history</div></div>
              {inv.paid > 0 ? (
                <div style={{ padding: '12px 20px' }}>
                  <div className="flex-between" style={{ padding: '8px 0' }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>Check #4421</div>
                      <div className="tbl-sub">May 3, 2026</div>
                    </div>
                    <span className="num">${inv.paid.toLocaleString()}.00</span>
                  </div>
                </div>
              ) : (
                <div className="empty" style={{ padding: 24 }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No payments yet</div>
                </div>
              )}
            </div>

            <div className="card card-pad">
              <div className="card-title mb-12">Send & track</div>
              <div className="timeline">
                <div className="t-item gold"><div className="t-time">May 1, 9:14am</div><div className="t-text">Sent to board@westwindhoa.org</div></div>
                <div className="t-item"><div className="t-time">May 2, 11:42am</div><div className="t-text">Viewed (3 minutes)</div></div>
                <div className="t-item"><div className="t-time">May 3, 8:30am</div><div className="t-text">Reminder email sent (auto)</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============ BILLING ============
function Billing({ go }) {
  return (
    <>
      <Topbar crumbs={['Office', 'Billing']} />
      <div className="page">
        <PageHeader
          eyebrow="Recurring billing schedules"
          title="Billing"
          sub="Auto-invoice schedules and payment routing."
          actions={<button className="btn btn-cta"><Icon.Plus size={14} />New schedule</button>}
        />

        <div className="grid grid-3 mb-24">
          <StatCard label="Active schedules" value="42" foot="across 31 clients" />
          <StatCard label="Auto-billed MTD" value="$36,420" delta="+12%" foot="76% of revenue" />
          <StatCard label="Failed charges" value="2" foot="2 cards expired" />
        </div>

        <Tabs value="schedules" onChange={() => {}} tabs={[
          { id: 'schedules', label: 'Schedules', count: 42 },
          { id: 'methods', label: 'Payment methods' },
          { id: 'tax', label: 'Tax settings' },
        ]} />

        <div className="grid grid-2 gap-16">
          {[
            { c: 'Westwind HOA', svc: 'Common areas mow + edge', cad: 'Weekly · Mon', amt: 1200, next: 'May 11', method: 'ACH ··0421', status: 'active' },
            { c: 'Sage Hills HOA', svc: 'Bi-weekly mow + fertilization', cad: 'Bi-weekly · Wed', amt: 880, next: 'May 14', method: 'ACH ··0188', status: 'active' },
            { c: 'Tri-City Medical', svc: 'Weekly maintenance', cad: 'Weekly · Tue', amt: 540, next: 'May 12', method: 'Card ··4242', status: 'active' },
            { c: 'Pasco School District', svc: 'Monthly grounds package', cad: 'Monthly · 1st', amt: 6480, next: 'Jun 1', method: 'Check (manual)', status: 'active' },
            { c: 'Maria Chen', svc: 'Weekly mow & edge', cad: 'Weekly · Thu', amt: 65, next: 'May 14', method: 'Card ··2121 EXPIRED', status: 'failed' },
            { c: 'Linda Vasquez', svc: 'Weekly mow & edge', cad: 'Weekly · Thu', amt: 85, next: 'May 14', method: 'Card ··0091', status: 'active' },
          ].map((s, i) => (
            <div key={i} className="card card-pad" style={{ borderColor: s.status === 'failed' ? 'var(--st-issue)' : 'var(--border)' }}>
              <div className="flex-between mb-8">
                <div>
                  <div style={{ fontWeight: 500 }}>{s.c}</div>
                  <div className="tbl-sub">{s.svc}</div>
                </div>
                {s.status === 'failed' ? <span className="badge badge-issue"><span className="dot"></span>Card failed</span> : <Toggle on={true} onChange={() => {}} />}
              </div>
              <div className="grid grid-3 gap-12 mt-12" style={{ fontSize: 12 }}>
                <div><div className="label">Cadence</div><div style={{ fontWeight: 500 }}>{s.cad}</div></div>
                <div><div className="label">Amount</div><div className="num" style={{ fontWeight: 500 }}>${s.amt.toLocaleString()}</div></div>
                <div><div className="label">Next</div><div className="num" style={{ fontWeight: 500 }}>{s.next}</div></div>
              </div>
              <div className="rule"></div>
              <div className="flex-between" style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Payment method</span>
                <span className="num" style={{ color: s.status === 'failed' ? 'var(--st-issue)' : 'var(--text)' }}>{s.method}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

window.FinanceScreens = { Estimates, Invoices, NewInvoice, InvoiceDetail, Billing };
