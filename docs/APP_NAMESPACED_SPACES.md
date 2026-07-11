# App-Namespaced Spaces

A lightweight, self-describing convention that lets specialized clients (a wiki, a chess
app, a marketplace, …) run on the shared swimchain network **without polluting the general
social clients** (forum, feed, chat, search) — and without inventing a new protocol
primitive. It reuses the one thing spaces already have: a **name**.

## The convention

A space whose on-chain name has the form

```
@<app>:<display>
```

belongs to the app namespace `<app>`, where:

- `<app>` matches `[a-z0-9-]{1,32}` (e.g. `wiki`, `chess`, `market`).
- `<display>` is the human-facing name (may contain any characters, including `:`).

Examples: `@wiki:Minecraft`, `@chess:Ruy Lopez`.

## Deterministic, shared ids

An app space is **name-addressed** (like profile spaces are pubkey-addressed): its id is

```
space_id = sha256("app:<app>:v1:<display>")[..16]
```

so a given `@<app>:<display>` resolves to **one shared space** for everyone — two people
who both create `@wiki:Minecraft` land in the same namespace. `create_space` derives this id
(instead of the usual PoW-hash id) whenever the requested name is an app marker, and returns
the existing space idempotently if it is already registered. Anti-abuse PoW is still required.

The derivation also **prevents spoofing**: a normal space that merely happens to be named
`@wiki:x` gets a random PoW id, which won't equal `sha256("app:wiki:v1:x")[..16]`, so it is
**not** treated as an app space. A space counts as an app space only if its name parses as a
marker *and* its id matches the derivation.

## What the node exposes

`list_spaces` returns, per space:

- `app`: `"wiki"` / `"chess"` / … when the space is an app space, else `null`.
- `name`: the **clean** display name (the `@<app>:` marker is stripped).

So clients never have to parse markers or recompute hashes — they filter on `app`.

## The filtering rule (client-side)

- **General clients** (forum, feed, chat, search): show only spaces where `app == null`.
  They hide **every** app namespace, so no specialized content ever pollutes the default
  experience — including apps that did not exist when the client was built.
- **A specialized client** for app `X` (e.g. the wiki client, `X = "wiki"`): shows only
  spaces where `app == X`.

That is the entire contract. Adding a new specialized app is purely a client concern: pick an
app id, name your spaces `@<id>:<display>`, and filter on `app === "<id>"`. The general clients
already ignore you.

## Where it lives

- Node: `parse_app_space_name`, `app_space_id_16`, `resolve_app_space`, `create_space`, and
  `list_spaces` in `src/rpc/methods.rs`; `SpaceSummary.app` in `src/rpc/types.rs`.
- Wiki client (`app = "wiki"`): `wiki-client/src/lib/appNamespace.ts` and the namespace hooks.
- General clients drop app spaces in their `listSpaces()` / search paths.
