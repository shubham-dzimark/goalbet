import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type AdminRole } from '@goalbet/shared';
import { ENV, type Env } from '../../config/env.js';

export interface UserTokenPayload {
  sub: string;
  typ: 'user';
}

export interface AdminTokenPayload {
  sub: string;
  typ: 'admin';
  role: AdminRole;
  sid: string;
  email: string;
}

export interface SetupTokenPayload {
  sub: string;
  typ: 'totp-setup';
  secret: string;
}

/** Short-lived access tokens (15 min). Players and admins use different secrets and audiences. */
@Injectable()
export class TokensService {
  private readonly jwt = new JwtService();

  constructor(@Inject(ENV) private readonly env: Env) {}

  signUser(userId: string) {
    const payload: UserTokenPayload = { sub: userId, typ: 'user' };
    return this.jwt.sign(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.ACCESS_TOKEN_TTL_SEC,
      audience: 'goalbet-web',
    });
  }

  verifyUser(token: string): UserTokenPayload {
    const p = this.jwt.verify<UserTokenPayload>(token, { secret: this.env.JWT_ACCESS_SECRET, audience: 'goalbet-web' });
    if (p.typ !== 'user') throw new Error('wrong token type');
    return p;
  }

  signAdmin(payload: Omit<AdminTokenPayload, 'typ'>) {
    return this.jwt.sign(
      { ...payload, typ: 'admin' },
      { secret: this.env.JWT_ADMIN_SECRET, expiresIn: this.env.ACCESS_TOKEN_TTL_SEC, audience: 'goalbet-admin' },
    );
  }

  verifyAdmin(token: string): AdminTokenPayload {
    const p = this.jwt.verify<AdminTokenPayload>(token, { secret: this.env.JWT_ADMIN_SECRET, audience: 'goalbet-admin' });
    if (p.typ !== 'admin') throw new Error('wrong token type');
    return p;
  }

  /** 5-minute token carrying a freshly generated TOTP secret during first-login enrolment. */
  signTotpSetup(adminId: string, secret: string) {
    const payload: SetupTokenPayload = { sub: adminId, typ: 'totp-setup', secret };
    return this.jwt.sign(payload, { secret: this.env.JWT_ADMIN_SECRET, expiresIn: 300, audience: 'goalbet-admin-setup' });
  }

  verifyTotpSetup(token: string): SetupTokenPayload {
    return this.jwt.verify<SetupTokenPayload>(token, {
      secret: this.env.JWT_ADMIN_SECRET,
      audience: 'goalbet-admin-setup',
    });
  }
}
