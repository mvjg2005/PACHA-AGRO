import { lazy, Suspense, useEffect, useState } from 'react'
import { Button, Card, ErrorBox, Loading, Notice, PageTitle } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import type { Crop } from '../lib/types'

const CoverageMap = lazy(() => import('../components/CoverageMap'))
type CropsResp = { crops: Crop[]; calendars: { crop: string; department_id: string | null; region: string | null }[] }

/** Cobertura nacional (idea de PACHAAGRO): qué hay disponible en cada departamento, sin exagerar. */
export default function Coverage() {
  const { departments, locationsError, reloadLocations } = useApp()
  const [crops, setCrops] = useState<CropsResp | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [map, setMap] = useState(false)
  useEffect(() => { api<CropsResp>('/api/crops').then(setCrops).catch(e => setErr(e.message)) }, [])
  if (locationsError || err) return <ErrorBox message={locationsError ?? err!} onRetry={reloadLocations} />
  if (!departments || !crops) return <Loading />
  const municipalities = departments.reduce((a, d) => a + d.municipalities.length, 0)

  const status = (deptId: string, regions: Set<string>, c: Crop) => {
    const st = [...regions].map(r => c.regions[r]).find(Boolean)
    const cal = crops.calendars.some(x => x.crop === c.id && (x.department_id === deptId || (!x.department_id && !!x.region && regions.has(x.region))))
    if (st && cal) return st === 'implemented' ? 'disponible' : 'demostración'
    return null
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Cobertura nacional" subtitle="Los 9 departamentos de Bolivia y qué orientación de siembra hay en cada uno." />
      <Card className="flex flex-wrap justify-around gap-x-4 gap-y-1 text-center">
        {[[departments.length, 'departamentos'], [municipalities, 'municipios'], [crops.crops.length, 'cultivos']].map(([n, l]) => (
          <p key={l as string}><strong className="text-2xl text-bosque">{n}</strong> <span className="text-musgo">{l}</span></p>
        ))}
      </Card>
      {!map ? <Button variant="secondary" className="w-full" onClick={() => setMap(true)}>Ver mapa de municipios</Button>
        : <Suspense fallback={<Loading text="Cargando mapa…" />}><CoverageMap departments={departments} /></Suspense>}
      {map && <p className="text-sm text-musgo">Colores: <span className="font-semibold text-tierra">● altiplano</span> · <span className="font-semibold text-ocre">● valles</span> · <span className="font-semibold text-bosque">● llanos</span>. Ubicaciones aproximadas.</p>}
      <ul className="space-y-3">
        {departments.map(d => {
          const regions = new Set(d.municipalities.map(m => m.region))
          const avail = crops.crops.map(c => [c, status(d.id, regions, c)] as const).filter(([, s]) => s)
          return (
            <li key={d.id}>
              <Card>
                <div className="flex items-baseline justify-between gap-2"><h2 className="text-xl font-bold">{d.name}</h2>
                  <span className="text-sm text-musgo">{d.municipalities.length} municipios · {[...regions].join(', ')}</span></div>
                {avail.length === 0 ? <p className="mt-1 text-musgo">Clima disponible. Aún sin reglas de siembra validadas para esta zona.</p> : (
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {avail.map(([c, s]) => (
                      <li key={c.id} className={`rounded-full px-3 py-0.5 font-semibold ${s === 'disponible' ? 'bg-brote text-bosque-800' : 'bg-sol-50 text-sol-ink'}`}>
                        {c.name}: {s}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          )
        })}
      </ul>
      <Notice>El clima funciona en todos los municipios listados. «Disponible» significa reglas documentadas pendientes de validación agronómica; «demostración», reglas preliminares.</Notice>
    </div>
  )
}
