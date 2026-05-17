import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import PDFDocument from "pdfkit";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// Initialize Supabase Admin
const supabaseAdmin = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const TABLES = {
  sessions: "MTL_WRITING_LAB_SESSIONS",
  students: "MTL_WRITING_LAB_STUDENTS",
  essays: "MTL_WRITING_LAB_ESSAYS",
};

const CONTINUATION_BREAK = "\n\n[[WRITING_LAB_CONTINUE_BREAK]]\n\n";
const CONTINUATION_BREAK_PATTERN = /\n*\[\[WRITING_LAB_CONTINUE_BREAK\]\]\n*/g;

const TEACHER_EMAIL_DOMAIN = "@ri.edu.sg";
const TEACHER_SHARED_PASSWORD = process.env.TEACHER_SHARED_PASSWORD || "Password1";

const H2MLL_LITERATURE_RUBRIC_GUIDANCE = `
Use the H2 Malay Language and Literature Paper 3 literature rubric as the marking lens.
Judge only what the student has actually written. Most students may submit one short paragraph,
so do not write a full essay report unless the submission is long enough to justify it.
Focus on whether the writing:
- answers the question directly with a critical, personal, knowledgeable response;
- analyses how the writer/text uses form, structure and language to convey meaning;
- evaluates the effects of style, language and structure instead of only retelling content;
- develops relevant arguments in a focused, detailed and coherent way;
- shows understanding of literary context such as theme, genre, period, history and issue;
- supports claims with specific references, quotations or paraphrases from the text;
- uses critical terminology accurately and expresses complex ideas clearly.

When the essay is not a literature essay, adapt these principles to the task: focus on relevance,
argument quality, evidence, paragraph development, structure, language precision and reader impact.
Keep the feedback concise, specific and revision-oriented.
`;

function parseJsonObjectFromModel(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  return JSON.parse(cleaned);
}

function getBearerToken(req: express.Request) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

function getSupabaseAdmin() {
  if (!supabaseAdmin) throw new Error("Supabase server credentials are not configured");
  return supabaseAdmin;
}

async function enrichCommentsWithNames(sessionId: string | number, comments: any[]) {
  if (!Array.isArray(comments) || comments.length === 0) return [];

  const admin = getSupabaseAdmin();
  const { data: students } = await admin
    .from(TABLES.students)
    .select("student_id, display_name")
    .eq("session_id", sessionId);

  const studentNames = new Map((students || []).map((student: any) => [
    String(student.student_id),
    student.display_name
  ]));

  return Promise.all(comments.map(async (comment: any) => {
    if (comment.commenter_name) return comment;

    if (comment.commenter_type === "teacher") {
      let teacherName = "Teacher";
      if (comment.commenter_id) {
        const { data } = await admin.auth.admin.getUserById(String(comment.commenter_id));
        teacherName = data?.user?.email || teacherName;
      }

      return { ...comment, commenter_name: teacherName };
    }

    return {
      ...comment,
      commenter_name: studentNames.get(String(comment.commenter_id)) || "Peer reviewer"
    };
  }));
}

async function getAuthenticatedUser(req: express.Request, options: { allowAnonymous?: boolean } = {}) {
  const admin = getSupabaseAdmin();
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing authorization token");

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid authorization token");
  if (!options.allowAnonymous && ((data.user as any).is_anonymous || data.user.app_metadata?.provider === "anonymous")) {
    throw new Error("Teacher authorization required");
  }

  return data.user;
}

async function requireTeacherForSession(req: express.Request, sessionId: string, options: { ownerOnly?: boolean } = {}) {
  const admin = getSupabaseAdmin();
  const user = await getAuthenticatedUser(req);
  const { data: session, error } = await admin
    .from(TABLES.sessions)
    .select("id, teacher_id, status, question_prompt")
    .eq("id", sessionId)
    .single();

  if (error || !session) throw new Error("Session not found");
  if (options.ownerOnly !== false && session.teacher_id !== user.id) throw new Error("Not authorized for this session");

  return { user, session };
}

async function requireTeacherForEssay(req: express.Request, essayId: string, options: { ownerOnly?: boolean } = {}) {
  const admin = getSupabaseAdmin();
  const user = await getAuthenticatedUser(req);
  const { data: essay, error: essayError } = await admin
    .from(TABLES.essays)
    .select("id, session_id, content")
    .eq("id", essayId)
    .single();

  if (essayError || !essay) throw new Error("Essay not found");

  const { data: session, error: sessionError } = await admin
    .from(TABLES.sessions)
    .select("id, teacher_id, question_prompt")
    .eq("id", essay.session_id)
    .single();

  if (sessionError || !session) throw new Error("Session not found");
  if (options.ownerOnly !== false && session.teacher_id !== user.id) throw new Error("Not authorized for this essay");

  return { user, essay, session };
}

async function validateStudentSession(sessionId: string | number, studentId: string, _studentToken?: string) {
  const admin = getSupabaseAdmin();

  if (!sessionId || !studentId) {
    throw new Error("Missing student session credentials");
  }

  const { data: student, error } = await admin
    .from(TABLES.students)
    .select("id, session_id, student_id, display_name")
    .eq("session_id", sessionId)
    .eq("student_id", studentId)
    .single();

  if (error || !student) throw new Error("Invalid student session");

  return student;
}

