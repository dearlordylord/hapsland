# Linux credential lifecycle evidence

The JSON record in this directory contains only mechanism, status and timing evidence. The probe
used a disposable session bus, HOME, runtime directory and GNOME Keyring login collection. It ran
the compiled package helper as separate processes for probe, store, read, replace, read, delete and
post-delete read. Synthetic credential values, keyring password, local paths and provider responses
were not retained.

The runtime adapter uses `SECRET_SEARCH_ALL | SECRET_SEARCH_LOAD_SECRETS` for hook/resident reads.
It never supplies `SECRET_SEARCH_UNLOCK`, so a background lookup cannot initiate an unlock prompt.
The parent process kills the helper at 750 ms. Deterministic tests separately cover timeout,
unavailable/locked storage, replacement preservation, delete-failure suspension, environment
precedence and generation invalidation.
