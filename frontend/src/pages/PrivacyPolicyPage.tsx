import { Link } from 'react-router-dom';

const SUPPORT_EMAIL = 'gachonkendo@gmail.com';
const EFFECTIVE_DATE = '2026년 3월 31일';

function PrivacyPolicyPage() {
  return (
    <div className="page-shell page-shell--center policy-page-shell">
      <div className="simple-card policy-page-card">
        <div className="simple-card-eyebrow">Privacy Policy</div>
        <h1>개인정보처리방침</h1>
        <p className="policy-page-lead">
          가천대학교 검도부 앱(이하 &ldquo;앱&rdquo;)은 이용자의 개인정보를 중요하게 생각하며,
          관련 법령 및 Google Play 정책에 따라 개인정보를 안전하게 처리합니다.
        </p>

        <div className="policy-meta">시행일: {EFFECTIVE_DATE}</div>

        <section className="policy-section">
          <h2>1. 수집하는 정보</h2>
          <ul>
            <li>구글 로그인 정보: 이메일 주소, 이름, 프로필 이미지, Google 계정 식별 정보</li>
            <li>이용자가 직접 입력하는 정보: 학번, 이름, 학과, 학년, 나이, 교육반 등</li>
            <li>서비스 이용 과정에서 생성되는 정보: 공지, 문의, 일정, 예산, 명단 관련 입력 데이터</li>
            <li>첨부파일 업로드가 있는 경우 해당 파일 정보</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>2. 개인정보 이용 목적</h2>
          <ul>
            <li>회원 식별 및 로그인 처리</li>
            <li>동아리 공지, 일정, 문의, 예산, 명단 기능 제공</li>
            <li>사용자 권한에 따른 기능 제공</li>
            <li>서비스 운영, 유지, 오류 대응</li>
            <li>이용자 문의 응대 및 운영 관련 연락</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>3. 개인정보 보관 기간</h2>
          <p>
            개인정보는 서비스 제공 기간 동안 보관하며, 관계 법령상 보관 의무가 있는 경우 해당
            기간 동안 보관할 수 있습니다. 이용자가 삭제를 요청하거나 서비스 운영상 더 이상
            필요하지 않은 경우, 관련 법령에 저촉되지 않는 범위에서 삭제 또는 비식별 처리합니다.
          </p>
        </section>

        <section className="policy-section">
          <h2>4. 개인정보 제3자 제공</h2>
          <p>
            앱은 원칙적으로 이용자의 개인정보를 제3자에게 판매하거나 임의로 제공하지 않습니다.
            다만, 법령에 따라 요구되는 경우 또는 Google 로그인 기능 제공을 위해 Google의 인증
            서비스를 사용하는 경우는 예외가 될 수 있습니다.
          </p>
        </section>

        <section className="policy-section">
          <h2>5. 개인정보 처리 위탁</h2>
          <p>
            서비스 운영을 위해 일부 인프라 또는 클라우드 서비스를 이용할 수 있으며, 이 경우 관련
            법령과 정책에 따라 안전하게 관리합니다.
          </p>
        </section>

        <section className="policy-section">
          <h2>6. 이용자의 권리</h2>
          <p>
            이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제를 요청할 수 있습니다.
          </p>
          <p>
            문의 및 요청: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </section>

        <section className="policy-section">
          <h2>7. 데이터 보안</h2>
          <p>
            앱은 전송 구간 보호, 접근 통제 등 합리적인 보안 조치를 통해 개인정보를 보호하기 위해
            노력합니다.
          </p>
        </section>

        <section className="policy-section">
          <h2>8. 아동의 개인정보</h2>
          <p>
            이 앱은 대학 동아리 운영을 위한 앱이며, 아동을 주요 대상으로 하지 않습니다.
          </p>
        </section>

        <section className="policy-section">
          <h2>9. 정책 변경</h2>
          <p>
            본 개인정보처리방침은 필요에 따라 변경될 수 있으며, 중요한 변경이 있는 경우 앱 또는
            관련 채널을 통해 안내합니다.
          </p>
        </section>

        <div className="policy-actions">
          <Link className="ghost-btn" to="/main">
            메인으로
          </Link>
          <Link className="primary-btn" to="/account-deletion">
            계정 삭제 안내 보기
          </Link>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;