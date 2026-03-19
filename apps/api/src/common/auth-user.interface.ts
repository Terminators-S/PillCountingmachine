export interface AuthUser {
  sub: string;
  email?: string;
  roles: string[];
  kind: 'USER' | 'API_KEY';
  apiKeyId?: string;
}
