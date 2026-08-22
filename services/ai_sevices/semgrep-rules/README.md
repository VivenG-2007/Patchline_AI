# semgrep-rules

Deterministic pattern-based vulnerability detection rules used by Patchline's
scanner (`services/ai-storage-service/scanner.py`). This is one of three
detection engines the scanner runs (semgrep, tree-sitter, regex), merged and
deduped by `deterministic_scanner.py`, and is the primary finding source that
the AI layer explains and supplements.

## Files in this directory

| File | Purpose |
|---|---|
| `patchline-rules.yml` | The rule pack itself — semgrep rules for SQLi, XSS, command injection, path traversal, insecure deserialization, weak/broken crypto, NoSQLi, log forging, and hardcoded secrets across Python, JS/TS, Java, C#, Go, PHP, Ruby, and JSX/TSX/HTML. |
| `validate_rules.py` | Custom test runner that replaces `semgrep scan --test`, which crashes on every currently-released semgrep version (`IndexError: tuple index out of range` in `relatively_eq` — [semgrep#11391](https://github.com/semgrep/semgrep/issues/11391)) when the rule config is a single file rather than a directory. Runs the rule pack against the annotated fixtures below and asserts every `ruleid:`/`ok:` annotation matches, plus flags any rule with zero coverage (dead-rule detection). |
| `cipher_wrapper.go` | Fixture: Go ECB cipher wrapper (`crypto-ecb-mode-go`). |
| `test_python.py` | Fixtures: SQLi (f-string/concat/%-format/.format/raw Django/SQLAlchemy text/indirect/taint), command injection (os.system/subprocess/os.popen/indirect), path traversal, insecure deserialization (pickle), weak crypto (MD5/SHA1/DES/ECB/CBC-no-iv/RC4/small RSA key/weak random), NoSQLi, log forging. |
| `test_js.js` | Fixtures: SQLi (template/concat/indirect/multi-concat/taint), XSS (innerHTML/document.write/res.send/insertAdjacentHTML/outerHTML/eval/indirect/taint), command injection (exec/execFile, template/concat/indirect/array), path traversal, weak crypto (MD5/SHA1/RC4), NoSQLi, log forging. |
| `test_react.tsx` | Fixture: `dangerouslySetInnerHTML` XSS. |
| `test_java.java` | Fixtures: SQLi (Statement concat/indirect/JPA `@Query`), command injection (Runtime.exec/ProcessBuilder), path traversal, insecure deserialization (ObjectInputStream), weak crypto (DES/ECB/CBC-no-iv/RC4/MD5/SHA1/weak Random/small RSA key). |
| `test_csharp.cs` | Fixtures: SQLi (SqlCommand concat/EF FromSqlRaw), command injection (Process.Start), weak crypto (TripleDES/ECB/CBC-no-iv/RC4/MD5/SHA1/small RSA key). |
| `test_go.go` | Fixtures: SQLi (db.Query/gorm.Raw concat), command injection (exec.Command), weak crypto (DES/RC4/MD5/SHA1/weak rand/small RSA key). |
| `test_php.php` | Fixtures: command injection (shell_exec/system/passthru/exec). |
| `test_ruby.rb` | Fixtures: SQLi (find_by_sql/where concat), weak crypto (MD5/SHA1). |
| `test_markup.html` | Fixtures: Vue `v-html` / Angular `[innerHTML]` XSS. |
| `test_secrets.txt` | Fixtures for `secret-*` rules: AWS keys, generic high-entropy assignments, PEM private key blocks, Slack/GitHub/GitLab/Stripe tokens, base64/hex high-entropy strings — each paired with an `ok:` counterexample using an env var reference instead of a literal. |

## Annotation convention

Same convention semgrep's own `--test` uses: a comment on the line
immediately before the code under test.

```python
# ruleid: sqli-py-concat
cursor.execute("..." + x)          # the line right after must match

# ok: sqli-py-concat
cursor.execute("...", (x,))        # the line right after must NOT match
```

JSX/TSX and HTML fixtures use `{/* ruleid: ... */}` / `<!-- ruleid: ... -->`.

## Running validation

```bash
cd services/ai-storage-service/semgrep-rules
python3 validate_rules.py
```

Exits non-zero and prints every mismatch if any rule fires where an `ok:`
comment says it shouldn't, fails to fire where a `ruleid:` says it should,
or if any rule in `patchline-rules.yml` never fires against any fixture.

## Note on `test_secrets.txt`

This file will likely get rejected by GitHub's push protection / secret
scanning — the fixtures deliberately use realistic-looking token formats
(`AKIA...`, `ghp_...`, `xoxb-...`, `sk_live_...`, PEM headers) so the
`secret-*` rules have something to match. They're not live credentials.
Options if you want it committed as-is:
- Push anyway and use GitHub's "allow secret" option in the blocked-push
  UI/link (per-pattern, per-repo).
- Ask an org admin to add a push-protection bypass for the repo.
- Obfuscate the fixtures slightly (e.g. insert a non-matching character)
  in a way that still satisfies the rule pattern but doesn't match GitHub's
  built-in secret patterns — riskier, since it can silently break the
  fixture's coverage.
