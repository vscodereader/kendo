import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import MainPage from './pages/MainPage';
import LoginPage from './pages/LoginPage';
import ProfileSetupPage from './pages/ProfileSetupPage';
import SelectPage from './pages/SelectPage';
import MembersPage from './pages/MembersPage';
import MoneyPaidPage from './pages/MoneyPaidPage';
import { isApprovedMember, useAuth } from './lib/auth';
import GymPage from './pages/GymPage';
import MTPage from './pages/MTPage';
import SchedulePage from './pages/SchedulePage';
import NoticeListPage from './pages/NoticeListPage';
import NoticeDetailPage from './pages/NoticeDetailPage';
import NoticeWritePage from './pages/NoticeWritePage';
import ContactListPage from './pages/ContactListPage';
import ContactDetailPage from './pages/ContactDetailPage';
import ContactWritePage from './pages/ContactWritePage';
import EventsListPage from './pages/EventsListPage';
import EventsWritePage from './pages/EventsWritePage';
import EventsDetailPage from './pages/EventsDetailPage';
import SectionLayout from './components/SectionLayout';
import LoginCallbackPage from './pages/LoginCallbackPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import AccountDeletionPage from './pages/AccountDeletionPage';
import MobileRuntimeBridge from './components/MobileRuntimeBridge';

function App() {
  return (
    <>
      <MobileRuntimeBridge />
      <Routes>
        <Route path="/" element={<Navigate to="/main" replace />} />
        <Route path="/main" element={<MainPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/callback" element={<LoginCallbackPage />} />
        <Route path="/profile-setup" element={<ProfileSetupGuard />} />
        <Route path="/select" element={<SelectGuard />} />

        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/account-deletion" element={<AccountDeletionPage />} />

        <Route element={<ApprovedContentGuard />}>
          <Route element={<SectionLayout />}>
            <Route path="/members" element={<ManageGuard scope="members" />} />
            <Route path="/moneypaid" element={<ManageGuard scope="money" />} />

            <Route path="/gym" element={<GymPage />} />
            <Route path="/MT" element={<MTPage />} />

            <Route path="/notice/:postId/edit" element={<ManageGuard scope="members" render={() => <NoticeWritePage />} />} />
            <Route path="/notice" element={<NoticeListPage />} />
            <Route path="/notice/:postId" element={<NoticeDetailPage />} />
            <Route path="/notice/write" element={<ManageGuard scope="members" render={() => <NoticeWritePage />} />} />

            <Route path="/schedule" element={<SchedulePage />} />

            <Route path="/events" element={<EventsListPage />} />
            <Route path="/events/write" element={<ManageGuard scope="members" render={() => <EventsWritePage />} />} />
            <Route path="/events/:postId/edit" element={<ManageGuard scope="members" render={() => <EventsWritePage />} />} />
            <Route path="/events/:postId" element={<EventsDetailPage />} />

            <Route path="/contact" element={<ContactListPage />} />
            <Route path="/contact/write" element={<ContactWritePage />} />
            <Route path="/contact/:postId" element={<ContactDetailPage />} />

            <Route path="/dojo" element={<Navigate to="/gym" replace />} />
            <Route path="/mt-place" element={<Navigate to="/MT" replace />} />
          </Route>
        </Route>

        <Route path="/check" element={<Navigate to="/select" replace />} />
        <Route path="*" element={<Navigate to="/main" replace />} />
      </Routes>
    </>
  );
}

function ProfileSetupGuard() {
  const { loading, authenticated, user } = useAuth();

  if (loading) return <PageLoading />;
  if (!authenticated) return <Navigate to="/login" replace />;
  if ((user?.profileCompleted && user?.approvalStatus !== 'REJECTED') || user?.isRoot) {
    return <Navigate to="/main" replace />;
  }

  return <ProfileSetupPage />;
}

function SelectGuard() {
  const { loading, authenticated, user } = useAuth();

  if (loading) return <PageLoading />;
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!user?.profileCompleted || user.approvalStatus === 'REJECTED') {
    return <Navigate to="/profile-setup" replace />;
  }
  if (!isApprovedMember(user)) return <Navigate to="/main" replace />;

  return <SelectPage />;
}

function ApprovedContentGuard() {
  const { loading, authenticated, user } = useAuth();

  if (loading) return <PageLoading />;
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!user?.profileCompleted || user.approvalStatus === 'REJECTED') {
    return <Navigate to="/profile-setup" replace />;
  }
  if (!isApprovedMember(user)) {
    return <Navigate to="/main" replace />;
  }

  return <Outlet />;
}

function ManageGuard({ scope, render }: { scope: 'members' | 'money'; render?: () => JSX.Element }) {
  const { loading, authenticated, user } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoading />;
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!user?.profileCompleted || user.approvalStatus === 'REJECTED') {
    return <Navigate to="/profile-setup" replace />;
  }
  if (!isApprovedMember(user)) return <Navigate to="/main" replace />;

  const allowed = user?.isRoot ? true : scope === 'money' ? Boolean(user?.permissions.canManageMoney) : Boolean(user?.permissions.canManageRoster);

  if (!allowed) {
    return <Navigate to={`/select?denied=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (render) return render();
  return scope === 'members' ? <MembersPage /> : <MoneyPaidPage />;
}

function PageLoading() {
  return (
    <div className="page-shell page-shell--center">
      <div className="simple-card simple-card--loading">
        <h1>잠시만 기다려주세요</h1>
        <p>로그인 상태를 확인하고 있어요.</p>
      </div>
    </div>
  );
}

export default App;
