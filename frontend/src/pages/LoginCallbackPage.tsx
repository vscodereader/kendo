import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

function LoginCallbackPage() {
  const navigate = useNavigate();
  const { refreshMe, user, loading } = useAuth();

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (user.profileCompleted) {
      navigate('/main', { replace: true });
      return;
    }

    navigate('/profile-setup', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="oauth-loading-page">
      <div className="oauth-loading-card">
        <h1>로딩중입니다</h1>
        <p>로그인 정보를 확인하고 있어요.</p>
      </div>
    </div>
  );
}

export default LoginCallbackPage;