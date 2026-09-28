-- ============================================================================
-- Tarbiyah Institute — adding a teacher without opening a SQL editor
-- ============================================================================
-- Sh Badawy is the only teacher because adding one has meant somebody writing
-- INSERT by hand. This gives the institute a form instead.
--
-- Two rows per teacher, as for a student: a `people` row for the human and a
-- `teachers` row for the role. save_teacher writes both in one transaction so a
-- half-made teacher cannot exist.
--
-- The email is the important field. handle_auth_user_confirmed claims a person
-- record by address, so recording it means the teacher signs in with Google and
-- arrives at their own gradebook — no second step, and nobody to ask.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Is this person actually somebody, or a shell left by a sign-in?
-- ---------------------------------------------------------------------------
-- save_teacher runs as the caller so RLS decides what it may write, and
-- `authenticated` is deliberately denied the admins table entirely. This one
-- question needs to see it, so it is elevated — and it only ever answers
-- true or false about a person id. It lives in `app`, which PostgREST does
-- not expose, so it is unreachable from the API.
create or replace function app.person_is_attached(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.students   where person_id = p_person)
      or exists (select 1 from public.teachers   where person_id = p_person)
      or exists (select 1 from public.admins     where person_id = p_person)
      or exists (select 1 from public.seat_holds where person_id = p_person);
$$;


create or replace function public.save_teacher(
  p_teacher_id uuid   default null,
  p_title      text   default null,
  p_first_name text   default null,
  p_last_name  text   default null,
  p_email      text   default null,
  p_bio        text   default null,
  p_is_active  boolean default true
)
returns uuid
language plpgsql
security invoker            -- RLS decides; only admins hold write on either table
set search_path = ''
as $$
declare
  v_person  uuid;
  v_teacher uuid := p_teacher_id;
  v_first   text := nullif(trim(p_first_name), '');
  v_last    text := nullif(trim(p_last_name), '');
  v_email   text := nullif(trim(p_email), '');
  v_title   text := nullif(trim(p_title), '');
  v_bio     text := nullif(trim(p_bio), '');
  v_rival       uuid;
  v_rival_login uuid;
begin
  if v_first is null or v_last is null then
    raise exception 'A first and last name are required'
      using errcode = 'invalid_parameter_value';
  end if;

  if v_teacher is null then
    -- An address already on file belongs to somebody. Attach the role to that
    -- person rather than creating a second record of the same human — a
    -- student who starts teaching keeps one identity, and one login.
    if v_email is not null then
      select id into v_person from public.people where lower(email) = lower(v_email);
    end if;

    if v_person is null then
      insert into public.people (title, first_name, last_name, email)
      values (v_title, v_first, v_last, v_email)
      returning id into v_person;
    end if;

    if exists (select 1 from public.teachers where person_id = v_person) then
      raise exception 'That person is already a teacher'
        using errcode = 'unique_violation';
    end if;

    insert into public.teachers (person_id, bio, is_active)
    values (v_person, v_bio, p_is_active)
    returning id into v_teacher;
  else
    select person_id into v_person from public.teachers where id = v_teacher;
    if v_person is null then
      raise exception 'No such teacher' using errcode = 'invalid_parameter_value';
    end if;

    -- The likeliest mistake: a teacher was added without an address, signed in
    -- with Google anyway, and that sign-in created a bare record holding the
    -- address. Typing it in now would collide with people_email_unique and
    -- leave the admin stuck. Adopt that login instead — but only when the
    -- other record is genuinely empty. A person with enrolments or marks is a
    -- real human, and merging two of those is not a decision to take silently.
    if v_email is not null then
      select id into v_rival
        from public.people
       where lower(email) = lower(v_email) and id <> v_person;

      if v_rival is not null then
        if app.person_is_attached(v_rival) then
          raise exception
            '% already belongs to somebody else on file. Open their record instead.', v_email
            using errcode = 'unique_violation';
        end if;

        select auth_user_id into v_rival_login from public.people where id = v_rival;

        -- Delete before assigning: auth_user_id is unique, so the shell has to
        -- let go of the login before this record can take it.
        delete from public.people where id = v_rival;

        if v_rival_login is not null then
          update public.people set auth_user_id = v_rival_login where id = v_person;
        end if;
      end if;
    end if;

    update public.people
       set title      = v_title,
           first_name = v_first,
           last_name  = v_last,
           -- Blanking the address would silently detach a login they already
           -- use, so a blank means "leave it alone", not "remove it".
           email      = coalesce(v_email, email)
     where id = v_person;

    update public.teachers
       set bio = v_bio, is_active = p_is_active
     where id = v_teacher;
  end if;

  return v_teacher;
end;
$$;

comment on function public.save_teacher is
  'Creates or updates a teacher and the person behind them in one transaction. '
  'An email already on file attaches the role to that person instead of '
  'duplicating them.';

grant execute on function public.save_teacher(uuid, text, text, text, text, text, boolean)
  to authenticated;


-- ---------------------------------------------------------------------------
-- A signed-in student could read a teacher's phone number
-- ---------------------------------------------------------------------------
-- people_read_active_teachers was granted to anon AND authenticated. For anon
-- that is safe: 20260923121000 restricted anon to four display columns, so the
-- policy can only ever surface a name. authenticated holds SELECT on every
-- column, so the same policy handed any signed-in student a teacher's email,
-- phone and date of birth. Empty today, and filled in by the form this
-- migration adds — which is why it is fixed now rather than later.
--
-- Column grants cannot vary per row, so the fix is to stop signed-in users
-- reading the raw row at all and let them reach the directory instead. That
-- makes teacher_directory elevated again, as it was before 20260923121000.
-- The trade is deliberate: that migration removed the elevation because column
-- grants covered anon, and they cannot cover authenticated. The view's SELECT
-- list is the boundary now, so it lists display columns only — adding email to
-- it would publish email.
alter view public.teacher_directory set (security_invoker = off);

alter policy people_read_active_teachers on public.people to anon;

comment on view public.teacher_directory is
  'Instructor profiles for the catalogue. Runs elevated because signed-in '
  'users are no longer permitted the underlying people row. Display columns '
  'ONLY — never add email, phone or date_of_birth here.';
