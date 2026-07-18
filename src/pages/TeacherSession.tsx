import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSessionRealtime } from '../hooks/useSessionRealtime';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { 
  Users, Play, Square, Loader2, Sparkles, 
  RefreshCcw, Eye, ChevronLeft, CheckCircle2,
  BookOpen, Download, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatTimerRemaining, getSessionTimerRemainingMs, isTimerLow } from '../lib/session-timer';

const CONTINUATION_BREAK_PATTERN = /\n*\[\[WRITING_LAB_CONTINUE_BREAK\]\]\n*/g;
const TIMER_MINUTE_OPTIONS = [
  ...Array.from({ length: 20 }, (_, index) => index + 1),
  25, 30, 35, 40, 45, 50, 60, 70, 80
];

function cleanContinuationMarkers(content = '') {
  return content.replace(CONTINUATION_BREAK_PATTERN, '\n\n').trim();
}

function getWordCount(content = '') {
  return cleanContinuationMarkers(content).split(/\s+/).filter(Boolean).length;
}

export default function TeacherSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { session, students, essays, error: sessionLoadError } = useSessionRealtime(id);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedTimerMinutes, setSelectedTimerMinutes] = useState(45);
  const [timerRemainingMs, setTimerRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (TIMER_MINUTE_OPTIONS.includes(Number(session?.timer_duration_minutes))) {
      setSelectedTimerMinutes(Number(session.timer_duration_minutes));
    }
  }, [session?.id, session?.timer_duration_minutes]);

  useEffect(() => {
    const updateTimer = () => setTimerRemainingMs(getSessionTimerRemainingMs(session));
    updateTimer();

    const interval = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  if (!session && sessionLoadError) return (
    <div className="h-screen flex items-center justify-center bg-[#faf8f3] p-6">
      <div className="max-w-md rounded-2xl border border-red-100 bg-white p-8 shadow-geometric text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500 mb-3">Session Load Failed</p>
        <h1 className="text-2xl font-black text-slate-900 mb-3">Could not open this session</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">{sessionLoadError}</p>
        <button
          type="button"
          onClick={() => navigate('/teacher')}
          className="px-5 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );

  if (!session) return (
    <div className="h-screen flex items-center justify-center bg-[#faf8f3]">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
    </div>
  );

  async function updateStatus(status: string, timerMinutes?: number) {
    setLoadingAction('status');
    setErrorMessage('');
    try {
      const token = await getTeacherToken();
      const response = await fetch('/api/session/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId: session.id, status, timerMinutes })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Could not update session status');
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
    setLoadingAction(null);
  }

  async function generateAIFeedback() {
    setLoadingAction('ai');
    setErrorMessage('');
    try {
      if (essays.length === 0) {
        throw new Error('No student essays found yet. Ask students to join again or write before generating feedback.');
      }

      const token = await getTeacherToken();
      const pendingFeedback = essays.map(essay => {
        return fetch('/api/ai-feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            essayId: essay.id
          })
        });
      });
      const responses = await Promise.all(pendingFeedback);
      const failed = responses.find(response => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body.error || 'Some feedback could not be generated');
      }

      await updateStatus('returned');
    } catch (err: any) {
      setErrorMessage(err.message);
    }
    setLoadingAction(null);
  }

  async function assignPeerReviews() {
    setLoadingAction('peer');
    setErrorMessage('');
    try {
      const token = await getTeacherToken();
      const response = await fetch('/api/peer-review/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId: session.id })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Could not assign peer reviews');
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
    setLoadingAction(null);
  }

  async function returnToStudents() {
    setLoadingAction('return');
    await updateStatus('returned');
    setLoadingAction(null);
  }

  async function continueSession() {
    setLoadingAction('continue');
    setErrorMessage('');
    try {
      const token = await getTeacherToken();
      const response = await fetch('/api/session/continue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId: session.id, timerMinutes: selectedTimerMinutes })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Could not continue the session');
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
    setLoadingAction(null);
  }

  async function downloadSessionPdf() {
    setLoadingAction('pdf');
    setErrorMessage('');
    try {
      const token = await getTeacherToken();
      const response = await fetch(`/api/teacher/session/${encodeURIComponent(session.id)}/report.pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Could not download the PDF report');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${session.session_code || 'session'}-submissions-feedback.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
    setLoadingAction(null);
  }

  const avgWordCount = essays.length > 0 
    ? Math.round(essays.reduce((acc, curr) => acc + getWordCount(curr.content || ''), 0) / essays.length)
    : 0;
  const canManageSession = session.teacher_id === user?.id;
  const timerLabel = formatTimerRemaining(timerRemainingMs);

  return (
    <div className="h-screen bg-[#faf8f3] text-[#242523] font-sans flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-500 rounded flex items-center justify-center">
            <span className="text-white font-bold text-lg leading-none">W</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase">Writing Lab <span className="text-slate-400 font-normal">/ Session Console</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-black tracking-widest",
            session.status === 'active' ? "bg-brand-50 text-brand-600 border-brand-200" : "bg-slate-50 text-slate-400 border-slate-200"
          )}>
            <span className={cn("w-2 h-2 rounded-full", session.status === 'active' ? "bg-brand-500 animate-pulse" : "bg-slate-300")}></span>
            SESSION {session.status.toUpperCase()}
          </div>
          {timerLabel && (
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-black tracking-widest tabular-nums",
              isTimerLow(timerRemainingMs) ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-600 border-slate-200"
            )}>
              <Clock className="w-3.5 h-3.5" />
              {timerLabel}
            </div>
          )}
          <div className="h-8 w-px bg-slate-200"></div>
          <div className="flex items-center gap-3 text-sm font-medium">
            <div className="text-right leading-none">
              <p className="font-bold">Instructor</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">Console Master</p>
            </div>
            <div className="w-10 h-10 bg-slate-200 rounded-full border border-slate-300 flex items-center justify-center text-slate-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Session Controls & Students */}
        <aside className="w-64 lg:w-72 bg-white border-r border-slate-200 hidden md:flex flex-col">
          <div className="p-6 space-y-6">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Room Code</label>
              <div className="bg-slate-900 text-white p-4 rounded-lg flex items-center justify-between shadow-lg">
                <span className="text-2xl font-mono tracking-[0.2em] font-bold">{session.session_code}</span>
                <button className="hover:text-brand-400 transition-colors">
                  <RefreshCcw className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
              {!canManageSession && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  View-only shared session
                </div>
              )}
              {canManageSession && session.status === 'waiting' && (
                <>
                  <TimerSlider value={selectedTimerMinutes} onChange={setSelectedTimerMinutes} disabled={!!loadingAction} />
                  <button
                    onClick={() => updateStatus('active', selectedTimerMinutes)}
                    disabled={!!loadingAction}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" /> Start Session
                  </button>
                </>
              )}
              {canManageSession && session.status === 'active' && (
                <button 
                  onClick={() => updateStatus('ended')}
                  disabled={!!loadingAction}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg shadow-sm transition-all"
                >
                  End Session
                </button>
              )}
              {canManageSession && ['ended', 'peer_review', 'returned'].includes(session.status) && (
                <>
                  <TimerSlider value={selectedTimerMinutes} onChange={setSelectedTimerMinutes} disabled={!!loadingAction} />
                  <button
                    onClick={continueSession}
                    disabled={!!loadingAction}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    {loadingAction === 'continue' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    Continue Session
                  </button>
                  <button 
                    onClick={generateAIFeedback}
                    disabled={!!loadingAction}
                    className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    {loadingAction === 'ai' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate AI Feedback
                  </button>
                  <button 
                    onClick={assignPeerReviews}
                    disabled={!!loadingAction}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    Swap for Peer Review
                  </button>
                </>
              )}
              {['ended', 'peer_review', 'returned'].includes(session.status) && (
                <button
                  onClick={downloadSessionPdf}
                  disabled={!!loadingAction}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {loadingAction === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download PDF
                </button>
              )}
              {canManageSession && session.status === 'peer_review' && (
                <button
                  onClick={returnToStudents}
                  disabled={!!loadingAction}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  {loadingAction === 'return' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Return Feedback
                </button>
              )}
              <button 
                onClick={() => navigate('/teacher')}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-lg transition-all text-xs uppercase tracking-widest"
              >
                Exit to Dashboard
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 border-t border-slate-100">
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Students ({students.length})</span>
              <span className="text-[9px] bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded font-bold">Realtime</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {students.map(student => {
                const essay = essays.find(e => e.student_id === student.student_id);
                const wordCount = getWordCount(essay?.content || '');
                return (
                  <div key={student.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-semibold text-slate-700">{student.display_name}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 tabular-nums">{wordCount} WDS</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col bg-[#faf8f3] p-4 md:p-8 overflow-y-auto">
          {errorMessage && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-5 py-4 rounded-xl text-sm font-bold mb-6">
              {errorMessage}
            </div>
          )}

          {/* Essay Prompt Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 md:p-8 shadow-sm mb-6 md:mb-8">
            <h2 className="text-[10px] font-black text-brand-500 uppercase tracking-[0.2em] mb-2">Current Question Prompt</h2>
            <h3 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight font-serif leading-tight mb-4 md:mb-6">
              {session.question_title}
            </h3>
            {session.question_prompt && (
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-slate-600 leading-relaxed max-w-4xl font-medium">
                  {session.question_prompt}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Avg. Word Count</p>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">{avgWordCount}</p>
              <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((avgWordCount / 500) * 100, 100)}%` }}
                  className="h-full bg-brand-500"
                />
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Students</p>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">{students.length}</p>
              <p className="text-[10px] text-green-600 font-bold uppercase mt-2">Monitoring synced</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Submissions</p>
              <p className="text-4xl font-black text-slate-900 tracking-tighter">
                {essays.filter(e => e.is_submitted).length}
              </p>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-tight">Realtime update</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {essays.map(essay => {
              const student = students.find(s => s.student_id === essay.student_id);
              return (
                <motion.div 
                  key={essay.id}
                  layout
                  onClick={() => navigate(`/display/${essay.id}`)}
                  className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:border-brand-400 hover:shadow-md transition-all group cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-slate-50 rounded flex items-center justify-center group-hover:bg-brand-50">
                      <BookOpen className="w-5 h-5 text-slate-400 group-hover:text-brand-500" />
                    </div>
                    {essay.is_submitted && (
                      <span className="bg-green-50 text-green-700 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-green-100">
                        Submitted
                      </span>
                    )}
                  </div>
                  <h5 className="font-black text-slate-900 uppercase tracking-tight mb-1 truncate text-sm">
                    {student?.display_name || 'Anonymous'}
                  </h5>
                  <p className="text-slate-400 text-[10px] font-bold uppercase mb-4 tracking-wider">
                    {getWordCount(essay.content || '')} WORDS
                  </p>
                  <p className="line-clamp-3 text-slate-400 text-xs leading-relaxed font-serif opacity-60 mb-6">
                    {cleanContinuationMarkers(essay.content || '') || 'Drafting...'}
                  </p>
                  <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 uppercase text-[9px] font-black tracking-widest text-brand-500">
                      {essay.ai_feedback ? <><Sparkles className="w-3 h-3" /> Feedback Ready</> : <><Loader2 className="w-3 h-3 animate-spin" /> Drafting</>}
                    </div>
                    <Eye className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

function TimerSlider({ value, onChange, disabled }: { value: number; onChange: (minutes: number) => void; disabled?: boolean }) {
  const sliderIndex = Math.max(0, TIMER_MINUTE_OPTIONS.indexOf(value));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor="session-timer-slider" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Countdown Timer
        </label>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-black tabular-nums text-brand-700">
          {value} {value === 1 ? 'minute' : 'minutes'}
        </span>
      </div>
      <input
        id="session-timer-slider"
        type="range"
        min="0"
        max={TIMER_MINUTE_OPTIONS.length - 1}
        step="1"
        value={sliderIndex}
        onChange={(event) => onChange(TIMER_MINUTE_OPTIONS[Number(event.target.value)])}
        disabled={disabled}
        aria-label="Countdown timer duration"
        aria-valuetext={`${value} ${value === 1 ? 'minute' : 'minutes'}`}
        className="timer-slider w-full"
      />
      <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-400">
        <span>1 min</span>
        <span>80 min</span>
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

async function getTeacherToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again before running this action.');
  return token;
}
