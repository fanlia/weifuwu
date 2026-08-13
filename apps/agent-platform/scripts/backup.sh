#!/usr/bin/env bash
# agent-platform 数据库备份脚本（Wave 7 后端可运维性——MULTI-ROLE-PLAN §8）
#
# 用法：
#   ./scripts/backup.sh                 # 备份到 backups/（保留最近 14 份）
#   DATABASE_URL=... ./scripts/backup.sh
#   ./scripts/restore.sh backups/dump-2026-12-13.sql   # 恢复（谨慎——覆盖当前数据）
#
# 设计：
# - pg_dump 全量备份（含 schema + 数据）——恢复用 psql 导入
# - 文件名带时间戳；自动清理超过 14 份的旧备份
# - 不依赖 docker——直接连 DATABASE_URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP="${BACKUP_KEEP:-14}"

# 读取 .env 的 DATABASE_URL（若未显式提供）
if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC2046
  export $(grep -E '^DATABASE_URL=' "$ROOT_DIR/.env" | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "错误：DATABASE_URL 未设置（请 export 或配置 .env）" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d-%H%M%S)"
OUT="$BACKUP_DIR/dump-$STAMP.sql"

echo "[backup] 开始备份 → $OUT"
pg_dump "${DATABASE_URL}" -f "$OUT" --no-owner 2>/dev/null || {
  echo "错误：pg_dump 失败（需要安装 postgresql-client）" >&2
  exit 1
}
SIZE="$(du -h "$OUT" | cut -f1)"
echo "[backup] ✓ 完成（$SIZE）"

# 清理旧备份（保留最近 $KEEP 份）
ls -1t "$BACKUP_DIR"/dump-*.sql 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "[backup] 清理旧备份 $old"
  rm -f "$old"
done

echo "[backup] 保留最近 $KEEP 份"
