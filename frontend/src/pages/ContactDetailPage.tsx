import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { fetchContactPost, type ContactPostDetail } from '../lib/club';
import { useToast } from '../lib/toast';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

type ContactPostDetailWithActions = ContactPostDetail & {
  isAuthor?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
};

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message ?? '요청에 실패했습니다.');
  }

  return payload as T;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function ContactDetailPage() {
  const navigate = useNavigate();
  const { postId } = useParams();
  const { pushToast } = useToast();
  const { user } = useAuth();

  const [post, setPost] = useState<ContactPostDetailWithActions | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealingAuthor, setRevealingAuthor] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canHoldReveal = useMemo(() => {
    if (!post?.isAnonymous) return false;
    return Boolean(post.canRevealAuthor);
  }, [post]);

  useEffect(() => {
    if (!postId) return;

    const run = async () => {
      setLoading(true);
      try {
        const result = (await fetchContactPost(postId)) as ContactPostDetailWithActions;
        setPost(result);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '문의글을 불러오지 못했습니다.', 'error');
        navigate('/contact', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [postId, navigate, pushToast, user]);

  const handleDelete = async () => {
    if (!postId || !post) return;

    const confirmed = window.confirm('이 문의글을 삭제하시겠습니까?');
    if (!confirmed) return;

    setDeleting(true);
    try {
      await apiRequest<{ ok: true }>(`/club/contact/posts/${postId}`, {
        method: 'DELETE'
      });
      pushToast('문의글이 삭제되었습니다.', 'success');
      navigate('/contact', { replace: true });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '문의글 삭제에 실패했습니다.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !post) {
    return (
      <div className="page-shell page-shell--center">
        <div className="simple-card simple-card--loading">
          <h1>문의글을 불러오는 중입니다.</h1>
        </div>
      </div>
    );
  }

  const authorText = canHoldReveal && revealingAuthor ? post.realAuthorName : post.authorDisplayName;

  return (
    <div className="page-shell">
      <div className="contact-page-width">
        <div className="contact-page-topbar">
          <button className="danger-outline-btn" onClick={() => navigate('/contact')}>
            목록으로
          </button>
        </div>

        <div className="contact-detail-card">
          <div className="contact-detail-header">
            <h1>
              {post.isSecret ? '🔒 ' : ''}
              {post.title}
            </h1>

            <div className="contact-detail-meta">
              <span
                className={canHoldReveal ? 'contact-author-holdable' : ''}
                onMouseDown={() => {
                  if (canHoldReveal) setRevealingAuthor(true);
                }}
                onMouseUp={() => setRevealingAuthor(false)}
                onMouseLeave={() => setRevealingAuthor(false)}
                onTouchStart={() => {
                  if (canHoldReveal) setRevealingAuthor(true);
                }}
                onTouchEnd={() => setRevealingAuthor(false)}
                onTouchCancel={() => setRevealingAuthor(false)}
              >
                작성자 {authorText}
              </span>
              <span>작성일 {formatDateTime(post.createdAt)}</span>
              <span>조회수 {post.viewCount}</span>
            </div>

            {canHoldReveal ? <div className="contact-reveal-hint">익명을 꾹 누르고 있으면 실명이 보입니다.</div> : null}
          </div>

          <div className="contact-detail-body" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />

          {(post.canEdit || post.canDelete) ? (
            <div className="contact-detail-actions">
              {post.canEdit ? (
                <button
                  className="primary-btn"
                  onClick={() => navigate(`/contact/write?postId=${post.id}`)}
                >
                  수정
                </button>
              ) : null}

              {post.canDelete ? (
                <button
                  className="danger-btn"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? '삭제 중...' : '삭제'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ContactDetailPage;