function cleanPdfText(value: any) {
  return String(value || "")
    .replace(CONTINUATION_BREAK_PATTERN, "\n\n")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getDisplayEssayContent(value: any) {
  return String(value || "").replace(CONTINUATION_BREAK_PATTERN, "\n\n").trim();
}

function appendContinuationBreak(value: any) {
  const content = String(value || "").trimEnd();
  if (!content) return "";
  if (content.endsWith("[[WRITING_LAB_CONTINUE_BREAK]]")) return content;
  return `${content}${CONTINUATION_BREAK}`;
}

function splitContinuationContent(value: any) {
  const parts = String(value || "").split(CONTINUATION_BREAK_PATTERN);
  if (parts.length <= 1) return { locked: "", current: String(value || "") };

  return {
    locked: parts.slice(0, -1).join("\n\n").trim(),
    current: parts[parts.length - 1] || ""
  };
}

function mergeContinuationContent(locked: string, current: string) {
  return locked ? `${locked}${CONTINUATION_BREAK}${current}` : current;
}

function formatCommentLocation(comment: any) {
  const paragraph = (Number(comment.paragraph_index) || 0) + 1;
  const line = (Number(comment.line_index) || 0) + 1;
  return `P${paragraph} L${line}`;
}

function getCommenterName(comment: any) {
  return comment.commenter_name || (comment.commenter_type === "teacher" ? "Teacher" : "Peer reviewer");
}

function ensurePdfSpace(doc: PDFKit.PDFDocument, needed = 80) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function pdfHeading(doc: PDFKit.PDFDocument, text: string, size = 13) {
  ensurePdfSpace(doc, 42);
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(size).fillColor("#111827").text(text);
  doc.moveDown(0.25);
}

function pdfLabel(doc: PDFKit.PDFDocument, label: string, value: any) {
  const text = cleanPdfText(value);
  if (!text) return;
  ensurePdfSpace(doc, 36);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b").text(label.toUpperCase(), { continued: false });
  doc.font("Helvetica").fontSize(9.5).fillColor("#111827").text(text, { lineGap: 1 });
  doc.moveDown(0.35);
}

function addCompactFeedback(doc: PDFKit.PDFDocument, feedback: any) {
  if (!feedback) {
    pdfLabel(doc, "AI Feedback", "No AI feedback generated.");
    return;
  }

  pdfLabel(doc, "Strengths", feedback.strengths);
  pdfLabel(doc, "Improvements", feedback.improvements);
  pdfLabel(doc, "Structure", feedback.structure_notes);
  pdfLabel(doc, "Language", feedback.grammar_notes);
  pdfLabel(doc, "Next Step", feedback.next_step);

  const paragraphFeedback = Array.isArray(feedback.paragraph_feedback) ? feedback.paragraph_feedback : [];
  if (paragraphFeedback.length > 0) {
    ensurePdfSpace(doc, 44);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b").text("PARAGRAPH NOTES");
    paragraphFeedback.slice(0, 4).forEach((item: any, index: number) => {
      const paragraph = item.paragraph_number || index + 1;
      const note = [item.focus, item.feedback, item.next_revision ? `Next: ${item.next_revision}` : ""]
        .map(cleanPdfText)
        .filter(Boolean)
        .join(" - ");
      if (note) {
        ensurePdfSpace(doc, 26);
        doc.font("Helvetica").fontSize(8.8).fillColor("#111827").text(`P${paragraph}: ${note}`, { lineGap: 1 });
      }
    });
    doc.moveDown(0.35);
  }
}

function addCommentsSection(doc: PDFKit.PDFDocument, title: string, comments: any[]) {
  pdfHeading(doc, title, 10);
  if (comments.length === 0) {
    doc.font("Helvetica").fontSize(8.8).fillColor("#64748b").text("None.");
    doc.moveDown(0.3);
    return;
  }

  comments.forEach((comment: any) => {
    ensurePdfSpace(doc, 28);
    const meta = `${formatCommentLocation(comment)} - ${getCommenterName(comment)}`;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b").text(meta);
    doc.font("Helvetica").fontSize(9).fillColor("#111827").text(cleanPdfText(comment.comment), { lineGap: 1 });
    doc.moveDown(0.25);
  });
}

function safeFilename(value: string) {
  return cleanPdfText(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "writing-lab";
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/teacher/provision", async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail.endsWith(TEACHER_EMAIL_DOMAIN)) {
    return res.status(403).json({ error: `Teacher email must end with ${TEACHER_EMAIL_DOMAIN}` });
  }

  if (password !== TEACHER_SHARED_PASSWORD) {
    return res.status(403).json({ error: "Invalid login credentials" });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;

    const users = (data?.users || []) as Array<any>;
    const existing = users.find(user => user.email?.toLowerCase() === normalizedEmail);

    if (existing) {
      const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        password: TEACHER_SHARED_PASSWORD,
        email_confirm: true,
        user_metadata: { ...(existing.user_metadata || {}), role: "teacher" }
      });
      if (updateError) throw updateError;

      return res.json({ success: true, userId: existing.id });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: TEACHER_SHARED_PASSWORD,
      email_confirm: true,
      user_metadata: { role: "teacher" }
    });

    if (createError) throw createError;

    res.json({ success: true, userId: created.user.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/teacher/dashboard", async (req, res) => {
  try {
    const admin = getSupabaseAdmin();
    await getAuthenticatedUser(req);

    const [
      { data: questions, error: questionsError },
      { data: sessions, error: sessionsError }
    ] = await Promise.all([
      admin.from(TABLES.sessions).select("*").eq("record_type", "question").order("created_at", { ascending: false }),
      admin.from(TABLES.sessions).select("*").eq("record_type", "session").order("created_at", { ascending: false })
    ]);

    if (questionsError) throw questionsError;
    if (sessionsError) throw sessionsError;

    res.json({
      success: true,
      questions: questions || [],
      sessions: sessions || []
    });
  } catch (error: any) {
    res.status(error.message?.includes("authorization") ? 403 : 500).json({ error: error.message });
  }
});

