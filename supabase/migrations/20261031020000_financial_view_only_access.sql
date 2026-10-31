-- Migration: Financial management (View-only financial access)
-- Grants read-only (SELECT) access to financial ledgers (expenses, external_incomes)
-- for designated administrator: nethmithakariyawasam@gmail.com
-- Super admins retain full management rights (SELECT, INSERT, UPDATE, DELETE).
-- RPC functions (record_expense, update_expense, delete_expense, record_external_income, update_external_income, delete_external_income)
-- remain strictly restricted to private.is_super_admin().

-- Helper function in private schema to check if caller has financial read access
create or replace function private.can_view_financials()
returns boolean
language sql security definer set search_path = ''
as $$
  select private.is_super_admin() or (
    exists (
      select 1
      from auth.users u
      where u.id = auth.uid()
        and lower(coalesce(u.email, '')) in (
          'nethmithakariyawasam@gmail.com'
        )
    ) and private.is_admin()
  );
$$;

-- Update RLS policies on public.expenses
do $$
begin
  drop policy if exists "super_admins_all_expenses" on public.expenses;
  drop policy if exists "financial_view_only_select_expenses" on public.expenses;
  drop policy if exists "super_admins_insert_expenses" on public.expenses;
  drop policy if exists "super_admins_update_expenses" on public.expenses;
  drop policy if exists "super_admins_delete_expenses" on public.expenses;

  -- Read access: Super admins and financial view-only admins
  create policy "financial_view_only_select_expenses"
    on public.expenses
    for select
    to authenticated
    using (private.can_view_financials());

  -- Write access: Super admins only
  create policy "super_admins_insert_expenses"
    on public.expenses
    for insert
    to authenticated
    with check (private.is_super_admin());

  create policy "super_admins_update_expenses"
    on public.expenses
    for update
    to authenticated
    using (private.is_super_admin())
    with check (private.is_super_admin());

  create policy "super_admins_delete_expenses"
    on public.expenses
    for delete
    to authenticated
    using (private.is_super_admin());
end;
$$;

-- Update RLS policies on public.external_incomes
do $$
begin
  drop policy if exists "super_admins_all_external_incomes" on public.external_incomes;
  drop policy if exists "financial_view_only_select_external_incomes" on public.external_incomes;
  drop policy if exists "super_admins_insert_external_incomes" on public.external_incomes;
  drop policy if exists "super_admins_update_external_incomes" on public.external_incomes;
  drop policy if exists "super_admins_delete_external_incomes" on public.external_incomes;

  -- Read access: Super admins and financial view-only admins
  create policy "financial_view_only_select_external_incomes"
    on public.external_incomes
    for select
    to authenticated
    using (private.can_view_financials());

  -- Write access: Super admins only
  create policy "super_admins_insert_external_incomes"
    on public.external_incomes
    for insert
    to authenticated
    with check (private.is_super_admin());

  create policy "super_admins_update_external_incomes"
    on public.external_incomes
    for update
    to authenticated
    using (private.is_super_admin())
    with check (private.is_super_admin());

  create policy "super_admins_delete_external_incomes"
    on public.external_incomes
    for delete
    to authenticated
    using (private.is_super_admin());
end;
$$;

-- Table-level grants for authenticated users (enforced by RLS above)
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.external_incomes to authenticated;

