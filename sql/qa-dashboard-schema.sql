-- qa-kit cross-app dashboard schema. Apply to the DEDICATED Supabase project:
--   psql "$QA_DASHBOARD_DB_URL" -f sql/qa-dashboard-schema.sql
-- Idempotent: re-running is safe.

create table if not exists qa_findings (
  app          text   not null,
  id           text   not null,            -- Finding.id (stable hash)
  run_id       text   not null,
  dimension    text   not null,
  severity     text   not null,
  title        text   not null,
  location     jsonb  not null default '{}'::jsonb,
  evidence     text   not null default '',
  repro        text   not null default '',
  verified_by  text   not null,
  status       text   not null,
  score        jsonb,                       -- {value,max,weight?,rubricKey} or null
  suggested_fix text,
  first_seen   text   not null,
  last_seen    text   not null,
  ingested_at  timestamptz not null default now(),
  primary key (app, id)
);
create index if not exists qa_findings_app_dim_sev_idx on qa_findings (app, dimension, severity);
create index if not exists qa_findings_status_idx on qa_findings (status);

create table if not exists qa_score_trend (
  app        text not null,
  stable_id  text not null,
  dimension  text not null,
  rubric_key text not null,
  value      double precision not null,
  max        double precision not null,
  weight     double precision,
  run_id     text not null,
  persona    text,
  ts         timestamptz not null,
  primary key (app, stable_id, run_id)      -- one datapoint per metric per run
);
create index if not exists qa_score_trend_app_rubric_ts_idx on qa_score_trend (app, rubric_key, ts);

-- One board: per app × dimension × severity, confirmed-open counts; plus per-app freshness.
create or replace view qa_dashboard_summary as
with latest as (
  select app, max(ingested_at) as latest_ingest from qa_findings group by app
)
select
  f.app,
  f.dimension,
  f.severity,
  count(*) filter (where f.status = 'confirmed') as confirmed_open,
  count(*)                                       as total,
  l.latest_ingest,
  extract(epoch from (now() - l.latest_ingest)) / 86400.0 as days_since_last_sweep
from qa_findings f
join latest l on l.app = f.app
group by f.app, f.dimension, f.severity, l.latest_ingest;