app.post("/api/student/join", async (req, res) => {
  const { code, displayName, studentId: existingStudentId, studentToken: existingStudentToken } = req.body;
  const normalizedCode = String(code || "").trim().toUpperCase();
  const normalizedName = String(displayName || "").trim();

  if (!normalizedCode || !normalizedName) {
    return res.status(400).json({ error: "Room code and name are required" });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: session, error: sessionError } = await admin
      .from(TABLES.sessions)
      .select("*")
      .eq("record_type", "session")
      .eq("session_code", normalizedCode)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: "Session not found. Please check your code." });
    }

    if (!["waiting", "active"].includes(session.status)) {
      return res.status(400).json({ error: "This session is no longer open for joining." });
    }

    let studentId = existingStudentId && existingStudentToken ? String(existingStudentId) : randomUUID();
    const studentToken = existingStudentId && existingStudentToken ? String(existingStudentToken) : randomUUID();

    const { data: existingStudent } = await admin
      .from(TABLES.students)
      .select("id")
      .eq("session_id", session.id)
      .eq("student_id", studentId)
      .maybeSingle();

    const { error: studentError } = await admin
      .from(TABLES.students)
      .upsert({
        session_id: session.id,
        student_id: studentId,
        display_name: normalizedName,
        updated_at: new Date().toISOString()
      }, { onConflict: "session_id,student_id" });

    if (studentError) throw studentError;

    const { data: existingEssay } = await admin
      .from(TABLES.essays)
      .select("id")
      .eq("session_id", session.id)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!existingEssay) {
      const { error: essayError } = await admin
        .from(TABLES.essays)
        .insert({
          session_id: session.id,
          student_id: studentId,
          display_name: normalizedName,
          content: ""
        });

      if (essayError) throw essayError;
    } else {
      const { error: essayUpdateError } = await admin
        .from(TABLES.essays)
        .update({
          display_name: normalizedName,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingEssay.id)
        .eq("content", "");

      if (essayUpdateError) throw essayUpdateError;
    }

    res.json({ success: true, session, studentId, studentToken });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/student/state", async (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  const studentId = String(req.query.studentId || "");
  const studentToken = String(req.query.studentToken || "");

  try {
    const admin = getSupabaseAdmin();
    await validateStudentSession(sessionId, studentId, studentToken);

    const [{ data: session, error: sessionError }, { data: essay, error: essayError }] = await Promise.all([
      admin.from(TABLES.sessions).select("*").eq("id", sessionId).single(),
      admin.from(TABLES.essays).select("*").eq("session_id", sessionId).eq("student_id", studentId).single()
    ]);

    if (sessionError || !session) throw new Error("Session not found");
    if (essayError || !essay) throw new Error("Essay not found");

    const peerComments = await enrichCommentsWithNames(
      sessionId,
      Array.isArray(essay.peer_comments) ? essay.peer_comments : []
    );
    let peerEssay = null;
    let myComments: any[] = [];

    if (essay.assigned_essay_id) {
      const { data: assignedEssay } = await admin
        .from(TABLES.essays)
        .select("*")
        .eq("id", essay.assigned_essay_id)
        .single();

      if (assignedEssay) {
        const assignedComments = await enrichCommentsWithNames(
          sessionId,
          Array.isArray(assignedEssay.peer_comments) ? assignedEssay.peer_comments : []
        );
        peerEssay = { ...assignedEssay, peer_comments: assignedComments };
        const comments = assignedComments;
        myComments = comments.filter((comment: any) => comment.commenter_id === studentId);
      }
    }

    res.json({
      success: true,
      session,
      essay: { ...essay, peer_comments: peerComments },
      feedback: essay.ai_feedback || null,
      peerComments,
      peerEssay,
      myComments
    });
  } catch (error: any) {
    res.status(error.message?.includes("Invalid student") ? 403 : 500).json({ error: error.message });
  }
});

