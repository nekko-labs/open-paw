# Wiki source

These files mirror the [GitHub Wiki](https://github.com/ermish/nekko-paw/wiki).

GitHub does not expose an API to create a wiki's first page — it must be created
once in the web UI (Wiki tab → "Create the first page"). After that one-time step,
the wiki's git repo (`nekko-paw.wiki.git`) exists and these pages can be pushed:

```bash
git clone git@github.com:ermish/nekko-paw.wiki.git
cp docs/wiki/Home.md docs/wiki/Walkthrough.md nekko-paw.wiki/
cd nekko-paw.wiki && git add -A && git commit -m "Sync wiki" && git push
```

The same content also lives at [docs/WALKTHROUGH.md](../WALKTHROUGH.md) so it's
readable directly in the repo.
