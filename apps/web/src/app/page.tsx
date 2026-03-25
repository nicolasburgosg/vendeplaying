import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroSection } from "@/components/hero-section";
import { MetricsStrip } from "@/components/metrics-strip";
import { HowItWorks } from "@/components/how-it-works";
import { VisualBreak } from "@/components/visual-break";
import { FeaturesEmbed } from "@/components/features-embed";
import { CtaBand } from "@/components/cta-band";

export default function HomePage() {
  return (
    <main className="dot-grid-bg min-h-screen bg-background text-foreground">
      <SiteHeader />

      <HeroSection />

      <MetricsStrip />

      <HowItWorks />

      <VisualBreak />

      <FeaturesEmbed />

      <CtaBand />

      <SiteFooter />
    </main>
  );
}
