import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';
import clubRouter from './routes/club.js';
import passport from './auth/passport.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
const sessionSecret = process.env.SESSION_SECRET;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL 환경변수가 필요합니다.');
}

if (!sessionSecret) {
  throw new Error('SESSION_SECRET 환경변수가 필요합니다.');
}

const isProduction = process.env.NODE_ENV === 'production';
const PgSession = connectPgSimple(session);
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

app.set('trust proxy', 1);

app.use(
  cors({
    origin: clientUrl,
    credentials: true
  })
);

app.use(express.json({ limit: '35mb' }));
app.use(morgan('dev'));

app.use(
  session({
    store: new PgSession({
      pool: pgPool,
      tableName: 'user_sessions',
      createTableIfMissing: true
    }),
    name: 'coursechecker.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.get('/', (_req, res) => {
  res.json({
    message: 'Kendo Club Manager API',
    docs: {
      health: '/api/health',
      authMe: '/api/auth/me',
      authGoogle: '/api/auth/google',
      rosters: '/api/club/rosters',
      moneySnapshots: '/api/club/money-snapshots',
      legacyCompare: '/api/compare'
    }
  });
});

app.use('/api/auth', authRouter);
app.use('/api/club', clubRouter);
app.use('/api', apiRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err instanceof Error ? err.message : '서버 오류가 발생했습니다.';
  res.status(500).json({ message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API 서버 실행 중: port ${PORT}`);
});
