import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { User } from '@supabase/supabase-js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true; // no roles required → everyone allowed

    const request = context.switchToHttp().getRequest();
    const user: User | undefined = request.user;
    if (!user) return false;

    // Check if user has a role in app_metadata.roles (customize as needed)
const userRoles: string[] = user.app_metadata?.catalog_roles ?? [];    return requiredRoles.some(role => userRoles.includes(role));
  }
}