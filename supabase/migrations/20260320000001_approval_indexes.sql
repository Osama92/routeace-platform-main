-- Indexes to speed up approval status filtering on all approval tables

-- invoices
create index if not exists idx_invoices_approval_status on invoices(approval_status);
create index if not exists idx_invoices_submitted_by on invoices(submitted_by);
create index if not exists idx_invoices_first_approver_id on invoices(first_approver_id);
create index if not exists idx_invoices_second_approver_id on invoices(second_approver_id);

-- expenses
create index if not exists idx_expenses_approval_status on expenses(approval_status);
create index if not exists idx_expenses_submitted_by on expenses(submitted_by);
create index if not exists idx_expenses_first_approver_id on expenses(first_approver_id);
create index if not exists idx_expenses_second_approver_id on expenses(second_approver_id);

-- dispatches
create index if not exists idx_dispatches_approval_status on dispatches(approval_status);

-- drivers
create index if not exists idx_drivers_approval_status on drivers(approval_status);

-- vehicles
create index if not exists idx_vehicles_approval_status on vehicles(approval_status);

-- profiles (used by approval lookups and user approval screens)
create index if not exists idx_profiles_approval_status on profiles(approval_status);

-- approval_roles (queried per user on every expense approvals page load)
create index if not exists idx_approval_roles_user_id on approval_roles(user_id);
