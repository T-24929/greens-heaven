import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const directory = path.dirname(fileURLToPath(import.meta.url))
const database = new PGlite()

try {
  // Only the Supabase-owned infrastructure is stubbed. Application tables,
  // grants, RLS, stored procedures and assertions run in actual PostgreSQL.
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth;
    create schema storage;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      created_at timestamptz default now(),
      last_sign_in_at timestamptz,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      is_anonymous boolean default false
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text not null,
      owner_id text,
      metadata jsonb,
      unique(bucket_id, name)
    );
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
  `)

  const migrationsDirectory = path.join(directory, '..', 'migrations')
  const migrations = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort()
  for (const migration of migrations) {
    await database.exec(await readFile(path.join(migrationsDirectory, migration), 'utf8'))
  }
  const assertions = await readFile(path.join(directory, 'authorization.sql'), 'utf8')
  await database.exec(assertions)
  const count = (assertions.match(/select test_support\.(?:ok|denied)\(/g) ?? []).length
  console.log(`PASS: ${count} database authorization and workflow assertions; ${migrations.length} migration(s) applied.`)
  console.log('Uses PostgreSQL via PGlite. Live Auth, Storage HTTP, OAuth, and SMTP remain integration checks.')
} catch (error) {
  console.error('Database tests failed:', error.message)
  if (error.detail) console.error('Detail:', error.detail)
  if (error.position) console.error('SQL position:', error.position)
  if (error.where) console.error('Context:', error.where)
  process.exitCode = 1
} finally {
  await database.close()
}
