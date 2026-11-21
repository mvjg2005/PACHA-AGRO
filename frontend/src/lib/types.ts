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
}
export interface Criterion { id: string; label: string; status: Status; explanation: string; data_kind: string; source: string | null; value: string | null; hint?: string | null }
export interface Recommendation {
  status: Status; headline: string; summary: string; score: number | null; confidence: string
  crop: string; crop_name: string; variety: string | null; location: { name: string; department_name: string; region: string }
  scenario_status: 'implemented' | 'demo' | 'no_rules'; scenario_label: string; mode: string; disclaimer: string
  criteria: Criterion[]; actions: string[]; sources: string[]; notes: string[]; variety_note?: string
  key_factor: Criterion | null; main_action: string; missing_data: string[]; confidence_explanation: string
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
