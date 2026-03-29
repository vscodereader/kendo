import jwt, { type Secret } from 'jsonwebtoken';

const mobileAuthSecretValue = process.env.MOBILE_AUTH_SECRET || process.env.SESSION_SECRET;

if (!mobileAuthSecretValue) {
  throw new Error('MOBILE_AUTH_SECRET 또는 SESSION_SECRET 환경변수가 필요합니다.');
}

const MOBILE_AUTH_SECRET: Secret = mobileAuthSecretValue;

type MobileAccessPayload = {
  sub: string;
  type: 'mobile-access';
};

type MobileLoginCodePayload = {
  sub: string;
  type: 'mobile-login-code';
  nextPath: '/main' | '/profile-setup';
};

export function signMobileToken(userId: string) {
  const payload: MobileAccessPayload = {
    sub: userId,
    type: 'mobile-access'
  };

  return jwt.sign(payload, MOBILE_AUTH_SECRET, {
    algorithm: 'HS256',
    expiresIn: '30d'
  });
}

export function verifyMobileToken(token: string): MobileAccessPayload {
  return jwt.verify(token, MOBILE_AUTH_SECRET, {
    algorithms: ['HS256']
  }) as unknown as MobileAccessPayload;
}

export function signMobileLoginCode(userId: string, nextPath: '/main' | '/profile-setup') {
  const payload: MobileLoginCodePayload = {
    sub: userId,
    type: 'mobile-login-code',
    nextPath
  };

  return jwt.sign(payload, MOBILE_AUTH_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m'
  });
}

export function verifyMobileLoginCode(code: string): MobileLoginCodePayload {
  return jwt.verify(code, MOBILE_AUTH_SECRET, {
    algorithms: ['HS256']
  }) as unknown as MobileLoginCodePayload;
}