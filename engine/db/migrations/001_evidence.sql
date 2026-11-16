-- Evidence store for the EPI data engine (phase 1). See docs/superpowers/specs/2026-11-16-epi-data-engine-design.md §6.

create table snapshots (
  id bigserial primary key,
  provider text not null,
  job text not null,
  requested_url text not null,
  source_url text not null,
  fetched_at timestamptz not null,
  observed_at timestamptz,
  http_status int not null,
  content_type text,
  payload_hash text not null,            -- sha256 hex of raw (uncompressed) bytes
  payload bytea,                          -- gzip; null after retention
  payload_bytes int not null,
  payload_expires_at timestamptz,
  collector_version text not null
);
create index snapshots_provider_fetched on snapshots (provider, fetched_at desc);
create index snapshots_hash on snapshots (payload_hash);
create index snapshots_url_fetched on snapshots (requested_url, fetched_at desc);

-- Immutability: no delete; an update may only null the payload (retention).
create function snapshots_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'snapshots are immutable';
  end if;
  if new.payload is not null
     or row(new.id, new.provider, new.job, new.requested_url, new.source_url, new.fetched_at, new.observed_at,
            new.http_status, new.content_type, new.payload_hash, new.payload_bytes, new.payload_expires_at,
            new.collector_version)
        is distinct from
        row(old.id, old.provider, old.job, old.requested_url, old.source_url, old.fetched_at, old.observed_at,
            old.http_status, old.content_type, old.payload_hash, old.payload_bytes, old.payload_expires_at,
            old.collector_version) then
    raise exception 'snapshots are immutable (only payload may be nulled)';
  end if;
  return new;
end $$;
create trigger snapshots_immutable before update or delete on snapshots
  for each row execute function snapshots_guard();

create table tracked_titles (
  id bigserial primary key,
  tmdb_kind text not null check (tmdb_kind in ('movie', 'tv')),
  tmdb_id int not null,
  role text not null check (role in ('market', 'watch', 'cohort')),
  origin_language text,
  release_date date,
  added_at timestamptz not null default now(),
  unique (tmdb_kind, tmdb_id)
);

-- Provider ids discovered from evidence; the phase 2 resolver builds on these.
create table title_links (
  tracked_title_id bigint not null references tracked_titles (id),
  provider text not null,                 -- 'imdb' | 'wikidata' | 'wiki:enwiki' | 'wiki:hiwiki' | ...
  external_id text not null,              -- tt…, Q…, article title
  snapshot_id bigint not null references snapshots (id),
  discovered_at timestamptz not null default now(),
  primary key (tracked_title_id, provider)
);

-- Provider pages found by crawling, not yet matched to titles (Sacnilk).
create table discovered_items (
  provider text not null,
  item_key text not null,                 -- e.g. '/movie/Jailer_2_2026'
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (provider, item_key)
);

create table job_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'ok', 'degraded', 'failed', 'abandoned', 'skipped_locked')),
  snapshots int not null default 0,
  skipped int not null default 0,
  detail jsonb
);
create index job_runs_job_started on job_runs (job, started_at desc);
