-- Esquema inicial: job-search-automation
-- Se ejecuta automáticamente al crear el volumen de Postgres (docker-entrypoint-initdb.d)

CREATE TYPE posting_status AS ENUM (
    'discovered',
    'scored',
    'queued_for_application',
    'pending_review',      -- LinkedIn: espera aprobación humana antes de postular
    'rejected_by_score',   -- bajo el umbral, no se postula
    'applied',
    'application_failed',
    'response_received'
);

CREATE TYPE source_platform AS ENUM (
    'linkedin',
    'greenhouse',
    'lever',
    'workday',
    'getonboard',          -- job board Chile/LATAM (discovery vía API pública; apply requiere login)
    'computrabajo',        -- portal Chile/LATAM (discovery vía scraping HTML público; apply requiere login)
    'remoteok',            -- board remoto global (discovery vía API pública JSON; roles en USD, mayormente inglés)
    'indeed',              -- portal global/Chile (tras Cloudflare: discovery vía scraper CDP con browser real; apply requiere login)
    'laborum',             -- portal Chile/LATAM (tras Cloudflare: discovery vía scraper CDP con browser real; apply requiere login)
    'other_open_ats'
);

CREATE TYPE response_type AS ENUM (
    'rejection',
    'interview_request',
    'info_request',
    'auto_ack',
    'unknown'
);

CREATE TABLE postings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          source_platform NOT NULL,
    source_job_id   TEXT NOT NULL,          -- id nativo del portal, para dedupe
    company         TEXT NOT NULL,
    title           TEXT NOT NULL,
    location        TEXT,
    url             TEXT NOT NULL,
    description_raw TEXT,
    discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          posting_status NOT NULL DEFAULT 'discovered',
    UNIQUE (source, source_job_id)
);

CREATE TABLE scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posting_id      UUID NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
    score           SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
    reasoning       TEXT,
    model_used      TEXT,
    scored_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    posting_id      UUID NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
    applied_at      TIMESTAMPTZ,
    method          TEXT,                   -- 'playwright_auto', 'easy_apply_semi', etc.
    approved_by_human BOOLEAN NOT NULL DEFAULT false,
    error_message   TEXT
);

CREATE TABLE email_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  UUID REFERENCES applications(id) ON DELETE SET NULL,
    gmail_message_id TEXT NOT NULL UNIQUE,
    from_address    TEXT,
    subject         TEXT,
    received_at     TIMESTAMPTZ NOT NULL,
    classified_as   response_type,
    classified_at   TIMESTAMPTZ
);

CREATE INDEX idx_postings_status ON postings(status);
CREATE INDEX idx_postings_source ON postings(source);
CREATE INDEX idx_scores_posting ON scores(posting_id);
CREATE INDEX idx_applications_posting ON applications(posting_id);
