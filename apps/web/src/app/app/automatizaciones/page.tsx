import { AppPageIntro } from "@/components/app-page-intro";
import { toggleFollowUpRuleAction } from "@/app/app/actions";
import { FollowUpRuleForm } from "@/components/commerce-forms";
import { ReadinessPanel } from "@/components/readiness-panel";
import {
  labelFollowUpSendMode,
  labelFollowUpTarget,
  labelFollowUpTrigger,
  labelTemplateCategory,
  labelTemplateQuality,
  labelTemplateStatus,
} from "@/lib/labels";
import { getAutomationsPageData } from "@/lib/merchant";

export default async function AutomatizacionesPage() {
  const { followUpRules, templates, readiness } = await getAutomationsPageData();
  const templateRows = templates ?? [];

  return (
    <>
      <AppPageIntro
        eyebrow="Automatizaciones"
        title="Recordatorios y reglas operativas"
        description="Reglas de follow-up, modo de envio y templates disponibles para mantener el pipeline activo sin romper compliance."
      />

      <section className="site-section">
        <p className="site-kicker">Nueva regla</p>
        <FollowUpRuleForm
          templates={templateRows.map((template) => ({
            id: template.id,
            name: template.name,
          }))}
        />
      </section>

      <section className="site-section">
        <p className="site-kicker">Dependencias de envío</p>
        <ReadinessPanel readiness={readiness} compact />
      </section>

      <section className="site-section">
        <p className="site-kicker">Reglas de seguimiento</p>
        {followUpRules.length > 0 ? (
          <table className="site-table mt-6">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Disparador</th>
                <th>Objetivo</th>
                <th>Envio</th>
                <th>Delay</th>
                <th>Estado</th>
                <th>Gestionar</th>
              </tr>
            </thead>
            <tbody>
              {followUpRules.map((rule) => (
                <tr key={rule.id}>
                  <td className="font-semibold text-foreground">{rule.name}</td>
                  <td className="text-sm text-muted">
                    {labelFollowUpTrigger(rule.trigger_type)}
                  </td>
                  <td className="text-sm text-muted">
                    {labelFollowUpTarget(rule.target_type)}
                  </td>
                  <td className="text-sm text-muted">
                    {labelFollowUpSendMode(rule.send_mode)}
                    {rule.template ? ` · ${rule.template.name}` : ""}
                  </td>
                  <td className="text-sm text-muted">{rule.delay_minutes} min</td>
                  <td className="text-sm text-muted">
                    {rule.is_active ? "Activa" : "Pausada"}
                  </td>
                  <td>
                    <form action={toggleFollowUpRuleAction} className="flex items-center gap-3 text-sm">
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="isActive"
                          defaultChecked={rule.is_active}
                        />
                        Activa
                      </label>
                      <button type="submit" className="site-button-secondary">
                        Guardar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="site-note mt-6">
            Aún no hay reglas de seguimiento para este negocio.
          </p>
        )}
      </section>

      <section className="site-section">
        <p className="site-kicker">Plantillas de WhatsApp</p>
        {templateRows.length > 0 ? (
          <table className="site-table mt-6">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Categoria</th>
                <th>Estado</th>
                <th>Idioma</th>
                <th>Calidad</th>
              </tr>
            </thead>
            <tbody>
              {templateRows.map((template) => (
                <tr key={template.id}>
                  <td className="font-semibold text-foreground">{template.name}</td>
                  <td className="text-sm text-muted">
                    {labelTemplateCategory(template.category_code)}
                  </td>
                  <td className="text-sm text-muted">
                    {labelTemplateStatus(template.status_code)}
                  </td>
                  <td className="text-sm text-muted">{template.language_code}</td>
                  <td className="text-sm text-muted">
                    {labelTemplateQuality(template.quality_rating_code)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="site-note mt-6">
            Aún no hay plantillas disponibles para automatizaciones.
          </p>
        )}
      </section>
    </>
  );
}
