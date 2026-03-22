/**
 * Capa de autenticación simulada.
 *
 * En una aplicación real, el companyId del usuario vendría de la sesión
 * autenticada (NextAuth, Clerk, JWT, etc.) y NUNCA estaría hardcodeado.
 *
 * Este módulo centraliza esa resolución para que el resto del código
 * no dependa directamente de un valor fijo ni se duplique la lógica.
 * Cuando se integre un sistema de autenticación real, sólo hay que
 * modificar este archivo.
 */

/**
 * Devuelve el companyId de la empresa del usuario autenticado actual.
 *
 * @returns El identificador de la empresa (ej. 'TechCorp').
 *
 * TODO: Reemplazar con la lectura real de la sesión, por ejemplo:
 *   const session = await getServerSession(authOptions)
 *   return session.user.companyId
 */
export function getCurrentCompanyId(): string {
  return 'TechCorp'
}