app.get("/api/display/essay", async (req, res) => {
  const essayId = String(req.query.essayId || "");

  if (!essayId) {
    return res.status(400).json({ error: "Missing essay id" });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: essay, error: essayError } = await admin
      .from(TABLES.essays)
      .select("*")
      .eq("id", essayId)
      .single();

    if (essayError || !essay) {
      return res.status(404).json({ error: "Essay not found" });
    }

    const { data: session, error: sessionError } = await admin
      .from(TABLES.sessions)
      .select("session_code, question_title")
      .eq("id", essay.session_id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const peerComments = await enrichCommentsWithNames(
      essay.session_id,
      Array.isArray(essay.peer_comments) ? essay.peer_comments : []
    );

    res.json({ essay: { ...essay, peer_comments: peerComments, session } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/teacher-comment", async (req, res) => {
  const { essayId, comment, paragraphIndex, lineIndex } = req.body;

  if (!essayId || !comment) {
    return res.status(400).json({ error: "Missing teacher comment fields" });
  }

  try {
    const admin = getSupabaseAdmin();
    const { user } = await requireTeacherForEssay(req, essayId);

    const { data: targetEssay, error: targetError } = await admin
      .from(TABLES.essays)
      .select("id, peer_comments")
      .eq("id", essayId)
      .single();

    if (targetError || !targetEssay) throw new Error("Essay not found");

    const newComment = {
      id: randomUUID(),
      commenter_id: user.id,
      commenter_name: user.email || "Teacher",
      commenter_type: "teacher",
      comment: String(comment).trim(),
      paragraph_index: Number(paragraphIndex) || 0,
      line_index: Number(lineIndex) || 0,
      created_at: new Date().toISOString()
    };

    const peerComments = Array.isArray(targetEssay.peer_comments) ? targetEssay.peer_comments : [];
    const { data, error: updateError } = await admin
      .from(TABLES.essays)
      .update({
        peer_comments: [...peerComments, newComment],
        updated_at: new Date().toISOString()
      })
      .eq("id", essayId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ success: true, comment: newComment, essay: data });
  } catch (error: any) {
    res.status(error.message?.includes("authorized") || error.message?.includes("authorization") ? 403 : 500).json({ error: error.message });
  }
});

app.post("/api/student/essay", async (req, res) => {
  const { sessionId, studentId, studentToken, content } = req.body;

  try {
    const admin = getSupabaseAdmin();
    await validateStudentSession(sessionId, studentId, studentToken);

    const { data: session, error: sessionError } = await admin
      .from(TABLES.sessions)
      .select("id, status")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) throw new Error("Session not found");
    if (session.status !== "active") {
      return res.status(403).json({ error: "This writing session is not active." });
    }

    const { data: currentEssay, error: currentEssayError } = await admin
      .from(TABLES.essays)
      .select("id, content")
      .eq("session_id", sessionId)
      .eq("student_id", studentId)
      .single();

    if (currentEssayError || !currentEssay) throw new Error("Essay not found");

    const existingContent = splitContinuationContent(currentEssay.content);
    const requestedContent = splitContinuationContent(content);
    const finalContent = existingContent.locked
      ? mergeContinuationContent(existingContent.locked, requestedContent.current)
      : String(content || "");

    const { data, error } = await admin
      .from(TABLES.essays)
      .update({
        content: finalContent,
        updated_at: new Date().toISOString()
      })
      .eq("session_id", sessionId)
      .eq("student_id", studentId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, essay: data });
  } catch (error: any) {
    res.status(error.message?.includes("Invalid student") ? 403 : 500).json({ error: error.message });
  }
});

app.post("/api/session/status", async (req, res) => {
  const { sessionId, status } = req.body;
  const allowedStatuses = new Set(["waiting", "active", "ended", "peer_review", "returned"]);

  if (!sessionId || !allowedStatuses.has(status)) {
    return res.status(400).json({ error: "Invalid session status request" });
  }

  try {
    const admin = getSupabaseAdmin();
    await requireTeacherForSession(req, sessionId);

    const update: Record<string, string> = { status };
    if (status === "ended") update.ended_at = new Date().toISOString();

    const { error: sessionError } = await admin
      .from(TABLES.sessions)
      .update(update)
      .eq("id", sessionId);

    if (sessionError) throw sessionError;

    if (status === "ended") {
      const { error: essayError } = await admin
        .from(TABLES.essays)
        .update({ is_submitted: true, updated_at: new Date().toISOString() })
        .eq("session_id", sessionId);

      if (essayError) throw essayError;
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(error.message?.includes("authorized") ? 403 : 500).json({ error: error.message });
  }
});

app.post("/api/session/continue", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const admin = getSupabaseAdmin();
    await requireTeacherForSession(req, sessionId);

    const { data: session, error: sessionError } = await admin
      .from(TABLES.sessions)
      .select("id, status")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) throw new Error("Session not found");
    if (["waiting", "active"].includes(session.status)) {
      return res.status(400).json({ error: "Only ended sessions can be continued." });
    }

    const { data: essays, error: essaysError } = await admin
      .from(TABLES.essays)
      .select("id, content")
      .eq("session_id", sessionId);
    if (essaysError) throw essaysError;

    const updates = (essays || []).map((essay: any) => admin
      .from(TABLES.essays)
      .update({
        content: appendContinuationBreak(essay.content),
        is_submitted: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", essay.id)
    );

    const results = await Promise.all(updates);
    const updateError = results.find(result => result.error)?.error;
    if (updateError) throw updateError;

    const { error: statusError } = await admin
      .from(TABLES.sessions)
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (statusError) throw statusError;

    res.json({ success: true });
  } catch (error: any) {
    res.status(error.message?.includes("authorized") ? 403 : 500).json({ error: error.message });
  }
});

