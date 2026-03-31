import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE, apiFetch, useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

function ProfileSetupPage() {
  const navigate = useNavigate();
  const { user, refreshMe } = useAuth();
  const { pushToast } = useToast();

  const [studentId, setStudentId] = useState(user?.studentId ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? user?.googleName ?? '');
  const [department, setDepartment] = useState(user?.department ?? '');
  const [grade, setGrade] = useState(user?.grade ? String(user.grade) : '');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [trainingType, setTrainingType] = useState<'기본' | '호구'>(user?.trainingType ?? '기본');
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isRetry = user?.approvalStatus === 'REJECTED';
  const description = useMemo(() => {
    if (isRetry) {
      return '가입 신청이 거절되었습니다. 정보를 다시 확인한 뒤 다시 제출해주세요.';
    }
    return '최신 명단에 자동으로 합류되도록 기본 정보를 먼저 저장합니다.';
  }, [isRetry]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await apiFetch(`${API_BASE}/auth/profile-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          displayName,
          department,
          grade,
          age,
          trainingType,
          agreePersonalPolicy: agree
        })
      });

      const json = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(json.message ?? '프로필 저장에 실패했습니다.');
      }

      await refreshMe();
      pushToast('가입 신청이 접수되었습니다. 승인 후 이용할 수 있습니다.', 'success');
      navigate('/main', { replace: true });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '프로필 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell page-shell--center">
      <div className="simple-card form-card">
        <div className="simple-card-eyebrow">첫 접속 설정</div>
        <h1>{isRetry ? '프로필 다시 입력' : '검도부 기본 정보 입력'}</h1>
        <p>{description}</p>

        <label className="form-field">
          <span>학번</span>
          <input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="숫자 9자리" />
        </label>

        <label className="form-field">
          <span>이름</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="이름" />
        </label>

        <label className="form-field">
          <span>학과</span>
          <input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="예: 컴퓨터공학과" />
        </label>

        <div className="form-grid">
          <label className="form-field">
            <span>학년</span>
            <input value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="예: 1" />
          </label>
          <label className="form-field">
            <span>나이</span>
            <input value={age} onChange={(event) => setAge(event.target.value)} placeholder="예: 20" />
          </label>
        </div>

        <label className="form-field">
          <span>교육반</span>
          <select value={trainingType} onChange={(event) => setTrainingType(event.target.value as '기본' | '호구')}>
            <option value="기본">기본</option>
            <option value="호구">호구</option>
          </select>
        </label>

        <label className="checkbox-field">
          <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
          <span>개인정보 이용에 동의합니다.</span>
        </label>

        <button className="primary-btn primary-btn--large" onClick={submit} disabled={submitting}>
          {submitting ? '저장 중...' : isRetry ? '다시 신청하기' : '프로필 저장'}
        </button>
      </div>
    </div>
  );
}

export default ProfileSetupPage;