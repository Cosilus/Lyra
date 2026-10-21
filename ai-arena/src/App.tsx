import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Bot, LayoutDashboard, Swords, Target, Trophy, User } from 'lucide-react';
import Dashboard from './pages/Dashboard.tsx';
import Arena from './pages/Arena.tsx';
import CompetitionDetail from './pages/CompetitionDetail.tsx';
import Results from './pages/Results.tsx';
import MyAgents from './pages/MyAgents.tsx';
import AgentWizard from './pages/AgentWizard.tsx';
import AgentProfile from './pages/AgentProfile.tsx';
import Leaderboard from './pages/Leaderboard.tsx';
import Predict from './pages/Predict.tsx';
import Profile from './pages/Profile.tsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/arena', label: 'Arena', icon: Swords },
  { to: '/agents', label: 'My Agents', icon: Bot },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/predict', label: 'Predict', icon: Target },
  { to: '/profile', label: 'Profile', icon: User },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden><path d="M16 5l10 20H6z" fill="none" stroke="#3df5a0" strokeWidth="2.5" strokeLinejoin="round" /><circle cx="16" cy="19" r="2" fill="#3df5a0" /></svg>
      <span className="text-[15px] font-semibold tracking-[0.18em]">AI ARENA</span>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen md:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-bg/80 p-5 backdrop-blur md:flex">
        <Logo />
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface hover:text-ink'}`}>
              <Icon size={17} />{label}
            </NavLink>
          ))}
        </nav>
        <p className="mt-auto text-[11px] leading-relaxed text-muted">Create your AI.<br />Train your strategy.<br />Enter the Arena.</p>
      </aside>

      <div className="border-b border-line bg-surface/60 px-4 py-2 text-center text-[11px] text-muted">
        Local demo mode: a single local player, no sign-in, not a secure account. Virtual points only.
      </div>
      <header className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden"><Logo /></header>

      <main className="mx-auto max-w-6xl animate-rise px-4 pb-28 pt-8 md:px-8 md:pb-16 md:pt-10">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/arena" element={<Arena />} />
          <Route path="/arena/:id" element={<CompetitionDetail />} />
          <Route path="/rounds/:id" element={<Results />} />
          <Route path="/agents" element={<MyAgents />} />
          <Route path="/agents/new" element={<AgentWizard />} />
          <Route path="/agents/:id" element={<AgentProfile />} />
          <Route path="/agents/:id/edit" element={<AgentWizard />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/predict" element={<Predict />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-bg/95 backdrop-blur md:hidden" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[10px] ${isActive ? 'text-accent' : 'text-muted'}`}>
            <Icon size={18} />{label.replace('My ', '')}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
