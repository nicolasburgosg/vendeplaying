import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

function secureCompare(expected: string, candidate: string) {
  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);

  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, candidateBuffer);
}

export function assertInternalApiAccess(token?: string) {
  const isLocalDev =
    process.env.NODE_ENV !== 'production' &&
    process.env.VENDETO_ENABLE_DEV_ROUTES === 'true';

  if (isLocalDev) {
    return;
  }

  const expectedToken = process.env.VENDETO_INTERNAL_API_TOKEN?.trim();
  const normalizedToken = token?.trim();

  if (!expectedToken) {
    throw new NotFoundException();
  }

  if (!normalizedToken || !secureCompare(expectedToken, normalizedToken)) {
    throw new UnauthorizedException('Acceso interno no autorizado.');
  }
}

export function assertDevRoutesEnabled() {
  const enabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.VENDETO_ENABLE_DEV_ROUTES === 'true';

  if (!enabled) {
    throw new NotFoundException();
  }
}
