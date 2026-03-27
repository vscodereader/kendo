import { useNavigate } from 'react-router-dom';

function PlaceholderPage({ title }: { title: string }) {
  const navigate = useNavigate();

  return (
    <div className="page-shell page-shell--center">
      <div className="simple-card placeholder-card">
        <div className="simple-card-eyebrow">준비 중</div>
        <h1>{title}</h1>
        <p>이 페이지는 다음 단계에서 이어서 구현할 수 있도록 버튼과 라우트만 먼저 연결해 두었습니다.</p>
        <button className="primary-btn" onClick={() => navigate('/select')}>
          메뉴로 돌아가기
        </button>
      </div>
    </div>
  );
}

export default PlaceholderPage;
