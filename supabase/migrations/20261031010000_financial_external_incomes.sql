-- Migration: Financial management (External Incomes Ledger)
-- Provides external income tracking (credits/injections such as sponsorships, donations, stalls, merchandise, bulk tickets)
-- Restricted to designated super administrators: hasarinda986@gmail.com, hasaridnda986@gmail.com, sasinduranasinghe121@gmail.com

create table if not exists public.external_incomes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  category text not null check (category in ('sponsorship', 'donation', 'stall_vendor', 'merchandise', 'ticket_bulk', 'misc')),
  amount_lkr integer not null check (amount_lkr > 0),
  payment_method text not null default 'bank_transfer' check (payment_method in ('bank_transfer', 'cash', 'card', 'online', 'other')),
  income_date date not null default current_date,
  payer text check (payer is null or length(payer) <= 200),
  receipt_reference text check (receipt_reference is null or length(receipt_reference) <= 100),
  notes text check (notes is null or length(notes) <= 1000),
  status text not null default 'received' check (status in ('received', 'pledged', 'pending')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_incomes_income_date_idx on public.external_incomes(income_date desc);
create index if not exists external_incomes_category_idx on public.external_incomes(category);
create index if not exists external_incomes_status_idx on public.external_incomes(status);

alter table public.external_incomes enable row level security;

-- RLS Policy on public.external_incomes
do $$
begin
  drop policy if exists "super_admins_all_external_incomes" on public.external_incomes;
  create policy "super_admins_all_external_incomes"
    on public.external_incomes
    for all
    to authenticated
    using (private.is_super_admin())
    with check (private.is_super_admin());
end;
$$;

-- Security Definer RPC: record_external_income
create or replace function private.record_external_income(
  p_title text,
  p_category text,
  p_amount_lkr integer,
  p_payment_method text default 'bank_transfer',
  p_income_date date default current_date,
  p_payer text default null,
  p_receipt_reference text default null,
  p_notes text default null,
  p_status text default 'received'
)
returns public.external_incomes
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_income public.external_incomes;
begin
  if not private.is_super_admin() then
    raise exception 'Only designated super administrators can record external incomes.' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Income title is required.' using errcode = '22023';
  end if;

  if p_amount_lkr is null or p_amount_lkr <= 0 then
    raise exception 'Income amount must be greater than zero.' using errcode = '22023';
  end if;

  insert into public.external_incomes (
    title,
    category,
    amount_lkr,
    payment_method,
    income_date,
    payer,
    receipt_reference,
    notes,
    status,
    created_by,
    created_at,
    updated_at
  ) values (
    trim(p_title),
    coalesce(p_category, 'misc'),
    p_amount_lkr,
    coalesce(p_payment_method, 'bank_transfer'),
    coalesce(p_income_date, current_date),
    nullif(trim(p_payer), ''),
    nullif(trim(p_receipt_reference), ''),
    nullif(trim(p_notes), ''),
    coalesce(p_status, 'received'),
    v_admin,
    now(),
    now()
  )
  returning * into v_income;

  return v_income;
end;
$$;

create or replace function public.record_external_income(
  p_title text,
  p_category text,
  p_amount_lkr integer,
  p_payment_method text default 'bank_transfer',
  p_income_date date default current_date,
  p_payer text default null,
  p_receipt_reference text default null,
  p_notes text default null,
  p_status text default 'received'
)
returns public.external_incomes
language sql security definer set search_path = ''
as $$
  select private.record_external_income(
    p_title,
    p_category,
    p_amount_lkr,
    p_payment_method,
    p_income_date,
    p_payer,
    p_receipt_reference,
    p_notes,
    p_status
  );
$$;

-- Security Definer RPC: update_external_income
create or replace function private.update_external_income(
  p_id uuid,
  p_title text,
  p_category text,
  p_amount_lkr integer,
  p_payment_method text default 'bank_transfer',
  p_income_date date default current_date,
  p_payer text default null,
  p_receipt_reference text default null,
  p_notes text default null,
  p_status text default 'received'
)
returns public.external_incomes
language plpgsql security definer set search_path = ''
as $$
declare
  v_income public.external_incomes;
begin
  if not private.is_super_admin() then
    raise exception 'Only designated super administrators can update external incomes.' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Income title is required.' using errcode = '22023';
  end if;

  if p_amount_lkr is null or p_amount_lkr <= 0 then
    raise exception 'Income amount must be greater than zero.' using errcode = '22023';
  end if;

  update public.external_incomes
  set title = trim(p_title),
      category = coalesce(p_category, 'misc'),
      amount_lkr = p_amount_lkr,
      payment_method = coalesce(p_payment_method, 'bank_transfer'),
      income_date = coalesce(p_income_date, current_date),
      payer = nullif(trim(p_payer), ''),
      receipt_reference = nullif(trim(p_receipt_reference), ''),
      notes = nullif(trim(p_notes), ''),
      status = coalesce(p_status, 'received'),
      updated_at = now()
  where id = p_id
  returning * into v_income;

  if not found then
    raise exception 'External income record not found.' using errcode = 'P0002';
  end if;

  return v_income;
end;
$$;

create or replace function public.update_external_income(
  p_id uuid,
  p_title text,
  p_category text,
  p_amount_lkr integer,
  p_payment_method text default 'bank_transfer',
  p_income_date date default current_date,
  p_payer text default null,
  p_receipt_reference text default null,
  p_notes text default null,
  p_status text default 'received'
)
returns public.external_incomes
language sql security definer set search_path = ''
as $$
  select private.update_external_income(
    p_id,
    p_title,
    p_category,
    p_amount_lkr,
    p_payment_method,
    p_income_date,
    p_payer,
    p_receipt_reference,
    p_notes,
    p_status
  );
$$;

-- Security Definer RPC: delete_external_income
create or replace function private.delete_external_income(p_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Only designated super administrators can delete external incomes.' using errcode = '42501';
  end if;

  delete from public.external_incomes where id = p_id;
  if not found then
    raise exception 'External income record not found.' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

create or replace function public.delete_external_income(p_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select private.delete_external_income(p_id);
$$;
