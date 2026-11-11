import os

# ollama 0.6 builds a default httpx client at import time, and httpx 0.28 parses
# NO_PROXY entries as URLs, rejecting bracketed IPv6 like [::1]. Drop only those
# entries so importing the AI services doesn't crash on typical shell defaults.
for _var in ("NO_PROXY", "no_proxy"):
    if _var in os.environ:
        os.environ[_var] = ",".join(
            p for p in os.environ[_var].split(",") if not p.strip().startswith("[")
        )
