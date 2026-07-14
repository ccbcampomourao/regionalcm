import { getUser, setUser, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from './store.js';
import { hashPassword } from './password.js';

// Garante que a conta admin padrão exista e tenha o papel admin.
// - Se não existe: cria do zero, já como admin.
// - Se existe mas não é admin (ex: cadastro feito antes dessa funcionalidade
//   existir): promove pra admin e reseta a senha pra padrão, garantindo
//   acesso mesmo que a senha antiga tenha sido esquecida.
// - Se já é admin: não mexe em nada.
export async function ensureDefaultAdmin(env) {
  const existing = await getUser(env, DEFAULT_ADMIN_EMAIL);
  const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);

  if (existing) {
    if (existing.role === 'admin') return;
    existing.role = 'admin';
    existing.active = true;
    existing.passwordHash = passwordHash;
    await setUser(env, DEFAULT_ADMIN_EMAIL, existing);
    return;
  }

  await setUser(env, DEFAULT_ADMIN_EMAIL, {
    email: DEFAULT_ADMIN_EMAIL,
    passwordHash,
    active: true,
    role: 'admin',
    assignedLists: [],
    createdAt: new Date().toISOString(),
  });
}
