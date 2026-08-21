export const TASK_EXCLUDED_EMAILS = ['na@birka-market.ru'] as const;

export function isTaskExcludedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return TASK_EXCLUDED_EMAILS.some((e) => e.toLowerCase() === lower);
}

export function isTaskPrivilegedRole(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE';
}
