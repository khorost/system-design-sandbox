import type { ArchitectureSchema } from '../types/index.ts';
import { apiFetch } from './client.ts';

export interface ArchitectureListItem {
  id: string;
  user_id: string;
  name: string;
  description: string;
  scenario_id?: string;
  thumbnail_url?: string;
  is_public: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ArchitectureDetail extends ArchitectureListItem {
  data: ArchitectureSchema;
}

export function createArchitecture(
  userId: string,
  name: string,
  description: string,
  data: ArchitectureSchema,
  isPublic: boolean,
  tags: string[],
): Promise<ArchitectureDetail> {
  return apiFetch<ArchitectureDetail>('/api/v1/architectures/', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, name, description, data, is_public: isPublic, tags }),
  });
}

export function updateArchitecture(
  id: string,
  name: string,
  description: string,
  data: ArchitectureSchema,
  isPublic: boolean,
  tags: string[],
): Promise<ArchitectureDetail> {
  return apiFetch<ArchitectureDetail>(`/api/v1/architectures/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, description, data, is_public: isPublic, tags }),
  });
}

export function getArchitecture(id: string): Promise<ArchitectureDetail> {
  return apiFetch<ArchitectureDetail>(`/api/v1/architectures/${id}`);
}

export function listArchitectures(userId: string): Promise<ArchitectureListItem[]> {
  return apiFetch<ArchitectureListItem[]>(`/api/v1/architectures/user/${userId}`);
}

export function deleteArchitecture(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/architectures/${id}`, { method: 'DELETE' });
}
