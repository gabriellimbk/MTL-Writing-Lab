import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Clock, LogOut, ChevronRight, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate } from '../lib/utils';
import { TABLES } from '../lib/tables';

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [questions, setQuestions] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState('');
  const [deletingQuestionId, setDeletingQuestionId] = useState('');

  // Modal states
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);

  // Form states
  const [newQuestionTitle, setNewQuestionTitle] = useState('');
  const [newQuestionPrompt, setNewQuestionPrompt] = useState('');
  const [selectedQuestionId, setSelectedQuestionId] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  async function fetchDashboardData() {
    if (!user) return;
    setLoading(true);
    setErrorMessage('');

    try {
      const token = await getTeacherToken();
      const response = await fetch('/api/teacher/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || 'Could not load shared teacher dashboard.');
      }

      setQuestions(body.questions || []);
      setSessions(body.sessions || []);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
    setLoading(false);
  }

  async function createQuestion(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage('');

    try {
      const token = await getTeacherToken();
      const response = await fetch('/api/teacher/question', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newQuestionTitle,
          prompt: newQuestionPrompt
        })
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || 'Could not save prompt.');
      }

      if (body.question) {
        setQuestions([body.question, ...questions]);
        setShowQuestionModal(false);
        setNewQuestionTitle('');
        setNewQuestionPrompt('');
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      return;
    }
  }

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    const code = nanoid(6).toUpperCase();
    setErrorMessage('');

    try {
      const token = await getTeacherToken();
      const response = await fetch('/api/teacher/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          questionId: selectedQuestionId,
          sessionCode: code
        })
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || 'Could not create session.');
      }

      if (body.session) {
        navigate(`/teacher/session/${body.session.id}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      return;
    }
  }

  async function deleteSession(e: React.MouseEvent, session: any) {
    e.stopPropagation();
    setErrorMessage('');

    const confirmed = window.confirm(`Delete session ${session.session_code}? This removes its student entries and essays.`);
    if (!confirmed) return;

    setDeletingSessionId(session.id);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setErrorMessage('Please sign in again before deleting a session.');
      setDeletingSessionId('');
      return;
    }

    const response = await fetch(`/api/teacher/session/${encodeURIComponent(session.id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setErrorMessage(body.error || 'Could not delete that session.');
      setDeletingSessionId('');
      return;
    }

    setSessions(current => current.filter(item => item.id !== session.id));
    setDeletingSessionId('');
  }

  async function deleteQuestion(e: React.MouseEvent, question: any) {
    e.stopPropagation();
    setErrorMessage('');

    const confirmed = window.confirm(`Delete "${question.question_title}" from the shared library? Existing sessions will keep their copied prompt.`);
    if (!confirmed) return;

    setDeletingQuestionId(question.id);
    try {
      const token = await getTeacherToken();
      const response = await fetch(`/api/teacher/question/${encodeURIComponent(question.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || 'Could not delete that prompt.');
      }

      setQuestions(current => current.filter(item => item.id !== question.id));
      if (selectedQuestionId === question.id) setSelectedQuestionId('');
    } catch (err: any) {
      setErrorMessage(err.message);
    }
    setDeletingQuestionId('');
  }

  return (
    <div className="flex h-screen bg-[#f4f5f2] overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-72 lg:w-80 bg-white border-r border-slate-200 hidden md:flex flex-col shrink-0">
        <div className="p-8 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-brand-500 rounded flex items-center justify-center">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <h1 className="text-lg font-extrabold tracking-tight uppercase">Writing Lab</h1>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Teacher Console</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-8 space-y-8">
          <div>
            <div className="flex items-center justify-between px-4 mb-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Library</h3>
              <button 
                onClick={() => setShowQuestionModal(true)}
                className="p-1 hover:bg-slate-100 rounded text-brand-500 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {questions.map(q => (
                <div key={q.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group border border-transparent hover:border-slate-100">
                  <BookOpen className="w-4 h-4 text-slate-400 group-hover:text-brand-500 shrink-0" />
                  <span className="text-sm font-semibold text-slate-600 truncate group-hover:text-slate-900 flex-1 min-w-0">{q.question_title}</span>
                  <button
                    type="button"
                    title="Delete prompt"
                    onClick={(event) => deleteQuestion(event, q)}
                    disabled={deletingQuestionId === q.id}
                    className="w-7 h-7 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {questions.length === 0 && <p className="text-[11px] text-slate-400 px-4">No prompts yet</p>}
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <button 
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 text-slate-500 hover:text-red-600 transition-colors font-bold text-xs uppercase tracking-widest"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 md:h-24 bg-white border-b border-slate-200 px-4 md:px-12 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tight">Active Sessions</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Realtime monitoring active</p>
            </div>
          </div>
          <button 
            onClick={() => setShowSessionModal(true)}
            className="bg-brand-500 text-white px-8 py-3.5 rounded-lg font-bold text-xs uppercase tracking-widest flex items-center gap-3 hover:bg-brand-600 transition-all shadow-lg shadow-brand-900/10"
          >
            <Plus className="w-4 h-4" />
            Create Session
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-12 space-y-4 md:space-y-6">
          {errorMessage && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-5 py-4 rounded-xl text-sm font-bold">
              {errorMessage}
            </div>
          )}

          {sessions.map(session => (
            <motion.div 
              key={session.id}
              whileHover={{ x: 4 }}
              onClick={() => navigate(`/teacher/session/${session.id}`)}
              className="bg-white border border-slate-200 p-4 md:p-6 rounded-xl flex items-center justify-between cursor-pointer hover:border-brand-400 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-8">
                <div className="w-14 h-14 bg-slate-900 rounded-lg flex items-center justify-center text-white font-mono text-xl font-bold tracking-tighter">
                  {session.session_code.slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-4 mb-1.5">
                    <span className="font-black text-xl text-slate-900 tracking-tight">{session.session_code}</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border",
                      session.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                    )}>
                      {session.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><BookOpen className="w-3 h-3" /> {session.question_title}</span>
                    <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {formatDate(session.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {session.teacher_id === user?.id && (
                  <button
                    type="button"
                    title="Delete session"
                    onClick={(event) => deleteSession(event, session)}
                    disabled={deletingSessionId === session.id}
                    className="w-10 h-10 rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-brand-50 transition-colors">
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 transition-colors" />
                </div>
              </div>
            </motion.div>
          ))}

          {sessions.length === 0 && !loading && (
            <div className="text-center py-32 bg-white rounded-2xl border border-dashed border-slate-300">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="w-8 h-8 text-slate-200" />
              </div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">Workspace Empty</h3>
              <p className="text-slate-400 text-sm mb-8">Launch a new session to begin collecting student writing.</p>
              <button 
                onClick={() => setShowSessionModal(true)}
                className="bg-slate-900 text-white px-10 py-4 rounded-lg font-bold text-xs uppercase tracking-[0.2em]"
              >
                Launch First Session
              </button>
            </div>
          )}
        </div>

        <footer className="h-10 bg-[#25282d] border-t border-[#1a1e24] px-8 flex items-center justify-between text-[10px] font-bold text-[#5c6470] tracking-wider uppercase shrink-0">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
               <span>Backend Ready</span>
             </div>
             <span className="opacity-30">|</span>
             <span>System V1.0.4</span>
          </div>
          <span>Classroom Writer // Geometric Balance Theme</span>
        </footer>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {(showQuestionModal || showSessionModal) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 z-50"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white p-10 rounded-2xl w-full max-w-md border border-slate-200 shadow-2xl"
            >
              {showQuestionModal && (
                <>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Add Prompt</h3>
                  <p className="text-slate-500 text-sm mb-8">Save custom prompts to your library for future use.</p>
                  <form onSubmit={createQuestion} className="space-y-6">
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Title</label>
                        <input 
                          autoFocus
                          placeholder="Short descriptive title"
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-4 rounded-lg outline-none focus:border-brand-500 focus:bg-white transition-all font-medium"
                          value={newQuestionTitle}
                          onChange={e => setNewQuestionTitle(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Writing Prompt</label>
                        <textarea 
                          placeholder="Detailed instructions for students..."
                          className="w-full bg-slate-50 border border-slate-200 px-4 py-4 rounded-lg min-h-[160px] outline-none focus:border-brand-500 focus:bg-white transition-all font-medium resize-none"
                          value={newQuestionPrompt}
                          onChange={e => setNewQuestionPrompt(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button type="button" onClick={() => setShowQuestionModal(false)} className="flex-1 py-4 font-bold text-xs uppercase tracking-widest text-slate-400">Cancel</button>
                      <button type="submit" className="flex-1 py-4 bg-brand-500 text-white rounded-lg font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-900/10">Add to Library</button>
                    </div>
                  </form>
                </>
              )}

              {showSessionModal && (
                <>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">New Session</h3>
                  <p className="text-slate-500 text-sm mb-8">Configure your workspace before starting.</p>
                  <form onSubmit={createSession} className="space-y-6">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Choose Prompt</label>
                      <select 
                        required
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-4 rounded-lg outline-none focus:border-brand-500 focus:bg-white transition-all font-bold text-sm"
                        value={selectedQuestionId}
                        onChange={e => setSelectedQuestionId(e.target.value)}
                      >
                        <option value="">Select a prompt...</option>
                        {questions.map(q => <option key={q.id} value={q.id}>{q.question_title}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button type="button" onClick={() => setShowSessionModal(false)} className="flex-1 py-4 font-bold text-xs uppercase tracking-widest text-slate-400">Cancel</button>
                      <button type="submit" className="flex-1 py-4 bg-slate-900 text-white rounded-lg font-bold text-xs uppercase tracking-widest shadow-lg">Start Session</button>
                    </div>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Minimal polyfill for cn if it wasn't used earlier
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

async function getTeacherToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Please sign in again before loading teacher data.');
  return token;
}
