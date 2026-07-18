import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Loader2, Save, Send, AlertCircle, Clock, 
  MessageSquare, Sparkles, BookOpen, ChevronRight, CheckCircle2, RefreshCcw, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatTimerRemaining, getSessionTimerRemainingMs, isTimerLow } from '../lib/session-timer';

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

const CONTINUATION_BREAK = '[[WRITING_LAB_CONTINUE_BREAK]]';
const CONTINUATION_BREAK_PATTERN = /\n*\[\[WRITING_LAB_CONTINUE_BREAK\]\]\n*/g;

function cleanContinuationMarkers(content = '') {
  return content.replace(CONTINUATION_BREAK_PATTERN, '\n\n').trim();
}

function splitContinuationContent(content = '') {
  const parts = content.split(CONTINUATION_BREAK_PATTERN);
  if (parts.length <= 1) return { locked: '', current: content };

  return {
    locked: parts.slice(0, -1).join('\n\n').trim(),
    current: parts[parts.length - 1] || ''
  };
}

function mergeContinuationContent(locked: string, current: string) {
  return locked ? `${locked}\n\n${CONTINUATION_BREAK}\n\n${current}` : current;
}

function splitEssayParagraphs(content = '') {
  const paragraphs = cleanContinuationMarkers(content).split(/\n{2,}|\n/).map(part => part.trim()).filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [content || 'Draft Empty'];
}

function getCommentLineIndex(comment: any) {
  return Number(comment.line_index) || 0;
}

function getParagraphLineKey(paragraphIndex: number, lineIndex: number) {
  return `${paragraphIndex}:${lineIndex}`;
}

function normalizeParagraphFeedback(feedback: any) {
  return Array.isArray(feedback?.paragraph_feedback) ? feedback.paragraph_feedback : [];
}

function getCommenterLabel(comment: any) {
  return comment.commenter_name || (comment.commenter_type === 'teacher' ? 'Teacher' : 'Peer reviewer');
}

function useRenderedLines(text: string) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [metrics, setMetrics] = useState({ lineCount: 1, lineHeight: 36 });

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const measure = () => {
      const styles = window.getComputedStyle(element);
      const fontSize = Number.parseFloat(styles.fontSize) || 20;
      const parsedLineHeight = Number.parseFloat(styles.lineHeight);
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.8;
      const height = element.getBoundingClientRect().height;
      const lineCount = Math.max(1, Math.round(height / lineHeight));

      setMetrics(previous => (
        previous.lineCount === lineCount && Math.abs(previous.lineHeight - lineHeight) < 0.5
          ? previous
          : { lineCount, lineHeight }
      ));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [text]);

  return { textRef, ...metrics };
}

function PeerReviewParagraph({
  paragraph,
  paragraphIndex,
  commentsByLine,
  onAddComment
}: {
  key?: React.Key;
  paragraph: string;
  paragraphIndex: number;
  commentsByLine: Record<string, any[]>;
  onAddComment: (comment: string, paragraphIndex: number, lineIndex: number) => void;
}) {
  const { textRef, lineCount, lineHeight } = useRenderedLines(paragraph);

  return (
    <div className="relative pl-14 pr-2 pb-6 border-b border-slate-200">
      <div className="absolute left-0 top-0 w-9" aria-hidden={false}>
        {Array.from({ length: lineCount }).map((_, lineIndex) => {
          const hasComment = Boolean(commentsByLine[getParagraphLineKey(paragraphIndex, lineIndex)]?.length);
          return (
            <button
              key={lineIndex}
              type="button"
              title={`Add comment to paragraph ${paragraphIndex + 1}, line ${lineIndex + 1}`}
              onClick={() => {
                const msg = prompt(`Feedback for paragraph ${paragraphIndex + 1}, line ${lineIndex + 1}:`);
                if (msg?.trim()) onAddComment(msg.trim(), paragraphIndex, lineIndex);
              }}
              className={cn(
                "absolute left-0 w-7 h-7 rounded-full text-lg leading-none font-black flex items-center justify-center shadow-sm transition-all",
                hasComment
                  ? "bg-slate-700 text-white ring-4 ring-slate-200 scale-105"
                  : "bg-white text-slate-500 border border-slate-300 hover:bg-slate-100 hover:text-slate-900 hover:ring-4 hover:ring-slate-100"
              )}
              style={{ top: `${lineIndex * lineHeight + 3}px` }}
            >
              +
            </button>
          );
        })}
      </div>
      <p ref={textRef} className="text-slate-700">
        {paragraph}
      </p>
    </div>
  );
}

