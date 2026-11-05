import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module';
import { users } from '../database/schema';
import { CategoriesService } from '../categories/categories.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async register(dto: RegisterDto) {
    // 1. Chuyển email về chữ thường
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 2. Kiểm tra email đã tồn tại chưa
    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail));

    if (existingUser) {
      throw new ConflictException('Email này đã được đăng ký.');
    }

    // 3. Hash mật khẩu bằng Argon2
    const passwordHash = await argon2.hash(dto.password);

    // 4. Tạo user và seed danh mục mặc định trong cùng 1 transaction
    const newUser = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          createdAt: users.createdAt,
        });

      await this.categoriesService.seedDefaultsForUser(
        user.id,
        tx as unknown as Database,
      );

      return user;
    });

    // 5. Ký JWT token và trả về
    const accessToken = await this.signToken(newUser.id, newUser.email);

    return {
      user: newUser,
      accessToken,
    };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail));

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    const accessToken = await this.signToken(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      accessToken,
    };
  }

  private signToken(userId: string, email: string): Promise<string> {
    return this.jwtService.signAsync({
      sub: userId,
      email,
    });
  }
}
