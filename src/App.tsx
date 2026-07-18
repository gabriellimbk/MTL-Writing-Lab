import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Landing from './pages/Landing';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherSession from './pages/TeacherSession';
import StudentJoin from './pages/StudentJoin';
import StudentEditor from './pages/StudentEditor';
import Display from './pages/Display';
import { Loader2 } from 'lucide-react';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-[#faf8f3] text-[#242523] font-sans">
          <Routes>
            <Route path="/" element={<Landing />} />
            
            {/* Teacher Routes */}
            <Route path="/teacher" element={
              <ProtectedRoute role="teacher">
                <TeacherDashboard />
              </ProtectedRoute>
            } />
            <Route path="/teacher/session/:id" element={
              <ProtectedRoute role="teacher">
                <TeacherSession />
              </ProtectedRoute>
            } />

            {/* Student Routes */}
            <Route path="/student" element={<StudentJoin />} />
            <Route path="/student/session/:code" element={<StudentJoin />} />
            <Route path="/student/write/:sessionId" element={<StudentEditor />} />

            {/* Projector Display */}
            <Route path="/display/:essayId" element={<Display />} />

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

function ProtectedRoute({ children, role }: { children: React.ReactNode, role?: 'teacher' }) {
  const { user, loading, isTeacher } = useAuth();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-[#faf8f3]">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
    </div>
  );

  if (role === 'teacher' && (!user || !isTeacher)) return <Navigate to="/" />;
  
  return <>{children}</>;
}
