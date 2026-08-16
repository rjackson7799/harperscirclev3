-- ============================================================================
-- 1A · M9 — hc.create_circle(): the founder path, custodianship first.
--
-- TSD §2.3: the custodianship declaration is written to access_log BEFORE
-- any other row for that circle exists — before subjects, before the
-- founder's membership, before grants — and it is seq = 1 in the circle's
-- hash chain (AC-AUTH-6, PRD §7.5). The circles row itself is the one
-- FK-required exception (access_log.circle_id references circles).
--
-- The declarations precede the subject rows themselves, so they name the
-- subject in detail (subject_id is necessarily null — the row it precedes
-- cannot be referenced yet); the chain position IS the receipt.
-- ============================================================================

-- The founder's display name is read as hc_internal at declaration time.
grant select on public.accounts to hc_internal;
create policy accounts_internal on public.accounts
  for select to hc_internal using (true);

-- The creation writes, granted with the one function that performs them
-- (creation, ownership, revoke and grants atomic within one migration —
-- the definer-invariant discipline). FORCE RLS applies to hc_internal too,
-- so each grant is paired with its named policy; no UPDATE and no DELETE
-- anywhere — creation only.
grant insert on public.circles, public.subjects,
                public.circle_members, public.access_grants
  to hc_internal;
-- INSERT ... RETURNING reads the returned columns: SELECT rides along.
grant select on public.circles to hc_internal;
create policy circles_internal on public.circles
  for select to hc_internal using (true);
create policy circles_internal_create on public.circles
  for insert to hc_internal with check (true);
create policy subjects_internal_create on public.subjects
  for insert to hc_internal with check (true);
create policy circle_members_internal_create on public.circle_members
  for insert to hc_internal with check (true);
create policy access_grants_internal_create on public.access_grants
  for insert to hc_internal with check (true);

create function hc.create_circle(
  p_name            text,
  p_subjects        jsonb,
  p_opening_context text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_display text;
  v_circle  uuid;
  v_founder uuid;
  v_subject uuid;
  v_member  uuid;
  v_ids     uuid[] := '{}'::uuid[];
  s         jsonb;
  d         hc.domain;
begin
  v_account := hc.uid();
  if v_account is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select a.display_name into v_display
  from public.accounts a where a.id = v_account;
  if v_display is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- The two-subject cap (PRD §2): not expressible as a table CHECK, so it
  -- is enforced here, in the one function that creates subjects in 1A,
  -- under the same per-circle advisory lock discipline later subject
  -- additions must take (§2.3 note).
  if p_subjects is null
     or jsonb_typeof(p_subjects) <> 'array'
     or jsonb_array_length(p_subjects) not between 1 and 2 then
    raise exception 'invalid_subjects' using errcode = 'P0001';
  end if;

  insert into public.circles (name, opening_context, created_by)
  values (p_name, p_opening_context, v_account)
  returning id into v_circle;

  perform pg_advisory_xact_lock(hashtext('circle:' || v_circle::text));

  -- FIRST: the custodianship declarations, seq 1 (and 2), before subjects,
  -- before the founder's membership, before grants (AC-AUTH-6). The subject
  -- is named in detail; its row does not exist yet, by design.
  for s in select * from jsonb_array_elements(p_subjects) loop
    perform hc.log(v_circle, 'custodianship_declared', v_display, v_account,
                   p_detail => jsonb_build_object(
                     'subject_name', s ->> 'first_name',
                     'custodian', v_display,
                     'declared_on', to_char(now(), 'YYYY-MM-DD')));
  end loop;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (v_circle, v_account, 'coordinator', v_display)
  returning id into v_founder;

  perform hc.log(v_circle, 'member_joined', v_display, v_account);

  for s in select * from jsonb_array_elements(p_subjects) loop
    insert into public.subjects
      (circle_id, first_name, situation, postal_code, timezone,
       accent_color, forwarding_local_part)
    values
      (v_circle, s ->> 'first_name', s ->> 'situation', s ->> 'postal_code',
       s ->> 'timezone', s ->> 'accent_color', s ->> 'forwarding_local_part')
    returning id into v_subject;
    v_ids := v_ids || v_subject;

    insert into public.circle_members
      (circle_id, subject_id, custodian_member_id, tier, display_name_at_join)
    values
      (v_circle, v_subject, v_founder, 'coordinator', s ->> 'first_name')
    returning id into v_member;

    foreach d in array hc.all_domains() loop
      insert into public.access_grants
        (circle_id, member_id, subject_id, domain, level, granted_by)
      values
        (v_circle, v_founder, v_subject, d, 'manage', v_account),
        (v_circle, v_member,  v_subject, d, 'manage', v_account);
    end loop;
  end loop;

  return jsonb_build_object(
    'circle_id', v_circle,
    'founder_member_id', v_founder,
    'subject_ids', to_jsonb(v_ids));
end $$;

alter function hc.create_circle(text, jsonb, text[]) owner to hc_internal;
revoke execute on function hc.create_circle(text, jsonb, text[])
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.create_circle(text, jsonb, text[]) to authenticated;
