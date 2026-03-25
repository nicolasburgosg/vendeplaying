import { Controller, Get, Headers, Param } from '@nestjs/common';
import { assertInternalApiAccess } from './internal-auth';
import { ReadinessService } from './readiness.service';

@Controller('readiness')
export class ReadinessController {
  constructor(private readonly readinessService: ReadinessService) {}

  @Get()
  getPlatformReadiness(
    @Headers('x-vendeto-internal-token') internalToken: string | undefined,
  ) {
    assertInternalApiAccess(internalToken);
    return this.readinessService.getPlatformReadiness();
  }

  @Get('organizations/:organizationId')
  getOrganizationReadiness(
    @Param('organizationId') organizationId: string,
    @Headers('x-vendeto-internal-token') internalToken: string | undefined,
  ) {
    assertInternalApiAccess(internalToken);
    return this.readinessService.getOrganizationReadiness(organizationId);
  }
}