function ReturnedParagraph({
  paragraph,
  paragraphIndex,
  commentsByLine,
  onSelectComments
}: {
  key?: React.Key;
  paragraph: string;
  paragraphIndex: number;
  commentsByLine: Record<string, any[]>;
  onSelectComments: (paragraphIndex: number, lineIndex: number, comments: any[]) => void;
}) {
  const { textRef, lineCount, lineHeight } = useRenderedLines(paragraph);

  return (
    <div className="relative pb-6 border-b border-slate-100">
      {Array.from({ length: lineCount }).map((_, lineIndex) => {
        const comments = commentsByLine[getParagraphLineKey(paragraphIndex, lineIndex)] || [];
        if (comments.length === 0) return null;

        return (
          <button
            key={lineIndex}
            type="button"
            title={`View peer feedback for paragraph ${paragraphIndex + 1}, line ${lineIndex + 1}`}
            onClick={() => onSelectComments(paragraphIndex, lineIndex, comments)}
            className="absolute left-[-12px] right-[-12px] rounded-lg bg-purple-100/80 border-l-4 border-purple-500 hover:bg-purple-200/80 transition-colors z-0"
            style={{ top: `${lineIndex * lineHeight}px`, height: `${lineHeight}px` }}
          >
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-purple-700 bg-white/80 px-2 py-0.5 rounded-full">
              {comments.length}
            </span>
          </button>
        );
      })}
      <p ref={textRef} className="relative z-10 pointer-events-none text-slate-800/80">
        {paragraph}
      </p>
    </div>
  );
}

