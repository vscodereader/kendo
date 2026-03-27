import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import NoticeEditor, {
  type MoneySnapshotEmbedPayload,
  type NoticeEditorHandle
} from '../components/NoticeEditor';
import { useToast } from '../lib/toast';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');

type NoticeAttachment = {
  id: string;
  fileName: string;
  fileSize: number;
  downloadUrl: string;
};

type NoticePostDetail = {
  id: string;
  title: string;
  bodyHtml: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  isPinned: boolean;
  attachments: NoticeAttachment[];
};

type MoneySnapshotSummary = {
  id: string;
  title: string;
  savedAt: string;
  isActive: boolean;
  count: number;
};

type MoneySnapshotDetail = MoneySnapshotEmbedPayload & {
  id: string;
  savedAt?: string;
  isActive?: boolean;
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

function NoticeWritePage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { postId } = useParams();
  const editorRef = useRef<NoticeEditorHandle | null>(null);

  const isEditMode = Boolean(postId);

  const [title, setTitle] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditMode);

  const [attachments, setAttachments] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<NoticeAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const [moneyModalOpen, setMoneyModalOpen] = useState(false);
  const [moneyConfirmOpen, setMoneyConfirmOpen] = useState(false);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [importingSnapshot, setImportingSnapshot] = useState(false);
  const [snapshotOptions, setSnapshotOptions] = useState<MoneySnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');

  useEffect(() => {
    if (!isEditMode || !postId) return;

    const run = async () => {
      setLoading(true);
      try {
        const post = await apiRequest<NoticePostDetail>(`/club/notice/posts/${postId}`);
        setTitle(post.title);
        setBodyHtml(post.bodyHtml);
        setExistingAttachments(post.attachments ?? []);
      } catch (error) {
        pushToast(error instanceof Error ? error.message : '공지글을 불러오지 못했습니다.', 'error');
        navigate('/notice', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [isEditMode, postId, pushToast, navigate]);

  const selectedSnapshotTitle = useMemo(
    () => snapshotOptions.find((item) => item.id === selectedSnapshotId)?.title ?? '',
    [snapshotOptions, selectedSnapshotId]
  );

  const mergeFiles = (incoming: File[]) => {
    setAttachments((current) => {
      const next = [...current];
      for (const file of incoming) {
        const exists = next.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified
        );
        if (!exists) next.push(file);
      }
      return next.slice(0, 10);
    });
  };

  const openMoneyModal = async () => {
    setMoneyModalOpen(true);
    if (snapshotOptions.length > 0) return;

    setLoadingSnapshots(true);
    try {
      const result = await apiRequest<{ items: MoneySnapshotSummary[] }>('/club/money-snapshots/bootstrap');
      setSnapshotOptions(result.items ?? []);
      if (result.items?.[0]?.id) {
        setSelectedSnapshotId(result.items[0].id);
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '회비 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const confirmInsertMoneyTable = async () => {
    if (!selectedSnapshotId) {
      pushToast('가져올 회비내역을 선택해주세요.', 'error');
      return;
    }

    setImportingSnapshot(true);
    try {
      const snapshot = await apiRequest<MoneySnapshotDetail>(`/club/money-snapshots/${selectedSnapshotId}`);
      editorRef.current?.insertMoneyTableAtCursor({
        title: snapshot.title,
        entries: snapshot.entries
      });
      setMoneyConfirmOpen(false);
      setMoneyModalOpen(false);
      pushToast('회비 표가 본문에 추가되었습니다.', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '회비 표를 불러오지 못했습니다.', 'error');
    } finally {
      setImportingSnapshot(false);
    }
  };

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
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('bodyHtml', bodyHtml);

      attachments.forEach((file) => {
        formData.append('attachments', file);
      });

      const result = await apiRequest<NoticePostDetail>(
        isEditMode ? `/club/notice/posts/${postId}` : '/club/notice/posts',
        {
          method: isEditMode ? 'PUT' : 'POST',
          body: formData
        }
      );

      pushToast(isEditMode ? '공지글이 수정되었습니다.' : '공지글이 저장되었습니다.', 'success');
      navigate(`/notice/${result.id}`, { replace: true });
    } catch (error) {
      pushToast(error instanceof Error ? error.message : '공지 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-shell page-shell--center">
        <div className="simple-card simple-card--loading">
          <h1>공지글을 불러오는 중입니다.</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="notice-write-card">
        <div className="notice-write-header">
          <h1>{isEditMode ? '공지 수정' : '공지 작성'}</h1>
        </div>

        <div className="notice-write-body">
          <label className="form-field">
            <span>제목</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="제목"
            />
          </label>

          <div className="form-field">
            <span>본문</span>
            <NoticeEditor
              ref={editorRef}
              value={bodyHtml}
              onChange={setBodyHtml}
              showMoneyImportButton
              onOpenMoneyImport={openMoneyModal}
            />
          </div>

          <div className="form-field">
            <span>첨부파일</span>

            {existingAttachments.length > 0 ? (
              <div className="notice-existing-file-list">
                {existingAttachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    className="notice-attachment-link"
                    href={`${API_ORIGIN}${attachment.downloadUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>📎 {attachment.fileName}</span>
                    <span>기존 첨부파일</span>
                  </a>
                ))}
              </div>
            ) : null}

            <div className="notice-upload-toolbar">
              <label className="notice-upload-add-btn">
                <input
                  type="file"
                  multiple
                  onChange={(event) => mergeFiles(Array.from(event.target.files ?? []))}
                  hidden
                />
                파일 추가
              </label>
              <div className="notice-upload-guide">Word / HWP / PPT / Excel / PDF 등 파일을 첨부할 수 있습니다.</div>
            </div>

            <div
              className={`notice-file-dropzone ${dragActive ? 'notice-file-dropzone--active' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                mergeFiles(Array.from(event.dataTransfer.files ?? []));
              }}
            >
              첨부파일을 마우스로 끌어 놓으세요.
            </div>

            <div className="notice-file-list">
              {attachments.length === 0 ? (
                <div className="notice-file-empty">선택된 파일이 없습니다.</div>
              ) : (
                attachments.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`} className="notice-file-item">
                    <div className="notice-file-item__name">
                      📎 {file.name}
                    </div>
                    <div className="notice-file-item__meta">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() =>
                        setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))
                      }
                    >
                      제거
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="notice-write-actions">
          <button className="primary-btn" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
          <button className="ghost-btn" onClick={() => navigate('/notice')} disabled={saving}>
            취소
          </button>
        </div>
      </div>

      {moneyModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card notice-money-modal">
            <h3>가져올 회비내역을 선택하세요</h3>

            {loadingSnapshots ? (
              <p>회비 목록을 불러오는 중입니다.</p>
            ) : (
              <>
                <select
                  className="notice-money-select"
                  value={selectedSnapshotId}
                  onChange={(event) => setSelectedSnapshotId(event.target.value)}
                >
                  <option value="">선택하세요</option>
                  {snapshotOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>

                <div className="modal-actions">
                  <button
                    className="primary-btn"
                    onClick={() => {
                      if (!selectedSnapshotId) {
                        pushToast('회비내역을 선택해주세요.', 'error');
                        return;
                      }
                      setMoneyConfirmOpen(true);
                    }}
                  >
                    확인
                  </button>
                  <button
                    className="ghost-btn"
                    onClick={() => {
                      setMoneyModalOpen(false);
                      setMoneyConfirmOpen(false);
                    }}
                  >
                    취소
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {moneyConfirmOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <p>정말 일반 부원들에게 {selectedSnapshotTitle} 을 공개할까요?</p>
            <div className="modal-actions">
              <button className="primary-btn" onClick={() => void confirmInsertMoneyTable()} disabled={importingSnapshot}>
                {importingSnapshot ? '가져오는 중...' : '확인'}
              </button>
              <button className="ghost-btn" onClick={() => setMoneyConfirmOpen(false)} disabled={importingSnapshot}>
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default NoticeWritePage;