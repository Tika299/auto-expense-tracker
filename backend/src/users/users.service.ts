import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { categories, users, wallets } from '../database/schema';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async findByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    return user ?? null;
  }

  async findById(id: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  }

  async createUserWithDefaults(email: string, passwordHash: string) {
    return this.db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          email: email.toLowerCase().trim(),
          passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          createdAt: users.createdAt,
        });

      // Seed danh mục mặc định theo Mục 9
      await tx.insert(categories).values([
        { userId: newUser.id, name: 'Ăn uống', scope: 'OUT' },
        { userId: newUser.id, name: 'Di chuyển', scope: 'OUT' },
        { userId: newUser.id, name: 'Mua sắm', scope: 'OUT' },
        { userId: newUser.id, name: 'Hóa đơn', scope: 'OUT' },
        { userId: newUser.id, name: 'Lương', scope: 'IN' },
        { userId: newUser.id, name: 'Hoàn tiền', scope: 'IN' },
        { userId: newUser.id, name: 'Thu nhập khác', scope: 'IN' },
      ]);

      // Seed sẵn 1 ví Tiền mặt mặc định
      await tx.insert(wallets).values({
        userId: newUser.id,
        name: 'Tiền mặt',
        type: 'CASH',
        currency: 'VND',
      });

      return newUser;
    });
  }
}
