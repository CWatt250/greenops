import { loadEnvTest } from './env';

loadEnvTest();

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — copy .env.test.example to .env.test`);
  return v;
}

export const OWNER = {
  email: req('E2E_OWNER_EMAIL'),
  password: req('E2E_OWNER_PASSWORD'),
};

export const CREW = {
  email: req('E2E_CREW_EMAIL'),
  password: req('E2E_CREW_PASSWORD'),
};

export const OWNER_STATE = 'playwright/.auth/owner.json';
