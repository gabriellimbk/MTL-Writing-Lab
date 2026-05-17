import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  MessageSquare,
  Sparkles,
  User,
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

const CONTINUATION_BREAK_PATTERN = /\n*\[\[WRITING_LAB_CONTINUE_BREAK\]\]\n*/g;

function splitEssayParagraphs(content = '') {
  const cleanedContent = content.replace(CONTINUATION_BREAK_PATTERN, '\n\n').trim();
  const paragraphs = cleanedContent.split(/\n{2,}|\n/).map(part => part.trim()).filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [content || 'The manuscript is currently empty.'];
}

function getCommentLineIndex(comment: any) {
  return Number(comment.line_index) || 0;
}

function getParagraphLineKey(paragraphIndex: number, lineIndex: number) {
  return `${paragraphIndex}:${lineIndex}`;
}

function groupCommentsByLine(comments: any[]) {
  return comments.reduce((acc: Record<string, any[]>, comment: any) => {
    const paragraphIndex = Number(comment.paragraph_index) || 0;
    const lineIndex = getCommentLineIndex(comment);
    const key = getParagraphLineKey(paragraphIndex, lineIndex);
    acc[key] = [...(acc[key] || []), comment];
    return acc;
  }, {});
}

function getCommenterLabel(comment: any) {
  return comment.commenter_name || (comment.commenter_type === 'teacher' ? 'Teacher' : 'Peer reviewer');
}

