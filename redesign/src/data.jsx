// Mock data for GreenOps prototype

const TODAY = new Date('2026-05-07');

const CLIENTS = [
  { id: 'c1', name: 'Maria Chen', company: null, type: 'residential', address: '4218 Riverwood Ln', city: 'Kennewick', state: 'WA', zip: '99337', lot: 8400, status: 'active', crew: 'Crew Alpha', phone: '(509) 555-0142', email: 'mchen@gmail.com', revenue: 4280, gateCode: '#2244', notes: 'Dog in back yard — friendly. Side gate latches up.' },
  { id: 'c2', name: 'Westwind HOA', company: 'Westwind HOA', type: 'hoa', address: '1200 Westwind Way', city: 'Richland', state: 'WA', zip: '99354', lot: 220000, status: 'active', crew: 'Crew Bravo', phone: '(509) 555-0188', email: 'board@westwindhoa.org', revenue: 38400, notes: 'Common areas only; do not service individual lots.' },
  { id: 'c3', name: 'Tri-City Medical Plaza', company: 'TCM Properties', type: 'commercial', address: '7340 W Grandridge Blvd', city: 'Kennewick', state: 'WA', zip: '99336', lot: 56000, status: 'active', crew: 'Crew Charlie', phone: '(509) 555-0211', email: 'facilities@tcmplaza.com', revenue: 21600 },
  { id: 'c4', name: 'James & Anita Lopez', company: null, type: 'residential', address: '892 Vineyard Dr', city: 'Pasco', state: 'WA', zip: '99301', lot: 12200, status: 'active', crew: 'Crew Alpha', phone: '(509) 555-0167', email: 'lopezj@yahoo.com', revenue: 3140 },
  { id: 'c5', name: 'Columbia Center Office Park', company: 'CCOP LLC', type: 'commercial', address: '1455 Columbia Center Blvd', city: 'Kennewick', state: 'WA', zip: '99336', lot: 84000, status: 'active', crew: 'Crew Charlie', phone: '(509) 555-0234', email: 'manager@ccop.com', revenue: 28200 },
  { id: 'c6', name: 'Sage Hills HOA', company: 'Sage Hills', type: 'hoa', address: '3000 Sage Hills Dr', city: 'Richland', state: 'WA', zip: '99354', lot: 142000, status: 'active', crew: 'Crew Bravo', phone: '(509) 555-0298', email: 'admin@sagehills.org', revenue: 19800 },
  { id: 'c7', name: 'David Park', company: null, type: 'residential', address: '215 Meadowbrook Ct', city: 'Kennewick', state: 'WA', zip: '99337', lot: 6200, status: 'prospect', crew: null, phone: '(509) 555-0312', email: 'dpark@outlook.com', revenue: 0 },
  { id: 'c8', name: 'Yakima Valley Vineyards', company: 'YVV Inc', type: 'commercial', address: '8800 Wine Country Rd', city: 'Prosser', state: 'WA', zip: '99350', lot: 480000, status: 'active', crew: 'Crew Delta', phone: '(509) 555-0345', email: 'estates@yvv.com', revenue: 47200 },
  { id: 'c9', name: 'Reagan Family', company: null, type: 'residential', address: '67 Apple Blossom Way', city: 'Richland', state: 'WA', zip: '99354', lot: 9100, status: 'active', crew: 'Crew Alpha', phone: '(509) 555-0378', email: 'reagans@gmail.com', revenue: 2880 },
  { id: 'c10', name: 'Pasco School District', company: 'PSD Facilities', type: 'commercial', address: '1215 W Lewis St', city: 'Pasco', state: 'WA', zip: '99301', lot: 320000, status: 'active', crew: 'Crew Delta', phone: '(509) 555-0410', email: 'grounds@psd1.org', revenue: 64800 },
  { id: 'c11', name: 'Linda Vasquez', company: null, type: 'residential', address: '1833 Country Club Ln', city: 'Kennewick', state: 'WA', zip: '99337', lot: 14800, status: 'active', crew: 'Crew Alpha', phone: '(509) 555-0445', email: 'linda.v@hotmail.com', revenue: 5640 },
  { id: 'c12', name: 'Horse Heaven Estates', company: 'HHE HOA', type: 'hoa', address: '4400 Horse Heaven Dr', city: 'Kennewick', state: 'WA', zip: '99337', lot: 184000, status: 'active', crew: 'Crew Bravo', phone: '(509) 555-0476', email: 'hoa@horseheaven.net', revenue: 24000 },
];

