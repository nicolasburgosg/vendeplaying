import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';

type ReadinessBlock = {
  state: 'unconfigured' | 'partial' | 'ready';
  blockers: string[];
};

@Injectable()
export class ReadinessService {
  constructor(private readonly database: DatabaseService) {}

  getPlatformReadiness() {
    const aiBlockers: string[] = [];
    const kapsoBlockers: string[] = [];

    if (!process.env.OPENAI_API_KEY) {
      aiBlockers.push('La IA no está configurada en este entorno.');
    }

    if (!process.env.VENDETO_KAPSO_API_KEY) {
      kapsoBlockers.push('Falta la llave de proyecto de Kapso.');
    }

    return {
      ai: this.toBlock(aiBlockers),
      whatsapp: this.toBlock(kapsoBlockers),
      database: {
        state: 'ready',
      },
    };
  }

  async getOrganizationReadiness(organizationId: string) {
    const [sellerResult, channelResult, paymentsResult] = await Promise.all([
      this.database.query<{
        is_active: boolean;
      }>(
        `
          select is_active
          from public.ai_seller_profiles
          where organization_id = $1
          limit 1
        `,
        [organizationId],
      ),
      this.database.query<{
        status: string;
        provider_phone_number_id: string | null;
      }>(
        `
          select status, provider_phone_number_id
          from public.whatsapp_channels
          where organization_id = $1
          order by created_at asc
          limit 1
        `,
        [organizationId],
      ),
      this.database.query<{
        is_enabled: boolean;
        provider_code: string;
        vault_secret_ref: string | null;
      }>(
        `
          select is_enabled, provider_code, vault_secret_ref
          from public.organization_payment_configs
          where organization_id = $1
        `,
        [organizationId],
      ),
    ]);

    const aiBlockers: string[] = [];
    const whatsappBlockers: string[] = [];
    const paymentBlockers: string[] = [];

    if (!process.env.OPENAI_API_KEY) {
      aiBlockers.push('La IA no está configurada en este entorno.');
    }

    if (sellerResult.rows.length === 0) {
      aiBlockers.push('No hay perfil de IA.');
    } else if (!sellerResult.rows[0].is_active) {
      aiBlockers.push('El perfil de IA está pausado.');
    }

    if (channelResult.rows.length === 0) {
      whatsappBlockers.push('No hay canal creado.');
    } else {
      const channel = channelResult.rows[0];

      if (channel.status !== 'connected') {
        whatsappBlockers.push('El canal no está conectado.');
      }

      if (!channel.provider_phone_number_id) {
        whatsappBlockers.push(
          'Falta el identificador operativo del número en Kapso.',
        );
      }
    }

    if (this.getPlatformReadiness().whatsapp.state !== 'ready') {
      whatsappBlockers.push(
        'El entorno todavía no tiene la credencial activa de Kapso.',
      );
    }

    const activeConfigs = paymentsResult.rows.filter((row) => row.is_enabled);

    if (activeConfigs.length === 0) {
      paymentBlockers.push('No hay métodos de pago activos.');
    }

    activeConfigs.forEach((config) => {
      if (
        !['manual', 'cash_on_delivery', 'bank_transfer'].includes(
          config.provider_code,
        ) &&
        !config.vault_secret_ref
      ) {
        paymentBlockers.push(
          `La configuración ${config.provider_code} no tiene secretos cargados.`,
        );
      }
    });

    return {
      ai: this.toBlock(aiBlockers),
      whatsapp: this.toBlock(whatsappBlockers),
      payments: this.toBlock(paymentBlockers),
    };
  }

  private toBlock(blockers: string[]): ReadinessBlock {
    if (blockers.length === 0) {
      return {
        state: 'ready',
        blockers,
      };
    }

    return {
      state: blockers.length > 1 ? 'partial' : 'unconfigured',
      blockers,
    };
  }
}
