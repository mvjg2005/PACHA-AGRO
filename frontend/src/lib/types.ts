export type Status = 'verde' | 'amarillo' | 'rojo' | 'gris'
export interface Municipality { id: string; name: string; lat: number; lon: number; elevation: number; region: string }
export interface Department { id: string; name: string; municipalities: Municipality[] }
export interface User { id: number; full_name: string; phone: string; role: string; is_demo: boolean; whatsapp_opt_in: boolean; default_municipality_id: string | null; crops: string[]; must_change_password?: boolean }
export interface Daily { date: string; tmin: number | null; tmax: number | null; precip_mm: number | null; precip_prob: number | null; weather_code: number | null; storm: boolean }
export interface Block { available: boolean; source: string; kind: string; fetched_at: string | null; error: string | null; daily: Daily[]; current_temp: number | null; current_time: string | null; soil_moisture: number | null; soil_moisture_unit: string | null; extra: Record<string, any> }
export interface Weather {
  mode: 'real' | 'simulado'
  location: { id: string; name: string; department_name: string; lat: number; lon: number; elevation: number; region: string; gps?: boolean; nearest_name?: string; distance_km?: number; far?: boolean }
  generated_at: string
  forecast: Block
  recent: Block
  climatology: { available: boolean; period?: string; frost_days_month?: number; precip_mm_day_month?: number; source?: string; error?: string }
  official_alerts: { available: boolean; source: string; url: string; message: string }
  frost_risk: { level: 'alto' | 'medio' | 'bajo' | 'desconocido'; min_tmin?: number | null; date?: string | null; basis: string | null; source: string | null; frost_days_month?: number }
  storm_risk: { level: string; days: string[]; note?: string }
  spray?: SprayT | null
}
export interface Criterion { id: string; label: string; status: Status; explanation: string; data_kind: string; source: string | null; value: string | null; hint?: string | null }
export interface Recommendation {
  status: Status; headline: string; summary: string; score: number | null; confidence: string
  crop: string; crop_name: string; variety: string | null; location: { name: string; department_name: string; region: string }
  scenario_status: 'implemented' | 'demo' | 'no_rules'; scenario_label: string; mode: string; disclaimer: string
  criteria: Criterion[]; actions: string[]; sources: string[]; notes: string[]; variety_note?: string
  key_factor: Criterion | null; main_action: string; missing_data: string[]; confidence_explanation: string
  alternatives?: { id: string; name: string }[]
  weather_summary?: { forecast_available: boolean; forecast_error: string | null; forecast_source: string; recent_source: string | null; fetched_at: string | null; stale?: boolean; stale_fetched_at?: string | null }
}
export interface Crop { id: string; name: string; varieties: string[]; regions: Record<string, string> }
export interface Community { id: number; name: string; description: string; status: string; is_demo: boolean; department_name: string; municipality_id: string; municipality_name: string; members: number; representatives: string[]; my_membership?: { id: number; role: string; status: string } | null }
export interface Meeting { id: number; title: string; description: string; place: string; starts_at: string; cancelled: boolean; created_by: string; attendance: { si: number; no: number; tal_vez: number }; my_response: string | null }
export interface RegionalNotice {
  id: number; title: string; summary: string; body: string; kind: string; kind_label: string
  scope: 'nacional' | 'departamento' | 'municipio' | 'cultivo'; scope_label: string
  department_id: string | null; municipality_id: string | null; crop_id: string | null
  author: string | null; author_role: string; is_demo: boolean; created_at: string; expires_at: string | null; disclaimer: string
}
export interface LibraryItem { id: string; title: string; summary: string; type: string; crop: string | null; department_id: string | null; reading_minutes: number; body: string; source_note: string }
export interface Library { source_project: string; note: string; review_status: string; types: Record<string, string>; items: LibraryItem[]; total: number }
export interface ExpertT { id: number; full_name: string; specialty: string; institution: string; phone: string; email: string; whatsapp_url: string | null; crops: string[]; departments: string[]; verified: boolean; is_demo: boolean }
export interface ResourceT { id: string; category: string; name: string; url: string; description: string; scope: string; official?: boolean }
export interface Resources { note: string; categories: Record<string, string>; items: ResourceT[] }
export interface AdviceT { answer: string; mode: 'ia' | 'basico'; topics: string[]; crop: string | null; experts: ExpertT[]; resources: ResourceT[]; location: string | null; note: string; ai_available: boolean }
export interface SprayT { status: 'bueno' | 'moderado' | 'no'; label: string; reasons: string[]; wind_kmh: number | null; temp_c: number | null; rh: number | null; best_window: { start: string; end: string } | null; hours: { time: string; status: 'bueno' | 'moderado' | 'no' }[]; note: string }
export interface SymptomT { id: string; title: string; could_be: string; check: string[]; first_steps: string[] }
export interface DiagnosisT {
  mode: 'ia' | 'guia'; ai_available: boolean; crop: string | null; location: string | null; photo_stored: false; note: string
  result: null | { is_plant: boolean; image_quality: 'buena' | 'regular' | 'insuficiente'; summary: string; urgency: 'alta' | 'media' | 'baja'
    candidates: { name: string; kind: string; kind_label: string; confidence: 'alta' | 'media' | 'baja'; signs: string }[]; verify: string[]; actions: string[] }
  guide: SymptomT[] | null; experts: ExpertT[]; resources: ResourceT[]
}
export interface SheetItem { icon: string; label: string; value: string }
export interface CropSheetT { id: string; name: string; scientific: string; summary: string; regions: string; growing: SheetItem[]; crop: SheetItem[]; soil: SheetItem[]; problems: string[]; sow_supported: boolean; note: string; source_link: { name: string; url: string } }
export interface FieldRecordT { id: number; date: string; kind: string; kind_label: string; description: string; quantity: number | null; unit: string; cost_bs: number | null }
export interface PlotT {
  id: number; name: string; crop: string; crop_name: string; variety: string; area_ha: number | null; area_method: 'manual' | 'gps'
  municipality_id: string | null; municipality_name: string | null; sowing_date: string | null; notes: string
  summary: { costs_bs: number; income_bs: number; balance_bs: number; harvest_kg: number; yield_kg_ha: number | null; days_since_sowing: number | null; records: number }
  records?: FieldRecordT[]
}
export interface SenaReading { id: string; label: string; predicts: Record<string, string[]>; meaning: string }
export interface SenaT { id: string; name: string; type: string; when: string; months: number[]; how: string; readings: SenaReading[]; science: string | null; source: string }
export interface SenasCatalog { intro: string; method: string; outcomes: Record<string, { label: string; values: Record<string, string> }>; senas: SenaT[]; current_campaign: number; current_campaign_label: string }
export interface OutcomeT { status: 'pendiente' | 'evaluado' | 'sin_datos'; available_after?: string; value?: string; label?: string; observed?: number; normal?: number; low?: number; high?: number; unit?: string; years?: number; window?: string; source?: string }
export interface SenaObsT { id: number; sena_id: string; sena_name: string; reading: string; reading_label: string; predicts: Record<string, string[]>; observed_on: string; campaign: number; municipality_id: string; notes: string; is_demo: boolean; mine: boolean }
export interface SenaZoneT {
  campaign: number; campaign_label: string; municipality: { id: string; name: string; department_name: string }
  outcome: Record<string, OutcomeT>; mine: SenaObsT[]; recent: SenaObsT[]
  local: { n: number; votes: Record<string, Record<string, number>> }
  department: { n: number; votes: Record<string, Record<string, number>> }
}
export interface ReliabilityRow { id: string; sena_id: string; name: string; observations: number; demo: number; evaluated: number; hits: number; rate: number | null; chance: number | null; campaigns: string[]; enough: boolean }
export interface PachaWeek { start: string; end: string; rain_mm: number | null; normal_mm: number | null; frost_days: number | null; tmin: number | null; future: boolean; reports: Record<string, number>; senas: string[] }
export interface PachagramaT { municipality: { name: string; department_name: string }; campaign: number; campaign_label: string; months: string[]; weeks: PachaWeek[]; data_available: boolean; outcome: Record<string, OutcomeT>; source: string; note: string }
export interface NightT { date: string; tmin: number | null; snow: boolean; wind_kmh: number | null; level: 'extremo' | 'alto' | 'medio' | 'bajo'; label: string; reasons: string[]; actions: string[] }
export interface NightsT { available: boolean; error?: string; source?: string; nights: NightT[]; worst?: NightT; note?: string }
export interface DroughtT {
  campaign_label: string; level: 'alta' | 'media' | 'baja'; signals: string[]; actions: string[]
  rain?: { observed: number; normal: number; low: number; high: number; years: number; category: string; window: string }
  last_season?: OutcomeT & { campaign_label: string }
  senas: { n: number; votes: Record<string, number>; dry_share: number | null }
}
export interface WinterT { winter: string; frost_nights: number; hard_nights: number; min: number; rain_mm: number; normal_frost_nights: number | null; normal_hard_nights: number | null; normal_min: number | null; normal_rain_mm: number | null; years: number; snow_events: { date: string; precip_mm: number; tmin: number }[]; note: string }
export interface LossSummaryT { campaign_label: string; reports: number; families: number; animals: number; by_species: { id: string; label: string; count: number }[]; by_cause: { id: string; label: string; count: number }[]; by_month: { month: string; count: number }[]; communities: { name: string; count: number }[]; has_demo: boolean }
export interface LossT { id: number; date: string; species: string; species_label: string; count: number; cause: string; cause_label: string; community: string; notes: string }
export interface LivestockReportT { generated_at: string; municipality: { name: string; department_name: string }; losses: LossSummaryT; rain?: OutcomeT; rain_campaign_label: string; winter: WinterT | null; requests: string[] }