app.delete("/api/teacher/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  try {
    const admin = getSupabaseAdmin();
    await requireTeacherForSession(req, sessionId);

    const { error: essaysError } = await admin
      .from(TABLES.essays)
      .delete()
      .eq("session_id", sessionId);
    if (essaysError) throw essaysError;

    const { error: studentsError } = await admin
      .from(TABLES.students)
      .delete()
      .eq("session_id", sessionId);
    if (studentsError) throw studentsError;

    const { error: sessionError } = await admin
      .from(TABLES.sessions)
      .delete()
      .eq("id", sessionId)
      .eq("record_type", "session");
    if (sessionError) throw sessionError;

    res.json({ success: true });
  } catch (error: any) {
    res.status(error.message?.includes("authorized") ? 403 : 500).json({ error: error.message });
  }
});

app.delete("/api/teacher/question/:questionId", async (req, res) => {
  const { questionId } = req.params;

  try {
    const admin = getSupabaseAdmin();
    await getAuthenticatedUser(req);

    const { error } = await admin
      .from(TABLES.sessions)
      .delete()
      .eq("id", questionId)
      .eq("record_type", "question");

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    res.status(error.message?.includes("authorization") ? 403 : 500).json({ error: error.message });
  }
});

app.get("/api/teacher/session-state", async (req, res) => {
  const sessionId = String(req.query.sessionId || "");

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const admin = getSupabaseAdmin();
    await requireTeacherForSession(req, sessionId, { ownerOnly: false });

    const [
      { data: session, error: sessionError },
      { data: students, error: studentsError },
      { data: essays, error: essaysError }
    ] = await Promise.all([
      admin.from(TABLES.sessions).select("*").eq("id", sessionId).eq("record_type", "session").single(),
      admin.from(TABLES.students).select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
      admin.from(TABLES.essays).select("*").eq("session_id", sessionId).order("created_at", { ascending: true })
    ]);

    if (sessionError || !session) throw new Error("Session not found");
    if (studentsError) throw studentsError;
    if (essaysError) throw essaysError;

    res.json({
      success: true,
      session,
      students: students || [],
      essays: essays || []
    });
  } catch (error: any) {
    res.status(error.message?.includes("authorized") ? 403 : 500).json({ error: error.message });
  }
});

