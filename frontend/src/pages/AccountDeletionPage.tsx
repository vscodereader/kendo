import { Link } from 'react-router-dom';

const SUPPORT_EMAIL = 'gachonkendo@gmail.com';

function AccountDeletionPage() {
  return (
    <div className="page-shell page-shell--center policy-page-shell">
      <div className="simple-card policy-page-card">
        <div className="simple-card-eyebrow">Account Deletion</div>
        <h1>계정 및 데이터 삭제 안내</h1>
        <p className="policy-page-lead">
          가천대학교 검도부 앱 계정 삭제를 원하시는 경우 아래 절차에 따라 요청할 수 있습니다.
        </p>

        <section className="policy-section">
          <h2>삭제 요청 방법</h2>
          <ol>
            <li>아래 이메일 주소로 삭제 요청 메일을 보냅니다.</li>
            <li>메일 제목에 <strong>[가천검도부 계정 삭제 요청]</strong> 을 적어 주세요.</li>
            <li>본인 확인을 위해 가입 시 사용한 Google 계정 이메일을 함께 적어 주세요.</li>
          </ol>
          <p className="policy-highlight">
            삭제 요청 이메일: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </section>

        <section className="policy-section">
          <h2>삭제되는 정보</h2>
          <ul>
            <li>앱 계정 정보</li>
            <li>프로필 정보(학번, 이름, 학과, 학년, 나이, 교육반 등)</li>
            <li>서비스 이용 과정에서 저장된 사용자 관련 식별 정보</li>
          </ul>
        </section>

        <section className="policy-section">
          <h2>보관될 수 있는 정보</h2>
          <p>
            법령상 보관 의무가 있거나 서비스 운영상 분쟁 대응을 위해 필요한 최소 정보는 관련
            법령이 허용하는 범위에서 일정 기간 보관될 수 있습니다.
          </p>
        </section>

        <section className="policy-section">
          <h2>처리 기간</h2>
          <p>
            삭제 요청 확인 후 특별한 사정이 없는 한 합리적인 기간 내에 처리합니다. 추가 확인이
            필요한 경우 답변이 지연될 수 있습니다.
          </p>
        </section>

        <section className="policy-section">
          <h2>참고</h2>
          <p>
            계정 삭제 요청은 앱 삭제와 다릅니다. 앱을 휴대폰에서 삭제해도 서버에 저장된 계정이
            자동 삭제되지는 않습니다. 계정 삭제를 원하시면 반드시 이메일로 요청해 주세요.
          </p>
        </section>

        <div className="policy-actions">
          <a className="primary-btn" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[가천검도부 계정 삭제 요청]')}`}>
            삭제 요청 메일 보내기
          </a>
          <Link className="ghost-btn" to="/privacy">
            개인정보처리방침 보기
          </Link>
        </div>
      </div>
    </div>
  );
}

export default AccountDeletionPage;