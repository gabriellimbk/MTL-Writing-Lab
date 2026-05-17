import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, GraduationCap, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { requireSupabaseConfig, supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export default function Landing() {
  const navigate = useNavigate();
  const { isTeacher } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password1');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleTeacherSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.endsWith('@ri.edu.sg')) {
      setMessage('Teacher email must end with @ri.edu.sg.');
      setLoading(false);
      return;
    }

    try {
      requireSupabaseConfig();
    } catch (err: any) {
      setMessage(err.message);
      setLoading(false);
      return;
    }
    
    const firstAttempt = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (!firstAttempt.error) {
      navigate('/teacher');
      setLoading(false);
      return;
    }

    const provisionResponse = await fetch('/api/teacher/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password })
    });

    if (!provisionResponse.ok) {
      const body = await provisionResponse.json().catch(() => ({}));
      setMessage(body.error || firstAttempt.error.message);
      setLoading(false);
      return;
    }

    const secondAttempt = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (secondAttempt.error) {
      setMessage(secondAttempt.error.message);
    } else {
      navigate('/teacher');
    }
    setLoading(false);
  };

  if (isTeacher) {
    navigate('/teacher');
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f4f5f2] flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full text-center space-y-10 md:space-y-16"
      >
        <div className="space-y-6">
          <div className="w-20 h-20 bg-brand-500 rounded-xl flex items-center justify-center mx-auto shadow-lg">
            <BookOpen className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tighter text-slate-900 uppercase">
              Writing<span className="text-brand-500">Lab</span>
            </h1>
            <p className="text-slate-500 font-medium tracking-tight">
              A precise workspace for classroom writing and peer analysis.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 md:gap-10">
          {/* Student Entrance */}
          <div className="bg-white border border-slate-200 p-6 md:p-10 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-200 transition-all flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-6 border border-green-100">
              <GraduationCap className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2 uppercase tracking-wide">Student Portal</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">Join an ongoing session with your class code.</p>
            <button 
              onClick={() => navigate('/student')}
              className="w-full bg-slate-900 text-white py-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
            >
              Enter Session Code <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Teacher Entrance */}
          <div className="bg-white border border-slate-200 p-6 md:p-10 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-200 transition-all flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-brand-50 rounded-full flex items-center justify-center mb-6 border border-brand-100">
              <BookOpen className="w-6 h-6 text-brand-500" />
            </div>
            <h2 className="text-xl font-bold mb-2 uppercase tracking-wide">Teacher Console</h2>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">Manage sessions, generate AI feedback, and review essays.</p>
            
            <form onSubmit={handleTeacherSignIn} className="w-full space-y-4">
              <div className="relative">
                <input 
                  type="email" 
                  placeholder="name@school.edu"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-4 rounded-lg focus:border-brand-500 focus:bg-white outline-none transition-all text-sm font-medium"
                />
              </div>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-4 rounded-lg focus:border-brand-500 focus:bg-white outline-none transition-all text-sm font-medium"
                />
              </div>
              <button 
                disabled={loading}
                className="w-full bg-brand-500 text-white py-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Log in to Console'}
              </button>
              {message && <p className="text-xs font-bold text-brand-500 tracking-tight">{message}</p>}
            </form>
          </div>
        </div>

        <div className="pt-8 md:pt-20 text-[10px] font-bold text-slate-300 uppercase tracking-[0.4em]">
          Powered by Supabase + OpenAI
        </div>
      </motion.div>
    </div>
  );
}
