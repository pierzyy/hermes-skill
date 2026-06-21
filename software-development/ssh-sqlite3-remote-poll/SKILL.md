---
name: ssh-sqlite3-remote-poll
title: SSH Remote sqlite3 Poll
description: Poll a remote sqlite3 database via SSH with proper handling of Row objects, quote nesting, and session discovery.
---

# SSH Remote sqlite3 Poll

Use when you need to query a sqlite3 database on a remote machine via SSH, especially for agent state polling patterns.

## Common Pitfalls

### 1. `dict(sqlite3.Row)` fails in Python 3.10

`sqlite3.Row` does NOT support `dict(row)` — it silently returns an empty dict or raises.

**Fix**: Set `row_factory = sqlite3.Row` and iterate manually:

```python
rows = cursor.fetchall()
result = [{k: row[k] for k in row.keys()} for row in rows]
```

### 2. SSH double-quote nesting in `subprocess.check_output`

When passing SQL with single quotes inside a `subprocess.check_output(cmd, shell=True)` string, the shell consumes nested quotes.

**Fix**: Use `subprocess.Popen` with `stdin=subprocess.PIPE`:

```python
proc = subprocess.Popen(
    ['ssh', '-i', key_path, '-p', str(port), f'{user}@{host}', 'sqlite3', '-json', db_path],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)
stdout, stderr = proc.communicate(input=sql_query, timeout=10)
```

### 3. `repr(sid)` adds single quotes that conflict with SQL

```python
# BAD — repr(sid) gives "'some_session_id'" which breaks SQL quoting
sql = f"SELECT * FROM messages WHERE session_id = {repr(sid)}"

# GOOD — use double quotes for the SQL string
sql = f'SELECT * FROM messages WHERE session_id = "{sid}"'
```

### 4. Session discovery across machines

When a cloud agent starts a new session, the local machine's `state.db` doesn't know the new session_id. Polling must:

1. Read the **remote** `state.db` to find the max `started_at` timestamp
2. Query for sessions started after that timestamp
3. Use the newly found session_id for subsequent message polling

```python
def _ssh_get_max_started_at(self):
    """Get the latest session started_at from cloud state.db."""
    sql = 'SELECT MAX(started_at) as max_ts FROM sessions'
    result = self._ssh_exec(sql)
    return result[0]['max_ts'] if result else 0

def _ssh_find_new_session_since(self, since_ts):
    """Find sessions started after a given timestamp."""
    sql = f'SELECT * FROM sessions WHERE started_at > {since_ts} ORDER BY started_at DESC LIMIT 1'
    return self._ssh_exec(sql)
```

## Architecture Pattern

```
┌─────────────────┐     SSH (key-based)     ┌─────────────────┐
│  Local Machine   │ ──────────────────────▶ │  Cloud Machine   │
│  (NiceGUI App)   │                        │  (Hermes Agent)  │
│                  │ ◀────────────────────── │                  │
│  Poll every 1-2s │    sqlite3 -json        │  state.db        │
│  via asyncio     │    over stdin pipe      │  (sessions +     │
│                  │                         │   messages)      │
└─────────────────┘                         └─────────────────┘
```

## Verification

After fixing, test directly:

```bash
# Test SSH connection
ssh -i /root/.ssh/id_rsa -p 12250 root@106.12.90.23 "echo OK"

# Test sqlite3 query directly
ssh -i /root/.ssh/id_rsa -p 12250 root@106.12.90.23 "sqlite3 -json /root/.hermes/state.db 'SELECT * FROM messages ORDER BY id DESC LIMIT 5'"

# In Python, test the exec function directly
result = process._ssh_exec('SELECT * FROM messages ORDER BY id DESC LIMIT 5')
print(f"Got {len(result)} messages")
```