export default function StudentEditor() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const studentId = localStorage.getItem('writing_lab_student_id');
  const studentToken = localStorage.getItem('writing_lab_student_token');
  const [session, setSession] = useState<any>(null);
  const [content, setContent] = useState('');
  const [lockedContent, setLockedContent] = useState('');
  const [essay, setEssay] = useState<any>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [peerEssay, setPeerEssay] = useState<any>(null);
  const [peerComments, setPeerComments] = useState<any[]>([]);
  const [myComments, setMyComments] = useState<any[]>([]);
  const [selectedPeerFeedback, setSelectedPeerFeedback] = useState<{ paragraphIndex: number; lineIndex: number; comments: any[] } | null>(null);
  const [showAIFeedback, setShowAIFeedback] = useState(false);

  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState('');
  const [timerRemainingMs, setTimerRemainingMs] = useState<number | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const openedFeedbackKeyRef = useRef('');

  const fetchStudentState = useCallback(async () => {
    if (!sessionId || !studentId || !studentToken) {
      navigate('/student');
      return;
    }

    const params = new URLSearchParams({
      sessionId,
      studentId,
      studentToken
    });

    const response = await fetch(`/api/student/state?${params.toString()}`);
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      setLoadError(body.error || 'Could not load your writing session.');
      return;
    }

    setLoadError('');
    setSession(body.session);
    setEssay(body.essay);
    setFeedback(body.feedback);
    setPeerComments(body.peerComments || []);
    setPeerEssay(body.peerEssay || null);
    setMyComments(body.myComments || []);

    if (body.essay) {
      const nextContent = splitContinuationContent(body.essay.content || '');
      setLockedContent(previous => {
        if (previous !== nextContent.locked) {
          setContent(nextContent.current);
          return nextContent.locked;
        }
        return previous;
      });

      if (content === '' && nextContent.current) {
        setContent(nextContent.current);
      }
    }

    if (body.essay?.updated_at) {
      setLastSaved(new Date(body.essay.updated_at));
    }
  }, [content, navigate, sessionId, studentId, studentToken]);

  useEffect(() => {
    fetchStudentState();
    const interval = window.setInterval(fetchStudentState, 2000);
    return () => window.clearInterval(interval);
  }, [fetchStudentState]);

  useEffect(() => {
    const updateTimer = () => setTimerRemainingMs(getSessionTimerRemainingMs(session));
    updateTimer();

    const interval = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!feedback) return;

    const feedbackKey = `${essay?.id || sessionId}:${JSON.stringify(feedback)}`;
    if (openedFeedbackKeyRef.current === feedbackKey) return;

    openedFeedbackKeyRef.current = feedbackKey;
    setShowAIFeedback(true);
  }, [essay?.id, feedback, sessionId]);

  // Autosave logic
  const saveEssay = useCallback(async (newContent: string) => {
    if (!essay || !session || session.status !== 'active' || timerRemainingMs === 0) return;
    const mergedContent = mergeContinuationContent(lockedContent, newContent);

    setSaving(true);
    const response = await fetch('/api/student/essay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        studentId,
        studentToken,
        content: mergedContent
      })
    });

    if (response.ok) {
      const body = await response.json().catch(() => ({}));
      if (body.essay) setEssay(body.essay);
      setLastSaved(new Date());
    }
    setSaving(false);
  }, [essay, lockedContent, session, sessionId, studentId, studentToken, timerRemainingMs]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveEssay(val);
    }, 750);
  };

  const addPeerComment = async (commentText: string, paragraphIndex: number, lineIndex: number) => {
    if (!peerEssay) return;

    const response = await fetch('/api/peer-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        studentId,
        studentToken,
        sourceEssayId: essay.id,
        targetEssayId: peerEssay.id,
        comment: commentText,
        paragraphIndex,
        lineIndex
      })
    });

    if (response.ok) {
      const { comment } = await response.json();
      setMyComments([...myComments, comment]);
      setPeerEssay({
        ...peerEssay,
        peer_comments: [...(Array.isArray(peerEssay.peer_comments) ? peerEssay.peer_comments : []), comment]
      });
    }
  };

  if (!session) return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-4" />
        {loadError && <p className="text-sm font-bold text-red-600">{loadError}</p>}
      </div>
    </div>
  );

  const peerReviewParagraphs = splitEssayParagraphs(peerEssay?.content || '');
  const returnedEssayParagraphs = splitEssayParagraphs(essay?.content || '');
  const lockedParagraphs = splitEssayParagraphs(lockedContent);
  const commentsByParagraphLine = peerComments.reduce((acc: Record<string, any[]>, comment: any) => {
    const paragraphIndex = Number(comment.paragraph_index) || 0;
    const lineIndex = getCommentLineIndex(comment);
    const key = getParagraphLineKey(paragraphIndex, lineIndex);
    acc[key] = [...(acc[key] || []), comment];
    return acc;
  }, {});
  const myCommentsByParagraphLine = myComments.reduce((acc: Record<string, any[]>, comment: any) => {
    const paragraphIndex = Number(comment.paragraph_index) || 0;
    const lineIndex = getCommentLineIndex(comment);
    const key = getParagraphLineKey(paragraphIndex, lineIndex);
    acc[key] = [...(acc[key] || []), comment];
    return acc;
  }, {});
  const paragraphFeedback = normalizeParagraphFeedback(feedback);
  const timerLabel = formatTimerRemaining(timerRemainingMs);
  const timerExpired = timerRemainingMs === 0;

  return (
    <div className="h-screen bg-[#f4f5f2] text-[#1f242b] font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-brand-500 rounded flex items-center justify-center">
            <span className="text-white font-bold text-lg leading-none">W</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase">Writing Lab <span className="text-slate-400 font-normal">/ Writing Console</span></h1>
        </div>

        <div className="flex items-center gap-6">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black tracking-widest uppercase",
            session.status === 'active' ? "bg-brand-50 text-brand-600 border-brand-200" : "bg-slate-50 text-slate-400 border-slate-200"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", session.status === 'active' ? "bg-brand-500 animate-pulse" : "bg-slate-300")}></span>
            SESSION {session.status.toUpperCase()}
          </div>
          {timerLabel && (
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black tracking-widest tabular-nums",
              isTimerLow(timerRemainingMs) ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-50 text-slate-500 border-slate-200"
            )}>
              <Clock className="w-3 h-3" />
              {timerLabel}
            </div>
          )}
          <div className="h-8 w-px bg-slate-200"></div>
          {session.status === 'active' && (
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              {saving ? <Loader2 className="w-3 h-3 animate-spin text-brand-500" /> : <Save className="w-3 h-3" />}
              {saving ? 'Syncing...' : lastSaved ? `Last Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Drafting'}
            </div>
          )}
          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 font-black text-xs border border-slate-200">
            {studentId?.charAt(0).toUpperCase() || 'S'}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Waiting State */}
        {session.status === 'waiting' && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white">
            <motion.div 
               animate={{ y: [0, -10, 0] }}
               transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
               className="w-24 h-24 bg-brand-50 rounded-2xl flex items-center justify-center mb-10 shadow-lg border border-brand-100 rotate-3"
            >
              <Clock className="w-12 h-12 text-brand-500 -rotate-3" />
            </motion.div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter mb-4">Prepare to Write</h1>
            <p className="text-slate-400 max-w-sm mx-auto leading-relaxed font-medium uppercase text-[10px] tracking-widest">
              You are linked to session <span className="text-brand-500 font-black">{session.session_code}</span>. 
              The task will appear momentarily.
            </p>
          </div>
        )}



        {/* Active/Ended State */}
        {(session.status === 'active' || session.status === 'ended') && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <main className="flex-1 bg-[#f4f5f2] p-4 md:p-12 overflow-y-auto flex justify-center">
               <div className="w-full max-w-3xl bg-white shadow-geometric border border-slate-200 rounded-xl min-h-[600px] md:min-h-[1000px] p-6 md:p-16 flex flex-col relative">
                  <div className="mb-6 md:mb-8 border-b border-slate-100 pb-6 md:pb-8">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="text-[10px] font-black text-brand-500 uppercase tracking-[0.25em] mb-2">The Assignment</p>
                        <h1 className="text-2xl md:text-4xl font-serif text-slate-900 leading-tight">
                          {session.question_title}
                        </h1>
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.35em] shrink-0 pt-2">
                        {essay?.display_name || 'STUDENT'}
                      </p>
                    </div>
                    {session.question_prompt && (
                      <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-2xl">
                        {session.question_prompt}
                      </p>
                    )}
                  </div>
                  {lockedContent && (
                    <div className="mb-8 rounded-xl border border-slate-200 bg-slate-50 p-5 md:p-6">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Previous Writing</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Locked</p>
                      </div>
                      <div className="space-y-5 font-serif text-lg leading-[1.8] text-slate-500">
                        {lockedParagraphs.map((paragraph, index) => (
                          <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {lockedContent && (
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-500 mb-3">
                      Continue Writing Below
                    </p>
                  )}
                  <textarea 
                    readOnly={session.status !== 'active' || timerExpired}
                    placeholder={lockedContent ? "Continue your writing here..." : "Capture your analysis here..."}
                    className="flex-1 w-full text-xl leading-[1.8] outline-none border-none resize-none font-serif text-slate-800 placeholder:text-slate-200"
                    value={content}
                    onChange={handleContentChange}
                  />
                  {(session.status === 'ended' || timerExpired) && (
                    <div className="absolute inset-x-0 bottom-0 py-10 bg-gradient-to-t from-white via-white/95 to-transparent flex items-center justify-center">
                       <div className="bg-red-50 text-red-700 px-6 py-3 rounded-full border border-red-100 text-xs font-black uppercase tracking-widest flex items-center gap-3">
                         <Clock className="w-4 h-4" /> {timerExpired ? 'Time is up' : 'Editing Disabled by Instructor'}
                       </div>
                    </div>
                  )}
               </div>
            </main>
          </div>
        )}

        {/* Peer Review State */}
        {session.status === 'peer_review' && peerEssay && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <aside className="w-full md:w-80 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0 p-5 md:p-8 overflow-y-auto max-h-52 md:max-h-none">
               <div className="space-y-8">
                  <div>
                    <h3 className="flex items-center gap-2 text-[10px] font-black text-purple-600 uppercase tracking-widest mb-4 bg-purple-50 px-4 py-2 rounded-lg border border-purple-100">
                      <RefreshCcw className="w-3.5 h-3.5" /> Peer Analysis Task
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed font-medium">
                      Review the student contribution and leave <span className="font-black text-purple-600 underline underline-offset-4 decoration-2">three critical comments</span>.
                    </p>
                  </div>

                  <div className="pt-8 border-t border-slate-100 space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saved Comments ({myComments.length})</h3>
                    {myComments.map(c => (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={c.id} className="p-4 bg-purple-50 rounded-xl border border-purple-100 transition-all hover:shadow-sm">
                        <span className="text-[9px] font-black uppercase text-purple-400 block mb-2 tracking-tighter">
                          P{(Number(c.paragraph_index) || 0) + 1} L{getCommentLineIndex(c) + 1}
                        </span>
                        <span className="text-[10px] font-semibold text-purple-400 block mb-1">
                          {getCommenterLabel(c)}
                        </span>
                        <p className="text-xs text-purple-900 font-bold leading-relaxed">{c.comment}</p>
                      </motion.div>
                    ))}
                    {myComments.length === 0 && <p className="text-[10px] text-slate-400">No comments registered yet.</p>}
                  </div>
               </div>
            </aside>

            <main className="flex-1 bg-[#f4f5f2] p-4 md:p-12 overflow-y-auto flex justify-center">
              <div className="w-full max-w-3xl bg-white shadow-geometric border border-slate-200 rounded-xl min-h-[600px] md:min-h-[1000px] p-6 md:p-16 flex flex-col">
                <header className="mb-6 md:mb-8 text-center border-b border-slate-50 pb-6 md:pb-8 opacity-40">
                  <h1 className="text-3xl md:text-5xl font-serif text-slate-900 mb-2">Classmate's Draft</h1>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Review Mode Enabled</p>
                </header>
                <div className="space-y-8 font-serif text-xl leading-[1.8] text-slate-800">
                   {peerReviewParagraphs.map((paragraph, idx) => (
                      <PeerReviewParagraph
                        key={idx}
                        paragraph={paragraph}
                        paragraphIndex={idx}
                        commentsByLine={myCommentsByParagraphLine}
                        onAddComment={addPeerComment}
                      />
                   ))}
                </div>
              </div>
            </main>
          </div>
        )}

        {/* Returned State */}
        {session.status === 'returned' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            <aside className="hidden">
               <div className="flex items-center justify-between gap-4">
                 <h2 className="text-[10px] font-black text-brand-500 uppercase tracking-[0.3em] bg-brand-50 px-5 py-3 rounded-full border border-brand-100 inline-block w-fit">
                   Expert Analysis
                 </h2>
                 <button
                   type="button"
                   title="AI feedback"
                   onClick={() => feedback && setShowAIFeedback(true)}
                   disabled={!feedback}
                   className={cn(
                     "w-12 h-12 rounded-full border flex items-center justify-center shadow-sm transition-all shrink-0",
                     feedback
                       ? "bg-brand-500 border-brand-500 text-white hover:bg-brand-600 hover:scale-105"
                       : "bg-white border-slate-200 text-slate-300 cursor-wait"
                   )}
                 >
                   {feedback ? <Sparkles className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                 </button>
               </div>

               <div className="hidden">
               {feedback ? (
                 <div className="space-y-6">
                    <AnalysisCard 
                      title="What is Working" 
                      content={feedback.strengths} 
                      theme="green" 
                      icon={<CheckCircle2 className="w-4 h-4" />} 
                    />
                    <AnalysisCard 
                      title="What is Limiting the Score" 
                      content={feedback.improvements} 
                      theme="amber" 
                      icon={<AlertCircle className="w-4 h-4" />} 
                    />
                    <AnalysisCard 
                      title="Estimated Rubric Alignment" 
                      content={feedback.structure_notes} 
                      theme="blue" 
                      icon={<BookOpen className="w-4 h-4" />} 
                    />
                    <AnalysisCard
                      title="Authenticity and Consistency"
                      content={feedback.grammar_notes}
                      theme="slate"
                      icon={<MessageSquare className="w-4 h-4" />}
                    />
                    {paragraphFeedback.length > 0 && (
                      <div className="p-5 rounded-xl border bg-white border-slate-200 space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60">
                          Paragraph Guidance
                        </h4>
                        <div className="space-y-2">
                          {paragraphFeedback.map((item: any, index: number) => (
                            <div key={`${item.paragraph_number || index}-${index}`} className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500 mb-1">
                                Paragraph {item.paragraph_number || index + 1}
                                {item.focus ? ` — ${item.focus}` : ''}
                              </p>
                              <p className="text-sm font-normal leading-relaxed text-slate-700">
                                {item.feedback}
                              </p>
                              {item.next_revision && (
                                <p className="text-xs font-medium leading-relaxed text-slate-400 mt-1">
                                  Next: {item.next_revision}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="p-5 bg-[#1f242b] text-white rounded-xl shadow-geometric-lg">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2 text-brand-400 opacity-80">How to Reach the Next Band</h4>
                      <p className="text-sm font-medium text-slate-200 leading-relaxed">{feedback.next_step}</p>
                    </div>
                 </div>
               ) : (
                 <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                    <Loader2 className="w-10 h-10 animate-spin text-slate-200 mx-auto mb-4" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calculating Insights...</p>
                 </div>
               )}
               </div>

               <div className="pt-8 border-t border-slate-200">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Peer Feedback</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {peerComments.length > 0
                      ? `${peerComments.length} peer comment${peerComments.length === 1 ? '' : 's'} returned. Highlighted lines in your essay contain feedback.`
                      : 'No peer feedback has been returned yet.'}
                  </p>
               </div>
            </aside>

            <main className="flex-1 bg-white p-6 md:p-24 overflow-y-auto flex justify-center">
               <div className="w-full max-w-3xl">
                  <div className="mb-5 md:mb-8 border-b border-slate-100 pb-5 md:pb-8 flex items-start justify-between gap-4">
                    <h1 className="text-3xl md:text-4xl font-serif text-slate-900 leading-tight">
                      {session.question_title}
                    </h1>
                    {feedback && (
                      <button
                        type="button"
                        title="AI feedback"
                        onClick={() => setShowAIFeedback(true)}
                        className="w-12 h-12 rounded-full bg-brand-500 border border-brand-500 text-white hover:bg-brand-600 hover:scale-105 flex items-center justify-center shadow-sm transition-all shrink-0"
                      >
                        <Sparkles className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-8 font-serif text-xl leading-[2] text-slate-800/70">
                    {returnedEssayParagraphs.map((paragraph, idx) => (
                      <ReturnedParagraph
                        key={idx}
                        paragraph={paragraph}
                        paragraphIndex={idx}
                        commentsByLine={commentsByParagraphLine}
                        onSelectComments={(paragraphIndex, lineIndex, comments) =>
                          setSelectedPeerFeedback({ paragraphIndex, lineIndex, comments })
                        }
                      />
                    ))}
                  </div>
               </div>
            </main>
          </div>
        )}
      </div>

      {showAIFeedback && feedback && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-2xl max-h-[86vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 md:p-8"
          >
            <div className="flex items-start justify-between gap-6 mb-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-500 mb-2">
                  Expert Analysis
                </p>
                <h3 className="text-xl font-black text-slate-900">AI Feedback</h3>
              </div>
              <button
                type="button"
                title="Close"
                onClick={() => setShowAIFeedback(false)}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <AnalysisCard 
                title="What is Working" 
                content={feedback.strengths} 
                theme="green" 
                icon={<CheckCircle2 className="w-4 h-4" />} 
              />
              <AnalysisCard 
                title="What is Limiting the Score" 
                content={feedback.improvements} 
                theme="amber" 
                icon={<AlertCircle className="w-4 h-4" />} 
              />
              <AnalysisCard 
                title="Estimated Rubric Alignment" 
                content={feedback.structure_notes} 
                theme="blue" 
                icon={<BookOpen className="w-4 h-4" />} 
              />
              <AnalysisCard
                title="Authenticity and Consistency"
                content={feedback.grammar_notes}
                theme="slate"
                icon={<MessageSquare className="w-4 h-4" />}
              />
              {paragraphFeedback.length > 0 && (
                <div className="p-5 rounded-xl border bg-white border-slate-200 space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60">
                    Paragraph Guidance
                  </h4>
                  <div className="space-y-2">
                    {paragraphFeedback.map((item: any, index: number) => (
                      <div key={`${item.paragraph_number || index}-${index}`} className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500 mb-1">
                          Paragraph {item.paragraph_number || index + 1}
                          {item.focus ? ` - ${item.focus}` : ''}
                        </p>
                        <p className="text-sm font-normal leading-relaxed text-slate-700">
                          {item.feedback}
                        </p>
                        {item.next_revision && (
                          <p className="text-xs font-medium leading-relaxed text-slate-400 mt-1">
                            Next: {item.next_revision}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="p-5 bg-[#1f242b] text-white rounded-xl shadow-geometric-lg">
                <h4 className="text-[10px] font-bold uppercase tracking-widest mb-2 text-brand-400 opacity-80">How to Reach the Next Band</h4>
                <p className="text-sm font-medium text-slate-200 leading-relaxed">{feedback.next_step}</p>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {selectedPeerFeedback && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-8"
          >
            <div className="flex items-start justify-between gap-6 mb-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-600 mb-2">
                  Peer Feedback
                </p>
                <h3 className="text-xl font-black text-slate-900">
                  Paragraph {selectedPeerFeedback.paragraphIndex + 1}, Line {selectedPeerFeedback.lineIndex + 1}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPeerFeedback(null)}
                className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 font-black"
              >
                x
              </button>
            </div>
            <div className="space-y-4">
              {selectedPeerFeedback.comments.map(comment => (
                <div key={comment.id} className="rounded-xl bg-purple-50 border border-purple-100 p-5">
                  <p className="text-[10px] font-semibold text-purple-400 mb-1">
                    {getCommenterLabel(comment)}
                  </p>
                  <p className="text-sm font-semibold leading-relaxed text-purple-950">{comment.comment}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Footer Status Bar */}
      <footer className="h-8 bg-[#25282d] text-[#5c6470] px-6 flex items-center justify-between text-[10px] shrink-0 font-black tracking-tight uppercase">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            <span>Supabase Gateway: Active</span>
          </div>
          <span className="opacity-20 text-white">|</span>
          <span>LATENCY: 18ms</span>
        </div>
        <div className="flex items-center gap-4 text-slate-700">
           <span>Realtime Session Engine</span>
           <span className="text-slate-600">V1.0.4-Geometric</span>
        </div>
      </footer>
    </div>
  );
}

function AnalysisCard({ title, content, theme, icon }: any) {
  const styles: any = {
    green: "bg-green-50 text-green-700 border-green-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    blue: "bg-brand-50 text-brand-600 border-brand-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <div className={cn("p-5 rounded-xl border flex items-start gap-3 transition-all hover:shadow-sm", styles[theme])}>
      <div className="mt-0.5 shrink-0 opacity-70">{icon}</div>
      <div className="min-w-0">
        <h4 className="text-[10px] font-bold uppercase tracking-widest mb-1.5 opacity-60">{title}</h4>
        <p className="text-sm font-normal leading-relaxed">{content}</p>
      </div>
    </div>
  );
}
