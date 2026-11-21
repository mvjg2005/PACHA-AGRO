/**
 * Utilidades para reconocimiento de voz (Speech-to-Text / STT)
 * y síntesis de voz (Text-to-Speech / TTS) en el navegador.
 */

// Tipado para Web Speech API en navegadores que usan prefijo webkit
interface IWindow extends Window {
  SpeechRecognition?: any
  webkitSpeechRecognition?: any
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  const win = window as unknown as IWindow
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition)
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export interface SpeechRecognizerOptions {
  onStart?: () => void
  onResult: (transcript: string, isFinal: boolean) => void
  onError?: (errorMessage: string) => void
  onEnd?: () => void
  lang?: string
}

export function createSpeechRecognizer(options: SpeechRecognizerOptions) {
  if (!isSpeechRecognitionSupported()) {
    options.onError?.('Su navegador no soporta reconocimiento de voz. Puede escribir su consulta.')
    return null
  }

  const win = window as unknown as IWindow
  const RecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition
  const recognition = new RecognitionClass()

  recognition.lang = options.lang || 'es-BO'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.maxAlternatives = 1

  recognition.onstart = () => {
    options.onStart?.()
  }

  recognition.onresult = (event: any) => {
    let interim = ''
    let final = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        final += transcript
      } else {
        interim += transcript
      }
    }

    const text = final || interim
    options.onResult(text, Boolean(final))
  }

  recognition.onerror = (event: any) => {
    let msg = 'Ocurrió un error con el micrófono.'
    if (event.error === 'not-allowed') {
      msg = 'Permiso de micrófono denegado. Habilite el micrófono en los permisos de su navegador.'
    } else if (event.error === 'no-speech') {
      msg = 'No se detectó voz. Intente hablar de nuevo más cerca del micrófono.'
    } else if (event.error === 'network') {
      msg = 'Error de conexión para el reconocimiento de voz.'
    }
    options.onError?.(msg)
  }

  recognition.onend = () => {
    options.onEnd?.()
  }

  return {
    start: () => {
      try {
        recognition.start()
      } catch (e) {
        // En caso de que ya estuviera corriendo
        try {
          recognition.stop()
          setTimeout(() => recognition.start(), 100)
        } catch {
          /* ignorar */
        }
      }
    },
    stop: () => {
      try {
        recognition.stop()
      } catch {
        /* ignorar */
      }
    },
    abort: () => {
      try {
        recognition.abort()
      } catch {
        /* ignorar */
      }
    },
  }
}

/** Limpia marcas markdown para que el sintetizador de voz lea con fluidez natural. */
export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // quitar enlaces
    .replace(/[*_#`~]+/g, '') // quitar negritas, cursivas, encabezados
    .replace(/^\s*(?:[-•]|\d+[.)])\s*/gm, ' ') // viñetas y listas numeradas
    .replace(/\n+/g, '. ') // saltos de línea por pausas
    .replace(/\s+/g, ' ') // espacios dobles
    .trim()
}

let activeUtterance: SpeechSynthesisUtterance | null = null

export function speakText(
  text: string,
  options?: {
    onStart?: () => void
    onEnd?: () => void
    onError?: (error: any) => void
    rate?: number
    pitch?: number
  }
): { stop: () => void } {
  if (!isSpeechSynthesisSupported()) {
    options?.onError?.(new Error('Síntesis de voz no soportada'))
    return { stop: () => { } }
  }

  // Detener cualquier reproducción en curso
  stopSpeaking()

  const clean = cleanTextForSpeech(text)
  if (!clean) return { stop: () => { } }

  const utterance = new SpeechSynthesisUtterance(clean)
  activeUtterance = utterance
  utterance.rate = options?.rate ?? 0.95 // un poco más pausado para claridad rural
  utterance.pitch = options?.pitch ?? 1.0

  // Seleccionar la mejor voz en español disponible en el sistema
  const voices = window.speechSynthesis.getVoices()
  const esVoice =
    voices.find(v => v.lang.toLowerCase().startsWith('es-bo')) ||
    voices.find(v => v.lang.toLowerCase().includes('es-419')) ||
    voices.find(v => v.lang.toLowerCase().startsWith('es-')) ||
    voices.find(v => v.lang.toLowerCase().includes('es'))

  if (esVoice) {
    utterance.voice = esVoice
    utterance.lang = esVoice.lang
  } else {
    utterance.lang = 'es-BO'
  }

  utterance.onstart = () => {
    options?.onStart?.()
  }

  utterance.onend = () => {
    activeUtterance = null
    options?.onEnd?.()
  }

  utterance.onerror = (e) => {
    activeUtterance = null
    options?.onError?.(e)
  }

  window.speechSynthesis.speak(utterance)

  return {
    stop: () => stopSpeaking(),
  }
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    if (activeUtterance) {
      window.speechSynthesis.cancel()
      activeUtterance = null
    } else {
      window.speechSynthesis.cancel()
    }
  }
}