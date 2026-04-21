import os
from supabase import create_client, Client

_client: Client | None = None


def get_supabase() -> Client:
    """Return a singleton Supabase service-role client."""
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
        # Explicitly set service role on PostgREST so RLS is bypassed
        _client.postgrest.auth(key)
    return _client
