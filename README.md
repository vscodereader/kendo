# 가천대 수강 비교기

React 프론트엔드 + TypeScript/Node.js/Express 백엔드 + Prisma/SQLite로 만든 웹앱입니다.

이 앱으로 할 수 있는 일:

1. 가천대학교 요람 페이지에서 최신 요람 링크 목록을 가져옵니다.
2. 전공/교양 교과과정 데이터를 CSV 또는 JSON으로 저장합니다.
3. 내가 들은 과목 목록을 CSV 또는 JSON으로 넣습니다.
4. 무엇을 들었고, 무엇을 아직 안 들었는지 비교합니다.

---

## 0. 왜 이 구조로 만들었나

- **프론트는 React + Vite**: 빠르게 실행되고 개발이 쉽습니다.
- **백엔드는 Node.js + Express + TypeScript**: 프론트와 같은 언어(JavaScript/TypeScript)를 써서 초보자에게 가장 덜 헷갈립니다.
- **DB는 SQLite + Prisma**: MySQL/PostgreSQL처럼 별도 DB 서버 설치가 필요 없습니다. 파일 하나로 저장됩니다.

즉, **설치해야 할 핵심 프로그램은 Node.js 하나**라고 생각하면 됩니다.

---

## 1. 설치해야 하는 프로그램

### 필수

1. **Node.js LTS 버전 설치**
   - 공식 다운로드 페이지에서 LTS 버전을 설치하세요.
   - 설치할 때 특별히 바꿀 옵션이 없으면 기본값 그대로 다음 다음 눌러도 됩니다.

### 권장

2. **VS Code 설치**
   - 코드를 수정하기 가장 편합니다.

3. **Git 설치**
   - 꼭 필요하진 않지만, 나중에 GitHub에 올릴 때 좋습니다.

---

## 2. 프로젝트 폴더 구조

```text
gachon-course-checker/
├─ package.json
├─ README.md
├─ examples/
│  ├─ completed-courses.csv
│  └─ required-courses.csv
├─ backend/
│  ├─ package.json
│  ├─ .env.example
│  ├─ prisma/
│  │  └─ schema.prisma
│  └─ src/
│     ├─ lib/
│     │  └─ prisma.ts
│     ├─ routes/
│     │  └─ api.ts
│     ├─ services/
│     │  └─ gachonScraper.ts
│     ├─ utils/
│     │  ├─ compareCourses.ts
│     │  └─ normalize.ts
│     └─ server.ts
└─ frontend/
   ├─ package.json
   ├─ vite.config.ts
   ├─ index.html
   └─ src/
      ├─ App.tsx
      ├─ main.tsx
      └─ styles.css
```

---

## 3. 아주 정확한 실행 순서

아래 순서대로만 하면 됩니다.

### 3-1. 프로젝트 압축 풀기

압축을 풀어서 `gachon-course-checker` 폴더를 만드세요.

### 3-2. 터미널 열기

Windows 기준:

- `gachon-course-checker` 폴더 안에서
- 빈 공간에 **Shift + 우클릭**
- **PowerShell 창 열기** 또는 **터미널 열기**

### 3-3. 의존성 설치

아래 명령어를 그대로 입력하세요.

```bash
npm install
```

### 3-4. 백엔드 환경파일 확인

이 프로젝트에는 기본 실행용 `backend/.env` 파일이 이미 들어 있습니다.

내용은 아래와 같습니다.

```env
PORT=4000
CLIENT_URL=http://localhost:5173
DATABASE_URL="file:./dev.db"
```

이 파일은 그대로 둬도 됩니다.

### 3-5. 데이터베이스 생성

아래 명령어를 입력하세요.

```bash
npm run db:push
```

이 명령어를 실행하면 SQLite DB 파일이 자동으로 만들어집니다.

### 3-6. 개발 서버 실행

아래 명령어를 입력하세요.

```bash
npm run dev
```

실행이 되면 보통 아래 두 주소가 켜집니다.

- 프론트엔드: `http://localhost:5173`
- 백엔드 API: `http://localhost:4000`

브라우저에서 `http://localhost:5173`를 열면 됩니다.

---

## 4. 프로그램 사용 방법

### A. 가천대 요람 링크 가져오기

화면에서 **요람 링크 가져오기** 버튼을 누르세요.

그러면 백엔드가 가천대 요람 페이지를 읽어서 최신 링크 목록을 저장합니다.

### B. 교과과정 저장

필수 과목 목록을 CSV 또는 JSON으로 넣고 **교과과정 저장**을 누릅니다.

예시 CSV:

```csv
courseCode,name,credit,classification,isRequired,semesterText
CSE101,컴퓨터개론,3,전공필수,true,1-1
CSE102,C프로그래밍,3,전공필수,true,1-1
CSE201,자료구조,3,전공필수,true,2-1
CSE202,운영체제,3,전공필수,true,2-2
```

### C. 내가 들은 과목 입력

예시 CSV:

