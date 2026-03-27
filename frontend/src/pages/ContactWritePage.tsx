import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NoticeEditor from '../components/NoticeEditor';
import { createContactPost } from '../lib/club';
import { useToast } from '../lib/toast';

function ContactWritePage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [title, setTitle] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      pushToast('제목을 입력해주세요.', 'error');
      return;
    }

    if (!bodyHtml.trim()) {
      pushToast('본문 내용을 입력해주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      const created = await createContactPost({
        title: title.trim(),
        bodyHtml,
        isSecret,
        isAnonymous
      });

      pushToast('문의글이 등록되었습니다.', 'success');
      navigate(`/contact/${created.id}`, { replace: true });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '문의글 등록에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="contact-page-width">
        <div className="contact-page-topbar">
          <button className="danger-outline-btn" onClick={() => navigate('/contact')}>
            목록으로
          </button>
        </div>

        <div className="contact-write-card">
          <div className="contact-write-header">
            <h1>동아리 문의 작성</h1>
          </div>

          <div className="contact-write-body">
            <label className="form-field">
              <span>제목</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목을 입력해주세요."
              />
            </label>

            <div className="contact-check-row">
              <label className="contact-check-item">
                <input
                  type="checkbox"
                  checked={isSecret}
                  onChange={(e) => setIsSecret(e.target.checked)}
                />
                <span>비밀글</span>
              </label>

              <label className="contact-check-item">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                />
                <span>익명</span>
              </label>
            </div>

            <div className="form-field">
              <span>내용</span>
              <NoticeEditor value={bodyHtml} onChange={setBodyHtml} />
            </div>
          </div>

          <div className="contact-write-actions">
            <button className="primary-btn" onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
            <button className="ghost-btn" onClick={() => navigate('/contact')} disabled={saving}>
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContactWritePage;