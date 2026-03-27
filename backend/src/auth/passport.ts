import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../lib/prisma.js';
import { ROOT_ADMIN_EMAIL } from '../lib/club.js';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL;

if (!googleClientId || !googleClientSecret || !googleCallbackUrl) {
  throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL 환경변수가 필요합니다.');
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      done(null, false);
      return;
    }
    done(null, { id: user.id });
  } catch (error) {
    done(error);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: googleClientId,
      clientSecret: googleClientSecret,
      callbackURL: googleCallbackUrl
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.trim().toLowerCase();
        if (!email) {
          done(new Error('구글 계정에서 이메일을 가져오지 못했습니다.'));
          return;
        }

        const googleId = profile.id;
        const googleName = profile.displayName?.trim() || null;
        const googleImage = profile.photos?.[0]?.value?.trim() || null;
        const isRoot = email === ROOT_ADMIN_EMAIL;
        const systemRole = isRoot ? 'ROOT' : 'USER';

        const banned = await prisma.bannedAccount.findFirst({
          where: {
            OR: [{ email }, { googleId }]
          }
        });

        if (banned) {
          done(null, false, { message: 'banned' });
          return;
        }

        const existingByGoogleId = await prisma.user.findUnique({
          where: { googleId }
        });

        if (existingByGoogleId) {
          const updated = await prisma.user.update({
            where: { id: existingByGoogleId.id },
            data: {
              email,
              googleName,
              googleImage,
              systemRole,
              displayName: isRoot ? 'Admin' : existingByGoogleId.displayName
            }
          });

          done(null, { id: updated.id });
          return;
        }

        const existingByEmail = await prisma.user.findUnique({
          where: { email }
        });

        if (existingByEmail) {
          const updated = await prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              googleId,
              googleName,
              googleImage,
              systemRole,
              displayName: isRoot ? 'Admin' : existingByEmail.displayName
            }
          });

          done(null, { id: updated.id });
          return;
        }

        const created = await prisma.user.create({
          data: {
            googleId,
            email,
            googleName,
            googleImage,
            displayName: isRoot ? 'Admin' : null,
            systemRole
          }
        });

        done(null, { id: created.id });
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

export default passport;
