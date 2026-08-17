-- Pegá todo este bloque en Supabase: menú izquierdo > SQL Editor > New query > pegar > Run

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee text not null check (assignee in ('ariel','vale')),
  priority text not null default 'normal' check (priority in ('normal','urgent')),
  due_date date,
  created_at timestamptz not null default now(),
  created_by text,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by text,
  note text
);

-- Seguridad: solo se puede leer/escribir con el link de la app (sin login formal),
-- por eso las políticas quedan abiertas. No compartas la URL de la app públicamente.
alter table public.tasks enable row level security;

create policy "allow read for all" on public.tasks
  for select using (true);

create policy "allow insert for all" on public.tasks
  for insert with check (true);

create policy "allow update for all" on public.tasks
  for update using (true);

-- Activar sincronización en tiempo real para esta tabla
alter publication supabase_realtime add table public.tasks;
