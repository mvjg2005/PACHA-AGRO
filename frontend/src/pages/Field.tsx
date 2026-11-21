import { Icon, type IconName } from '../components/Icon'
import { PageTitle } from '../components/ui'
import { CALCS } from './Calculator'
import { CropMark, DiagnoseCta, MyCrops, SenasCta } from '../components/FieldBits'
import { CROP_LIST, useMyCrops } from '../lib/prefs'
import { useApp } from '../lib/store'

/** Mi campo: diagnóstico por foto, calculadoras, parcelas y fichas de cultivo en un solo lugar. */
export default function Field() {
  const { user } = useApp()
  const mine = useMyCrops(user)
  return (
    <div className="space-y-8">
      <PageTitle title="Mi campo" subtitle="Herramientas para el día a día: revise una planta enferma, haga sus cuentas y lleve el registro de sus parcelas." />

      <MyCrops crops={mine} />
      <DiagnoseCta />
      <SenasCta />

      <section aria-labelledby="calc-title">
        <p className="eyebrow">Herramientas</p>
        <h2 id="calc-title" className="section-title">Calculadoras</h2>
        <p className="mt-1 text-sm text-[var(--color-on-variant)]">En bolivianos, con kilos, arrobas o quintales. Los cálculos quedan guardados en este celular.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CALCS.map(c => <Tile key={c.id} href={`#/campo/calculadora/${c.id}`} icon={c.icon} title={c.title} text={c.text} />)}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <a href="#/campo/parcelas" className="panel group flex items-start gap-4 hover:bg-[var(--color-surface-low)]" data-testid="plots-link">
          <span className="icon-square"><Icon name="notebook" size={24} /></span>
          <div>
            <h2 className="font-display text-[1.3rem] font-semibold text-[var(--color-primary)] group-hover:underline">Mis parcelas y cuaderno de campo</h2>
            <p className="mt-1 text-sm text-[var(--color-on-variant)]">Registre sus parcelas, mida la superficie caminando con el GPS y anote siembra, labores, gastos, cosecha y ventas. Vea cuánto gastó y cuánto ganó.</p>
            <span className="link-caps mt-3">{user ? 'Abrir mis parcelas' : 'Ingresar para usar'} <Icon name="arrowRight" size={14} /></span>
          </div>
        </a>
        <a href="#/clima" className="panel group flex items-start gap-4 hover:bg-[var(--color-surface-low)]">
          <span className="icon-square"><Icon name="spray" size={24} /></span>
          <div>
            <h2 className="font-display text-[1.3rem] font-semibold text-[var(--color-primary)] group-hover:underline">¿Puedo fumigar hoy?</h2>
            <p className="mt-1 text-sm text-[var(--color-on-variant)]">Condiciones para aplicar productos hora por hora: viento, lluvia, calor y humedad del pronóstico de su municipio.</p>
            <span className="link-caps mt-3">Ver condiciones <Icon name="arrowRight" size={14} /></span>
          </div>
        </a>
      </section>

      <section aria-labelledby="sheets-title">
        <p className="eyebrow">Biblioteca</p>
        <h2 id="sheets-title" className="section-title">Fichas de cultivo</h2>
        <p className="mt-1 text-sm text-[var(--color-on-variant)]">Clima, suelo, ciclo y problemas frecuentes de cada cultivo. Puede escucharlas en voz alta.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CROP_LIST.map(c => (
            <a key={c.id} href={`#/cultivos/${c.id}`} className="tool-card items-center !justify-start gap-2 text-center">
              <CropMark id={c.id} />
              <span className="font-semibold">{c.name}</span>
            </a>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="#/aprender" className="btn-soft !w-auto"><Icon name="book" size={18} />Lecciones de 2 minutos</a>
          <a href="#/aprender/biblioteca" className="btn-soft !w-auto">Biblioteca y guías</a>
          <a href="#/asesoria" className="btn-soft !w-auto"><Icon name="chat" size={18} />Asesoría y técnicos</a>
        </div>
      </section>
    </div>
  )
}

function Tile({ href, icon, title, text }: { href: string; icon: IconName; title: string; text: string }) {
  return (
    <a href={href} className="tool-card group">
      <div>
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface-high)] text-[var(--color-primary)]"><Icon name={icon} size={22} /></span>
        <h3 className="font-display text-[1.15rem] font-semibold text-[#161d17] group-hover:underline group-hover:underline-offset-4">{title}</h3>
        <p className="mt-1 text-sm text-[var(--color-on-variant)]">{text}</p>
      </div>
    </a>
  )
}