```csv
courseCode,name,credit
CSE101,컴퓨터개론,3
CSE201,자료구조,3
MATH101,대학수학,3
```

### D. 비교 실행

비교 실행 버튼을 누르면 결과가 3개로 나옵니다.

- 들은 과목
- 안 들은 과목
- 초과로 들은 과목

---

## 5. JSON 형식 예시

### 교과과정 JSON

```json
[
  {
    "courseCode": "CSE101",
    "name": "컴퓨터개론",
    "credit": 3,
    "classification": "전공필수",
    "isRequired": true,
    "semesterText": "1-1"
  },
  {
    "courseCode": "CSE201",
    "name": "자료구조",
    "credit": 3,
    "classification": "전공필수",
    "isRequired": true,
    "semesterText": "2-1"
  }
]
```

### 완료과목 JSON

```json
[
  {
    "courseCode": "CSE101",
    "name": "컴퓨터개론",
    "credit": 3
  },
  {
    "courseCode": "CSE201",
    "name": "자료구조",
    "credit": 3
  }
]
```

---

## 6. 현재 구현된 비교 기준

우선순위는 아래와 같습니다.

1. **과목코드가 같으면 같은 과목으로 판단**
2. 과목코드가 없으면 **과목명을 정규화해서 비교**
   - 공백 제거
   - 대소문자 차이 무시
   - 일부 특수문자 제거

그래서 가능하면 **과목코드를 꼭 넣는 것**이 가장 정확합니다.

---

## 7. 가천대 사이트 연동 방식

이 프로젝트는 기본적으로 다음 흐름으로 동작합니다.

1. `https://www.gachon.ac.kr/kor/1097/subview.do` 에서 최신 요람 링크 목록을 가져옴
2. 어떤 연도의 총람/전공교육과정인지 저장함
3. 실제 과목 목록은 CSV/JSON으로 저장해서 비교함

### 왜 과목표 자체를 자동으로 전부 긁어오지 않았나?

가천대 요람 페이지는 최근 연도 자료를 보여주지만, 실제 세부 자료는 `ibook.gachon.ac.kr` 뷰어 링크로 연결됩니다.
이 뷰어 구조는 바뀔 수 있고, 자동 수집이 항상 안정적으로 되지 않을 수 있습니다.

그래서 **1차 버전은 “학교 사이트에서 최신 링크를 자동 수집” + “실제 비교용 과목표는 CSV/JSON 저장”** 구조로 만들었습니다.

이 방식이 오히려 운영할 때 더 안전합니다.

---

## 8. 가천대 자료를 더 자동화하고 싶을 때

다음 단계로 확장할 수 있습니다.

1. PDF/전자책 텍스트 추출기 추가
2. 학과/학번별 표 구조 파서 추가
3. 교양/전공/전공필수 구분 자동 매핑
4. 사용자 로그인 기능 추가
5. 학생별 저장 기능 추가

---

## 9. 백엔드 API 요약

### `GET /api/health`
서버가 살아있는지 확인

### `POST /api/sources/gachon/refresh`
가천대 요람 링크를 가져와 DB에 저장

### `GET /api/catalogs`
저장된 교과과정 목록 조회

### `POST /api/catalogs/import`
CSV/JSON에서 교과과정 저장

### `POST /api/compare`
교과과정과 완료 과목 비교

---

## 10. 배포 전에 꼭 바꾸면 좋은 것

처음 로컬에서 다 돌아간 뒤에는 아래를 추가하면 좋습니다.

1. 로그인 기능
2. 관리자/학생 권한 분리
3. 업로드 파일 검증 강화
4. 중복 과목 처리 규칙 세분화
5. 배포 환경 변수 분리

---

## 11. 가장 많이 생기는 문제

### 문제 1. `npm install`이 안 됨
Node.js가 설치되지 않았거나, 설치 후 터미널을 다시 열지 않은 경우가 많습니다.

### 문제 2. `npm run db:push`가 안 됨
`backend/.env` 파일이 없을 가능성이 큽니다.

### 문제 3. 5173 페이지는 열리는데 데이터가 안 보임
백엔드가 안 켜졌을 가능성이 큽니다.

### 문제 4. 비교가 이상함
과목명이 학교 데이터와 내가 입력한 데이터에서 다르거나, 과목코드가 빠졌을 가능성이 큽니다.

---

## 12. 추천 작업 순서

처음에는 아래 순서로 하세요.

1. 예시 CSV로 앱이 돌아가는지 먼저 확인
2. 내가 원하는 학과의 실제 교과과정 CSV를 하나 만들어 넣기
3. 내가 들은 과목 CSV 넣어 비교하기
4. 그다음에 자동 파싱 기능을 추가하기

---

## 13. 다음에 바로 붙일 수 있는 기능

- 로그인 기능 추가
- 학생별 저장 기능 추가
- 학번별 졸업 요건 분기
- 교양/전필/전선/자선 분류 통계
- 학점 합계 계산
- PDF 업로드 후 자동 변환

