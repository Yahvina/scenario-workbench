#!/usr/bin/env bash
# 这个工作树的 HEAD 引用会被外部进程反复删除，提交对象本身仍在。
# 每包提交后立刻按 SHA 打 bundle，保证历史不丢。
set -u
cd "$(dirname "$0")/.." || exit 1
GITDIR=$(git rev-parse --git-dir)
SHA=$(tail -1 "$GITDIR/logs/HEAD" | awk '{print $2}')
[ -z "$SHA" ] && { echo "no commit recorded"; exit 1; }
mkdir -p ../_v5_commits
git update-ref refs/heads/_v5_snapshot "$SHA" || exit 1
git bundle create "../_v5_commits/$SHA.bundle" _v5_snapshot >/dev/null || exit 1
echo "$SHA"
echo "$SHA" >> ../_v5_commits/INDEX.txt
