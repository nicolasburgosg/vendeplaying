import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const sections = [
  {
    title: "1. Responsable del tratamiento",
    paragraphs: [
      "Esta Politica de Privacidad regula el tratamiento de datos personales realizado por VendeTo LLC, entidad legal que opera VendeTo.",
      "Direccion comercial registrada: 301 West Ave, Unit 1307, Austin, TX 78701, Estados Unidos.",
      "Si tienes preguntas sobre privacidad o quieres ejercer tus derechos, puedes escribir a hi@vendeto.co.",
    ],
  },
  {
    title: "2. Alcance de esta politica",
    paragraphs: [
      "Esta politica aplica al sitio web publico de VendeTo, al panel para negocios, a los formularios de contacto o demo, y a los flujos operativos relacionados con la conexion de WhatsApp, catalogo, inbox, automatizaciones, pagos y analitica comercial.",
      "Tambien aplica al tratamiento de datos de clientes finales que los negocios usuarios gestionan a traves de la plataforma cuando esos datos son necesarios para operar conversaciones, pedidos, recordatorios, cobros por enlace y seguimiento comercial.",
    ],
  },
  {
    title: "3. Marco legal en Republica Dominicana",
    paragraphs: [
      "VendeTo trata datos personales conforme al articulo 44 de la Constitucion de la Republica Dominicana y a la Ley No. 172-13 sobre proteccion integral de los datos personales.",
      "Tomamos como referencia los principios de licitud, calidad, finalidad, seguridad, confidencialidad y acceso del titular. En consecuencia, procuramos que los datos sean adecuados, exactos, actualizados y usados solo para finalidades compatibles con el servicio.",
    ],
  },
  {
    title: "4. Datos que recopilamos",
    paragraphs: [
      "Podemos recopilar datos de identificacion y contacto del negocio usuario, incluyendo nombre, apellido, correo electronico, telefono, nombre comercial, pais, industria y credenciales de acceso al panel.",
      "Tambien podemos tratar datos operativos del negocio, como configuracion del canal de WhatsApp, perfiles de IA vendedora, catalogo, base de conocimiento, pedidos, pagos, plantillas, eventos de mensajeria, historial de estados y registros tecnicos del servicio.",
      "Cuando el negocio usa VendeTo para vender por WhatsApp, podemos tratar datos de clientes finales como nombre, numero de telefono, contenido de mensajes, productos consultados, estado comercial, pedidos y eventos asociados al cobro o al seguimiento.",
      "En el sitio web podemos recopilar datos enviados mediante formularios de contacto, demo o registro, asi como informacion tecnica basica del navegador, dispositivo, direccion IP aproximada, cookies y eventos de uso.",
    ],
  },
  {
    title: "5. Datos de pago",
    paragraphs: [
      "VendeTo no debe almacenar numeros completos de tarjeta, codigos de seguridad ni otros datos completos de instrumentos de pago cuando la transaccion sea procesada por una pasarela o proveedor externo.",
      "Los enlaces de pago y la confirmacion de estados comerciales dependen del proveedor configurado para cada negocio. La captura y el procesamiento del medio de pago del cliente final son responsabilidad de esa pasarela externa y quedan sujetos a su propia politica de privacidad y sus propios terminos.",
    ],
  },
  {
    title: "6. Finalidades del tratamiento",
    paragraphs: [
      "Usamos los datos para crear y administrar cuentas, autenticar usuarios, operar el panel, conectar canales de WhatsApp, cargar catalogos, responder consultas, asistir conversaciones con IA, permitir takeover humano, generar pedidos, enviar enlaces de pago, programar recordatorios y mostrar analitica operativa.",
      "Tambien tratamos datos para soporte, seguridad, prevencion de abuso, auditoria, trazabilidad, mejora del producto, cumplimiento legal y atencion de solicitudes de los titulares.",
      "Con consentimiento previo cuando corresponda, podemos usar datos de contacto para comunicaciones comerciales, demos, novedades del producto o contenidos promocionales.",
    ],
  },
  {
    title: "7. Base de legitimacion",
    paragraphs: [
      "Tratamos datos cuando es necesario para ejecutar la relacion contractual con el negocio usuario, cuando existe una obligacion legal aplicable, cuando el titular ha otorgado su consentimiento o cuando el tratamiento es necesario para fines operativos compatibles con el servicio y no prevalecen derechos fundamentales del titular.",
      "Cuando el tratamiento se base en consentimiento, este puede ser retirado hacia el futuro en la medida en que no exista otra base valida que justifique la conservacion o el uso del dato.",
      "Cuando el negocio usuario carga o sincroniza datos de sus clientes finales, VendeTo actua como proveedor tecnologico del servicio y el negocio sigue siendo responsable de contar con una base valida para usar esos datos frente a sus clientes.",
    ],
  },
  {
    title: "8. Cookies y tecnologias similares",
    paragraphs: [
      "Usamos cookies y tecnologias similares para permitir funciones tecnicas del sitio y del panel, mantener sesiones activas, recordar preferencias y medir uso basico del producto.",
      "Las cookies estrictamente necesarias pueden activarse por defecto para el funcionamiento del servicio. Las cookies no esenciales, de medicion o de marketing, cuando existan, deben usarse con la base legal o el consentimiento que corresponda.",
    ],
  },
  {
    title: "9. Comparticion de datos y transferencias",
    paragraphs: [
      "Podemos compartir datos con proveedores que actuan como encargados del tratamiento para prestar el servicio, por ejemplo proveedores de infraestructura, base de datos, autenticacion, mensajeria, inteligencia artificial, almacenamiento, correo transaccional, monitoreo o pasarelas de pago configuradas por el negocio.",
      "En la operacion actual de VendeTo esto puede incluir proveedores vinculados a Supabase, Kapso y OpenAI, asi como el proveedor de pago que el negocio tenga habilitado.",
      "Algunos de estos proveedores pueden procesar datos fuera de la Republica Dominicana. Cuando eso ocurra, procuraremos utilizar proveedores con medidas contractuales y tecnicas razonables para proteger la confidencialidad, integridad y seguridad de la informacion.",
      "Tambien podremos comunicar datos a autoridades administrativas o judiciales cuando una ley, una orden valida o una obligacion regulatoria asi lo exijan.",
    ],
  },
  {
    title: "10. Conservacion",
    paragraphs: [
      "Conservamos los datos personales durante el tiempo necesario para cumplir las finalidades de esta politica, prestar el servicio, atender obligaciones legales, resolver controversias, mantener trazabilidad operativa y defender reclamaciones.",
      "Cuando un dato deja de ser necesario, procuramos su eliminacion, anonimizacion o disociacion segun corresponda. Los datos anonimizados o agregados pueden conservarse por mas tiempo para fines estadisticos y de mejora del producto.",
    ],
  },
  {
    title: "11. Seguridad y confidencialidad",
    paragraphs: [
      "Aplicamos medidas tecnicas y organizativas razonables para reducir riesgos de acceso no autorizado, perdida, alteracion, divulgacion indebida o uso no permitido de los datos personales.",
      "Ningun sistema es absolutamente infalible, por lo que el usuario tambien debe proteger sus credenciales, usar contrasenas robustas y notificar cualquier incidente o acceso no autorizado.",
    ],
  },
  {
    title: "12. Derechos de los titulares",
    paragraphs: [
      "De conformidad con la Ley No. 172-13, el titular puede solicitar acceso a sus datos, rectificacion, actualizacion, cancelacion o supresion cuando corresponda, y oponerse al tratamiento en los casos permitidos por la ley.",
      "Para ejercer estos derechos, puedes escribir a hi@vendeto.co indicando tu nombre, medio de contacto, relacion con VendeTo y el derecho que deseas ejercer. Podremos solicitar informacion razonable para verificar identidad antes de responder.",
      "Si eres cliente final de un negocio que usa VendeTo, es posible que necesitemos coordinar tu solicitud con ese negocio cuando sea quien determine la finalidad principal del tratamiento comercial.",
      "En algunos casos podremos conservar cierta informacion cuando exista una obligacion legal, una necesidad de seguridad, prevencion de fraude, trazabilidad contractual o defensa frente a reclamaciones.",
      "Sin perjuicio de lo anterior, el titular podra ejercer las acciones y recursos que le reconozcan la Constitucion dominicana y la Ley No. 172-13, incluyendo la accion de habeas data cuando corresponda.",
    ],
  },
  {
    title: "13. Datos de menores de edad",
    paragraphs: [
      "VendeTo esta orientado a negocios y usuarios mayores de edad. No esta destinado a recopilar de forma deliberada datos personales de menores de edad sin la autorizacion que exija la ley aplicable.",
    ],
  },
  {
    title: "14. Actualizaciones de esta politica",
    paragraphs: [
      "Podemos modificar esta Politica de Privacidad para reflejar cambios legales, regulatorios, contractuales, tecnicos o de producto.",
      "La version vigente se publicara en el sitio y mostrara su fecha de ultima actualizacion. Cuando un cambio sea material, procuraremos informarlo por medios razonables dentro del producto o por correo electronico si aplica.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <section className="site-section">
        <div className="site-shell max-w-3xl">
          <p className="site-kicker">Privacidad</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Politica de Privacidad de VendeTo
          </h1>
          <p className="site-lead mt-5">
            Ultima actualizacion: 18 de marzo de 2026. Esta version toma como
            referencia la estructura de politicas SaaS como la de YAVENDIO, pero
            esta adaptada a VendeTo, a su operacion en Republica Dominicana y a
            la Ley No. 172-13 sobre proteccion de datos personales.
          </p>
        </div>
      </section>

      <section className="pb-16">
        <div className="site-shell max-w-3xl space-y-6">
          {sections.map((section) => (
            <div key={section.title} className="surface-card p-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
