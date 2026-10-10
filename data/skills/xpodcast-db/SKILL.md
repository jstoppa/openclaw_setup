---
name: xpodcast-db
description: Query the xpodcast SQLite database of captured X/Twitter posts, users, engagement stats and Grok analyses (read-only).
metadata: {"openclaw":{"requires":{"bins":["sqlite3"],"env":["XPODCAST_DB"]}}}
---

# xpodcast DB

The xpodcast_infra containers continuously write X/Twitter posts into a SQLite
database. It is mounted **read-only** at `$XPODCAST_DB`
(`/data/xpodcast_db/twitter_data.sqlite`). Never try to write to it.

Always query with `-readonly` and a busy timeout (the writer may hold a lock briefly):

```bash
sqlite3 -readonly -cmd ".timeout 5000" -header -column "$XPODCAST_DB" "SELECT ..."
```

Use `-json` instead of `-column` when you need to post-process results.
The DB is large (hundreds of MB): always filter by date and use `LIMIT`.

## Schema

- `users(user_id_str UNIQUE, user_screen_name, user_name, user_location, user_description)`
- `user_stats(user_id_str, capture_timestamp, user_followers_count, user_friends_count)`
- `twitter_posts(id_str UNIQUE, created_at, capture_timestamp, full_text, user_id_str, quoted_status_id_str)`
- `twitter_post_stats(id_str, capture_timestamp, retweet_count, reply_count, quote_count, views_count, favorite_count, bookmark_count)` — one row per capture; take the latest per `id_str`. Some older rows have `views_count = '[object Object]'` (text): filter with `typeof(views_count) = 'integer'`
- `twitter_grok(id_str, grok_response, capture_timestamp)` — Grok AI analysis of a post

Indexed: `twitter_posts(created_at)`, `twitter_posts(user_id_str)`, `twitter_grok(id_str)`,
`twitter_post_stats(id_str, capture_timestamp)`, `user_stats(user_id_str, capture_timestamp)`.

Post URL: `https://x.com/<user_screen_name>/status/<id_str>`

## Examples

Latest posts in the last 24h with author:

```sql
SELECT p.created_at, u.user_screen_name, substr(p.full_text, 1, 200) AS text
FROM twitter_posts p JOIN users u ON u.user_id_str = p.user_id_str
WHERE p.created_at >= datetime('now', '-1 day')
ORDER BY p.created_at DESC LIMIT 20;
```

Top posts by views in the last 24h (latest stats snapshot):

```sql
WITH latest AS (
  SELECT id_str, MAX(capture_timestamp) AS ts FROM twitter_post_stats
  WHERE typeof(views_count) = 'integer' GROUP BY id_str
)
SELECT u.user_screen_name, s.views_count, s.favorite_count, substr(p.full_text, 1, 200) AS text
FROM twitter_posts p
JOIN users u ON u.user_id_str = p.user_id_str
JOIN latest l ON l.id_str = p.id_str
JOIN twitter_post_stats s ON s.id_str = l.id_str AND s.capture_timestamp = l.ts
WHERE p.created_at >= datetime('now', '-1 day')
ORDER BY s.views_count DESC LIMIT 20;
```

Posts with a Grok analysis:

```sql
SELECT p.id_str, substr(p.full_text, 1, 120) AS text, substr(g.grok_response, 1, 300) AS grok
FROM twitter_grok g JOIN twitter_posts p ON p.id_str = g.id_str
ORDER BY g.capture_timestamp DESC LIMIT 10;
```
