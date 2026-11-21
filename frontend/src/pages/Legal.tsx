import { PageTitle } from '../components/ui'

/** Privacidad y términos (idea de PACHAAGRO, adaptado a los datos reales que usa AgroBolivia). */
const DOCS = {
  privacidad: {
    icon: '', title: 'Política de privacidad',
    sections: [
      ['Qué datos pedimos', 'Para crear una cuenta: nombre, número de celular y una clave. De forma opcional: su municipio y sus cultivos de interés. Registramos la fecha en que acepta recibir mensajes por WhatsApp. Para consultar el clima o la siembra no hace falta cuenta.'],
      ['Para qué los usamos', 'Para su cuenta, para mostrarle los avisos de su zona y de sus cultivos, y para los recordatorios de su comunidad. No vendemos ni compartimos sus datos con fines publicitarios.'],
      ['Quién ve su número', 'Los representantes de su comunidad solo ven los últimos 4 dígitos. Los demás miembros no ven su número.'],
      ['WhatsApp', 'Solo enviamos recordatorios y avisos a quien los aceptó. Puede darse de baja escribiendo BAJA o desde Mi cuenta. Usaremos solo la plataforma oficial de WhatsApp Business; hoy el asistente es un simulador y no envía mensajes reales.'],
      ['Seguridad', 'Las claves se guardan cifradas (nunca en texto). Las credenciales del servidor están fuera del código. Los permisos se revisan en el servidor.'],
      ['Sus derechos', 'Puede pedir ver, corregir o borrar sus datos al administrador de la plataforma. El responsable del tratamiento y su contacto deben definirse antes de usar esta plataforma con personas reales; no publicamos datos de contacto ficticios.'],
    ],
  },
  terminos: {
    icon: '', title: 'Términos de uso',
    sections: [
      ['Qué es AgroBolivia', 'Un prototipo académico que ofrece orientación sobre clima y siembra, y herramientas para que las comunidades se organicen.'],
      ['Orientación, no garantía', 'Las orientaciones de siembra usan reglas experimentales, pendientes de validación agronómica. En la sección Asesoría puede contactar a técnicos. Usted decide qué hacer en su parcela.'],
      ['Avisos no oficiales', 'Los avisos de la plataforma y los reportes de la comunidad no son avisos oficiales. Los avisos oficiales de clima los publica el SENAMHI.'],
      ['Datos de demostración', 'Lo marcado como DEMO, SIMULADO o «Caso simulado» es ficticio y solo sirve para mostrar cómo funciona la plataforma.'],
      ['Uso responsable', 'No publique información falsa ni se haga pasar por otra persona. Los representantes y administradores pueden retirar publicaciones y desactivar cuentas que incumplan estas reglas.'],
    ],
  },
} as const

export default function Legal({ doc }: { doc: keyof typeof DOCS }) {
  const d = DOCS[doc]
  return (
    <article className="space-y-4">
      <PageTitle icon={d.icon} title={d.title} subtitle="Última actualización: noviembre de 2026." />
      {d.sections.map(([h, t]) => (
        <section key={h}><h2 className="text-xl font-bold text-bosque">{h}</h2><p className="mt-1 text-lg">{t}</p></section>
      ))}
      <p className="text-musgo">Vea también: <a className="font-semibold text-bosque underline" href={doc === 'privacidad' ? '#/terminos' : '#/privacidad'}>{doc === 'privacidad' ? 'Términos de uso' : 'Política de privacidad'}</a>.</p>
    </article>
  )
}
