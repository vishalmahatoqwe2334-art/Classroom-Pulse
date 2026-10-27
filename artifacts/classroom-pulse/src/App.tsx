import { useEffect, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import {
  Activity, ArrowDownToLine, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown,
  CircleHelp, ClipboardCheck, Clock3, Download, FileText, Filter, LayoutDashboard,
  LockKeyhole, LogOut, Menu, Plus, Search, ShieldCheck, Sparkles,
  Users, X, BookOpen, MapPin, Play, Square, RotateCcw, Eye, AudioLines, AlertTriangle,
} from 'lucide-react';
import {
  useHealthCheck, getHealthCheckQueryKey,
  useGetCurrentUser, getGetCurrentUserQueryKey,
  useGetDashboardSummary, getGetDashboardSummaryQueryKey,
  useListCourses, useCreateCourse, getListCoursesQueryKey,
  useListStudents, useCreateStudent, getListStudentsQueryKey,
  useListSessions, useCreateSession, getListSessionsQueryKey,
  useGetSession, getGetSessionQueryKey, useUpdateAttendance, useEndSession,
  useGetAttendanceReport, getGetAttendanceReportQueryKey,
  useListConsents, useUpdateConsent, getListConsentsQueryKey,
} from '@workspace/api-client-react';
import type { AttendanceRecordStatus, Course, Student } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './app.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#286d68', colorForeground: '#20383a', colorMutedForeground: '#6b7e7d',
    colorDanger: '#bd5146', colorBackground: '#fffdf8', colorInput: '#f8f6ef',
    colorInputForeground: '#20383a', colorNeutral: '#dedbd1', fontFamily: 'DM Sans, sans-serif', borderRadius: '14px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf8] rounded-[22px] w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#20383a] font-bold', headerSubtitle: 'text-[#6b7e7d]',
    socialButtonsBlockButtonText: 'text-[#20383a] font-semibold', formFieldLabel: 'text-[#354c4b] font-semibold',
    footerActionLink: 'text-[#286d68] font-semibold', footerActionText: 'text-[#657876]',
    dividerText: 'text-[#75817d]', identityPreviewEditButton: 'text-[#286d68]',
    formFieldSuccessText: 'text-[#286d68]', alertText: 'text-[#8c3d36]',
    logoBox: 'rounded-lg', logoImage: 'rounded-lg', socialButtonsBlockButton: 'border-[#dedbd1] bg-[#fbfaf5]',
    formButtonPrimary: 'bg-[#286d68] hover:bg-[#205b57] text-white',
    formFieldInput: 'bg-[#f8f6ef] border-[#dedbd1] text-[#20383a]',
    footerAction: 'text-[#657876]', dividerLine: 'bg-[#e6e1d7]', alert: 'bg-[#fbefec]',
    otpCodeFieldInput: 'border-[#dedbd1] text-[#20383a]', formFieldRow: 'text-[#354c4b]', main: 'text-[#20383a]',
  },
};

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/attendance', label: 'Attendance', icon: ClipboardCheck },
  { href: '/students', label: 'Students', icon: Users },
  { href: '/courses', label: 'Classes', icon: BookOpen },
  { href: '/history', label: 'History', icon: Clock3 },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/privacy', label: 'Privacy & consent', icon: ShieldCheck },
];

function Button({ children, kind = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'quiet' | 'outline' | 'danger' }) {
  return <button {...props} className={`btn btn-${kind} ${className}`}>{children}</button>;
}
function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}
function SelectField({ label, children, className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return <label className={`field ${className}`}><span>{label}</span><select {...props}>{children}</select></label>;
}
function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`soft-card panel ${className}`}>{children}</section>; }
function Loading({ label = 'Loading classroom data' }: { label?: string }) {
  return <div className="loading-state" role="status" data-testid="status-loading"><div className="skeleton wide" /><div className="skeleton" /><span>{label}</span></div>;
}
function ErrorState({ retry }: { retry: () => void }) {
  return <div className="error-state" data-testid="status-error"><AlertTriangle size={20}/><div><strong>We couldn’t load this view.</strong><p>Nothing has been changed. Try again in a moment.</p></div><Button kind="outline" onClick={retry} data-testid="button-retry">Try again</Button></div>;
}
function Empty({ title, note }: { title: string; note: string }) {
  return <div className="empty-state"><div className="empty-icon"><Sparkles size={20}/></div><strong>{title}</strong><p>{note}</p></div>;
}
function initials(value = '') { return value.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function formatDate(value?: string | null) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase().replace(/\s/g, '-');
  return <span className={`status-pill status-${key}`} data-testid={`status-${key}`}>{status}</span>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="modal-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog" data-testid="button-close-dialog"><X size={18}/></button></header>{children}</section></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk(); const client = useQueryClient(); const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => { const id = user?.id ?? null; if (previous.current !== undefined && previous.current !== id) client.clear(); previous.current = id; });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}