const CREWS = [
  { id: 'cr1', name: 'Crew Alpha', color: '#3D6B2C', lead: 'Diego Marin', members: ['Diego Marin', 'Tyler Brooks'], today: 6, completion: 96, status: 'active', mileage: 84, hours: 7.5 },
  { id: 'cr2', name: 'Crew Bravo', color: '#C9A84C', lead: 'Sarah Johnson', members: ['Sarah Johnson', 'Marcus Webb', 'Luis Romero'], today: 4, completion: 92, status: 'active', mileage: 102, hours: 8.0 },
  { id: 'cr3', name: 'Crew Charlie', color: '#3B6FB8', lead: 'Reggie Foster', members: ['Reggie Foster', 'Anh Nguyen'], today: 3, completion: 88, status: 'active', mileage: 56, hours: 6.5 },
  { id: 'cr4', name: 'Crew Delta', color: '#8B5C18', lead: 'Maya Rodriguez', members: ['Maya Rodriguez', 'Cole Bennett', 'Jamal Pierce', 'Ben Tate'], today: 5, completion: 94, status: 'active', mileage: 124, hours: 8.0 },
];

const SERVICES = [
  { id: 's1', name: 'Weekly Mow & Edge', cat: 'mowing', unit: 'per_visit', price: 65, active: true, jobs: 184 },
  { id: 's2', name: 'Bi-weekly Mow & Edge', cat: 'mowing', unit: 'per_visit', price: 75, active: true, jobs: 92 },
  { id: 's3', name: 'Spring Cleanup', cat: 'cleanup', unit: 'flat', price: 285, active: true, jobs: 41 },
  { id: 's4', name: 'Fall Cleanup', cat: 'cleanup', unit: 'flat', price: 320, active: true, jobs: 38 },
  { id: 's5', name: 'Fertilization (round)', cat: 'fertilization', unit: 'per_sqft', price: 0.06, active: true, jobs: 56 },
  { id: 's6', name: 'Core Aeration', cat: 'aeration', unit: 'per_sqft', price: 0.04, active: true, jobs: 23 },
  { id: 's7', name: 'Sprinkler Tune-up', cat: 'sprinkler', unit: 'flat', price: 145, active: true, jobs: 18 },
  { id: 's8', name: 'Sprinkler Winterization', cat: 'sprinkler', unit: 'flat', price: 95, active: true, jobs: 64 },
  { id: 's9', name: 'Tree Pruning (small)', cat: 'tree', unit: 'per_hour', price: 85, active: true, jobs: 12 },
  { id: 's10', name: 'Hedge Trimming', cat: 'tree', unit: 'per_hour', price: 75, active: true, jobs: 27 },
  { id: 's11', name: 'Holiday Lighting Install', cat: 'holiday', unit: 'flat', price: 480, active: false, jobs: 0 },
  { id: 's12', name: 'Snow Removal (per push)', cat: 'snow', unit: 'flat', price: 95, active: false, jobs: 0 },
];

const JOBS = [
  { id: 'j1', client: 'Maria Chen', clientId: 'c1', title: 'Weekly Mow & Edge', crew: 'Crew Alpha', date: '2026-05-07', start: '08:00', end: '08:45', status: 'complete', total: 65, address: '4218 Riverwood Ln, Kennewick' },
  { id: 'j2', client: 'James & Anita Lopez', clientId: 'c4', title: 'Mow + Hedge Trim', crew: 'Crew Alpha', date: '2026-05-07', start: '09:00', end: '10:15', status: 'complete', total: 140, address: '892 Vineyard Dr, Pasco' },
  { id: 'j3', client: 'Linda Vasquez', clientId: 'c11', title: 'Weekly Mow & Edge', crew: 'Crew Alpha', date: '2026-05-07', start: '10:30', end: '11:30', status: 'in_progress', total: 85, address: '1833 Country Club Ln, Kennewick' },
  { id: 'j4', client: 'Reagan Family', clientId: 'c9', title: 'Spring Cleanup', crew: 'Crew Alpha', date: '2026-05-07', start: '13:00', end: '15:00', status: 'scheduled', total: 285, address: '67 Apple Blossom Way, Richland' },
  { id: 'j5', client: 'Westwind HOA', clientId: 'c2', title: 'Common Areas Mow', crew: 'Crew Bravo', date: '2026-05-07', start: '07:30', end: '11:00', status: 'in_progress', total: 1200, address: '1200 Westwind Way, Richland' },
  { id: 'j6', client: 'Sage Hills HOA', clientId: 'c6', title: 'Fertilization Round 2', crew: 'Crew Bravo', date: '2026-05-07', start: '13:00', end: '15:30', status: 'scheduled', total: 880, address: '3000 Sage Hills Dr, Richland' },
  { id: 'j7', client: 'Tri-City Medical Plaza', clientId: 'c3', title: 'Weekly Maintenance', crew: 'Crew Charlie', date: '2026-05-07', start: '08:00', end: '11:00', status: 'issue', total: 540, address: '7340 W Grandridge Blvd, Kennewick' },
  { id: 'j8', client: 'Columbia Center', clientId: 'c5', title: 'Aeration', crew: 'Crew Charlie', date: '2026-05-07', start: '13:30', end: '16:00', status: 'scheduled', total: 1320, address: '1455 Columbia Center Blvd' },
  { id: 'j9', client: 'Pasco School District', clientId: 'c10', title: 'Mow + Trim — Maya HS', crew: 'Crew Delta', date: '2026-05-07', start: '07:00', end: '11:30', status: 'in_progress', total: 1480, address: '1215 W Lewis St, Pasco' },
  { id: 'j10', client: 'Yakima Valley Vineyards', clientId: 'c8', title: 'Estate Maintenance', crew: 'Crew Delta', date: '2026-05-07', start: '13:00', end: '17:00', status: 'scheduled', total: 1840, address: '8800 Wine Country Rd, Prosser' },
];

