// Admin shell: sidebar + topbar + view switcher + route hosting

const NAV = {
  ops: [
    { section: 'Daily' },
    { id: 'dashboard', label: 'Dashboard', icon: 'Dashboard' },
    { id: 'schedule', label: 'Schedule', icon: 'Calendar' },
    { id: 'routes', label: 'Routes', icon: 'Route', count: '8' },
    { id: 'crew-dispatch', label: 'Crew Dispatch', icon: 'Truck' },
    { section: 'Records' },
    { id: 'clients', label: 'Clients', icon: 'Users', count: '187' },
    { id: 'jobs', label: 'Jobs', icon: 'Briefcase', count: '24' },
    { id: 'crews', label: 'Crews', icon: 'HardHat' },
    { id: 'services', label: 'Services', icon: 'Layers' },
    { section: 'Money' },
    { id: 'estimates', label: 'Estimates', icon: 'FileText', count: '6' },
    { id: 'invoices', label: 'Invoices', icon: 'Receipt' },
    { id: 'billing', label: 'Billing', icon: 'CreditCard' },
    { section: 'Insight' },
    { id: 'analytics', label: 'Analytics', icon: 'BarChart' },
    { id: 'portal-admin', label: 'Portal Inbox', icon: 'Inbox', count: '12' },
    { id: 'settings', label: 'Settings', icon: 'Settings' },
  ],
};

function Sidebar({ view, route, setRoute, setView }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="src/tlc-logo.png" alt="TLC Landscape Management" className="sidebar-brand-logo" />
        <div className="sidebar-brand-name">Management Platform</div>
        <div className="sidebar-brand-sub">by Watt Systems</div>
      </div>
      <nav className="sidebar-nav">
        <div className="view-switcher">
          {[
            { id: 'ops', label: 'Office' },
            { id: 'portal', label: 'Customer' },
            { id: 'crew', label: 'Crew Mobile' },
          ].map(v => (
            <button key={v.id} className={cx(view === v.id && 'active')}
                    onClick={() => setView(v.id)}>{v.label}</button>
          ))}
        </div>
        {NAV.ops.map((item, i) => {
          if (item.section) {
            return <div key={i} className="sidebar-section-label">{item.section}</div>;
          }
          const Ico = Icon[item.icon];
          return (
            <button key={item.id}
                    className={cx('sidebar-link', route === item.id && 'active')}
                    onClick={() => setRoute(item.id)}>
              <Ico />
              {item.label}
              {item.count && <span className="sidebar-link-count">{item.count}</span>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="avatar">CW</div>
        <div style={{ flex: 1 }}>
          <div className="sidebar-foot-name">Connor Watt</div>
          <div className="sidebar-foot-role">Owner · admin@tlc.com</div>
        </div>
        <Icon.MoreH />
      </div>
    </aside>
  );
}

function Topbar({ crumbs, search = true }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="crumbs-sep"><Icon.ChevronRight size={12} /></span>}
            <span className={i === crumbs.length - 1 ? 'crumbs-current' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      {search && (
        <div className="topbar-search">
          <Icon.Search size={14} />
          <input type="text" placeholder="Search clients, jobs, invoices..." />
        </div>
      )}
      <div className="topbar-actions">
        <button className="icon-btn" title="Notifications"><Icon.Bell size={15} /><span className="dot"></span></button>
        <button className="icon-btn" title="Help"><Icon.Sparkle size={15} /></button>
      </div>
    </div>
  );
}

window.Shell = { Sidebar, Topbar, NAV };
