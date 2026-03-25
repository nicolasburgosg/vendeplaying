import { SellerProfileForm } from "@/components/ai-forms";
import { AiPreviewPanel } from "@/components/ai-preview-panel";
import { AppPageIntro } from "@/components/app-page-intro";
import { AiPageTabs } from "@/components/ai-page-tabs";
import { SellerToggle } from "@/components/seller-toggle";
import { getAiSellerPageData } from "@/lib/merchant";

export default async function IaVendedoraPage() {
  const { context } = await getAiSellerPageData();
  const seller = context.sellerProfile;

  return (
    <>
      <AppPageIntro
        eyebrow="IA vendedora"
        title={seller?.seller_name ?? "Configura tu agente"}
        description="Personalidad, mensajes y comportamiento de tu vendedor IA."
        aside={
          seller ? <SellerToggle isActive={seller.is_active} /> : null
        }
      />

      <AiPageTabs
        personalidad={
          <section className="app-section">
            <div className="app-card">
              <SellerProfileForm seller={seller} />
            </div>
          </section>
        }
        probar={
          <section className="app-section">
            <div className="app-card">
              <AiPreviewPanel />
            </div>
          </section>
        }
      />
    </>
  );
}