function Home() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  const { isSignedIn } = useUser();
  if (isSignedIn) return <Redirect to="/dashboard"/>;
  return <main className="landing">
    <header className="landing-nav"><Link href="/" className="brand-lockup"><span className="brand-mark"><Activity size={19}/></span><span>classroom<span className="brand-light">pulse</span></span></Link><div className="landing-links"><a href="#how-it-works">How it works</a><a href="#privacy-promise">Our privacy promise</a><Link href="/sign-in" className="landing-signin">Sign in <ArrowRight size={15}/></Link></div></header>
    <section className="landing-hero">
      <div className="hero-copy"><div className="hero-tag"><span className="pulse-dot"/><span>Built for the people in the room</span></div>
        <h1>Make every<br/>class <em>count.</em></h1>
        <p className="hero-deck">A clearer view of attendance. A lighter way to keep records. Classroom Pulse helps teachers stay present with their students—not buried in spreadsheets.</p>
        <div className="hero-actions"><Link href="/sign-up" className="btn btn-primary hero-cta">Create your workspace <ArrowRight size={17}/></Link><Link href="/sign-in" className="quiet-link">Already have an account <ArrowRight size={15}/></Link></div>
        <div className="hero-assurance"><LockKeyhole size={14}/><span>Private by default. Teacher-reviewed by design.</span></div>
      </div>
      <div className="hero-art" aria-label="Illustration of a classroom attendance overview">
        <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
        <div className="floating-note note-a"><span className="tiny-dot teal-dot"/> Class in session <strong>09:14</strong></div>
        <div className="floating-note note-b"><ShieldCheck size={15}/> Teacher review stays in control</div>
        <div className="dashboard-card">
          <div className="mock-top"><span className="mock-brand"><span className="mock-brand-dot"/> Pulse / Today</span><span className="mock-date">TUESDAY · 9:00 AM</span></div>
          <div className="mock-title">Environmental systems <span>SCI 204</span></div>
          <div className="mock-rule"/>
          <div className="mock-statline"><div><span>Here today</span><strong>22 <small>/ 26</small></strong></div><div><span>Needs a look</span><strong className="rust-number">04</strong></div><div className="mock-ring"><b>85%</b><span>marked</span></div></div>
          <div className="mock-roster"><div className="mock-roster-head"><span>CLASS ROSTER</span><span>STATUS</span></div>{['Maya Chen','Elliot Rivera','Nina Okafor','Theo Park'].map((name, i) => <div className="mock-row" key={name}><span className="mock-avatar">{initials(name)}</span><span className="mock-name">{name}</span><span className={`mock-state state-${i}`}>{['Present','Present','Review','Late'][i]}</span></div>)}</div>
          <div className="mock-foot"><span><CheckCircle2 size={13}/> Review before records are final</span><span>OPEN ROSTER →</span></div>
        </div>
        <div className="hero-stamp"><span>TEACHER</span><strong>in the loop</strong><span>ALWAYS</span></div>
      </div>
    </section>
    <div className="landing-strip"><span>ONE SIMPLE WORKSPACE</span><div><span><ClipboardCheck size={15}/> Attendance</span><i/><span><BookOpen size={15}/> Class rosters</span><i/><span><FileText size={15}/> Useful reports</span><i/><span><ShieldCheck size={15}/> Consent controls</span></div></div>
    <section className="landing-section" id="how-it-works"><div className="section-intro"><div className="eyebrow">A practical rhythm</div><h2>Less admin.<br/><em>More teaching.</em></h2><p>Everything you need for a thoughtful start, a reliable record, and a clear finish.</p></div><div className="rhythm-list">
      <article><span className="rhythm-number">01</span><div><h3>Start with your class</h3><p>Keep courses, rooms, and student records together. Open a session in a couple of clicks.</p></div><BookOpen size={21}/></article>
      <article><span className="rhythm-number">02</span><div><h3>Review attendance together</h3><p>Use a simple roster to mark, correct, and confirm attendance. Uncertain data stays unverified until a person reviews it.</p></div><ClipboardCheck size={21}/></article>
      <article><span className="rhythm-number">03</span><div><h3>Keep the record useful</h3><p>See patterns across sessions and export a clean report when you need one—without turning signals into judgments.</p></div><FileText size={21}/></article>
    </div></section>
    <section className="privacy-band" id="privacy-promise"><div className="privacy-symbol"><ShieldCheck size={27}/></div><div><div className="eyebrow">A clear boundary</div><h2>Signals are not conclusions.</h2><p>Visual or audio observations are optional, consent-based, and never treated as truth about attention, emotion, learning, or performance. Poor-quality or missing media means insufficient data—not a guess.</p></div><Link href="/privacy" className="privacy-link">Explore privacy controls <ArrowRight size={16}/></Link></section>
    <section className="landing-bottom"><div><div className="eyebrow">A calmer classroom record</div><h2>Ready when<br/>your next class is.</h2></div><Link href="/sign-up" className="btn btn-primary">Get started <ArrowRight size={17}/></Link></section>
    <footer className="landing-footer"><Link href="/" className="brand-lockup"><span className="brand-mark"><Activity size={16}/></span><span>classroom<span className="brand-light">pulse</span></span></Link><span>Classroom Pulse · Attendance, with care.</span><span className="health-status"><span className={`health-dot ${health.data?.status === 'ok' ? 'health-good' : ''}`}/>{health.isLoading ? 'Checking service' : health.isError ? 'Service status unavailable' : 'Service ready'}</span></footer>
  </main>;
}

function AuthPage({ type }: { type: 'in' | 'up' }) {
  return <main className="auth-page"><Link href="/" className="auth-return"><ArrowRight size={15}/> Return to Classroom Pulse</Link><div className="auth-aside"><div className="brand-lockup"><span className="brand-mark"><Activity size={19}/></span><span>classroom<span className="brand-light">pulse</span></span></div><div><div className="eyebrow">A thoughtful classroom workspace</div><h1>Good records.<br/><em>Better presence.</em></h1><p>Attendance should support the people teaching and learning—not define them.</p></div><div className="auth-privacy"><ShieldCheck size={18}/> Consent-first. Human-reviewed. Built to be useful.</div></div><div className="auth-form"><div className="eyebrow">{type === 'in' ? 'Welcome back' : 'Start with care'}</div><h2>{type === 'in' ? 'Sign in to your workspace' : 'Create your workspace'}</h2><p>{type === 'in' ? 'Your classroom is right where you left it.' : 'A clear, considered view of your classroom.'}</p>{type === 'in' ? <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/> : <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/>}</div></main>;
}

