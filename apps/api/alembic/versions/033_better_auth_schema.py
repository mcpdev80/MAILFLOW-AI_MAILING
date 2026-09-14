"""Add Better Auth and instance-admin tables.

Revision ID: 033
Revises: 032
"""

from alembic import op

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    statements = (
        '''create table if not exists "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null)''',
        '''create table if not exists "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade, "activeOrganizationId" text)''',
        '''create table if not exists "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null)''',
        '''create table if not exists "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null)''',
        '''create table if not exists "organization" ("id" text not null primary key, "name" text not null, "slug" text not null unique, "logo" text, "createdAt" timestamptz not null, "metadata" text)''',
        '''create table if not exists "member" ("id" text not null primary key, "organizationId" text not null references "organization" ("id") on delete cascade, "userId" text not null references "user" ("id") on delete cascade, "role" text not null, "createdAt" timestamptz not null)''',
        '''create table if not exists "invitation" ("id" text not null primary key, "organizationId" text not null references "organization" ("id") on delete cascade, "email" text not null, "role" text, "status" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "inviterId" text not null references "user" ("id") on delete cascade)''',
        '''create table if not exists "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" boolean not null, "transports" text, "createdAt" timestamptz, "aaguid" text)''',
        '''create table if not exists "auth_security_event" ("id" text not null primary key, "userId" text not null references "user" ("id") on delete cascade, "event" text not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null)''',
        '''create table if not exists "mailflow_instance_admin" ("userId" text not null primary key references "user" ("id") on delete cascade, "role" text not null check ("role" in ('owner', 'admin')), "createdAt" timestamptz default CURRENT_TIMESTAMP not null)''',
        '''create index if not exists "session_userId_idx" on "session" ("userId")''',
        '''create index if not exists "account_userId_idx" on "account" ("userId")''',
        '''create index if not exists "verification_identifier_idx" on "verification" ("identifier")''',
        '''create unique index if not exists "organization_slug_uidx" on "organization" ("slug")''',
        '''create index if not exists "member_organizationId_idx" on "member" ("organizationId")''',
        '''create index if not exists "member_userId_idx" on "member" ("userId")''',
        '''create index if not exists "invitation_organizationId_idx" on "invitation" ("organizationId")''',
        '''create index if not exists "invitation_email_idx" on "invitation" ("email")''',
        '''create index if not exists "passkey_userId_idx" on "passkey" ("userId")''',
        '''create index if not exists "passkey_credentialID_idx" on "passkey" ("credentialID")''',
        '''create index if not exists "auth_security_event_userId_idx" on "auth_security_event" ("userId")''',
        '''create unique index if not exists "mailflow_instance_admin_single_owner_uidx" on "mailflow_instance_admin" ("role") where "role" = 'owner' ''',
    )
    for statement in statements:
        op.execute(statement)


def downgrade() -> None:
    for table in (
        "mailflow_instance_admin",
        "auth_security_event",
        "passkey",
        "invitation",
        "member",
        "organization",
        "verification",
        "account",
        "session",
        "user",
    ):
        op.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