const INVOICES = [
  { id: 'TLC-1042', client: 'Westwind HOA', clientId: 'c2', date: '2026-05-01', due: '2026-05-31', amount: 4800, paid: 0, status: 'sent' },
  { id: 'TLC-1041', client: 'Tri-City Medical Plaza', clientId: 'c3', date: '2026-05-01', due: '2026-05-15', amount: 2160, paid: 2160, status: 'paid' },
  { id: 'TLC-1040', client: 'Maria Chen', clientId: 'c1', date: '2026-05-01', due: '2026-05-15', amount: 280, paid: 0, status: 'viewed' },
  { id: 'TLC-1039', client: 'Pasco School District', clientId: 'c10', date: '2026-04-28', due: '2026-05-28', amount: 6480, paid: 0, status: 'sent' },
  { id: 'TLC-1038', client: 'Sage Hills HOA', clientId: 'c6', date: '2026-04-25', due: '2026-04-25', amount: 1980, paid: 0, status: 'overdue' },
  { id: 'TLC-1037', client: 'James & Anita Lopez', clientId: 'c4', date: '2026-04-22', due: '2026-05-06', amount: 280, paid: 280, status: 'paid' },
  { id: 'TLC-1036', client: 'Yakima Valley Vineyards', clientId: 'c8', date: '2026-04-20', due: '2026-05-20', amount: 4720, paid: 4720, status: 'paid' },
  { id: 'TLC-1035', client: 'Columbia Center Office Park', clientId: 'c5', date: '2026-04-18', due: '2026-05-18', amount: 2820, paid: 0, status: 'sent' },
  { id: 'TLC-1034', client: 'Linda Vasquez', clientId: 'c11', date: '2026-04-15', due: '2026-04-29', amount: 470, paid: 0, status: 'overdue' },
  { id: 'TLC-1033', client: 'Horse Heaven Estates', clientId: 'c12', date: '2026-04-12', due: '2026-05-12', amount: 2400, paid: 2400, status: 'paid' },
];

const ESTIMATES = [
  { id: 'EST-204', client: 'David Park', clientId: 'c7', title: 'New residential — full service start-up', date: '2026-05-05', amount: 1240, status: 'sent' },
  { id: 'EST-203', client: 'Westwind HOA', clientId: 'c2', title: 'Tree pruning — common areas (12 trees)', date: '2026-05-04', amount: 2880, status: 'accepted' },
  { id: 'EST-202', client: 'Tri-City Medical Plaza', clientId: 'c3', title: 'Mulch refresh — entry beds', date: '2026-05-02', amount: 1860, status: 'sent' },
  { id: 'EST-201', client: 'Pasco School District', clientId: 'c10', title: 'Aeration — all 4 campuses', date: '2026-04-28', amount: 5240, status: 'accepted' },
  { id: 'EST-200', client: 'Sage Hills HOA', clientId: 'c6', title: 'Fall cleanup — common areas', date: '2026-04-25', amount: 1280, status: 'draft' },
  { id: 'EST-199', client: 'David Park', clientId: 'c7', title: 'Sod replacement — front yard', date: '2026-04-22', amount: 3480, status: 'declined' },
];

const PORTAL_ACTIVITY = [
  { kind: 'request', client: 'Maria Chen', text: 'Service request — extra mow before family BBQ Saturday', time: '12 min ago', priority: 'normal' },
  { kind: 'message', client: 'Linda Vasquez', text: 'Thanks for the great work yesterday!', time: '38 min ago', priority: 'low' },
  { kind: 'complaint', client: 'James Lopez', text: 'Sprinkler head broken near driveway', time: '2 hr ago', priority: 'high' },
  { kind: 'request', client: 'Westwind HOA', text: 'Estimate — pressure wash sidewalks', time: '4 hr ago', priority: 'normal' },
  { kind: 'message', client: 'Tri-City Medical Plaza', text: 'Can we move Tuesday\'s service to Wednesday?', time: '5 hr ago', priority: 'normal' },
  { kind: 'complaint', client: 'Reagan Family', text: 'Crew left grass clippings on patio', time: 'Yesterday', priority: 'low' },
];

window.GREENOPS = { TODAY, CLIENTS, CREWS, SERVICES, JOBS, INVOICES, ESTIMATES, PORTAL_ACTIVITY };
