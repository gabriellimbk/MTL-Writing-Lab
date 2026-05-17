import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, GraduationCap, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function StudentJoin() {
  const navigate = useNavigate();
  const { code: urlCode } = useParams();
  const [code, setCode] = useState(urlCode || '');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/student/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.toUpperCase(),
          displayName: name.trim(),
          studentId: localStorage.getItem('writing_lab_student_id'),
          studentToken: localStorage.getItem('writing_lab_student_token')
        })
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Could not join the session.');
      }

      localStorage.setItem('writing_lab_student_id', body.studentId);
      localStorage.setItem('writing_lab_student_token', body.studentToken);
      localStorage.setItem('student_name', name.trim());

      navigate(`/student/write/${body.session.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f2] flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl p-6 md:p-10 shadow-geometric-lg">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3">
              <GraduationCap className="w-8 h-8 text-white -rotate-3" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Enter Room</h1>
            <p className="text-slate-400 text-sm font-medium mt-2">Join your class writing session.</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 block">Room Code</label>
                <input 
                  required
                  type="text"
                  maxLength={6}
                  placeholder="ABCDEF"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-xl focus:border-brand-500 focus:bg-white outline-none transition-all font-mono text-3xl tracking-[0.3em] font-bold text-center placeholder:tracking-normal placeholder:font-sans"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2 block">Your Name</label>
                <input 
                  required
                  type="text"
                  placeholder="e.g. Alex Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-5 py-4 rounded-xl focus:border-brand-500 focus:bg-white outline-none transition-all font-bold text-lg"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-[10px] font-black uppercase tracking-tight bg-red-50 p-4 rounded-xl border border-red-100">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button 
              disabled={loading}
              className="w-full bg-brand-500 text-white py-5 rounded-xl font-black uppercase tracking-[0.2em] shadow-lg shadow-brand-900/10 hover:bg-brand-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Join Session <ArrowRight className="w-5 h-5" /></>}
            </button>
          </form>
        </div>

        <button 
          onClick={() => navigate('/')}
          className="w-full mt-8 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:text-slate-500 transition-colors"
        >
          Return to Portal
        </button>
      </motion.div>
    </div>
  );
}