app.get("/api/teacher/session/:sessionId/report.pdf", async (req, res) => {
  const { sessionId } = req.params;

  try {
    const admin = getSupabaseAdmin();
    await requireTeacherForSession(req, sessionId, { ownerOnly: false });

    const [
      { data: session, error: sessionError },
      { data: students, error: studentsError },
      { data: essays, error: essaysError }
    ] = await Promise.all([
      admin.from(TABLES.sessions).select("*").eq("id", sessionId).eq("record_type", "session").single(),
      admin.from(TABLES.students).select("*").eq("session_id", sessionId).order("display_name", { ascending: true }),
      admin.from(TABLES.essays).select("*").eq("session_id", sessionId).order("display_name", { ascending: true })
    ]);

    if (sessionError || !session) throw new Error("Session not found");
    if (studentsError) throw studentsError;
    if (essaysError) throw essaysError;

    if (["waiting", "active"].includes(session.status)) {
      return res.status(400).json({ error: "PDF export is available after the session has ended." });
    }

    const studentNames = new Map((students || []).map((student: any) => [
      String(student.student_id),
      student.display_name
    ]));
    const sortedEssays = [...(essays || [])].sort((a: any, b: any) => {
      const aName = cleanPdfText(a.display_name || studentNames.get(String(a.student_id)) || "");
      const bName = cleanPdfText(b.display_name || studentNames.get(String(b.student_id)) || "");
      return aName.localeCompare(bName);
    });

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 48, bottom: 48, left: 54, right: 54 },
      info: {
        Title: `Writing Lab Report - ${session.session_code}`,
        Author: "Writing Lab"
      }
    });

    const filename = `${safeFilename(session.session_code || "session")}-submissions-feedback.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("Writing Lab Submissions & Feedback");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10).fillColor("#334155")
      .text(`Session: ${session.session_code || "N/A"}`)
      .text(`Prompt: ${session.question_title || "Untitled prompt"}`)
      .text(`Status: ${session.status}`)
      .text(`Generated: ${new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}`);
    if (session.question_prompt) {
      doc.moveDown(0.5);
      pdfLabel(doc, "Question Description", session.question_prompt);
    }
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(`Submissions: ${sortedEssays.length}`);

    for (const [index, essay] of sortedEssays.entries()) {
      if (index > 0) doc.addPage();
      else doc.moveDown(0.8);

      const comments = await enrichCommentsWithNames(
        sessionId,
        Array.isArray(essay.peer_comments) ? essay.peer_comments : []
      );
      const teacherComments = comments.filter((comment: any) => comment.commenter_type === "teacher");
      const peerComments = comments.filter((comment: any) => comment.commenter_type !== "teacher");
      const studentName = essay.display_name || studentNames.get(String(essay.student_id)) || "Student";
      const wordCount = cleanPdfText(essay.content).split(/\s+/).filter(Boolean).length;

      doc.font("Helvetica-Bold").fontSize(15).fillColor("#111827").text(`${index + 1}. ${studentName}`);
      doc.font("Helvetica").fontSize(9).fillColor("#64748b")
        .text(`Words: ${wordCount} | Submitted: ${essay.is_submitted ? "Yes" : "No"}`);
      doc.moveDown(0.4);

      pdfHeading(doc, "Submission", 11);
      const essayText = cleanPdfText(essay.content) || "No submission text.";
      doc.font("Helvetica").fontSize(10).fillColor("#111827").text(essayText, {
        lineGap: 2,
        paragraphGap: 5
      });

      pdfHeading(doc, "Compact AI Feedback", 11);
      addCompactFeedback(doc, essay.ai_feedback);
      addCommentsSection(doc, "Teacher Comments", teacherComments);
      addCommentsSection(doc, "Peer Comments", peerComments);
    }

    if (sortedEssays.length === 0) {
      doc.moveDown(1);
      doc.font("Helvetica").fontSize(10).fillColor("#64748b").text("No student submissions were found for this session.");
    }

    doc.end();
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(error.message?.includes("authorized") ? 403 : 500).json({ error: error.message });
    } else {
      res.end();
    }
  }
});

// AI Feedback Generation Endpoint
app.post("/api/ai-feedback", async (req, res) => {
  const { essayId } = req.body;

  if (!essayId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!gemini) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
  }

  try {
    const admin = getSupabaseAdmin();
    const { essay, session } = await requireTeacherForEssay(req, essayId);

    const systemInstruction = `You are an expert H2 Malay Language and Literature writing mentor.

${H2MLL_LITERATURE_RUBRIC_GUIDANCE}

Give short, classroom-usable feedback for a student who may only have written one paragraph.
Avoid generic praise and avoid long commentary. Do not invent missing content or assume a full essay
structure when the student only submitted a paragraph.

Format your response as a JSON object with these keys:
- strengths: 1 sentence on what is working, tied to the rubric.
- improvements: 1 sentence on the most important missing rubric quality.
- grammar_notes: 1 short sentence on language precision only if useful; otherwise say "No major language issue in this draft."
- structure_notes: 1 sentence on paragraph focus, coherence or flow.
- paragraph_feedback: an array of at most 2 objects. Each object must have paragraph_number, focus, feedback, next_revision. Each value should be short.
- next_step: 1 concrete revision action in no more than 20 words.`;

    const prompt = `Essay Prompt: ${session.question_prompt || "No prompt supplied."}

