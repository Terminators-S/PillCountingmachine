export const ROLES = {
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  OPERATOR: 'OPERATOR',
  AUDITOR: 'AUDITOR',
  VIEWER: 'VIEWER',
  API_ONLY: 'API_ONLY'
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];
