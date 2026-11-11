CREATE TABLE tenants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_code UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(255) UNIQUE,
    address TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'owner'
        CHECK (role IN ('owner', 'manager', 'employee')),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email),
    UNIQUE (tenant_id, id)
);

CREATE TABLE subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_name VARCHAR(100) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly'
        CHECK (billing_period = 'monthly'),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
    FOR ALL
    USING (
        id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    )
    WITH CHECK (
        id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    );

CREATE POLICY user_tenant_isolation ON users
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    )
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    );

CREATE POLICY subscription_tenant_isolation ON subscriptions
    FOR ALL
    USING (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    )
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::BIGINT
    );

CREATE OR REPLACE FUNCTION register_tenant(
    p_tenant_name VARCHAR(150),
    p_tenant_phone VARCHAR(30),
    p_tenant_email VARCHAR(255),
    p_tenant_address TEXT,
    p_owner_name VARCHAR(150),
    p_owner_email VARCHAR(255),
    p_password_hash TEXT
)
RETURNS TABLE (
    new_tenant_id BIGINT,
    new_user_id BIGINT,
    new_tenant_code UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_tenant_id BIGINT;
    v_user_id BIGINT;
    v_tenant_code UUID;
BEGIN
    IF NULLIF(BTRIM(p_tenant_name), '') IS NULL
       OR NULLIF(BTRIM(p_owner_name), '') IS NULL
       OR NULLIF(BTRIM(p_owner_email), '') IS NULL
       OR NULLIF(p_password_hash, '') IS NULL THEN
        RAISE EXCEPTION 'Required registration data is missing';
    END IF;

    INSERT INTO public.tenants (name, phone, email, address)
    VALUES (
        BTRIM(p_tenant_name),
        NULLIF(BTRIM(p_tenant_phone), ''),
        NULLIF(LOWER(BTRIM(p_tenant_email)), ''),
        p_tenant_address
    )
    RETURNING id, tenant_code
    INTO v_tenant_id, v_tenant_code;

    INSERT INTO public.users (
        tenant_id, full_name, email, password_hash, role
    )
    VALUES (
        v_tenant_id,
        BTRIM(p_owner_name),
        LOWER(BTRIM(p_owner_email)),
        p_password_hash,
        'owner'
    )
    RETURNING id INTO v_user_id;

    RETURN QUERY
    SELECT v_tenant_id, v_user_id, v_tenant_code;
END;
$$;

REVOKE ALL ON FUNCTION register_tenant(
    VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION register_tenant(
    VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, TEXT
) TO barberpro_app;

-- Secure login lookup for the application backend
CREATE OR REPLACE FUNCTION authenticate_user(
    p_tenant_code UUID,
    p_email VARCHAR(255)
)
RETURNS TABLE (
    authenticated_user_id BIGINT,
    authenticated_tenant_id BIGINT,
    authenticated_role VARCHAR(30),
    stored_password_hash TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
    IF p_tenant_code IS NULL
       OR NULLIF(BTRIM(p_email), '') IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.tenant_id,
        u.role,
        u.password_hash
    FROM public.users AS u
    INNER JOIN public.tenants AS t
        ON t.id = u.tenant_id
    WHERE t.tenant_code = p_tenant_code
      AND LOWER(u.email) = LOWER(BTRIM(p_email))
      AND t.status = 'active'
      AND u.status = 'active'
    LIMIT 1;
END;
$$;

ALTER FUNCTION authenticate_user(UUID, VARCHAR)
OWNER TO neondb_owner;

REVOKE ALL ON FUNCTION authenticate_user(UUID, VARCHAR)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION authenticate_user(UUID, VARCHAR)
TO barberpro_app;

ALTER FUNCTION register_tenant(
    VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, TEXT
)
OWNER TO neondb_owner;

-- Runtime permissions for the application role
GRANT SELECT ON public.tenants TO barberpro_app;
GRANT SELECT ON public.users TO barberpro_app;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO barberpro_app;
