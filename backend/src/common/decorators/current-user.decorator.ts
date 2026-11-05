import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface ActiveUserData {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (field: keyof ActiveUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: ActiveUserData | undefined = request.user;
    return field ? user?.[field] : user;
  },
);
