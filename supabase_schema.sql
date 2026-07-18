-- THREE-TABLE SUPABASE SCHEMA FOR CLASSROOM WRITER
-- This file upgrades these existing tables:
-- "MTL_WRITING_LAB_SESSIONS"
-- "MTL_WRITING_LAB_STUDENTS"
-- "MTL_WRITING_LAB_ESSAYS"

ALTER TABLE public."MTL_WRITING_LAB_SESSIONS"
  ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS teacher_id UUID,
  ADD COLUMN IF NOT EXISTS parent_class_id BIGINT,
  ADD COLUMN IF NOT EXISTS source_question_id BIGINT,
  ADD COLUMN IF NOT EXISTS class_name TEXT,
  ADD COLUMN IF NOT EXISTS session_code TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'waiting',
  ADD COLUMN IF NOT EXISTS question_title TEXT,
  ADD COLUMN IF NOT EXISTS question_prompt TEXT,
  ADD COLUMN IF NOT EXISTS timer_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS timer_ends_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE public."MTL_WRITING_LAB_STUDENTS"
  ADD COLUMN IF NOT EXISTS session_id BIGINT,
  ADD COLUMN IF NOT EXISTS student_id UUID,
  ADD COLUMN IF NOT EXISTS student_token TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE public."MTL_WRITING_LAB_ESSAYS"
  ADD COLUMN IF NOT EXISTS session_id BIGINT,
  ADD COLUMN IF NOT EXISTS student_id UUID,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_submitted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_essay_id BIGINT,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_student_id UUID,
  ADD COLUMN IF NOT EXISTS ai_feedback JSONB,
  ADD COLUMN IF NOT EXISTS peer_comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

CREATE INDEX IF NOT EXISTS mtl_writing_lab_sessions_record_type_idx
  ON public."MTL_WRITING_LAB_SESSIONS"(record_type);

CREATE UNIQUE INDEX IF NOT EXISTS mtl_writing_lab_sessions_code_unique_idx
  ON public."MTL_WRITING_LAB_SESSIONS"(session_code)
  WHERE record_type = 'session' AND session_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS mtl_writing_lab_sessions_teacher_idx
  ON public."MTL_WRITING_LAB_SESSIONS"(teacher_id);

CREATE INDEX IF NOT EXISTS mtl_writing_lab_students_session_idx
  ON public."MTL_WRITING_LAB_STUDENTS"(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS mtl_writing_lab_students_session_student_unique_idx
  ON public."MTL_WRITING_LAB_STUDENTS"(session_id, student_id);

CREATE INDEX IF NOT EXISTS mtl_writing_lab_essays_session_idx
  ON public."MTL_WRITING_LAB_ESSAYS"(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS mtl_writing_lab_essays_session_student_unique_idx
  ON public."MTL_WRITING_LAB_ESSAYS"(session_id, student_id);

ALTER TABLE public."MTL_WRITING_LAB_SESSIONS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MTL_WRITING_LAB_STUDENTS" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MTL_WRITING_LAB_ESSAYS" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage own MTL session records" ON public."MTL_WRITING_LAB_SESSIONS";
DROP POLICY IF EXISTS "Students can view MTL joinable sessions" ON public."MTL_WRITING_LAB_SESSIONS";
DROP POLICY IF EXISTS "Teachers view MTL session students" ON public."MTL_WRITING_LAB_STUDENTS";
DROP POLICY IF EXISTS "Students join MTL sessions as themselves" ON public."MTL_WRITING_LAB_STUDENTS";
DROP POLICY IF EXISTS "Students view own MTL join rows" ON public."MTL_WRITING_LAB_STUDENTS";
DROP POLICY IF EXISTS "Students update own MTL join rows" ON public."MTL_WRITING_LAB_STUDENTS";
DROP POLICY IF EXISTS "Teachers view MTL essays" ON public."MTL_WRITING_LAB_ESSAYS";
DROP POLICY IF EXISTS "Students create own MTL essays" ON public."MTL_WRITING_LAB_ESSAYS";
DROP POLICY IF EXISTS "Students view own MTL essays" ON public."MTL_WRITING_LAB_ESSAYS";
DROP POLICY IF EXISTS "Students view assigned MTL essays" ON public."MTL_WRITING_LAB_ESSAYS";
DROP POLICY IF EXISTS "Students update own MTL essays while active" ON public."MTL_WRITING_LAB_ESSAYS";

CREATE POLICY "Teachers manage own MTL session records"
  ON public."MTL_WRITING_LAB_SESSIONS"
  FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students can view MTL joinable sessions"
  ON public."MTL_WRITING_LAB_SESSIONS"
  FOR SELECT
  USING (record_type = 'session');

CREATE POLICY "Teachers view MTL session students"
  ON public."MTL_WRITING_LAB_STUDENTS"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public."MTL_WRITING_LAB_SESSIONS" s
      WHERE s.id = session_id
        AND s.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers view MTL essays"
  ON public."MTL_WRITING_LAB_ESSAYS"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public."MTL_WRITING_LAB_SESSIONS" s
      WHERE s.id = session_id
        AND s.teacher_id = auth.uid()
    )
  );

DO $$
DECLARE
  realtime_table TEXT;
  realtime_tables TEXT[] := ARRAY[
    'MTL_WRITING_LAB_SESSIONS',
    'MTL_WRITING_LAB_STUDENTS',
    'MTL_WRITING_LAB_ESSAYS'
  ];
BEGIN
  FOREACH realtime_table IN ARRAY realtime_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = realtime_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', realtime_table);
    END IF;
  END LOOP;
END
$$;
