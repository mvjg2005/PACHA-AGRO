import type { Recommendation } from './types'

/** Mensaje para compartir el resultado por WhatsApp (lo envía la propia persona desde su celular). */
export function shareText(r: Recommendation): string {
  const lines = [
    `AgroBolivia: ${r.crop_name} en ${r.location.name} (${r.location.department_name})`,
    `Resultado: ${r.headline}`,
  ]
  if (r.key_factor) lines.push(`Lo que más pesa: ${r.key_factor.label}`)
  lines.push(`Qué hacer: ${r.main_action}`)
  if (r.mode === 'simulado') lines.push('Caso simulado: datos de clima ficticios, solo para demostración.')
  lines.push('Orientación experimental de PACHA-AGRO. Contactos de técnicos en la sección Asesoría.')
  return lines.join('\n')
}

export function whatsappShareUrl(r: Recommendation): string {
  return `https://wa.me/?text=${encodeURIComponent(shareText(r))}`
}
