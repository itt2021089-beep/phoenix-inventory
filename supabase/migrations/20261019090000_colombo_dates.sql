-- Business dates that the database fills in itself are the Sri Lanka date, not the UTC one.
--
-- Found in the pre-go-live check (15/10/2026, about 04:30 in Colombo): Supabase runs in UTC, and
-- `current_date` is the UTC date, which is still yesterday until 05:30 Sri Lanka time. Every
-- screen sends its own Colombo date, so the one visible case was a QR fault report: filed at
-- 04:20 on 15/10, it was saved as reported on 14/10 and showed as a day old. The views already
-- use Asia/Colombo (migration reminders_costs_swap); this brings everything else in line.
--
-- Two parts, and no function body is rewritten:
--   1. The five date columns default to the Colombo date.
--   2. Every function that falls back to `current_date` runs with timezone Asia/Colombo, so
--      that fallback (and the date a closed fault gets in fault_log_fill) is the Colombo date.
--      `now()` and every timestamptz value are unchanged: they are moments, not dates.
--
-- A function created or replaced later must keep `set timezone = 'Asia/Colombo'` if it uses
-- current_date (create or replace drops a setting it does not repeat). supabase/tests/dates.sql
-- fails if one does not.

alter table public.change_log      alter column change_date   set default (now() at time zone 'Asia/Colombo')::date;
alter table public.fault_log       alter column date_reported set default (now() at time zone 'Asia/Colombo')::date;
alter table public.handover_forms  alter column form_date     set default (now() at time zone 'Asia/Colombo')::date;
alter table public.service_jobs    alter column service_date  set default (now() at time zone 'Asia/Colombo')::date;
alter table public.stock_movements alter column movement_date set default (now() at time zone 'Asia/Colombo')::date;

alter function public.add_assets(smallint, integer, jsonb, text[])                    set timezone = 'Asia/Colombo';
alter function public.issue_assets(uuid, jsonb, smallint, date, text, boolean)        set timezone = 'Asia/Colombo';
alter function public.return_assets(jsonb, text, text, text, boolean, date, smallint) set timezone = 'Asia/Colombo';
alter function public.transfer_assets(uuid, uuid, uuid[], boolean, date, text)        set timezone = 'Asia/Colombo';
alter function public.move_asset(uuid, smallint, smallint, text, date)                set timezone = 'Asia/Colombo';
alter function public._end_of_life(uuid, text, text, date)                            set timezone = 'Asia/Colombo';
alter function public.import_workbook(jsonb)                                          set timezone = 'Asia/Colombo';
alter function public.fault_log_fill()                                                set timezone = 'Asia/Colombo';
alter function public.record_service_job(jsonb, jsonb)                                set timezone = 'Asia/Colombo';
alter function public.send_for_repair(uuid, bigint, bigint, date, text)               set timezone = 'Asia/Colombo';
alter function public.back_from_repair(uuid, text, text, date, text)                  set timezone = 'Asia/Colombo';
alter function public.swap_asset(uuid, uuid, text, date, bigint)                      set timezone = 'Asia/Colombo';
