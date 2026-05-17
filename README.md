# Writing Lab

A classroom writing app for live essay practice, teacher-controlled sessions, AI feedback, peer review, and classroom display.

## Product Intent

Writing Lab is designed for a small live classroom writing lesson with one teacher console and multiple student consoles. Students join using a short session code, wait for the teacher to begin, then write an essay response to the selected question.

The intended classroom scale is modest: up to about 20 students per session and roughly 2 classes. The app is built to be easy to test, inspect, and adapt, using Vercel-compatible React/Express code, Supabase for persistence, and OpenAI for feedback.

## Lesson Workflow

1. The teacher signs in and opens the teacher dashboard.
2. The teacher creates or selects an essay question from the question repository.
3. The teacher creates a session and shares the generated room code.
4. Students enter the room code and a display name from the student console.
5. The teacher clicks **Begin Session** to release the question.
6. Students write. Drafts autosave while the session is active.
7. The teacher clicks **End Session** to lock writing and submit the latest saved drafts.
8. After ending, the teacher can generate AI feedback, start peer review, return peer comments, or display any single essay.

The teacher can use the post-session tools in more than one order. For example, the class can generate AI feedback first, then still do peer review, or display selected essays for discussion.

## Current Features

- Teacher dashboard with classes, saved questions, and writing sessions.
- Short session code for students to join.
- Teacher-controlled session states: waiting, active, ended, peer review, returned.
- Student writing console with autosave.
- Teacher session console showing active students, draft word counts, submissions, and essay cards.
- AI feedback generation for student essays.
- AI feedback now uses the H2MLL Paper 3 literature rubric as a marking lens.
- Paragraph-level AI guidance is returned to students when new AI feedback is generated.
- Peer review swapping between students.
- Peer reviewers can add feedback using a grey/white `+` button beside each displayed line.
- Lines with peer feedback are highlighted when returned to the original writer.
- Clicking a highlighted returned line opens the peer feedback popup.
- Teacher can open an individual essay in classroom display mode.

## Rubric-Aligned AI Feedback

The AI feedback prompt is based on the PDF in the parent folder:

```text
MTL writing lab/H2MLL Marking Rubrics for Paper 3 (Literature Paper).pdf
```

The feedback is synthesised around these marking priorities:

- direct response to the question
- critical and personal engagement with the text or issue
- analysis of form, structure and language
- evaluation of writerly effects, not just retelling
- relevant argument development
- awareness of theme, genre, period, history, and context where applicable
- use of textual evidence, quotation, paraphrase, and critical terminology
- clarity, fluency, and precision of expression

For non-literature prompts, the same principles are adapted to argument quality, relevance, evidence, paragraph development, structure, language precision, and reader impact.

## Auth Design

Teachers use Supabase Auth. For local classroom testing, any email ending in `@ri.edu.sg` can log in with the shared password:

```text
Password1
```

The app provisions the Supabase Auth teacher user automatically on first login.

Students do not use Supabase Auth in the browser. A student receives an app-level `student_id` and `student_token` stored in local browser storage. Student actions go through Express server endpoints, and the server uses `SUPABASE_SERVICE_ROLE_KEY` to write student/session/essay data safely.

This design avoids the earlier problem where logging out in one browser tab affected teacher/student testing in other tabs.

## Data Model

The app is intentionally constrained to three Supabase tables:

- `MTL_WRITING_LAB_SESSIONS`
- `MTL_WRITING_LAB_STUDENTS`
- `MTL_WRITING_LAB_ESSAYS`

`MTL_WRITING_LAB_SESSIONS` stores multiple record types:

- `class`
- `question`
- `session`

`MTL_WRITING_LAB_STUDENTS` stores student join records for each session.

`MTL_WRITING_LAB_ESSAYS` stores drafts, AI feedback, peer assignments, and peer comments.

## Current Architecture

- Frontend: React, Vite, Tailwind CSS, React Router.
- Backend: Express server in `server.ts`.
- Database/Auth: Supabase.
- AI: OpenAI Chat Completions API.
- Realtime/session refresh: polling server endpoints for session state, plus Supabase-backed persistence.
- Display mode: `/display/:essayId`, now loaded through a server endpoint instead of direct browser Supabase reads.

Important server endpoints include:

- `POST /api/teacher/provision`
- `GET /api/teacher/session-state`
- `POST /api/student/join`
- `GET /api/student/state`
- `POST /api/student/essay`
- `POST /api/session/status`
- `POST /api/ai-feedback`
- `POST /api/peer-review/assign`
- `POST /api/peer-comment`
- `GET /api/display/essay`

## Environment

Create `.env` in this folder:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
APP_URL=http://localhost:3000
TEACHER_SHARED_PASSWORD=Password1
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_` variable.

## Supabase Setup

1. Create these three public tables if they do not already exist:
   - `MTL_WRITING_LAB_SESSIONS`
   - `MTL_WRITING_LAB_STUDENTS`
   - `MTL_WRITING_LAB_ESSAYS`
2. Run `supabase_schema.sql` in the Supabase SQL editor to add the app columns, indexes, RLS policies, and Realtime publication entries.
3. Enable Email sign-ins for teacher login.
4. Confirm the `.env` file contains both anon and service role keys.
5. Do not put real keys in `.env.example`, `README.md`, or database tables.

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```bash
npm run lint
npm run build
```

## Recent Changes Made

- Renamed the app branding to **Writing Lab**.
- Replaced teacher OTP/magic-link login with email plus shared password.
- Allowed teacher login for any `@ri.edu.sg` email.
- Changed student design so students no longer use Supabase Auth in the browser.
- Added service-role server endpoints for student join, save, session state, peer comments, and display mode.
- Fixed teacher session tracking so the teacher console can see student input.
- Fixed AI feedback generation so feedback can be pushed back to students.
- Added test essay questions to the teacher question repository.
- Added peer review line comments using side `+` buttons.
- Changed peer comment buttons to grey/white.
- Added returned peer feedback highlighting and popup display.
- Added H2MLL Paper 3 rubric-aligned AI feedback and paragraph guidance.

## Current Testing Notes

- Existing AI feedback saved before the rubric update will not contain `paragraph_feedback`. Generate AI feedback again to create the new rubric-aligned format.
- Student identity is local to the browser. To test multiple students, use different browsers, private windows, or clear the `writing_lab_student_id` and `writing_lab_student_token` local storage values.
- Display mode loads by essay ID, for example `/display/2`.
