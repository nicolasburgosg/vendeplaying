import { AiService, type SellerProfile } from './ai.service';

function buildSellerProfile(
  overrides: Partial<SellerProfile> = {},
): SellerProfile {
  return {
    sellerName: 'Lucia',
    tone: 'cercano',
    salesStyle: 'consultivo',
    messageLength: 'short',
    welcomeMessage: null,
    humanHandoffMessage: null,
    companyDescription: 'Cafe premium',
    targetAudience: 'amantes del cafe',
    specialInstructions: null,
    forbiddenWords: [],
    useEmojis: true,
    ...overrides,
  };
}

describe('AiService', () => {
  const service = new AiService();

  it('activa el fast path para hola', () => {
    const plan = service.tryBuildGreetingFastReply({
      seller: buildSellerProfile(),
      latestInboundMessage: {
        body: 'hola',
        messageType: 'text',
      },
    });

    expect(plan?.route).toBe('greeting_fast_path');
    expect(plan?.reply).toContain('Lucia');
  });

  it('desactiva el fast path cuando el saludo ya trae intención', () => {
    const plan = service.tryBuildGreetingFastReply({
      seller: buildSellerProfile(),
      latestInboundMessage: {
        body: 'hola precio',
        messageType: 'text',
      },
    });

    expect(plan).toBeNull();
  });

  it('activa el fast path con mano saludando sola', () => {
    const plan = service.tryBuildGreetingFastReply({
      seller: buildSellerProfile(),
      latestInboundMessage: {
        body: '👋',
        messageType: 'interactive',
      },
    });

    expect(plan?.route).toBe('greeting_fast_path');
  });

  it('desactiva el fast path si la respuesta viola forbidden words', () => {
    const plan = service.tryBuildGreetingFastReply({
      seller: buildSellerProfile({
        welcomeMessage: 'Hola oferta especial',
        forbiddenWords: ['oferta'],
      }),
      latestInboundMessage: {
        body: 'hola',
        messageType: 'text',
      },
    });

    expect(plan).toBeNull();
  });

  it('omite catalog context cuando no hay tokens útiles', () => {
    expect(
      service.shouldLoadCatalogContext({
        body: '??',
        messageType: 'text',
      }),
    ).toBe(false);
  });

  it('carga catalog context cuando sí hay intención comercial', () => {
    expect(
      service.shouldLoadCatalogContext({
        body: 'precio cafe santo domingo',
        messageType: 'text',
      }),
    ).toBe(true);
  });
});
