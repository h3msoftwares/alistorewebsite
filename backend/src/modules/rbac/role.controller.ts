import type { Request, Response } from 'express';
import { paramString } from '../../lib/params';
import * as roles from './role.service';

export async function permissionCatalogHandler(_req: Request, res: Response) {
  res.json(roles.permissionCatalog());
}

export async function listRolesHandler(_req: Request, res: Response) {
  res.json({ roles: await roles.listRoles() });
}

export async function createRoleHandler(req: Request, res: Response) {
  res.status(201).json({ role: await roles.createRole(req.body) });
}

export async function updateRoleHandler(req: Request, res: Response) {
  res.json({ role: await roles.updateRole(paramString(req.params.id), req.body) });
}

export async function deleteRoleHandler(req: Request, res: Response) {
  await roles.deleteRole(paramString(req.params.id));
  res.status(204).end();
}

export async function listTeamHandler(_req: Request, res: Response) {
  res.json({ team: await roles.listTeam() });
}

export async function assignRoleHandler(req: Request, res: Response) {
  const { userId, roleId } = req.body as { userId: string; roleId: string | null };
  res.json({ user: await roles.assignRole(userId, roleId) });
}

export async function setRevokedHandler(req: Request, res: Response) {
  const { userId, revoked } = req.body as { userId: string; revoked: string[] };
  res.json({ user: await roles.setRevoked(userId, revoked) });
}

export async function createTeamMemberHandler(req: Request, res: Response) {
  res.status(201).json({ user: await roles.createTeamMember(req.body) });
}

export async function updateTeamMemberHandler(req: Request, res: Response) {
  res.json({
    user: await roles.updateTeamMember(paramString(req.params.id), req.body, req.user!.id),
  });
}
