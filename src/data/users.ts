// Fictional people on the reserved .example domain; the roles are placeholders for KJ to confirm.
export type Role = 'Admin' | 'Operator' | 'Designer' | 'Viewer';
export type UserStatus = 'Active' | 'Invited' | 'Disabled';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  /** As shown in the table; relative to 16:00 PKT on 21 Oct 2026. */
  lastActive: string;
}

export const users: User[] = [
  { id: 'u1', name: 'Hina Malik', email: 'hina.malik@rsop.example', role: 'Admin', status: 'Active', lastActive: 'Now' },
  { id: 'u2', name: 'Bilal Ahmed', email: 'bilal.ahmed@rsop.example', role: 'Operator', status: 'Active', lastActive: '14 min ago' },
  { id: 'u3', name: 'Kamran Shah', email: 'kamran.shah@rsop.example', role: 'Operator', status: 'Active', lastActive: '25 min ago' },
  { id: 'u4', name: 'Sana Iqbal', email: 'sana.iqbal@rsop.example', role: 'Designer', status: 'Active', lastActive: '1 h ago' },
  { id: 'u5', name: 'Omar Farooq', email: 'omar.farooq@rsop.example', role: 'Operator', status: 'Active', lastActive: '3 h ago' },
  { id: 'u6', name: 'Ayesha Siddiqui', email: 'ayesha.siddiqui@rsop.example', role: 'Viewer', status: 'Active', lastActive: 'Yesterday' },
  { id: 'u7', name: 'Usman Tariq', email: 'usman.tariq@rsop.example', role: 'Designer', status: 'Invited', lastActive: 'Invite sent 20 Oct' },
  { id: 'u8', name: 'Zara Hussain', email: 'zara.hussain@rsop.example', role: 'Viewer', status: 'Disabled', lastActive: '12 Sep 2026' },
];

export const me = users[0];

export const roles: { role: Role; summary: string }[] = [
  { role: 'Admin', summary: 'Everything, including users and roles' },
  { role: 'Operator', summary: 'Runs the day: traces transactions and retries bill marking' },
  { role: 'Designer', summary: 'Owns the flows and their parameters' },
  { role: 'Viewer', summary: 'Reads the dashboard and the flows' },
];

/** The live screens' permissions; the nav shows each screen only to roles that have it. */
export const INQUIRY_LOG = 'View the bill inquiry log';
export const PAYMENT_LOG = 'View the bill payment log';

export const permissions: { label: string; roles: Role[] }[] = [
  { label: 'View dashboard and billing', roles: ['Admin', 'Operator', 'Designer', 'Viewer'] },
  { label: 'View flows and parameters', roles: ['Admin', 'Operator', 'Designer', 'Viewer'] },
  { label: 'Trace transactions', roles: ['Admin', 'Operator', 'Designer'] },
  { label: 'Edit flow parameters', roles: ['Admin', 'Designer'] },
  { label: 'Retry bill marking', roles: ['Admin', 'Operator'] },
  { label: 'Manage users and roles', roles: ['Admin'] },
  { label: INQUIRY_LOG, roles: ['Admin'] },
  { label: PAYMENT_LOG, roles: ['Admin'] },
];

export const can = (role: Role, permission: string) => permissions.some((p) => p.label === permission && p.roles.includes(role));

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
