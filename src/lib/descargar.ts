/** Descarga un archivo generado en el navegador. */
export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** ¿El celular permite compartir archivos (WhatsApp, etc.) con la hoja de compartir del sistema? */
export function puedeCompartir(blob: Blob, nombre: string): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([blob], nombre, { type: blob.type })] })
  } catch {
    return false
  }
}

/** Abre la hoja de compartir del sistema. Devuelve false si la persona canceló. */
export async function compartir(blob: Blob, nombre: string, titulo: string): Promise<boolean> {
  try {
    await navigator.share({ files: [new File([blob], nombre, { type: blob.type })], title: titulo })
    return true
  } catch {
    return false
  }
}
