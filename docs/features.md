---
version: '1.0'
permalink: /features
layout: default
title: Features
nav_order: 3
---

# Features

## Variable templates

A prompt with `{{ '{{' }}placeholders{{ '}}' }}` becomes a one-field-per-variable
form when you copy. Variables resolve per priority: what you typed in the
fill dialog beats the thread's own pool, which beats the global pool. The
Variables screen (burger menu, or the sidebar from a thread page) manages
both pools; variables whose thread is deleted are swept like the thread is.

## Threads, projects, tags

- A **thread** is one prompt (or an explicit variation history). Threads can
  be draft, active, or archived; archived ones disappear from default views.
- **Projects** are the heavier grouping — the sidebar's collapsible groups.
- **Tags** are the lighter one. Tag anything, filter by tag from the header's
  search row.

## Forking and lineage

Fork copies a prompt into a child thread with its own id and version. The
parent is untouched, and the fork links back, so iterating on "the prompt
that worked" never destroys the version that worked first.

## Arrangement that syncs

Pin, drag-reorder, and collapse — every arranged surface (home board,
projects grid, thread messages, sidebar groups) supports all three, and your
arrangement ships inside the normal sync payload as its own view state. A
reorder from your phone and a rename on your laptop can never overwrite each
other: the two live in different sync keys, so a drag only rewrites the
ordering entry while a rename only rewrites the thread entry.

## Find it in a keystroke

- The header search filters the live view, including rendered variable hints
  and drafts.
- `Cmd/Ctrl+K` opens the command palette: matching threads and projects first
  (searchable by name/tag/draft), then actions (create thread, create
  project, open trash, settings).

## Timestamps you can trace

Every thread and message carries created/edited times rendered in whatever
time zone you pick in Settings, synced in the payload — so a prompt can be
matched back to the conversation that produced it.

## Archive, trash, drafts

- **Archive** retires a prompt without losing it.
- **Delete** moves it to the trash; the trash page restores or hard-deletes.
  Under the hood a deletion is a tombstone that syncs, so deleting on one
  device deletes everywhere — while a newer edit on another device can still
  beat the delete, per merge rules.
- **Draft stamps** live locally on your device while you type, so an
  interrupted edit is never lost even mid-sync.

## Import / export

Settings → Export writes a full JSON archive (threads, projects, messages,
variables, view state, tombstones). Import merges by id — re-importing the
same backup never duplicates rows — and honors local tombstones so
importing an older backup does not resurrect what you deleted.
