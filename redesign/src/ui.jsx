// Shared UI primitives for GreenOps

const cx = (...a) => a.filter(Boolean).join(' ');

function Logo({ size = 38 }) {
  return (
    <div className="sidebar-mark" style={{ width: size, height: size }}>
      <img src="src/tlc-logo.png" alt="TLC Landscape Management" />
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    scheduled: { cls: 'badge-scheduled', label: 'Scheduled' },
    in_progress: { cls: 'badge-progress', label: 'In Progress' },
    complete: { cls: 'badge-complete', label: 'Complete' },
    issue: { cls: 'badge-issue', label: 'Issue' },
    unscheduled: { cls: 'badge-unscheduled', label: 'Unscheduled' },
    paid: { cls: 'badge-paid', label: 'Paid' },
    sent: { cls: 'badge-scheduled', label: 'Sent' },
    viewed: { cls: 'badge-progress', label: 'Viewed' },
    overdue: { cls: 'badge-overdue', label: 'Overdue' },
    draft: { cls: 'badge-draft', label: 'Draft' },
    accepted: { cls: 'badge-complete', label: 'Accepted' },
    declined: { cls: 'badge-issue', label: 'Declined' },
    active: { cls: 'badge-complete', label: 'Active' },
    prospect: { cls: 'badge-scheduled', label: 'Prospect' },
    inactive: { cls: 'badge-draft', label: 'Inactive' },
  };
  const m = map[status] || { cls: 'badge-draft', label: status };
  return <span className={`badge ${m.cls}`}><span className="dot"></span>{m.label}</span>;
}

function PropertyTag({ type }) {
  const map = {
    residential: { cls: 'tag-residential', label: 'Residential', icon: <Icon.Home size={11} /> },
    commercial: { cls: 'tag-commercial', label: 'Commercial', icon: <Icon.Building size={11} /> },
    hoa: { cls: 'tag-hoa', label: 'HOA', icon: <Icon.Houses size={11} /> },
  };
  const m = map[type] || { cls: '', label: type };
  return <span className={`tag ${m.cls}`}>{m.icon}{m.label}</span>;
}

function StatCard({ label, value, delta, deltaLabel, foot, spark }) {
  const isUp = delta && delta.startsWith('+');
  const isDown = delta && delta.startsWith('-');
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-meta">
        {delta && (
          <span className={isUp ? 'delta-up' : isDown ? 'delta-down' : 'delta-neutral'}>
            {isUp && <Icon.ArrowUp size={11} />}
            {isDown && <Icon.ArrowDown size={11} />}
            {' '}{delta}
          </span>
        )}
        {foot && <span className="stat-foot">{foot}</span>}
      </div>
      {spark && <Sparkline points={spark} />}
    </div>
  );
}

function Sparkline({ points, color = 'var(--forest-500)' }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 200, h = 38;
  const stepX = w / (points.length - 1);
  const path = points.map((p, i) => {
    const x = i * stepX;
    const y = h - ((p - min) / (max - min || 1)) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  const fill = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg className="stat-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={fill} fill={color} opacity="0.08" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function PageHeader({ eyebrow, title, sub, actions, noRule }) {
  return (
    <div className={cx('page-header', noRule && 'no-rule')}>
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.id} className={cx('tab', value === t.id && 'active')} onClick={() => onChange(t.id)}>
          {t.label}{t.count != null && <span style={{ marginLeft: 6, opacity: 0.6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Chips({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map(o => (
        <button key={o.id} className={cx('chip', value === o.id && 'active')} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count != null && <span className="chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Avatar({ name, size = 28, color }) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: color }}>
      {initials}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return <button className={cx('toggle', on && 'on')} onClick={() => onChange(!on)} />;
}

function MoneyFmt({ value, big }) {
  const formatted = value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  if (big) return <span className="money-lg">{formatted}</span>;
  return <span className="num">{formatted}</span>;
}

function PhotoPlaceholder({ label = 'photo', kind, height = 120 }) {
  return <div className={cx('photo-ph', kind)} style={{ height }}>{label}</div>;
}

Object.assign(window, {
  cx, Logo, StatusBadge, PropertyTag, StatCard, Sparkline, PageHeader, Tabs, Chips, Avatar, Toggle, MoneyFmt, PhotoPlaceholder
});
