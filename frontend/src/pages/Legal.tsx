import { PageTitle } from '../components/ui'

/** Privacidad y términos (adaptados al tratamiento que realiza el prototipo). */
const DOCS = {
  privacidad: {
    icon: '', title: 'Política de privacidad',
    sections: [
      ['Qué datos pedimos', 'Para crear una cuenta solicitamos nombre, número de celular y una clave. La clave no se guarda en texto legible: el servidor almacena un hash PBKDF2-SHA256 con sal. De forma opcional puede guardar municipio, cultivos de interés y consentimiento para WhatsApp.'],
      ['Para qué los usamos', 'Usamos los datos para gestionar la cuenta, mostrar avisos de su zona y cultivos, organizar actividades comunitarias y guardar las observaciones que usted decida registrar. No vendemos datos ni los usamos con fines publicitarios.'],
      ['Quién ve su información', 'Los permisos se aplican desde el servidor. Los representantes de comunidad solo ven los últimos 4 dígitos del celular de sus miembros. Las notas privadas de sus registros de señas no se muestran a otras personas. Las publicaciones comunitarias pueden ser visibles para los miembros autorizados de esa comunidad.'],
      ['Ubicación y servicios meteorológicos', 'Cuando consulta el clima mediante GPS, el navegador obtiene sus coordenadas con su permiso y el servidor las utiliza para solicitar información meteorológica. El proyecto indica que las coordenadas GPS no se guardan en la base de datos; aun así, se envían al proveedor meteorológico para resolver la consulta. Si elige un municipio, se utiliza la ubicación de ese municipio.'],
      ['Servicios externos e inteligencia artificial', 'El pronóstico y los datos históricos se consultan en servicios externos como Open-Meteo y NASA POWER. Si la Asesoría con IA está habilitada, el texto de su pregunta y el contexto necesario para responderla se envían a Anthropic. Si el análisis de una fotografía de planta con IA está habilitado, la imagen también se envía temporalmente al proveedor para procesarla. PACHA-AGRO no guarda la fotografía en su propia base de datos, pero no debe interpretarse como que la imagen nunca sale del servidor. Evite incluir nombres, teléfonos u otros datos personales en preguntas o fotografías. El tratamiento que haga cada proveedor se rige también por sus propias políticas.'],
      ['WhatsApp', 'Solo se envían recordatorios o avisos a quienes dieron su consentimiento. Puede retirar el consentimiento desde Mi cuenta o escribiendo BAJA cuando el canal oficial esté conectado. En la configuración de demostración, WhatsApp es un simulador y no envía mensajes reales.'],
      ['Seguridad', 'El servidor verifica permisos y almacena claves mediante hash criptográfico con sal, no mediante cifrado reversible. Se aplican controles de acceso y límites de intentos. Ningún sistema conectado a internet puede garantizar seguridad absoluta.'],
      ['Sus derechos y contacto', 'Puede cambiar sus datos disponibles y eliminar su cuenta desde la plataforma. Antes de un piloto con personas reales, la organización responsable debe definir y publicar el nombre del responsable del tratamiento, un contacto funcional, plazos de conservación y el canal para solicitudes de acceso o corrección. Este prototipo todavía no publica un responsable ni contacto institucional confirmado.'],
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