function HomeRedirect() { return <><Show when="signed-in"><Redirect to="/dashboard"/></Show><Show when="signed-out"><Home/></Show></>; }
function SignedIn({ children }: { children: ReactNode }) { return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/"/></Show></>; }
function ClerkProfile() {
  const { user } = useUser(); const { signOut } = useClerk(); const [open, setOpen] = useState(false);
  return <div className="profile-wrap"><button className="profile-button" onClick={() => setOpen(!open)} data-testid="button-account-menu"><span className="avatar">{initials(user?.fullName || user?.firstName || 'Teacher')}</span><span className="profile-label">{user?.firstName || 'Teacher'}<small>Workspace</small></span><ChevronDown size={14}/></button>{open && <div className="profile-menu"><div className="profile-menu-name">{user?.fullName || 'Classroom account'}</div><button onClick={() => { void signOut({ redirectUrl: basePath || '/' }); }} data-testid="button-sign-out"><LogOut size={15}/> Sign out</button></div>}</div>;
}
function AppShell({ children }: { children: ReactNode }) {
  const [loc] = useLocation(); const [mobile, setMobile] = useState(false);
  const userQuery = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const role = userQuery.data?.role || 'teacher';
  return <div className="app-shell">
    <aside className={`sidebar ${mobile ? 'sidebar-open' : ''}`}><div className="side-brand"><Link href="/dashboard" className="brand-lockup"><span className="brand-mark"><Activity size={19}/></span><span>classroom<span className="brand-light">pulse</span></span></Link><button className="mobile-close icon-button" onClick={() => setMobile(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="workspace-chip"><span className="workspace-avatar">CP</span><span><strong>Classroom workspace</strong><small>{role === 'admin' ? 'Administrator' : 'Teacher'} view</small></span><ChevronDown size={14}/></div>
      <div className="side-label">WORKSPACE</div><nav className="side-nav">{nav.map(item => { const Icon = item.icon; const active = loc === item.href; return <Link key={item.href} href={item.href} className={`nav-link ${active ? 'nav-active' : ''}`} onClick={() => setMobile(false)} data-testid={`link-nav-${item.href.slice(1)}`}><Icon size={17}/><span>{item.label}</span>{item.href === '/attendance' && <span className="nav-live-dot"/>}</Link>; })}</nav>
      <div className="sidebar-bottom"><div className="privacy-reminder"><div><ShieldCheck size={17}/><span>Consent stays in control</span></div><p>Review data choices anytime.</p><Link href="/privacy">Privacy settings <ArrowRight size={13}/></Link></div><div className="sidebar-user"><span className="avatar side-avatar">{initials(userQuery.data?.name || 'Teacher')}</span><span><strong>{userQuery.data?.name || 'Your account'}</strong><small>{userQuery.data?.email || 'Loading profile'}</small></span><ClerkProfile/></div></div>
    </aside>
    {mobile && <button className="mobile-scrim" onClick={() => setMobile(false)} aria-label="Close navigation"/>}
    <main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{nav.find(item => item.href === loc)?.label || 'Classroom'}</strong></div><div className="topbar-right"><div className="today-chip"><CalendarDays size={15}/>{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div><span className="topbar-divider"/><span className="profile-role">{role}</span><ClerkProfile/></div></header><div className="page-content page-enter">{children}</div></main>
  </div>;
}

function DashboardPage() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const profile = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey() } });
  const courses = useListCourses({ query: { queryKey: getListCoursesQueryKey() } });
  const start = useCreateSession();
  const client = useQueryClient(); const [courseId, setCourseId] = useState(''); const [notice, setNotice] = useState('');
  const s = summary.data;
  function startSession() {
    const course = courses.data?.find(c => c.id === Number(courseId)) || courses.data?.[0];
    if (!course) { setNotice('Add a class before starting a session.'); return; }
    start.mutate({ data: { courseId: course.id, room: course.room } }, { onSuccess: () => { setNotice('Session started. Review the roster to confirm attendance.'); void client.invalidateQueries({ queryKey: getListSessionsQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } });
  }
  if (summary.isLoading) return <Loading label="Gathering your classroom overview"/>;
  if (summary.isError) return <ErrorState retry={() => void summary.refetch()}/>;
  return <><PageHeading eyebrow={profile.data?.role === 'admin' ? 'Administrator overview' : 'Tuesday, in your classroom'} title={profile.data?.name ? `Good morning, ${profile.data.name.split(' ')[0]}.` : 'Good morning.'} subtitle={profile.data?.role === 'admin' ? 'A clear view across your school’s classroom activity.' : 'Here’s the classroom picture for today.'} action={<Button onClick={startSession} disabled={start.isPending} data-testid="button-start-session"><Play size={15}/>{start.isPending ? 'Starting…' : 'Start a session'}</Button>}/>{notice && <div className="inline-notice"><CheckCircle2 size={16}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <div className="overview-grid"><Panel className="welcome-panel"><div className="welcome-top"><div><div className="eyebrow">TODAY AT A GLANCE</div><h2>Your teaching day,<br/><em>in good order.</em></h2></div><div className="welcome-icon"><Activity size={24}/></div></div><div className="welcome-bottom"><span><span className="pulse-dot"/> {s?.recentSessions?.some(item => item.status === 'live') ? 'A class is live now' : 'Ready for your next class'}</span><span className="mono-subtle">{new Date().toLocaleDateString([], { month: 'long', day: 'numeric' })}</span></div></Panel>
      <Panel className="stat-panel"><div className="stat-label">Students in workspace <Users size={16}/></div><strong>{s?.students ?? '—'}</strong><span>Across your active rosters</span><div className="mini-bars"><i/><i/><i/><i/><i/><i/><i/><i/></div></Panel>
      <Panel className="stat-panel stat-present"><div className="stat-label">Present today <CheckCircle2 size={16}/></div><strong>{s?.presentToday ?? '—'}</strong><span>{s?.lateToday ?? 0} marked late today</span><div className="stat-track"><i style={{ width: `${Math.max(4, Math.min(100, s?.students ? (s.presentToday / s.students) * 100 : 0))}%` }}/></div></Panel>
      <Panel className="stat-panel stat-review"><div className="stat-label">Needs your review <Eye size={16}/></div><strong>{s?.needsReview ?? '—'}</strong><span>Unverified items stay unconfirmed</span><Link href="/attendance" className="text-link">Review roster <ArrowRight size={14}/></Link></Panel>
    </div>
    <div className="dashboard-lower"><Panel><div className="panel-heading"><div><div className="eyebrow">ON THE TIMETABLE</div><h2>Your classes</h2></div><Link className="text-link" href="/courses">All classes <ArrowRight size={14}/></Link></div>
      {courses.isLoading ? <div className="skeleton-list"><div className="skeleton"/><div className="skeleton"/></div> : courses.isError ? <ErrorState retry={() => void courses.refetch()}/> : (courses.data?.length || 0) === 0 ? <Empty title="Your classes start here" note="Add your first class to build a roster and start tracking attendance."/> :
        <div className="course-list">{courses.data?.slice(0, 4).map((c, i) => <div className="course-row" key={c.id} data-testid={`row-course-${c.id}`}><span className={`course-mark course-mark-${i % 4}`}><BookOpen size={17}/></span><div className="course-info"><strong>{c.name}</strong><span>{c.code} <i/> {c.schedule}</span></div><span className="course-room"><MapPin size={13}/>{c.room}</span><span className="student-count">{c.studentCount} students</span><Link href="/attendance" aria-label={`Open attendance for ${c.name}`} className="arrow-button"><ArrowRight size={16}/></Link></div>)}</div>}
      </Panel><Panel className="recent-panel"><div className="panel-heading"><div><div className="eyebrow">RECENT ACTIVITY</div><h2>Session notes</h2></div><Link className="text-link" href="/history">History <ArrowRight size={14}/></Link></div>
        {(s?.recentSessions?.length || 0) === 0 ? <Empty title="No sessions yet" note="When a class session is complete, it will appear here."/> : <div className="recent-list">{s?.recentSessions?.slice(0, 4).map(session => <Link className="recent-item" href="/history" key={session.id} data-testid={`row-recent-session-${session.id}`}><span className={`recent-icon ${session.status === 'live' ? 'recent-live' : ''}`}>{session.status === 'live' ? <span className="pulse-dot"/> : <Check size={15}/>}</span><span className="recent-main"><strong>{session.courseName}</strong><small>{formatDate(session.startedAt)} · {session.room}</small></span><span className="recent-count">{session.presentCount}<small>/{session.enrolledCount}</small></span></Link>)}</div>}
      </Panel></div>
    <div className="signal-note"><ShieldCheck size={16}/><span>Classroom Pulse keeps the teacher in the loop. Attendance needs review; optional observations are never a measure of learning or performance.</span><Link href="/privacy">Learn more</Link></div>
  </>;
}

function CoursesPage() {
  const list = useListCourses({ query: { queryKey: getListCoursesQueryKey() } }); const create = useCreateCourse(); const client = useQueryClient();
  const [modal, setModal] = useState(false); const [error, setError] = useState('');
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = new FormData(e.currentTarget); const payload = { name: String(data.get('name')).trim(), code: String(data.get('code')).trim(), room: String(data.get('room')).trim(), schedule: String(data.get('schedule')).trim() }; if (!payload.name || !payload.code) { setError('Class name and course code are required.'); return; } create.mutate({ data: payload }, { onSuccess: () => { setModal(false); setError(''); void client.invalidateQueries({ queryKey: getListCoursesQueryKey() }); } }); }
  return <><PageHeading eyebrow="Your teaching space" title="Classes" subtitle="Keep course details and rosters in one dependable place." action={<Button onClick={() => setModal(true)} data-testid="button-add-class"><Plus size={16}/> Add a class</Button>}/>{list.isLoading ? <Loading/> : list.isError ? <ErrorState retry={() => void list.refetch()}/> : list.data?.length ? <div className="classes-grid">{list.data.map((c, i) => <ClassCard course={c} index={i} key={c.id}/>)}</div> : <Panel><Empty title="A good place to begin" note="Add your first class. You can add students to its roster from the student records page."/></Panel>}
    {modal && <Modal title="Add a class" close={() => setModal(false)}><form className="modal-form" onSubmit={submit}><Field label="Class name" name="name" placeholder="e.g. Environmental systems" required data-testid="input-course-name"/><div className="form-two"><Field label="Course code" name="code" placeholder="SCI 204" required data-testid="input-course-code"/><Field label="Room" name="room" placeholder="Room 218" data-testid="input-course-room"/></div><Field label="Schedule" name="schedule" placeholder="Tue / Thu · 9:00 AM" data-testid="input-course-schedule"/>{error && <p className="form-error">{error}</p>}{create.isError && <p className="form-error">That class could not be saved. Check the details and try again.</p>}<div className="modal-actions"><Button kind="quiet" type="button" onClick={() => setModal(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} data-testid="button-save-class">{create.isPending ? 'Saving…' : 'Save class'}</Button></div></form></Modal>}
  </>;
}
function ClassCard({ course, index }: { course: Course; index: number }) {
  const colors = ['#dcebe5', '#f3e2d4', '#e6e7d7', '#dce7ec'];
  return <Panel className="class-card"><div className="class-card-top"><div className="class-emblem" style={{ backgroundColor: colors[index % colors.length] }}><BookOpen size={19}/></div><span className="eyebrow">{course.code}</span></div><h2>{course.name}</h2><div className="class-meta"><span><MapPin size={14}/>{course.room || 'Room not set'}</span><span><CalendarDays size={14}/>{course.schedule || 'Schedule not set'}</span></div><div className="class-card-bottom"><span><Users size={15}/>{course.studentCount} students</span><Link href="/students" className="text-link">View roster <ArrowRight size={14}/></Link></div></Panel>;
}

function StudentsPage() {
  const [courseId, setCourseId] = useState<number | undefined>(); const courses = useListCourses({ query: { queryKey: getListCoursesQueryKey() } });
  const list = useListStudents(courseId ? { courseId } : undefined, { query: { queryKey: getListStudentsQueryKey(courseId ? { courseId } : undefined) } });
  const create = useCreateStudent(); const client = useQueryClient(); const [modal, setModal] = useState(false); const [search, setSearch] = useState(''); const [error, setError] = useState('');
  const filtered = (list.data || []).filter(student => `${student.name} ${student.email} ${student.studentNumber}`.toLowerCase().includes(search.toLowerCase()));
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const data = new FormData(e.currentTarget); const selected = data.getAll('courseIds').map(Number); const payload = { name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), studentNumber: String(data.get('studentNumber')).trim(), courseIds: selected }; if (!payload.name || !payload.studentNumber) { setError('Name and student number are required.'); return; } create.mutate({ data: payload }, { onSuccess: () => { setModal(false); setError(''); void client.invalidateQueries({ queryKey: getListStudentsQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } }); }
  return <><PageHeading eyebrow="People, not numbers" title="Students" subtitle="Manage student records and keep consent visible." action={<Button onClick={() => setModal(true)} data-testid="button-add-student"><Plus size={16}/> Add student</Button>}/>
    <Panel className="table-panel"><div className="table-toolbar"><div className="search-field"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a student" aria-label="Search students" data-testid="input-search-students"/></div><SelectField className="filter-select" label="Class" value={courseId ?? ''} onChange={e => setCourseId(e.target.value ? Number(e.target.value) : undefined)} data-testid="select-student-course"><option value="">All classes</option>{courses.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField><span className="toolbar-count">{filtered.length} records</span></div>
      {list.isLoading ? <Loading label="Loading student records"/> : list.isError ? <ErrorState retry={() => void list.refetch()}/> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>STUDENT NUMBER</th><th>CLASSES</th><th>VISUAL</th><th>AUDIO</th><th></th></tr></thead><tbody>{filtered.map(student => <StudentRow key={student.id} student={student} courses={courses.data || []}/>)}</tbody></table></div> : <Empty title={search ? 'No matching students' : 'No students on this roster'} note={search ? 'Try another name, email, or student number.' : 'Add students to create a roster your team can review.'}/>}
    </Panel>
    {modal && <Modal title="Add a student" close={() => setModal(false)}><form className="modal-form" onSubmit={submit}><Field label="Full name" name="name" placeholder="Student name" required data-testid="input-student-name"/><Field label="Email address" name="email" type="email" placeholder="student@school.edu" data-testid="input-student-email"/><Field label="Student number" name="studentNumber" placeholder="e.g. 204-018" required data-testid="input-student-number"/><div className="field"><span>Add to classes</span><div className="course-checkboxes">{courses.data?.map(c => <label key={c.id}><input type="checkbox" name="courseIds" value={c.id}/>{c.name}</label>)}</div></div>{error && <p className="form-error">{error}</p>}{create.isError && <p className="form-error">Student could not be saved. Try again.</p>}<div className="modal-actions"><Button kind="quiet" type="button" onClick={() => setModal(false)}>Cancel</Button><Button type="submit" disabled={create.isPending} data-testid="button-save-student">{create.isPending ? 'Saving…' : 'Save student'}</Button></div></form></Modal>}
  </>;
}
function StudentRow({ student, courses }: { student: Student; courses: Course[] }) {
  const studentCourses = courses.filter(c => student.courseIds.includes(c.id));
  return <tr data-testid={`row-student-${student.id}`}><td><div className="student-identity"><span className="avatar student-avatar">{initials(student.name)}</span><span><strong>{student.name}</strong><small>{student.email || 'No email on file'}</small></span></div></td><td className="mono-subtle">{student.studentNumber}</td><td>{studentCourses.length ? studentCourses.map(c => <span className="class-tag" key={c.id}>{c.code}</span>) : <span className="muted">Not assigned</span>}</td><td><ConsentMark enabled={student.consentFace}/></td><td><ConsentMark enabled={student.consentAudio}/></td><td><Link href="/privacy" className="row-action" data-testid={`link-student-consent-${student.id}`}>Consent <ArrowRight size={13}/></Link></td></tr>;
}
function ConsentMark({ enabled }: { enabled: boolean }) { return <span className={`consent-mark ${enabled ? 'consent-on' : 'consent-off'}`}><span/>{enabled ? 'Granted' : 'Off'}</span>; }

function AttendancePage() {
  const sessions = useListSessions(undefined, { query: { queryKey: getListSessionsQueryKey() } });
  const courses = useListCourses({ query: { queryKey: getListCoursesQueryKey() } });
  const create = useCreateSession(); const [selected, setSelected] = useState<number | null>(null); const [course, setCourse] = useState(''); const [notice, setNotice] = useState('');
  const client = useQueryClient(); const liveSession = sessions.data?.find(s => s.status === 'live');
  const activeId = selected ?? liveSession?.id ?? null;
  const detail = useGetSession(activeId || 0, { query: { enabled: !!activeId, queryKey: getGetSessionQueryKey(activeId || 0) } });
  const update = useUpdateAttendance(); const end = useEndSession();
  function start() {
    const chosen = courses.data?.find(c => c.id === Number(course)) || courses.data?.[0];
    if (!chosen) { setNotice('Add a class before starting a session.'); return; }
    create.mutate({ data: { courseId: chosen.id, room: chosen.room } }, { onSuccess: session => { setSelected(session.id); setNotice('Session opened. Review each attendance mark before ending.'); void client.invalidateQueries({ queryKey: getListSessionsQueryKey() }); } });
  }
  function mark(studentId: number, status: AttendanceRecordStatus) {
    if (!activeId) return;
    update.mutate({ data: { status }, sessionId: activeId, studentId }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getGetSessionQueryKey(activeId) }); void client.invalidateQueries({ queryKey: getListSessionsQueryKey() }); } });
  }
  function finish() { if (!activeId) return; if (!window.confirm('End this session? You can still review it later in History.')) return; end.mutate({ sessionId: activeId }, { onSuccess: () => { setSelected(null); setNotice('Session ended. The record is available in History.'); void client.invalidateQueries({ queryKey: getListSessionsQueryKey() }); void client.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } }); }
  return <><PageHeading eyebrow="A reliable classroom record" title="Attendance" subtitle="Start a session, review uncertain marks, and make corrections in the moment." action={activeId ? <Button kind="outline" onClick={finish} disabled={end.isPending} data-testid="button-end-session"><Square size={14}/>{end.isPending ? 'Ending…' : 'End session'}</Button> : <Button onClick={start} disabled={create.isPending} data-testid="button-start-attendance"><Play size={15}/>{create.isPending ? 'Starting…' : 'Start session'}</Button>}/>{notice && <div className="inline-notice"><CheckCircle2 size={16}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <Panel className="attendance-session-head"><div className="session-head-left"><span className={`session-status-icon ${activeId ? 'is-live' : ''}`}>{activeId ? <span className="pulse-dot"/> : <ClipboardCheck size={18}/>}</span><div><div className="eyebrow">{activeId ? 'SESSION IN PROGRESS' : 'SESSION MONITOR'}</div><h2>{activeId ? detail.data?.session.courseName || liveSession?.courseName || 'Loading session' : 'Ready when your class is'}</h2><p>{activeId ? `${detail.data?.session.room || liveSession?.room || 'Room'} · Started ${formatDate(detail.data?.session.startedAt || liveSession?.startedAt)}` : 'Choose a class to begin a manual attendance session.'}</p></div></div><div className="session-head-stats">{activeId ? <><span><strong>{detail.data?.session.presentCount ?? liveSession?.presentCount ?? '—'}</strong>present</span><span><strong>{detail.data?.attendance?.filter(a => a.status === 'unverified').length ?? liveSession?.reviewCount ?? 0}</strong>to review</span></> : <><div className="session-course-pick"><SelectField label="Class" value={course} onChange={e => setCourse(e.target.value)} data-testid="select-attendance-course"><option value="">Choose a class</option>{courses.data?.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</SelectField></div></>}</div></Panel>
    <div className="attendance-layout"><Panel className="roster-panel"><div className="panel-heading"><div><div className="eyebrow">ROSTER REVIEW</div><h2>{activeId ? `${detail.data?.attendance?.length ?? '—'} students` : 'No active roster'}</h2></div>{activeId && <span className="live-tag"><span className="pulse-dot"/> Live</span>}</div>
      {!activeId ? <Empty title="Start a session to see the roster" note="Attendance marks are always reviewable and can be corrected by a teacher."/> : detail.isLoading ? <Loading label="Loading roster"/> : detail.isError ? <ErrorState retry={() => void detail.refetch()}/> : detail.data?.attendance?.length ? <div className="attendance-table">{detail.data.attendance.map(row => <div className="attendance-row" key={row.studentId} data-testid={`row-attendance-${row.studentId}`}><span className="avatar student-avatar">{initials(row.studentName)}</span><div className="attendance-student"><strong>{row.studentName}</strong><small>{row.studentNumber} · {row.method === 'manual' ? 'Teacher marked' : row.method === 'roster' ? 'Roster' : 'Suggested, needs review'}</small>{row.note && <small className="attendance-note">{row.note}</small>}</div><div className="attendance-controls"><select value={row.status} onChange={e => mark(row.studentId, e.target.value as AttendanceRecordStatus)} aria-label={`Attendance status for ${row.studentName}`} data-testid={`select-attendance-${row.studentId}`}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="unverified">Needs review</option></select>{row.status === 'unverified' && <span className="review-hint"><Eye size={12}/> Review</span>}</div></div>)}</div> : <Empty title="This session has no roster records" note="Check that the class has students assigned before starting."/>}
      {activeId && <div className="roster-foot"><span><ShieldCheck size={15}/> Please verify before finalizing the record.</span><span>{update.isPending ? 'Saving correction…' : 'Changes save as you review'}</span></div>}
    </Panel><aside className="attendance-aside"><Panel><div className="eyebrow">ABOUT OPTIONAL SIGNALS</div><div className="aside-symbol"><Eye size={18}/><AudioLines size={18}/></div><h3>Signals are context, not truth.</h3><p>Visual and audio observations are optional. They cannot tell us a student's attention, emotion, learning, or performance.</p><p className="aside-callout"><AlertTriangle size={14}/> Missing or low-quality media is insufficient data.</p><Link href="/privacy" className="text-link">Review consent settings <ArrowRight size={14}/></Link></Panel>
      <Panel className="manual-card"><div className="eyebrow">TEACHER CONTROL</div><h3>Every mark is reviewable.</h3><p>Choose a status from the roster to correct attendance. Your correction is recorded as a teacher action.</p><div className="manual-icon"><RotateCcw size={16}/> Manual corrections enabled</div></Panel></aside></div>
  </>;
}

function HistoryPage() {
  const list = useListSessions(undefined, { query: { queryKey: getListSessionsQueryKey() } }); const [filter, setFilter] = useState('all'); const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useGetSession(selectedId || 0, { query: { enabled: !!selectedId, queryKey: getGetSessionQueryKey(selectedId || 0) } });
  const visible = (list.data || []).filter(s => filter === 'all' || s.status === filter);
  return <><PageHeading eyebrow="A record of the room" title="Session history" subtitle="Review completed sessions and return to a live roster when needed." action={<Link className="btn btn-outline" href="/attendance"><ClipboardCheck size={15}/> Go to attendance</Link>}/><Panel className="table-panel"><div className="table-toolbar"><div className="eyebrow">SESSIONS</div><SelectField label="Show" value={filter} onChange={e => setFilter(e.target.value)} data-testid="select-history-status"><option value="all">All sessions</option><option value="live">Live now</option><option value="completed">Completed</option></SelectField><span className="toolbar-count">{visible.length} sessions</span></div>{list.isLoading ? <Loading/> : list.isError ? <ErrorState retry={() => void list.refetch()}/> : visible.length ? <div className="table-scroll"><table><thead><tr><th>CLASS</th><th>DATE & TIME</th><th>ROOM</th><th>PRESENT</th><th>REVIEW</th><th>STATUS</th><th></th></tr></thead><tbody>{visible.map(s => <tr key={s.id} data-testid={`row-session-${s.id}`}><td><strong>{s.courseName}</strong></td><td>{formatDate(s.startedAt)}</td><td>{s.room}</td><td><span className="mono-subtle">{s.presentCount} <span className="muted">/ {s.enrolledCount}</span></span></td><td>{s.reviewCount ? <span className="review-number">{s.reviewCount} to review</span> : '—'}</td><td><StatusPill status={s.status === 'live' ? 'Live' : 'Completed'}/></td><td><button className="row-action" onClick={() => setSelectedId(s.id)} data-testid={`button-view-session-${s.id}`}>{s.status === 'live' ? 'Open' : 'View'} <ArrowRight size={13}/></button></td></tr>)}</tbody></table></div> : <Empty title="No sessions in this view" note="Completed and live attendance sessions will be listed here."/>}</Panel>
    {selectedId && <Modal title="Session record" close={() => setSelectedId(null)}>{detail.isLoading ? <Loading label="Loading session record"/> : detail.isError ? <ErrorState retry={() => void detail.refetch()}/> : detail.data ? <div className="history-detail"><div className="history-detail-summary"><strong>{detail.data.session.courseName}</strong><span>{formatDate(detail.data.session.startedAt)} · {detail.data.session.room}</span><span>{detail.data.session.presentCount} present of {detail.data.session.enrolledCount}</span></div><div className="history-detail-list">{detail.data.attendance.map(row => <div key={row.studentId}><span className="avatar student-avatar">{initials(row.studentName)}</span><strong>{row.studentName}</strong><StatusPill status={row.status === 'unverified' ? 'Needs review' : row.status}/></div>)}</div>{detail.data.attendance.length === 0 && <Empty title="No attendance detail" note="There are no student marks on this session record."/>}<div className="history-detail-note"><ShieldCheck size={15}/>Teacher-reviewed records. Optional observations are not displayed as judgments.</div></div> : null}</Modal>}
  </>;
}

function ReportsPage() {
  const courses = useListCourses({ query: { queryKey: getListCoursesQueryKey() } });
  const [dates, setDates] = useState(() => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 30); return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }; });
  const [courseId, setCourseId] = useState<number | undefined>();
  const params = { from: dates.from, to: dates.to, ...(courseId ? { courseId } : {}) };
  const report = useGetAttendanceReport(params, { query: { queryKey: getGetAttendanceReportQueryKey(params) } });
  const rows = report.data || [];
  function exportCsv() {
    const header = ['Student name', 'Student ID', 'Sessions', 'Present', 'Late', 'Absent', 'Attendance rate', 'Participation indicator'];
    const data = rows.map(r => [r.studentName, r.studentId, r.sessions, r.present, r.late, r.absent, `${r.attendanceRate}%`, r.participationIndicator == null ? 'Insufficient data' : `${r.participationIndicator}%`]);
    const csv = [header, ...data].map(line => line.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `classroom-pulse-report-${dates.from}-to-${dates.to}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return <><PageHeading eyebrow="Useful, reviewable records" title="Reports" subtitle="Choose a date range, then export a classroom record for your team." action={<div className="export-actions"><Button kind="outline" onClick={() => window.print()} data-testid="button-print-report"><Download size={15}/> Print / PDF</Button><Button onClick={exportCsv} disabled={!rows.length} data-testid="button-export-csv"><ArrowDownToLine size={15}/> Export CSV</Button></div>}/>
    <Panel className="report-filters"><div className="report-filter-intro"><div className="eyebrow">REPORT FILTERS</div><p>Attendance data only. Participation observations are included only when available and sufficient.</p></div><Field label="From" type="date" value={dates.from} onChange={e => setDates(v => ({ ...v, from: e.target.value }))} data-testid="input-report-from"/><Field label="Through" type="date" value={dates.to} onChange={e => setDates(v => ({ ...v, to: e.target.value }))} data-testid="input-report-to"/><SelectField label="Class" value={courseId ?? ''} onChange={e => setCourseId(e.target.value ? Number(e.target.value) : undefined)} data-testid="select-report-course"><option value="">All classes</option>{courses.data?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField><span className="filter-icon"><Filter size={16}/></span></Panel>
    <div className="report-summary"><Panel><span className="eyebrow">STUDENTS INCLUDED</span><strong>{report.isLoading ? '—' : rows.length}</strong><small>For selected period</small></Panel><Panel><span className="eyebrow">AVERAGE ATTENDANCE</span><strong>{rows.length ? `${(rows.reduce((sum, r) => sum + r.attendanceRate, 0) / rows.length).toFixed(1)}%` : '—'}</strong><small>Across listed students</small></Panel><Panel><span className="eyebrow">OBSERVATIONS</span><strong>{rows.filter(r => r.participationIndicator != null).length}</strong><small>With sufficient data only</small></Panel></div>
    <Panel className="table-panel printable"><div className="panel-heading report-table-heading"><div><div className="eyebrow">ATTENDANCE DETAIL</div><h2>{dates.from} <span>through</span> {dates.to}</h2></div><span className="report-confidence"><ShieldCheck size={15}/> Reviewed records</span></div>{report.isLoading ? <Loading label="Building your report"/> : report.isError ? <ErrorState retry={() => void report.refetch()}/> : rows.length ? <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>SESSIONS</th><th>PRESENT</th><th>LATE</th><th>ABSENT</th><th>ATTENDANCE</th><th>PARTICIPATION SIGNAL</th></tr></thead><tbody>{rows.map(r => <tr key={r.studentId} data-testid={`row-report-${r.studentId}`}><td><strong>{r.studentName}</strong></td><td>{r.sessions}</td><td>{r.present}</td><td>{r.late}</td><td>{r.absent}</td><td><span className="rate-cell"><i style={{ width: `${Math.max(0, Math.min(100, r.attendanceRate))}%` }}/>{r.attendanceRate}%</span></td><td>{r.participationIndicator == null ? <span className="insufficient"><CircleHelp size={14}/> Insufficient data</span> : <span className="signal-available">Available · {r.participationIndicator}%</span>}</td></tr>)}</tbody></table></div> : <Empty title="No report rows for these dates" note="Try a wider date range or a different class. No student data has been inferred."/ >}</Panel>
    <div className="report-footnote"><LockKeyhole size={14}/> Participation indicators are optional observations—not evidence of attention, emotion, learning, or performance.</div>
  </>;
}

function PrivacyPage() {
  const list = useListConsents({ query: { queryKey: getListConsentsQueryKey() } }); const update = useUpdateConsent(); const client = useQueryClient(); const [message, setMessage] = useState('');
  function toggleConsent(studentId: number, faceAnalysis: boolean, audioParticipation: boolean) {
    update.mutate({ data: { faceAnalysis, audioParticipation }, studentId }, { onSuccess: () => { setMessage('Consent preference saved.'); void client.invalidateQueries({ queryKey: getListConsentsQueryKey() }); void client.invalidateQueries({ queryKey: getListStudentsQueryKey() }); }, onError: () => setMessage('Could not save the preference. Please retry.') });
  }
  return <><PageHeading eyebrow="Consent and boundaries" title="Privacy & consent" subtitle="Optional signals stay optional. Consent is visible, specific, and changeable."/><div className="privacy-principles"><Panel className="principle-card"><span className="principle-icon"><Eye size={17}/></span><div className="eyebrow">VISUAL</div><h3>Face analysis</h3><p>Only used when consent is granted. It does not identify or grade students.</p><span className="principle-tag">Optional, per student</span></Panel><Panel className="principle-card"><span className="principle-icon principle-audio"><AudioLines size={17}/></span><div className="eyebrow">AUDIO</div><h3>Audio participation</h3><p>Only an optional participation signal. It is never treated as a measure of learning.</p><span className="principle-tag">Optional, per student</span></Panel><Panel className="principle-card principle-safe"><span className="principle-icon"><ShieldCheck size={17}/></span><div className="eyebrow">DATA QUALITY</div><h3>Insufficient means unknown</h3><p>Missing or poor-quality media is recorded as insufficient data. We do not fill in the gaps.</p><span className="principle-tag">No inference</span></Panel></div>
    {message && <div className={`inline-notice ${message.startsWith('Could') ? 'notice-error' : ''}`}><CheckCircle2 size={16}/>{message}<button onClick={() => setMessage('')} aria-label="Dismiss"><X size={14}/></button></div>}
    <Panel className="table-panel consent-table-panel"><div className="panel-heading"><div><div className="eyebrow">STUDENT PREFERENCES</div><h2>Consent records</h2></div><span className="consent-caption"><LockKeyhole size={14}/> Only recorded preferences</span></div>{list.isLoading ? <Loading label="Loading consent records"/> : list.isError ? <ErrorState retry={() => void list.refetch()}/> : list.data?.length ? <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>FACE ANALYSIS</th><th>AUDIO PARTICIPATION</th><th>LAST UPDATED</th></tr></thead><tbody>{list.data.map(consent => <tr key={consent.studentId} data-testid={`row-consent-${consent.studentId}`}><td><strong>{consent.studentName}</strong></td><td><ConsentToggle label={`Face analysis consent for ${consent.studentName}`} checked={consent.faceAnalysis} disabled={update.isPending} onChange={value => toggleConsent(consent.studentId, value, consent.audioParticipation)} testId={`toggle-face-${consent.studentId}`}/></td><td><ConsentToggle label={`Audio participation consent for ${consent.studentName}`} checked={consent.audioParticipation} disabled={update.isPending} onChange={value => toggleConsent(consent.studentId, consent.faceAnalysis, value)} testId={`toggle-audio-${consent.studentId}`}/></td><td className="muted">{formatDate(consent.updatedAt)}</td></tr>)}</tbody></table></div> : <Empty title="No consent records yet" note="Consent records appear here when students have been added to the workspace."/ >}</Panel>
    <div className="privacy-footer-note"><ShieldCheck size={17}/><div><strong>Human review stays central.</strong><span>No visual or audio signal is a verdict about a student. Teachers can review and correct attendance at any time.</span></div></div>
  </>;
}
function ConsentToggle({ label, checked, disabled, onChange, testId }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void; testId: string }) {
  return <label className="toggle-line"><span className={`switch ${checked ? 'switch-on' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} aria-label={label} data-testid={testId}/><i/></span><span className={`toggle-label ${checked ? 'toggle-enabled' : ''}`}>{checked ? 'Granted' : 'Off'}</span></label>;
}

function DashboardRoute() { return <SignedIn><AppShell><DashboardPage/></AppShell></SignedIn>; }
function AttendanceRoute() { return <SignedIn><AppShell><AttendancePage/></AppShell></SignedIn>; }
function StudentsRoute() { return <SignedIn><AppShell><StudentsPage/></AppShell></SignedIn>; }
function CoursesRoute() { return <SignedIn><AppShell><CoursesPage/></AppShell></SignedIn>; }
function HistoryRoute() { return <SignedIn><AppShell><HistoryPage/></AppShell></SignedIn>; }
function ReportsRoute() { return <SignedIn><AppShell><ReportsPage/></AppShell></SignedIn>; }
function PrivacyRoute() { return <SignedIn><AppShell><PrivacyPage/></AppShell></SignedIn>; }
function RoutedErrorBoundary({ children }: { children: ReactNode }) { const [location] = useLocation(); return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>; }
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your classroom workspace' } }, signUp: { start: { title: 'Create your workspace', subtitle: 'A considered view of your classroom starts here' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <ClerkQueryClientCacheInvalidator/><RoutedErrorBoundary><Switch>
      <Route path="/" component={HomeRedirect}/>
      <Route path="/sign-in/*?" component={() => <AuthPage type="in"/>}/>
      <Route path="/sign-up/*?" component={() => <AuthPage type="up"/>}/>
      <Route path="/dashboard" component={DashboardRoute}/>
      <Route path="/attendance" component={AttendanceRoute}/>
      <Route path="/students" component={StudentsRoute}/>
      <Route path="/courses" component={CoursesRoute}/>
      <Route path="/history" component={HistoryRoute}/>
      <Route path="/reports" component={ReportsRoute}/>
      <Route path="/privacy" component={PrivacyRoute}/>
      <Route component={NotFound}/>
    </Switch></RoutedErrorBoundary>
  </ClerkProvider>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