function useRenderedLines(text: string) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [metrics, setMetrics] = useState({ lineCount: 1, lineHeight: 32 });

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const measure = () => {
      const styles = window.getComputedStyle(element);
      const fontSize = Number.parseFloat(styles.fontSize) || 18;
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

function ReviewParagraph({
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
    <div className="relative pl-12 pr-2 pb-5 border-b border-slate-100">
      <div className="absolute left-0 top-0 w-8">
        {Array.from({ length: lineCount }).map((_, lineIndex) => {
          const lineComments = commentsByLine[getParagraphLineKey(paragraphIndex, lineIndex)] || [];
          const hasTeacherComment = lineComments.some(comment => comment.commenter_type === 'teacher');

          return (
            <button
              key={lineIndex}
              type="button"
              title={`Add teacher comment to paragraph ${paragraphIndex + 1}, line ${lineIndex + 1}`}
              onClick={() => {
                const msg = prompt(`Teacher comment for paragraph ${paragraphIndex + 1}, line ${lineIndex + 1}:`);
                if (msg?.trim()) onAddComment(msg.trim(), paragraphIndex, lineIndex);
              }}
              className={cn(
                "absolute left-0 w-6 h-6 rounded-full text-sm leading-none font-black flex items-center justify-center shadow-sm transition-all",
                hasTeacherComment
                  ? "bg-slate-800 text-white ring-4 ring-slate-200"
                  : "bg-white text-slate-500 border border-slate-300 hover:bg-slate-100 hover:text-slate-900 hover:ring-4 hover:ring-slate-100"
              )}
              style={{ top: `${lineIndex * lineHeight + 4}px` }}
            >
              +
            </button>
          );
        })}
      </div>
      <p ref={textRef} className="font-serif text-slate-800 text-xl leading-[1.9]">
        {paragraph}
      </p>
    </div>
  );
}

function FeedbackCard({ title, content, icon, tone }: any) {
  const tones: Record<string, string> = {
    blue: "bg-brand-50 border-brand-100 text-brand-700",
    green: "bg-green-50 border-green-100 text-green-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    slate: "bg-slate-50 border-slate-200 text-slate-600"
  };

  return (
    <div className={cn("rounded-xl border p-4", tones[tone] || tones.slate)}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="opacity-70 shrink-0">{icon}</span>
        <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-60">{title}</h3>
      </div>
      <p className="text-sm font-normal leading-relaxed text-slate-700">{content || 'No feedback generated yet.'}</p>
    </div>
  );
}

export default function Display() {
  const { essayId } = useParams();
  const navigate = useNavigate();
  const [essay, setEssay] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [commentError, setCommentError] = useState('');
  const [openPanel, setOpenPanel] = useState<'ai' | 'paragraph' | 'comments' | null>(null);

  async function fetchEssay() {
    const response = await fetch(`/api/display/essay?essayId=${encodeURIComponent(essayId || '')}`);
    const body = await response.json().catch(() => ({}));

    if (response.ok && body.essay) {
      setEssay(body.essay);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchEssay();
  }, [essayId]);

  async function addTeacherComment(comment: string, paragraphIndex: number, lineIndex: number) {
    setCommentError('');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      setCommentError('Please sign in as a teacher before adding comments.');
      return;
    }

    const response = await fetch('/api/teacher-comment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        essayId,
        comment,
        paragraphIndex,
        lineIndex
      })
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setCommentError(body.error || 'Could not save teacher comment.');
      return;
    }

    setEssay((current: any) => ({
      ...current,
      peer_comments: [...(Array.isArray(current?.peer_comments) ? current.peer_comments : []), body.comment]
    }));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f5f2] text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!essay) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f5f2] text-slate-400 font-black uppercase tracking-widest text-xs">
        Essay Protocol Not Found
      </div>
    );
  }

  const paragraphs = splitEssayParagraphs(essay.content || '');
  const feedback = essay.ai_feedback || null;
  const comments = Array.isArray(essay.peer_comments) ? essay.peer_comments : [];
  const peerComments = comments.filter((comment: any) => comment.commenter_type !== 'teacher');
  const teacherComments = comments.filter((comment: any) => comment.commenter_type === 'teacher');
  const commentsByLine = groupCommentsByLine(comments);
  const paragraphFeedback = Array.isArray(feedback?.paragraph_feedback) ? feedback.paragraph_feedback : [];

  return (
    <div className="min-h-screen bg-[#f4f5f2] font-sans text-[#1f242b]">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="h-16 md:h-20 px-4 md:px-8 flex items-center justify-between gap-4 md:gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="w-11 h-11 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors flex items-center justify-center shrink-0"
            >
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            </button>
            <div className="w-11 h-11 bg-brand-500 rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight uppercase truncate">Classroom Spotlight</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.35em]">Teacher Review Display</p>
            </div>
          </div>

          <div className="flex items-center gap-6 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Session Code</p>
              <p className="text-sm font-black text-brand-500 tracking-widest uppercase">{essay.session?.session_code || 'N/A'}</p>
            </div>
            <div className="px-4 py-2 bg-slate-900 rounded-lg text-white text-[10px] font-black uppercase tracking-widest">
              Writing Lab
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 md:gap-8">
        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-7"
        >
          <div className="mb-5 pb-5 border-b border-slate-100">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 text-blue-700 rounded-full border border-brand-100 text-[10px] font-black uppercase tracking-widest mb-3">
              <User className="w-3.5 h-3.5" />
              {essay.display_name || 'Student'}
            </div>
            <h2 className="text-2xl md:text-3xl font-serif text-slate-900 leading-tight mb-2">
              {essay.session?.question_title || 'Student Essay'}
            </h2>
            <p className="text-sm text-slate-500 max-w-3xl leading-relaxed">
              Use the side buttons to add teacher comments to specific displayed lines.
            </p>
            {commentError && (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-100 text-red-700 px-4 py-3 text-sm font-bold">
                {commentError}
              </div>
            )}
          </div>

          <div className="space-y-6">
            {paragraphs.map((paragraph, index) => (
              <ReviewParagraph
                key={index}
                paragraph={paragraph}
                paragraphIndex={index}
                commentsByLine={commentsByLine}
                onAddComment={addTeacherComment}
              />
            ))}
          </div>
        </motion.article>

        <aside className="xl:sticky xl:top-28 self-start flex xl:flex-col gap-3">
          <IconPanelButton title="AI feedback" disabled={!feedback} onClick={() => setOpenPanel('ai')}>
            {feedback ? <Sparkles className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
          </IconPanelButton>
          <IconPanelButton title="Paragraph guidance" disabled={paragraphFeedback.length === 0} onClick={() => setOpenPanel('paragraph')}>
            <BookOpen className="w-5 h-5" />
          </IconPanelButton>
          <IconPanelButton title="Comments" disabled={comments.length === 0} onClick={() => setOpenPanel('comments')}>
            <MessageSquare className="w-5 h-5" />
          </IconPanelButton>
          <div className="hidden">
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60">AI Feedback</h2>
              <Sparkles className="w-4 h-4 text-brand-500" />
            </div>
            <FeedbackCard title="Strengths" content={feedback?.strengths} icon={<CheckCircle2 className="w-4 h-4" />} tone="green" />
            <FeedbackCard title="Improvements" content={feedback?.improvements} icon={<AlertCircle className="w-4 h-4" />} tone="amber" />
            <FeedbackCard title="Structure" content={feedback?.structure_notes} icon={<BookOpen className="w-4 h-4" />} tone="blue" />
            <FeedbackCard title="Next Step" content={feedback?.next_step} icon={<Sparkles className="w-4 h-4" />} tone="slate" />
          </section>

          {paragraphFeedback.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60 mb-3">Paragraph Guidance</h2>
              <div className="space-y-2">
                {paragraphFeedback.map((item: any, index: number) => (
                  <div key={`${item.paragraph_number || index}-${index}`} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500 mb-1">
                      Paragraph {item.paragraph_number || index + 1}
                      {item.focus ? ` — ${item.focus}` : ''}
                    </p>
                    <p className="text-sm font-normal leading-relaxed text-slate-700">{item.feedback}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60 mb-3">Comments</h2>
            <div className="space-y-4">
              <CommentList title="Teacher" comments={teacherComments} emptyText="No teacher comments yet." />
              <CommentList title="Peer" comments={peerComments} emptyText="No peer comments returned yet." />
            </div>
          </section>
          </div>
        </aside>
      </main>
      {openPanel && (
        <FeedbackModal
          openPanel={openPanel}
          setOpenPanel={setOpenPanel}
          feedback={feedback}
          paragraphFeedback={paragraphFeedback}
          teacherComments={teacherComments}
          peerComments={peerComments}
        />
      )}
    </div>
  );
}

function IconPanelButton({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-12 h-12 rounded-full border flex items-center justify-center shadow-sm transition-all",
        disabled
          ? "bg-white border-slate-200 text-slate-300 cursor-not-allowed"
          : "bg-brand-500 border-brand-500 text-white hover:bg-brand-600 hover:scale-105"
      )}
    >
      {children}
    </button>
  );
}

function FeedbackModal({ openPanel, setOpenPanel, feedback, paragraphFeedback, teacherComments, peerComments }: any) {
  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl max-h-[86vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 md:p-8"
      >
        <div className="flex items-start justify-between gap-6 mb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-brand-500 mb-2">
              {openPanel === 'ai' ? 'AI Feedback' : openPanel === 'paragraph' ? 'Paragraph Guidance' : 'Comments'}
            </p>
            <h3 className="text-xl font-black text-slate-900">
              {openPanel === 'ai' ? 'Generated Feedback' : openPanel === 'paragraph' ? 'Paragraph Notes' : 'Teacher and Peer Comments'}
            </h3>
          </div>
          <button
            type="button"
            title="Close"
            onClick={() => setOpenPanel(null)}
            className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {openPanel === 'ai' && (
          <div className="space-y-4">
            <FeedbackCard title="Strengths" content={feedback?.strengths} icon={<CheckCircle2 className="w-4 h-4" />} tone="green" />
            <FeedbackCard title="Improvements" content={feedback?.improvements} icon={<AlertCircle className="w-4 h-4" />} tone="amber" />
            <FeedbackCard title="Structure" content={feedback?.structure_notes} icon={<BookOpen className="w-4 h-4" />} tone="blue" />
            <FeedbackCard title="Next Step" content={feedback?.next_step} icon={<Sparkles className="w-4 h-4" />} tone="slate" />
          </div>
        )}

        {openPanel === 'paragraph' && (
          <div className="space-y-2">
            {paragraphFeedback.map((item: any, index: number) => (
              <div key={`${item.paragraph_number || index}-${index}`} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-500 mb-1">
                  Paragraph {item.paragraph_number || index + 1}
                  {item.focus ? ` - ${item.focus}` : ''}
                </p>
                <p className="text-sm font-normal leading-relaxed text-slate-700">{item.feedback}</p>
              </div>
            ))}
          </div>
        )}

        {openPanel === 'comments' && (
          <div className="space-y-4">
            <CommentList title="Teacher" comments={teacherComments} emptyText="No teacher comments yet." />
            <CommentList title="Peer" comments={peerComments} emptyText="No peer comments returned yet." />
          </div>
        )}
      </motion.div>
    </div>
  );
}

function CommentList({ title, comments, emptyText }: { title: string; comments: any[]; emptyText: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-3.5 h-3.5 text-slate-400 opacity-60" />
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 opacity-60">
          {title} ({comments.length})
        </h3>
      </div>
      {comments.length === 0 ? (
        <p className="text-sm font-normal text-slate-400">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {comments.map(comment => (
            <div key={comment.id} className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                P{(Number(comment.paragraph_index) || 0) + 1} · L{getCommentLineIndex(comment) + 1}
              </p>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">
                {getCommenterLabel(comment)}
              </p>
              <p className="text-sm font-normal leading-relaxed text-slate-700">{comment.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
