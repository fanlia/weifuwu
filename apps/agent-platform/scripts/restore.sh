#!/usr/bin/env bash
# agent-platform 数据库恢复脚本（配合 scripts/backup.sh）
#
# 用法：
#   ./scripts/restore.sh backups/dump-2026-12-13.sql
#
# ⚠️ 覆盖当前数据库（先备份当前状态再恢复）
#
# 设计：
# - psql 导入备份文件（DROP 后重建——备份含 schema + 数据）
# - 恢复后验证：表存在 + agents 计数

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

DUMP_FILE="${1:-}"
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "用法：./scripts/restore.sh <backup.sql>" >&2
  echo "可用备份：" >&2
  ls -1 "$ROOT_DIR/backups"/dump-*.sql 2>/dev/null | sed 's/^/  /' || echo "  （无备份）" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC2046
  export $(grep -E '^DATABASE_URL=' "$ROOT_DIR/.env" | xargs)
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "错误：DATABASE_URL 未设置" >&2
  exit 1
fi

echo "⚠️ 恢复将覆盖当前数据库。输入 RESTORE 确认："
read -r CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "已取消"
  exit 1
fi

echo "[restore] 导入 $DUMP_FILE ..."
psql "${DATABASE_URL}" -q -f "$DUMP_FILE" 2>/dev/null || {
  echo "错误：psql 导入失败" >&2
  exit 1
}

echo "[restore] ✓ 导入完成，验证："
psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) || ' agents' FROM agents;" 2>/dev/null || echo "  （agents 表不存在——备份可能不含该 schema）"
