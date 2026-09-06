#!/usr/bin/env bash
# weifuwu 测试日志落盘封装——**R-07 纪律**：任何测试命令输出 tee 到日志，
# 失败只 grep 日志（不重跑）。用法：
#   ./scripts/test-log.sh test:scenario          # 跑 + tee 日志
#   ./scripts/test-log.sh test:scenario --grep ✖ # 跑完 grep 失败行
#   LOG=0 ./scripts/test-log.sh test:client      # 只跑不 tee（手动管道场景）
# 日志：/tmp/wf-test-<域>.log（域 = 参数去掉冒号）
set -euo pipefail

CMD="$1"
shift || true
DOMAIN=$(echo "${CMD}" | tr ':.' '_')
LOG="/tmp/wf-test-${DOMAIN}.log"

echo "[test-log] $CMD → $LOG"
if [ "${LOG:-1}" = "0" ]; then
  npm run "$CMD" "$@"
  exit $?
fi

# 注意：tee 后管道退出码以 npm 为准（pipefail + tee 吞掉退出码问题——用 PIPESTATUS）
set +e
npm run "$CMD" "$@" 2>&1 | tee "$LOG"
STATUS=${PIPESTATUS[0]}
set -e

echo ""
echo "[test-log] exit=$STATUS · 失败定位：grep -E '✖|AssertionError|Error' $LOG"
exit "$STATUS"
