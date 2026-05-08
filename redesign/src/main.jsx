// Main app — routing & view assembly
const { Sidebar, Topbar } = window.Shell;
const { Dashboard, Clients, NewClient, ClientDetail, Jobs, NewJob, JobDetail, Schedule } = window.AdminScreens;
const { Routes, NewRoute, RouteDetail, CrewDispatch } = window.RouteScreens;
const { Estimates, Invoices, NewInvoice, InvoiceDetail, Billing } = window.FinanceScreens;
const { CrewsPage, ServicesPage, Settings } = window.OpsScreens;
const { Analytics, PortalAdmin } = window.AnalyticsScreens;
const { PortalShell, PortalHome, PortalJobs, PortalInvoices, PortalRequest } = window.PortalScreens;
const { CrewMobile } = window.CrewMobileScreens;

function App() {
  // view: 'ops' | 'portal' | 'crew'
  const [view, setView] = React.useState('ops');
  const [route, setRoute] = React.useState('dashboard');
  const [params, setParams] = React.useState({});
  const [portalPage, setPortalPage] = React.useState('home');

  const go = (newRoute, newParams = {}) => { setRoute(newRoute); setParams(newParams); window.scrollTo(0, 0); };

  // Render ops view
  if (view === 'ops') {
    let screen;
    const sub = params.sub;
    switch (route) {
      case 'dashboard': screen = <Dashboard go={go} />; break;
      case 'schedule': screen = <Schedule go={go} />; break;
      case 'routes':
        screen = sub === 'new' ? <NewRoute go={go} /> : sub === 'detail' ? <RouteDetail go={go} id={params.id} /> : <Routes go={go} />;
        break;
      case 'crew-dispatch': screen = <CrewDispatch go={go} />; break;
      case 'clients':
        screen = sub === 'new' ? <NewClient go={go} /> : sub === 'detail' ? <ClientDetail go={go} id={params.id} /> : <Clients go={go} />;
        break;
      case 'jobs':
        screen = sub === 'new' ? <NewJob go={go} /> : sub === 'detail' ? <JobDetail go={go} id={params.id} /> : <Jobs go={go} />;
        break;
      case 'crews': screen = <CrewsPage go={go} />; break;
      case 'services': screen = <ServicesPage go={go} />; break;
      case 'estimates': screen = <Estimates go={go} />; break;
      case 'invoices':
        screen = sub === 'new' ? <NewInvoice go={go} /> : sub === 'detail' ? <InvoiceDetail go={go} id={params.id} /> : <Invoices go={go} />;
        break;
      case 'billing': screen = <Billing go={go} />; break;
      case 'analytics': screen = <Analytics go={go} />; break;
      case 'portal-admin': screen = <PortalAdmin go={go} />; break;
      case 'settings': screen = <Settings go={go} />; break;
      default: screen = <Dashboard go={go} />;
    }
    return (
      <div className="app">
        <Sidebar view={view} setView={(v) => { setView(v); setRoute('dashboard'); }} route={route} setRoute={(r) => go(r)} />
        <main className="main">{screen}</main>
      </div>
    );
  }

  // Customer portal view
  if (view === 'portal') {
    return (
      <div className="app">
        <Sidebar view={view} setView={(v) => { setView(v); setRoute('dashboard'); }} route={route} setRoute={() => {}} />
        <main className="main" style={{ background: 'var(--cream-50)' }}>
          <PortalShell page={portalPage} setPage={setPortalPage}>
            {portalPage === 'home' && <PortalHome go={setPortalPage} />}
            {portalPage === 'jobs' && <PortalJobs go={setPortalPage} />}
            {portalPage === 'invoices' && <PortalInvoices go={setPortalPage} />}
            {portalPage === 'request' && <PortalRequest go={setPortalPage} />}
          </PortalShell>
        </main>
      </div>
    );
  }

  // Crew mobile view
  return (
    <div className="app">
      <Sidebar view={view} setView={(v) => { setView(v); setRoute('dashboard'); }} route={route} setRoute={() => {}} />
      <main className="main"><CrewMobile /></main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
