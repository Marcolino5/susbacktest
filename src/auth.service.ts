
import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';

@Injectable()
export class AuthService {
  private getKey(): Uint8Array {
    const secret = process.env.SESSION_SECRET;

    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new InternalServerErrorException(
        'SESSION_SECRET não configurada corretamente',
      );
    }

    return new TextEncoder().encode(secret);
  }

  private safeEqual(a: string, b: string): boolean {
    const hashA = createHash('sha256').update(a).digest();
    const hashB = createHash('sha256').update(b).digest();

    return timingSafeEqual(hashA, hashB);
  }

  validateCredentials(email: string, senha: string): boolean {
    const user = process.env.ADMIN_USER;
    const password = process.env.ADMIN_PASSWORD;

    if (!user || !password) {
      throw new InternalServerErrorException(
        'Credenciais do administrador não configuradas',
      );
    }

    return (
      this.safeEqual(email, user) &&
      this.safeEqual(senha, password)
    );
  }

  async createToken(): Promise<string> {
    return new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(this.getKey());
  }

  async verifyToken(token: string): Promise<boolean> {
    try {
      const { payload } = await jwtVerify(
        token,
        this.getKey(),
        { algorithms: ['HS256'] },
      );

      return payload.role === 'admin';
    } catch {
      return false;
    }
  }
}
