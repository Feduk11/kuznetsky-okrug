import { createClient } from '@supabase/supabase-js';
import { demoClient } from './demo.js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const connected = Boolean(url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_KEY'));
export const demoMode = import.meta.env.VITE_DEMO_MODE === 'true' || (import.meta.env.DEV && !connected);
export const configured = demoMode || connected;
if (key?.startsWith('sb_secret_')) throw new Error('Only a publishable key may be used in browser code.');
export const db = demoMode ? demoClient : connected ? createClient(url, key) : null;
export async function query(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
export const returnUrl = () => location.origin + location.pathname;
export function readableError(error) {
  if (error?.message?.includes('Invalid login credentials')) return 'Проверьте почту и пароль.';
  if (error?.message?.includes('Email not confirmed')) return 'Подтвердите почту по ссылке из письма.';
  if (error?.status === 429 || error?.message?.includes('rate limit')) return 'Слишком много попыток. Попробуйте немного позже.';
  if (error?.code === '23505') return 'Такая запись уже существует. Обновите страницу.';
  if (error?.code === '42501') return 'Недостаточно прав для этого действия.';
  if (error?.code === 'weak_password') return 'Выберите более надёжный пароль.';
  if (error?.message?.includes('User already registered')) return 'Аккаунт уже существует. Войдите или восстановите пароль.';
  return 'Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.';
}
