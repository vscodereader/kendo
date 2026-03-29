import jwt from 'jsonwebtoken';

const MOBILE_AUTH_SECRET = process.env.MOBILE_AUTH_SECRET || process.env.SESSION_SECRET;

if (!MOBILE_AUTH_SECRET) {
  throw new Error('MOBILE_AUTH_SECRET 또는 SESSION_SECRET 환경변수가 필요합니다.');
}

const MOBILE_AUTH_SECRET_KEY: string = MOBILE_AUTH_SECRET;

type MobileAccessPayload = {
  sub: string;
  type: 'mobile-access';
};

type MobileLoginCodePayload = {
  sub: string;
  type: 'mobile-login-code';
  nextPath: '/main' | '/profile-setup';
};

type MobileOAuthStatePayload = {
  type: 'mobile-oauth-state';
  redirectUri: string;
};

export function signMobileToken(userId: string) {
  const payload: MobileAccessPayload = {
    sub: userId,
    type: 'mobile-access'
  };

  return jwt.sign(payload, MOBILE_AUTH_SECRET_KEY, {
    algorithm: 'HS256',
    expiresIn: '30d'
  });
}

export function verifyMobileToken(token: string) {
  return jwt.verify(token, MOBILE_AUTH_SECRET_KEY, {
    algorithms: ['HS256']
  }) as unknown as MobileAccessPayload;
}

export function signMobileLoginCode(userId: string, nextPath: '/main' | '/profile-setup') {
  const payload: MobileLoginCodePayload = {
    sub: userId,
    type: 'mobile-login-code',
    nextPath
  };

  return jwt.sign(payload, MOBILE_AUTH_SECRET_KEY, {
    algorithm: 'HS256',
    expiresIn: '5m'
  });
}

export function verifyMobileLoginCode(code: string) {
  return jwt.verify(code, MOBILE_AUTH_SECRET_KEY, {
    algorithms: ['HS256']
  }) as unknown as MobileLoginCodePayload;
}

export function signMobileOAuthState(redirectUri: string) {
  const payload: MobileOAuthStatePayload = {
    type: 'mobile-oauth-state',
    redirectUri
  };

  return jwt.sign(payload, MOBILE_AUTH_SECRET_KEY, {
    algorithm: 'HS256',
    expiresIn: '10m'
  });
}

export function verifyMobileOAuthState(state: string) {
  return jwt.verify(state, MOBILE_AUTH_SECRET_KEY, {
    algorithms: ['HS256']
  }) as unknown as MobileOAuthStatePayload;
}