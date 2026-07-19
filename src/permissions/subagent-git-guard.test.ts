import { describe, test } from "node:test"
import assert from "node:assert"
import { isGitWriteCommand, isBuiltinAgentName } from "./index.ts"

describe("isGitWriteCommand", () => {
  // --- direct subcommand matches ---
  test("matches git commit", () => {
    assert.ok(isGitWriteCommand("git commit -m test"))
  })
  test("matches git push", () => {
    assert.ok(isGitWriteCommand("git push origin main"))
  })
  test("matches git tag", () => {
    assert.ok(isGitWriteCommand("git tag v1.0"))
  })
  test("matches git reset --hard", () => {
    assert.ok(isGitWriteCommand("git reset --hard HEAD~1"))
  })
  test("matches git rebase", () => {
    assert.ok(isGitWriteCommand("git rebase main"))
  })
  test("matches git cherry-pick", () => {
    assert.ok(isGitWriteCommand("git cherry-pick abc123"))
  })
  test("matches git revert", () => {
    assert.ok(isGitWriteCommand("git revert HEAD"))
  })

  // --- allowed read-only subcommands ---
  test("does NOT match git status", () => {
    assert.ok(!isGitWriteCommand("git status"))
  })
  test("does NOT match git log", () => {
    assert.ok(!isGitWriteCommand("git log --oneline"))
  })
  test("does NOT match git diff", () => {
    assert.ok(!isGitWriteCommand("git diff"))
  })
  test("does NOT match git reset without --hard", () => {
    assert.ok(!isGitWriteCommand("git reset HEAD~1"))
  })
  test("does NOT match git reset --soft", () => {
    assert.ok(!isGitWriteCommand("git reset --soft HEAD~1"))
  })

  // --- compound commands with env/chdir prefix ---
  test("matches git commit after env var prefix", () => {
    assert.ok(isGitWriteCommand('$env:CI = "true"; git commit -m test'))
  })
  test("matches git commit after cd", () => {
    assert.ok(isGitWriteCommand("cd /tmp; git commit -m test"))
  })

  // --- git global options before subcommand ---
  test("matches git -c user.name=x commit", () => {
    assert.ok(isGitWriteCommand("git -c user.name=x commit -m test"))
  })
  test("matches git --no-pager push", () => {
    assert.ok(isGitWriteCommand("git --no-pager push origin main"))
  })
  test("matches git --git-dir .git reset --hard", () => {
    assert.ok(isGitWriteCommand("git --git-dir .git reset --hard HEAD"))
  })
  test("matches git --bare rebase", () => {
    assert.ok(isGitWriteCommand("git --bare rebase main"))
  })
  test("matches git with multiple global options before push", () => {
    assert.ok(isGitWriteCommand("git --no-pager -c user.name=x push origin main"))
  })

  test("matches git -C repo commit -m test", () => {
    assert.ok(isGitWriteCommand("git -C repo commit -m test"))
  })

  // --- global options before allowed subcommand = no match ---
  test("does NOT match git -C repo status", () => {
    assert.ok(!isGitWriteCommand("git -C repo status"))
  })
  test("does NOT match git -c user.name=x status", () => {
    assert.ok(!isGitWriteCommand("git -c user.name=x status"))
  })
  test("does NOT match git --no-pager log", () => {
    assert.ok(!isGitWriteCommand("git --no-pager log"))
  })

  // --- non-git commands should not match ---
  test("does NOT match commit in non-git context", () => {
    assert.ok(!isGitWriteCommand("echo commit"))
  })
  test("does NOT match push in non-git context", () => {
    assert.ok(!isGitWriteCommand("echo push"))
  })

  // --- false positive: git token inside arguments ---
  test("does NOT match git inside echo argument", () => {
    assert.ok(!isGitWriteCommand("echo git commit"))
  })
  test("does NOT match git inside another command argument", () => {
    assert.ok(!isGitWriteCommand("some-tool git push origin main"))
  })

  // --- false positive: git tag listing is read-only ---
  test("does NOT match git tag -l (listing)", () => {
    assert.ok(!isGitWriteCommand("git tag -l"))
  })
  test("does NOT match git tag --list (listing)", () => {
    assert.ok(!isGitWriteCommand("git tag --list"))
  })
  test("does NOT match bare git tag (listing)", () => {
    assert.ok(!isGitWriteCommand("git tag"))
  })
  test("matches git tag with name (create)", () => {
    assert.ok(isGitWriteCommand("git tag v1.0"))
  })
  test("matches git tag -a (annotate)", () => {
    assert.ok(isGitWriteCommand("git tag -a v1.0 -m msg"))
  })
  test("matches git tag -d (delete)", () => {
    assert.ok(isGitWriteCommand("git tag -d v1.0"))
  })

  // --- false positive: git help is read-only ---
  test("does NOT match git --help commit (help)", () => {
    assert.ok(!isGitWriteCommand("git --help commit"))
  })
  test("does NOT match git help commit (help)", () => {
    assert.ok(!isGitWriteCommand("git help commit"))
  })
  test("does NOT match git help tag (help)", () => {
    assert.ok(!isGitWriteCommand("git help tag"))
  })

  // --- trailing --help after write subcommand = read-only ---
  test("does NOT match git commit --help", () => {
    assert.ok(!isGitWriteCommand("git commit --help"))
  })
  test("does NOT match git push --help", () => {
    assert.ok(!isGitWriteCommand("git push --help"))
  })
  test("does NOT match git rebase --help", () => {
    assert.ok(!isGitWriteCommand("git rebase --help"))
  })
  test("does NOT match git cherry-pick --help", () => {
    assert.ok(!isGitWriteCommand("git cherry-pick --help"))
  })
  test("does NOT match git revert --help", () => {
    assert.ok(!isGitWriteCommand("git revert --help"))
  })
  test("does NOT match git tag --help", () => {
    assert.ok(!isGitWriteCommand("git tag --help"))
  })
  test("does NOT match git reset --help", () => {
    assert.ok(!isGitWriteCommand("git reset --help"))
  })

  // --- shell separator: git commit after a separator should still be blocked ---
  test("matches git commit after ; separator", () => {
    assert.ok(isGitWriteCommand("git status ; git commit -m x"))
  })
  test("matches git commit after && separator", () => {
    assert.ok(isGitWriteCommand("git status && git commit -m x"))
  })
  test("matches git push after || separator", () => {
    assert.ok(isGitWriteCommand("false || git push origin main"))
  })

  // --- shell wrapper: pwsh -c / powershell -Command / cmd /c ---
  test("matches pwsh -c wrapping git commit", () => {
    assert.ok(isGitWriteCommand('pwsh -c "git commit -m x"'))
  })
  test("matches pwsh -c quoted git commit even with extra wrapper arg", () => {
    assert.ok(isGitWriteCommand('pwsh -c "git commit -m x" foo'))
  })
  test("matches powershell -Command wrapping git push", () => {
    assert.ok(isGitWriteCommand('powershell -Command "git push origin main"'))
  })
  test("matches powershell -Command quoted git push even with extra wrapper arg", () => {
    assert.ok(isGitWriteCommand('powershell -Command "git push origin main" foo'))
  })
  test("matches cmd /c wrapping git commit", () => {
    assert.ok(isGitWriteCommand("cmd /c git push origin main"))
  })

  // --- glued separators: ; && || without spaces ---
  test("matches git commit glued with ;", () => {
    assert.ok(isGitWriteCommand("git status;git commit -m x"))
  })
  test("matches git commit glued with &&", () => {
    assert.ok(isGitWriteCommand("git status&&git commit -m x"))
  })
  test("matches git push glued with ||", () => {
    assert.ok(isGitWriteCommand("false||git push origin main"))
  })
  test("matches git commit glued with | (pipe)", () => {
    assert.ok(isGitWriteCommand("echo x|git commit -m x"))
  })

  // --- wrappers with glued separators combined ---
  test("matches pwsh -c with glued separator inside script", () => {
    assert.ok(isGitWriteCommand('pwsh -c "git status;git commit -m x"'))
  })

  // --- wrapper after shell separator (regression: wrapper detection bounded to segment) ---
  test("matches pwsh -c wrapping git commit after semicolon separator", () => {
    assert.ok(isGitWriteCommand('echo ok; pwsh -c "git commit -m x"'))
  })
  test("matches pwsh -c wrapping git commit after && separator", () => {
    assert.ok(isGitWriteCommand('git status && pwsh -c "git commit -m x"'))
  })
  test("matches cmd /c wrapping git push after glued || separator", () => {
    assert.ok(isGitWriteCommand("false||cmd /c git push origin main"))
  })

  // --- regression: later-segment shell wrapper payloads containing separators ---
  test("matches pwsh -c wrapping git commit after semicolon separator (Task 4 regression)", () => {
    assert.ok(isGitWriteCommand('echo ok; pwsh -c "git status;git commit -m x"'))
  })
  test("matches pwsh -c wrapping git commit after && separator (Task 4 regression)", () => {
    assert.ok(isGitWriteCommand('git status && pwsh -c "git status&&git commit -m x"'))
  })
  test("matches powershell -Command wrapping git push after semicolon separator (Task 4 regression)", () => {
    assert.ok(isGitWriteCommand('echo ok; powershell -Command "git status;git push origin main"'))
  })

  // --- `--help` as an option value, not a help flag ---
  test("matches git commit -m --help (--help is a message value, not a help flag)", () => {
    assert.ok(isGitWriteCommand("git commit -m --help"))
  })
  test("matches git tag -a v1.0 -m --help (--help is a message value, not a help flag)", () => {
    assert.ok(isGitWriteCommand("git tag -a v1.0 -m --help"))
  })

  // --- `--` end-of-options: flags after `--` are operands, not flags ---
  test("does NOT match git reset HEAD -- --hard (--hard is a path operand after --)", () => {
    assert.ok(!isGitWriteCommand("git reset HEAD -- --hard"))
  })
  test("matches git tag -- --list (--list is a tag name operand after --)", () => {
    assert.ok(isGitWriteCommand("git tag -- --list"))
  })

  // --- negative: tokens after separators must not bleed into current segment logic ---
  test("does NOT match git reset without --hard even when --hard is in later segment (;)", () => {
    assert.ok(!isGitWriteCommand("git reset HEAD~1 ; echo --hard"))
  })
  test("does NOT match git reset without --hard even when --hard is in later segment (&&)", () => {
    assert.ok(!isGitWriteCommand("git reset HEAD~1 && printf --hard"))
  })
  test("does NOT match git tag listing when non-git tokens follow in later segment", () => {
    assert.ok(!isGitWriteCommand("git tag ; echo hi"))
  })

  // --- Task 4 blockers: help with preceding flags ---
  test("does NOT match git commit -q --help (help after ordinary flag, read-only)", () => {
    assert.ok(!isGitWriteCommand("git commit -q --help"))
  })
  test("does NOT match git push --verbose --help (help after verbose flag, read-only)", () => {
    assert.ok(!isGitWriteCommand("git push --verbose --help"))
  })

  // --- Task 4 blockers: tag listing with later write flags ---
  test("matches git tag --list -d v1.0 (--list then delete flag, write)", () => {
    assert.ok(isGitWriteCommand("git tag --list -d v1.0"))
  })
  test("matches git tag -l -a v1.0 -m msg (-l then annotate/message flags, write)", () => {
    assert.ok(isGitWriteCommand("git tag -l -a v1.0 -m msg"))
  })

  // --- Task 4 blockers: wrapper payload skip too broad ---
  test("matches echo ok; pwsh -c \"git status\"; git status&&git commit -m x (wrapper payload does not block later glued separator)", () => {
    assert.ok(isGitWriteCommand('echo ok; pwsh -c "git status"; git status&&git commit -m x'))
  })
  test("matches echo ok; pwsh -c \"git status\"; git diff||git push origin main (wrapper payload does not block later glued separator)", () => {
    assert.ok(isGitWriteCommand('echo ok; pwsh -c "git status"; git diff||git push origin main'))
  })

  // --- Final review blockers: --help as option value for more value-consuming options ---
  test("matches git commit --author --help (--help is an author value, not a help flag)", () => {
    assert.ok(isGitWriteCommand("git commit --author --help"))
  })
  test("matches git tag -u --help v1.0 (--help is a local-user value, not a help flag)", () => {
    assert.ok(isGitWriteCommand("git tag -u --help v1.0"))
  })

  // --- Final review blockers: case-insensitive git at segment start ---
  test("matches Git commit -m x (case-insensitive git command)", () => {
    assert.ok(isGitWriteCommand("Git commit -m x"))
  })

  // --- Final review blockers: case-insensitive wrapper options ---
  test("matches pwsh -Command \"git commit -m x\" (case-insensitive -Command)", () => {
    assert.ok(isGitWriteCommand('pwsh -Command "git commit -m x"'))
  })
  test("matches powershell -command \"git push origin main\" (case-insensitive -command)", () => {
    assert.ok(isGitWriteCommand('powershell -command "git push origin main"'))
  })

  // --- Final review blockers: git tag -l with pattern (list mode, read-only) ---
  test("does NOT match git tag -l v1.* (list mode with pattern)", () => {
    assert.ok(!isGitWriteCommand("git tag -l v1.*"))
  })
  test("does NOT match git tag --list release-* (list mode with pattern)", () => {
    assert.ok(!isGitWriteCommand("git tag --list release-*"))
  })

  // --- Negative: non-git commands with Git capitalization ---
  test("does NOT match echo Git commit (non-git command with Git token)", () => {
    assert.ok(!isGitWriteCommand("echo Git commit"))
  })

  // --- Final review blockers: -h as short help flag ---
  // Short help flag after write subcommand → read-only
  test("does NOT match git commit -h (short help flag)", () => {
    assert.ok(!isGitWriteCommand("git commit -h"))
  })
  test("does NOT match git push -h (short help flag)", () => {
    assert.ok(!isGitWriteCommand("git push -h"))
  })
  test("does NOT match git rebase -h (short help flag)", () => {
    assert.ok(!isGitWriteCommand("git rebase -h"))
  })
  test("does NOT match git cherry-pick -h (short help flag)", () => {
    assert.ok(!isGitWriteCommand("git cherry-pick -h"))
  })
  test("does NOT match git revert -h (short help flag)", () => {
    assert.ok(!isGitWriteCommand("git revert -h"))
  })
  test("does NOT match git -h commit (short help flag before subcommand)", () => {
    assert.ok(!isGitWriteCommand("git -h commit"))
  })
  // -h as option value (after -m) → still a write
  test("matches git commit -m -h (-h is a message value, not a help flag)", () => {
    assert.ok(isGitWriteCommand("git commit -m -h"))
  })
  test("does NOT match git commit -m hi`;bye --help (backtick-escaped separator in message)", () => {
    assert.ok(!isGitWriteCommand("git commit -m hi`;bye --help"))
  })

  // --- Final review blockers: -u subcommand-aware help scanning ---
  test("does NOT match git commit -u --help (-u is --set-upstream for commit, --help is help)", () => {
    assert.ok(!isGitWriteCommand("git commit -u --help"))
  })
  test("does NOT match git push -u --help (-u is --set-upstream for push, --help is help)", () => {
    assert.ok(!isGitWriteCommand("git push -u --help"))
  })
  test("matches git tag -u --help v1.0 (-u is --local-user for tag, --help is a value)", () => {
    assert.ok(isGitWriteCommand("git tag -u --help v1.0"))
  })
  test("matches git push -o --help origin main (--help is a push-option value)", () => {
    assert.ok(isGitWriteCommand("git push -o --help origin main"))
  })
  test("matches git push --push-option --help origin main (--help is a push-option value)", () => {
    assert.ok(isGitWriteCommand("git push --push-option --help origin main"))
  })
  test("does NOT match git push --no-push-option --help (--no-push-option is a flag)", () => {
    assert.ok(!isGitWriteCommand("git push --no-push-option --help"))
  })

  // --- Final review blockers: tag filter options → read-only list mode ---
  test("does NOT match git tag --contains HEAD (filter mode, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --contains HEAD"))
  })
  test("does NOT match git tag --merged HEAD (filter mode, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --merged HEAD"))
  })
  test("does NOT match git tag --points-at HEAD (filter mode, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --points-at HEAD"))
  })

  // --- Quality review: fused option/value forms for tag listing ---
  test("does NOT match git tag -n5 v0.* (fused -n<number>, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag -n5 v0.*"))
  })
  test("does NOT match git tag --contains=HEAD v0.* (fused --contains=, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --contains=HEAD v0.*"))
  })
  test("does NOT match git tag --no-contains=HEAD v0.* (fused --no-contains=, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --no-contains=HEAD v0.*"))
  })

  // --- Task 4 blockers: cmd /c with single & as separator ---
  test("matches cmd /c git status & git commit -m x (single & in cmd /c)", () => {
    assert.ok(isGitWriteCommand("cmd /c git status & git commit -m x"))
  })
  test("matches cmd /c git status&git commit -m x (glued & in cmd /c)", () => {
    assert.ok(isGitWriteCommand("cmd /c git status&git commit -m x"))
  })

  // --- Task 4 blockers: wrapper detection at segment start only ---
  test("matches echo pwsh -c x; git commit -m x (wrapper word in echo args, real git later)", () => {
    assert.ok(isGitWriteCommand("echo pwsh -c x; git commit -m x"))
  })
  test("matches echo powershell -command y; git push origin main (wrapper word in echo args)", () => {
    assert.ok(isGitWriteCommand("echo powershell -command y; git push origin main"))
  })
  test("matches echo cmd /c z; git tag v1.0 (wrapper word in echo args)", () => {
    assert.ok(isGitWriteCommand("echo cmd /c z; git tag v1.0"))
  })

  // --- Final blockers: Windows executable forms (.exe, flags before -c, cmd /d /c) ---
  test("matches git.exe commit -m x (.exe suffix)", () => {
    assert.ok(isGitWriteCommand("git.exe commit -m x"))
  })
  test("matches pwsh.exe -c git commit -m x (.exe + wrapper)", () => {
    assert.ok(isGitWriteCommand("pwsh.exe -c git commit -m x"))
  })
  test("matches quoted full-path git.exe command", () => {
    assert.ok(isGitWriteCommand('& "C:\\Program Files\\Git\\bin\\git.exe" commit -m x'))
  })
  test("matches quoted full-path powershell.exe wrapper", () => {
    assert.ok(isGitWriteCommand('& "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "git commit -m x"'))
  })
  test("matches quoted full-path git.exe inside PowerShell wrapper payload", () => {
    assert.ok(isGitWriteCommand(String.raw`pwsh -c "& ""C:\Program Files\Git\bin\git.exe"" commit -m x"`))
  })
  test("matches single-quoted full-path git.exe inside PowerShell wrapper payload", () => {
    assert.ok(isGitWriteCommand("pwsh -c '& ''C:\\Program Files\\Git\\bin\\git.exe'' commit -m x'"))
  })
  test("matches backtick-quoted git command in PowerShell", () => {
    assert.ok(isGitWriteCommand('& `"git`" commit -m x'))
  })
  test("matches backtick-quoted full-path git.exe inside PowerShell wrapper payload", () => {
    assert.ok(isGitWriteCommand('pwsh -c \'& `"C:\\Program Files\\Git\\bin\\git.exe`" commit -m x\''))
  })
  test("matches git commit after quoted PowerShell wrapper payload without separator whitespace", () => {
    assert.ok(isGitWriteCommand('pwsh -c "git status";git commit -m x'))
  })
  test("matches pwsh -NoProfile -c git commit -m x (flags before -c)", () => {
    assert.ok(isGitWriteCommand("pwsh -NoProfile -c git commit -m x"))
  })
  test("matches cmd /d /c git push origin main (/d before /c)", () => {
    assert.ok(isGitWriteCommand("cmd /d /c git push origin main"))
  })

  // --- Final blockers: tag read-only display/verify options ---
  test("does NOT match git tag -n release-* (list with line count, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag -n release-*"))
  })
  test("does NOT match git tag -v v1.0 (verify, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag -v v1.0"))
  })
  test("does NOT match git tag --sort=taggerdate release-* (sort in token, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --sort=taggerdate release-*"))
  })
  test("does NOT match git tag --format=%(refname:short) release-* (format in token, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --format=%(refname:short) release-*"))
  })

  // --- Task 4: additional read-only tag display/verify modes ---
  test("does NOT match git tag --verify v1.0 (verify mode, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --verify v1.0"))
  })
  test("does NOT match git tag -i release-* (ignore-case short form, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag -i release-*"))
  })
  test("does NOT match git tag --column release-* (column layout, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --column release-*"))
  })
  test("does NOT match git tag --color=always release-* (color display, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --color=always release-*"))
  })
  test("does NOT match git tag --omit-empty release-* (omit-empty display, read-only)", () => {
    assert.ok(!isGitWriteCommand("git tag --omit-empty release-*"))
  })

  // --- Task 4 blockers: quoted args with separators are not command boundaries ---
  test("does NOT match git commit -m \"hi;bye\" --help (separators inside quoted arg, help)", () => {
    assert.ok(!isGitWriteCommand('git commit -m "hi;bye" --help'))
  })
  test("does NOT match git push --receive-pack \"x;y\" --help (separators inside quoted arg, help)", () => {
    assert.ok(!isGitWriteCommand('git push --receive-pack "x;y" --help'))
  })

  // --- Task 4 blockers: wrapper payload with quote metadata preserved ---
  // These would have false-positive/negative before the fix because
  // extractWrapperScriptGit stringified the payload and quotes were lost.
  test("does NOT match cmd /c git commit -m \"hi;bye\" --help (quoted separators + help, read-only)", () => {
    assert.ok(!isGitWriteCommand('cmd /c git commit -m "hi;bye" --help'))
  })
  test("does NOT match cmd /c git push --receive-pack \"x;y\" --help (quoted separators + help, read-only)", () => {
    assert.ok(!isGitWriteCommand('cmd /c git push --receive-pack "x;y" --help'))
  })
  test("does NOT match pwsh -c git commit -m \"hi;bye\" --help (quoted separators + help, read-only)", () => {
    assert.ok(!isGitWriteCommand('pwsh -c git commit -m "hi;bye" --help'))
  })
  test("matches powershell -Command git reset HEAD \"x;y\" --hard (write)", () => {
    assert.ok(isGitWriteCommand('powershell -Command git reset HEAD "x;y" --hard'))
  })
  test("matches pwsh -c git tag --list \"v1;*\" -d v1 (list mode then delete, write)", () => {
    assert.ok(isGitWriteCommand('pwsh -c git tag --list "v1;*" -d v1'))
  })

  // --- Task 4 blockers: existing wrapper with quoted separators preserved ---
  test("matches echo ok; pwsh -c \"git status;git commit -m x\" (wrapper with quoted semicolons)", () => {
    assert.ok(isGitWriteCommand('echo ok; pwsh -c "git status;git commit -m x"'))
  })
  test("matches git status && pwsh -c \"git status&&git commit -m x\" (wrapper with quoted &&)", () => {
    assert.ok(isGitWriteCommand('git status && pwsh -c "git status&&git commit -m x"'))
  })

})

describe("isBuiltinAgentName", () => {
  test("recognizes orchestrator", () => {
    assert.ok(isBuiltinAgentName("orchestrator"))
  })
  test("recognizes builder", () => {
    assert.ok(isBuiltinAgentName("builder"))
  })
  test("recognizes reviewer", () => {
    assert.ok(isBuiltinAgentName("reviewer"))
  })
  test("recognizes alias oracle as builtin", () => {
    assert.ok(isBuiltinAgentName("oracle"))
  })
  test("recognizes alias explore as builtin", () => {
    assert.ok(isBuiltinAgentName("explore"))
  })
  test("recognizes canonical and generated review profiles as builtins", () => {
    for (const name of ["oracle-2nd", "oracle-9th-max", "reviewer-low", "oracle-second"]) {
      assert.equal(isBuiltinAgentName(name), true, name)
    }
    assert.equal(isBuiltinAgentName("reviewer-2nd"), false)
  })
  test("does NOT recognize coding (category, not builtin agent)", () => {
    assert.ok(!isBuiltinAgentName("coding"))
  })
  test("does NOT recognize deep (category, not builtin agent)", () => {
    assert.ok(!isBuiltinAgentName("deep"))
  })
})