Assess the draft against the rubric lens based only on what is written.
If the draft is one paragraph, give feedback for that paragraph only.
Keep the total feedback brief enough for a student to read quickly.

Essay Content:
${getDisplayEssayContent(essay.content) || "No essay content supplied."}`;

    const response = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const feedbackData = parseJsonObjectFromModel(response.text || "{}");

    const { data, error } = await admin
      .from(TABLES.essays)
      .update({
        ai_feedback: feedbackData,
        updated_at: new Date().toISOString()
      })
      .eq("id", essayId)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, feedback: data });
  } catch (error: any) {
    console.error("AI Feedback Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Peer Review Swapping Endpoint
app.post("/api/peer-review/assign", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    const admin = getSupabaseAdmin();
    await requireTeacherForSession(req, sessionId);

    // 1. Get all essays for the session
    const { data: essays, error: essaysError } = await admin
      .from(TABLES.essays)
      .select("id, student_id")
      .eq("session_id", sessionId);

    if (essaysError) throw essaysError;
    if (!essays || essays.length < 2) {
      return res.status(400).json({ error: "At least 2 essays are needed for peer review" });
    }

    const updates = essays.map((essay, index) => {
      const targetEssay = essays[(index + 1) % essays.length];
      return admin
        .from(TABLES.essays)
        .update({
          assigned_essay_id: targetEssay.id,
          assigned_reviewer_student_id: essay.student_id,
          updated_at: new Date().toISOString()
        })
        .eq("id", essay.id);
    });

    const results = await Promise.all(updates);
    const updateError = results.find(result => result.error)?.error;
    if (updateError) throw updateError;

    // 4. Update session status
    await admin
      .from(TABLES.sessions)
      .update({ status: "peer_review" })
      .eq("id", sessionId);

    res.json({ success: true, count: essays.length });
  } catch (error: any) {
    console.error("Peer Review Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/peer-comment", async (req, res) => {
  const { sessionId, studentId, studentToken, sourceEssayId, targetEssayId, comment, paragraphIndex, lineIndex } = req.body;

  if (!sessionId || !studentId || !studentToken || !sourceEssayId || !targetEssayId || !comment) {
    return res.status(400).json({ error: "Missing peer comment fields" });
  }

  try {
    const admin = getSupabaseAdmin();
    const student = await validateStudentSession(sessionId, studentId, studentToken);

    const { data: sourceEssay, error: sourceError } = await admin
      .from(TABLES.essays)
      .select("id, student_id, assigned_essay_id")
      .eq("id", sourceEssayId)
      .single();

    if (sourceError || !sourceEssay) throw new Error("Reviewer essay not found");
    if (sourceEssay.student_id !== studentId) throw new Error("Not authorized for this review");
    if (String(sourceEssay.assigned_essay_id) !== String(targetEssayId)) {
      throw new Error("This essay is not assigned to you");
    }

    const { data: targetEssay, error: targetError } = await admin
      .from(TABLES.essays)
      .select("id, peer_comments")
      .eq("id", targetEssayId)
      .single();

    if (targetError || !targetEssay) throw new Error("Target essay not found");

    const newComment = {
      id: randomUUID(),
      commenter_id: studentId,
      commenter_name: student.display_name || "Peer reviewer",
      comment: String(comment).trim(),
      paragraph_index: Number(paragraphIndex) || 0,
      line_index: Number(lineIndex) || 0,
      created_at: new Date().toISOString()
    };

    const peerComments = Array.isArray(targetEssay.peer_comments) ? targetEssay.peer_comments : [];
    const { error: updateError } = await admin
      .from(TABLES.essays)
      .update({
        peer_comments: [...peerComments, newComment],
        updated_at: new Date().toISOString()
      })
      .eq("id", targetEssayId);

    if (updateError) throw updateError;

    res.json({ success: true, comment: newComment });
  } catch (error: any) {
    res.status(error.message?.includes("authorized") || error.message?.includes("assigned") ? 403 : 500).json({ error: error.message });
  }
});

export default app;

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.VERCEL !== "1") {
  startServer();
}
