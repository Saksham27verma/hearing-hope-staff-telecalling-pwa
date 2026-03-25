import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from './firebase';
import { useAuthUser } from './hooks/useAuthUser';
import { EnquiriesProvider } from './context/EnquiriesContext';
import { setupPushNotifications } from './services/pushNotifications';
import AppShell from './components/AppShell';
import LoginScreen from './screens/LoginScreen';
import AppointmentsScreen from './screens/AppointmentsScreen';
import EnquiriesScreen from './screens/EnquiriesScreen';
import EnquiryDetailScreen from './screens/EnquiryDetailScreen';
import TelecallingScreen from './screens/TelecallingScreen';

function StaffLayout({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <EnquiriesProvider userId={user.uid}>
      <Routes>
        <Route element={<AppShell onLogout={onLogout} />}>
          <Route path="appointments" element={<AppointmentsScreen />} />
          <Route path="enquiries" element={<EnquiriesScreen />} />
          <Route path="enquiries/:id" element={<EnquiryDetailScreen />} />
          <Route path="calls" element={<TelecallingScreen />} />
          <Route index element={<Navigate to="appointments" replace />} />
        </Route>
      </Routes>
    </EnquiriesProvider>
  );
}

export default function App() {
  const { user, loading } = useAuthUser();

  useEffect(() => {
    if (user) {
      void setupPushNotifications().catch(() => {});
    }
  }, [user]);

  const handleLogout = () => {
    void signOut(auth);
  };

  if (loading) {
    return <div className="app-splash">Loading…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/app" replace /> : <LoginScreen />} />
        <Route
          path="/app/*"
          element={
            user ? <StaffLayout user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />
          }
        />
        <Route path="/" element={<Navigate to={user ? '/app' : '/login'} replace />} />
        <Route path="*" element={<Navigate to={user ? '/app' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
