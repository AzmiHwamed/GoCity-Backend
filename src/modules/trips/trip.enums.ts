export enum TripMemberRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

/** Higher rank = more rights. Each role includes the rights of the ones below it. */
export const TRIP_ROLE_RANK: Record<TripMemberRole, number> = {
  [TripMemberRole.VIEWER]: 1,
  [TripMemberRole.EDITOR]: 2,
  [TripMemberRole.OWNER]: 3,
};

/** Roles that can be given through an invitation or a role change (ownership is transferred). */
export const INVITABLE_ROLES = [TripMemberRole.EDITOR, TripMemberRole.VIEWER] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  REVOKED = 'revoked',
}

export enum ActivityKind {
  ACTIVITY = 'activity',
  PLAN = 'plan',
}

export enum Transportation {
  WALK = 'walk',
  PUBLIC_TRANSPORT = 'public_transport',
  DRIVE = 'drive',
}

export enum IdeaStatus {
  OPEN = 'open',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum VoteValue {
  YES = 'yes',
  NO = 'no',
}

/** Who can see a trip besides its members. */
export enum TripVisibility {
  /** Members only. */
  PRIVATE = 'private',
  /** Anyone logged in who has the share link (read-only, not listed). */
  LINK = 'link',
  /** Listed in GET /trips/public and on the owner's profile; anyone logged in can view it. */
  PUBLIC = 'public',
}

export enum ExpenseCategory {
  HOTEL = 'hotel',
  ACTIVITY = 'activity',
  TRANSPORT = 'transport',
  FOOD = 'food',
  SHOPPING = 'shopping',
  OTHER = 'other',
}
