# 가천대 검도부 앱 (Kendo Club Manager)

가천대학교 검도부 운영을 위한 웹/안드로이드 앱 프로젝트입니다.

현재 저장소는 다음 두 영역으로 구성되어 있습니다.

- `backend/`: Express + TypeScript + Prisma 기반 API 서버
- `frontend/`: React + Vite + Capacitor 기반 프론트엔드 / 안드로이드 앱

이 프로젝트는 단순 웹페이지가 아니라, **웹과 안드로이드 앱을 함께 운영하는 구조**를 기준으로 작성되어 있습니다.

---

## 1. 주요 기능

### 회원 / 로그인
- Google 로그인
- 모바일 로그인 딥링크 처리
- 승인된 동아리원만 접근 가능한 페이지 관리
- 운영진 / 부회장 / 회장 / Admin 권한 분기

### 공지 / 대회 및 심사일정 / 문의
- 공지 게시판
- 대회 및 심사일정 게시판
- 동아리 문의 게시판
- 첨부파일 업로드/다운로드
- 게시글 조회수 증가
- 일부 게시글 고정(pin) 처리

### 동아리 운영
- 가입 승인 대기자 조회
- 가입 승인 / 반려
- 동아리원 명단 저장 / 불러오기
- 회비(예산) 스냅샷 저장 / 조회
- 도장 위치 / 엠티 장소 페이지 관리
- 일정 이벤트 저장 / 조회

### 모바일 푸시 알림
- 앱 설치 후 알림 권한 요청
- 공지 등록 시 전체 유저 대상 푸시
- 대회 및 심사일정 등록 시 전체 유저 대상 푸시
- 문의 등록 시 운영진 대상 푸시
- 예산 저장 시 운영진 대상 푸시
- 엠티 장소 저장 시 운영진 대상 푸시
- 신규 가입 승인 완료 시 운영진 대상 푸시
- 알림 클릭 시 지정된 페이지로 이동
- 비로그인 상태에서 알림 클릭 시 로그인 후 목적 경로 이동
- `/main` 관련 알림은 이미 `/main`에 있는 경우 새로고침 이벤트 처리

---

## 2. 기술 스택

### 프론트엔드
- React 18
- TypeScript
- Vite
- React Router
- Quill Editor
- Capacitor
- Capacitor Push Notifications
- Capacitor Preferences
- Capacitor Browser
- Capacitor App

### 백엔드
- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- express-session
- connect-pg-simple
- Passport
- passport-google-oauth20
- Firebase Admin SDK
- multer
- nodemailer

### 모바일
- Capacitor Android
- Firebase Cloud Messaging (FCM)

---

## 3. 프로젝트 구조

```text
kendo/
├─ backend/
│  ├─ package.json
│  ├─ prisma/
│  └─ src/
│     ├─ auth/
│     ├─ lib/
│     ├─ routes/
│     ├─ services/
│     └─ server.ts
├─ frontend/
│  ├─ package.json
│  ├─ capacitor.config.ts
│  ├─ android/
│  └─ src/
└─ README.md

4. 개발 환경 준비
<필수>
Node.js
npm
PostgreSQL
Android Studio (안드로이드 앱 테스트 시)
Firebase 프로젝트 (푸시 알림 사용 시)
<권장>
VS Code
Git

5. 환경변수
<<backend 환경변수>>
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME
SESSION_SECRET=your_session_secret
CLIENT_URL=http://localhost:5173
APPROVAL_REMINDER_SECRET=your_internal_secret
FIREBASE_SERVICE_ACCOUNT_JSON={서비스계정 JSON 전체}

<<frontend 환경변수>>
VITE_API_BASE=https://your-backend-domain/api
VITE_API_BASE_URL=https://your-backend-domain/api
VITE_NAVER_MAPS_KEY_ID=your_naver_maps_key

6. Firebase 설정
  6-1. 앱용 Firebase 설정
  Android 앱에 google-services.json 넣어야 합니다.
  frontend/android/app/google-services.json
  
  6-2. 서버용 Firebase 설정
  Render(또는 백엔드 실행 환경)에 서비스 계정 JSON을 환경변수로 넣어야 합니다.
  Firebase Console
  Project settings
  Service accounts
  Generate new private key
  받은 JSON 파일 전체를 FIREBASE_SERVICE_ACCOUNT_JSON에 저장

7. 백엔드 실행 방법
npm install
npm run prisma:generate
npm run dev
npm run build
npm run start
npm run db:studio

8. 프론트엔드 실행 방법
npm install
npm run dev
npm run build
npm run preview

9. 안드로이드 앱 실행 방법
npm run build
npm run cap:sync
npm run android
npx cap open android

에뮬레이터 실행 또는 실기기 연결
Run

10. 안드로이드 앱 빌드 / 배포
AAB 생성

Android Studio에서:

Build
Generate Signed Bundle / APK
Android App Bundle 선택
keystore 선택
release 빌드 생성

생성된 .aab 파일을 Google Play Console에 업로드합니다.

11. 현재 모바일 동작 기준
앱 시작 시
알림 권한을 확인합니다.
허용되면 푸시 토큰을 발급받아 서버에 등록합니다.
채널 이름은 동아리 알림 입니다.
알림 클릭 시
알림 데이터의 targetPath를 기준으로 이동합니다.
로그인되지 않은 상태라면 로그인 페이지로 먼저 이동합니다.
로그인 완료 후 원래 알림의 목적 페이지로 이동합니다.
일반 로그인은 기존대로 /main 흐름을 유지합니다.
포그라운드 알림
앱이 열려 있는 상태에서 푸시가 왔을 때는 별도 처리 코드가 필요합니다.
현재 프로젝트에서는 포그라운드 수신 처리와 재초기화 방지를 위한 MobileRuntimeBridge.tsx 최신 수정본을 유지하는 것이 중요합니다.

12. CORS 관련 주의사항

Capacitor Android 앱은 https://localhost origin에서 동작합니다.

백엔드는 아래 origin들을 허용하도록 설정되어 있습니다.

http://localhost:5173
http://localhost
https://localhost
capacitor://localhost

Render에 최신 백엔드 코드가 반영되지 않으면, 앱 내부의 게시글 저장/수정 요청에서 CORS 문제가 발생할 수 있습니다.
이 경우 Render에서 최신 커밋 재배포가 필요합니다.
15. 현재 확인된 구현 범위

현재 코드 기준으로 확인된 푸시 트리거는 아래와 같습니다.

공지 등록 → /notice
대회 및 심사일정 등록 → /events
문의 등록 → /contact
예산 저장 → /moneypaid
엠티 장소 저장 → /MT
신규 가입 승인 완료 → /members

가입 대기 알림(/main)은 별도 검증 또는 추가 확인이 필요할 수 있습니다.

16. 문제 해결 체크포인트
푸시가 안 올 때
앱 알림 권한 허용 여부 확인
google-services.json 위치 확인
서버에 FCM 토큰이 저장됐는지 확인
FIREBASE_SERVICE_ACCOUNT_JSON 설정 여부 확인
공지/문의/예산 저장 시 실제 푸시 호출 코드가 연결돼 있는지 확인
앱이 포그라운드 상태인지 / 백그라운드 상태인지 구분해서 테스트
Render에 최신 백엔드가 실제 배포됐는지 확인
앱 내부 저장 요청이 실패할 때
VITE_API_BASE 확인
Render 최신 백엔드 배포 확인
CORS 허용 origin 확인