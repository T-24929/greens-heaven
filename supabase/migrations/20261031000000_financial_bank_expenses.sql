-- Migration: Financial management (Event Bank & Expenses Ledger)
-- Provides expense tracking (debits/deductions) from event ticket revenue
-- Restricted to designated super administrators: hasarinda986@gmail.com, hasaridnda986@gmail.com, sasinduranasinghe121@gmail.com

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0 and length(title) <= 200),
  category text not null check (category in ('venue', 'sound_music', 'food_beverage', 'decor', 'printing', 'logistics', 'security_ops', 'misc')),
  amount_lkr integer not null check (amount_lkr > 0),
  payment_method text not null default 'bank_transfer' check (payment_method in ('bank_transfer', 'cash', 'card', 'online', 'other')),
  expense_date date not null default current_date,
  recipient text check (recipient is null or length(recipient) <= 200),
  receipt_reference text check (receipt_reference is null or length(receipt_reference) <= 100),
  notes text check (notes is null or length(notes) <= 1000),
  status text not null default 'paid' check (status in ('paid', 'planned', 'pending')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_expense_date_idx on public.expenses(expense_date desc);
create index if not exists expenses_category_idx on public.expenses(category);
create index if not exists expenses_status_idx on public.expenses(status);

alter table public.expenses enable row level security;

-- Super Admin helper check in private schema
create or replace function private.is_super_admin()
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(coalesce(u.email, '')) in (
        'hasarinda986@gmail.com',
        'hasaridnda986@gmail.com',
        'sasinduranasinghe121@gmail.com'
      )
  ) and private.is_admin();
$$;

-- RLS Policy on public.expenses
do $$
begin
  drop policy if exists "super_admins_all_expenses" on public.expenses;
  create policy "super_admins_all_expenses"
    on public.expenses
    for all
    to authenticated
    using (private.is_super_admin())
    with check (private.is_super_admin());
end;
$$;

-- Security Definer RPC: record_expense
create or replace function private.record_expense(
  p_title text,
  p_category text,
  p_amount_lkr integer,
  p_payment_method text default 'bank_transfer',
  p_expense_date date default current_date,
  p_recipient text default null,
  p_receipt_reference text default null,
  p_notes text default null,
  p_status text default 'paid'
)
returns public.expenses
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_expense public.expenses;
begin
  if not private.is_super_admin() then
    raise exception 'Only designated super administrators can record expenses.' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Expense title is required.' using errcode = '22023';
  end if;

  if p_amount_lkr is null or p_amount_lkr <= 0 then
    raise exception 'Expense amount must be greater than zero.' using errcode = '22023';
  end if;

  insert into public.expenses (
    title,
    category,
    amount_lkr,
    payment_method,
    expense_date,
    recipient,
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
    coalesce(p_expense_date, current_date),
    nullif(trim(p_recipient), ''),
    nullif(trim(p_receipt_reference), ''),
    nullif(trim(p_notes), ''),
    coalesce(p_status, 'paid'),
    v_admin,
    now(),
    now()
  )
  returning * into v_expense;

  return v_expense;
end;
$$;

create or replace function public.record_expense(
  p_title text,
  p_category text,
  p_amount_lkr integer,
  p_payment_method text default 'bank_transfer',
  p_expense_date date default current_date,
  p_recipient text default null,
  p_receipt_reference text default null,
  p_notes text default null,
  p_status text default 'paid'
)
returns public.expenses
language sql security definer set search_path = ''
as $$
  select private.record_expense(
    p_title,
    p_category,
    p_amount_lkr,
    p_payment_method,
    p_expense_date,
    p_recipient,
    p_receipt_reference,
    p_notes,
    p_status
  );
$$;

-- Security Definer RPC: update_expense
create or replace function private.update_expense(
  p_id uuid,
  p_title text,
  p_category text,
  p_amount_lkr integer,
  p_payment_method text default 'bank_transfer',
  p_expense_date date default current_date,
  p_recipient text default null,
  p_receipt_reference text default null,
  p_notes text default null,
  p_status text default 'paid'
)
returns public.expenses
language plpgsql security definer set search_path = ''
as $$
declare
  v_expense public.expenses;
begin
  if not private.is_super_admin() then
    raise exception 'Only designated super administrators can update expenses.' using errcode = '42501';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'Expense title is required.' using errcode = '22023';
  end if;

  if p_amount_lkr is null or p_amount_lkr <= 0 then
    raise exception 'Expense amount must be greater than zero.' using errcode = '22023';
  end if;

  update public.expenses
  set title = trim(p_title),
      category = coalesce(p_category, 'misc'),
      amount_lkr = p_amount_lkr,
      payment_method = coalesce(p_payment_method, 'bank_transfer'),
      expense_date = coalesce(p_expense_date, current_date),
      recipient = nullif(trim(p_recipient), ''),
      receipt_reference = nullif(trim(p_receipt_reference), ''),
      notes = nullif(trim(p_notes), ''),
      status = coalesce(p_status, 'paid'),
      updated_at = now()
  where id = p_id
  returning * into v_expense;

  if not found then
    raise exception 'Expense record not found.' using errcode = 'P0002';
  end if;

  return v_expense;
end;
$$;

create or replace function public.update_expense(
  p_id uuid,
  p_title text,
  p_category text,
  p_amount_lkr integer,
  p_payment_method text default 'bank_transfer',
  p_expense_date date default current_date,
  p_recipient text default null,
  p_receipt_reference text default null,
  p_notes text default null,
  p_status text default 'paid'
)
returns public.expenses
language sql security definer set search_path = ''
as $$
  select private.update_expense(
    p_id,
    p_title,
    p_category,
    p_amount_lkr,
    p_payment_method,
    p_expense_date,
    p_recipient,
    p_receipt_reference,
    p_notes,
    p_status
  );
$$;

-- Security Definer RPC: delete_expense
create or replace function private.delete_expense(p_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Only designated super administrators can delete expenses.' using errcode = '42501';
  end if;

  delete from public.expenses where id = p_id;
  if not found then
    raise exception 'Expense record not found.' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

create or replace function public.delete_expense(p_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select private.delete_expense(p_id);
$$;
