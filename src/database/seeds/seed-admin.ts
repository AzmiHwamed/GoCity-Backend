// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists yet.
// Usage: npm run seed:admin
import * as bcrypt from 'bcryptjs';
import dataSource from '../data-source';
import { User, UserRole } from '../../modules/users/entities/user.entity';
import { SALT_ROUNDS } from '../../modules/users/users.service';

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first');
  }
  if (password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');

  await dataSource.initialize();
  // Same rule as the app: create/update tables from the entities unless sync is turned off.
  if ((process.env.DB_SYNCHRONIZE ?? 'true') === 'true') await dataSource.synchronize();
  try {
    const users = dataSource.getRepository(User);
    if (await users.exists({ where: { role: UserRole.ADMIN } })) {
      console.log('An admin already exists, nothing to do.');
      return;
    }
    if (await users.exists({ where: { email }, withDeleted: true })) {
      throw new Error(`A user with email ${email} already exists`);
    }
    await users.save(
      users.create({
        firstName: 'Admin',
        lastName: 'User',
        email,
        password: await bcrypt.hash(password, SALT_ROUNDS),
        role: UserRole.ADMIN,
      }),
    );
    console.log(`Admin ${email} created.`);
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
